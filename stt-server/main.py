import asyncio
import base64
import json
import logging
import os
import tempfile

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

MODEL_SIZE = os.getenv("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.getenv("DEVICE", "cuda")
COMPUTE_TYPE = os.getenv("COMPUTE_TYPE", "float16")

app = FastAPI(title="Silent Witness STT")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

log.info(f"Loading Whisper model: {MODEL_SIZE}  device={DEVICE}  compute={COMPUTE_TYPE}")
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE, num_workers=4)
log.info("Model ready")

# final: max 4 concurrent, partial: max 2 concurrent (yield slots to final)
_final_sem = asyncio.Semaphore(4)
_partial_sem = asyncio.Semaphore(2)


def _transcribe(audio_bytes: bytes, language: str | None) -> str:
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_bytes)
        tmp = f.name
    try:
        segments, _ = model.transcribe(
            tmp,
            language=language or None,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
        )
        return " ".join(s.text.strip() for s in segments).strip()
    finally:
        os.unlink(tmp)


@app.get("/health")
@app.get("/ping")
def health():
    return {"status": "ok", "model": MODEL_SIZE, "device": DEVICE}


class TranscribeRequest(BaseModel):
    audio_base64: str
    language: str | None = None


@app.post("/transcribe")
async def http_transcribe(req: TranscribeRequest):
    # strip data URL prefix if present: "data:audio/webm;base64,xxxx" → raw bytes
    b64 = req.audio_base64.split(",", 1)[-1]
    audio_bytes = base64.b64decode(b64)
    loop = asyncio.get_event_loop()
    async with _final_sem:
        text = await loop.run_in_executor(None, lambda: _transcribe(audio_bytes, req.language))
    log.info(f"http_transcribe → {text[:120]}")
    return {"text": text}


@app.websocket("/ws/transcribe")
async def ws_transcribe(ws: WebSocket):
    await ws.accept()
    log.info("WS connected")

    chunks: list[bytes] = []
    language: str | None = None
    loop = asyncio.get_event_loop()
    partial_in_flight = False
    # incremental partial: last transcribed chunk index and accumulated text
    partial_chunk_cursor = 0
    partial_text_so_far = ""

    try:
        while True:
            msg = await ws.receive()

            if "bytes" in msg and msg["bytes"]:
                chunks.append(msg["bytes"])
                log.debug(f"chunk {len(msg['bytes'])}B  total={len(chunks)}")

            elif "text" in msg:
                data = json.loads(msg["text"])
                kind = data.get("type")

                if kind == "config":
                    language = data.get("language")
                    log.info(f"config: language={language}")
                    await ws.send_json({"type": "config_ack", "language": language})

                elif kind == "partial":
                    # skip if a partial is already in flight (prevent queue buildup)
                    if partial_in_flight or not chunks:
                        await ws.send_json({"type": "partial", "text": partial_text_so_far})
                        continue

                    # transcribe only new chunks (incremental)
                    new_chunks = chunks[partial_chunk_cursor:]
                    if not new_chunks:
                        await ws.send_json({"type": "partial", "text": partial_text_so_far})
                        continue

                    partial_in_flight = True
                    # chunks[0] has the WebM EBML header — required for ffmpeg to parse any slice
                    header = chunks[0] if partial_chunk_cursor > 0 else b""
                    new_audio = header + b"".join(new_chunks)
                    snapshot_cursor = len(chunks)

                    try:
                        async with _partial_sem:
                            new_text = await loop.run_in_executor(
                                None, lambda: _transcribe(new_audio, language)
                            )
                        partial_text_so_far = (partial_text_so_far + " " + new_text).strip()
                        partial_chunk_cursor = snapshot_cursor
                        log.info(f"partial → {partial_text_so_far[:80]}")
                        await ws.send_json({"type": "partial", "text": partial_text_so_far})
                    except Exception as e:
                        log.error(f"partial error: {e}")
                        await ws.send_json({"type": "partial", "text": partial_text_so_far})
                    finally:
                        partial_in_flight = False

                elif kind == "stop":
                    if not chunks:
                        await ws.send_json({"type": "final", "text": ""})
                        await ws.close()
                        break
                    audio = b"".join(chunks)
                    try:
                        # final uses its own semaphore — not blocked by partial queue
                        async with _final_sem:
                            text = await loop.run_in_executor(
                                None, lambda: _transcribe(audio, language)
                            )
                        log.info(f"final → {text[:120]}")
                        await ws.send_json({"type": "final", "text": text})
                    except Exception as e:
                        log.error(f"final error: {e}")
                        await ws.send_json({"type": "error", "message": str(e)})
                    await ws.close()
                    break

    except WebSocketDisconnect:
        log.info("WS disconnected")
    except Exception as e:
        log.error(f"WS error: {e}")
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
