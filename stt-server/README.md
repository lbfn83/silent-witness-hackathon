# Silent Witness STT Server

This FastAPI server converts voice recordings from the Silent Witness PWA into text. It uses `faster-whisper` and supports both one-shot HTTP transcription and WebSocket streaming transcription.

## Purpose

- `/transcribe`: transcribes a base64-encoded audio payload in one request.
- `/ws/transcribe`: receives browser audio chunks over WebSocket and returns partial/final transcripts.
- `/health`, `/ping`: checks server and model status.

## Structure

```text
stt-server/
|-- main.py                 # FastAPI app, Whisper model loading, HTTP/WS transcription APIs
|-- docker-compose.yml      # CPU/GPU runtime configuration
|-- Dockerfile              # CUDA runtime container
|-- modal_stt_native.py     # Modal GPU deployment script
`-- requirements.txt        # Python dependencies
```

## Environment Variables

| Name | Default | Description |
|---|---:|---|
| `WHISPER_MODEL` | `large-v3-turbo` | faster-whisper model to load |
| `DEVICE` | `cuda` | `cuda` or `cpu` |
| `COMPUTE_TYPE` | `float16` | Usually `float16` for GPU and `int8` for CPU |

## Run With Docker Compose

CPU test mode:

```bash
cd stt-server
docker compose --profile cpu up --build
```

GPU mode:

```bash
cd stt-server
docker compose --profile gpu up --build
```

The server runs at `http://localhost:8000`.

The CPU profile uses `WHISPER_MODEL=base`, `DEVICE=cpu`, and `COMPUTE_TYPE=int8` for local testing. The GPU profile uses `large-v3-turbo`, CUDA, and `float16`.

GPU mode requires NVIDIA drivers and NVIDIA Container Toolkit.

## Run Locally With Python

Local execution requires `ffmpeg`.

CPU example:

```powershell
cd stt-server
pip install -r requirements.txt
$env:WHISPER_MODEL = "base"
$env:DEVICE = "cpu"
$env:COMPUTE_TYPE = "int8"
uvicorn main:app --host 0.0.0.0 --port 8000
```

GPU example:

```powershell
cd stt-server
pip install -r requirements.txt
$env:WHISPER_MODEL = "large-v3-turbo"
$env:DEVICE = "cuda"
$env:COMPUTE_TYPE = "float16"
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API

### `GET /health`

```bash
curl http://localhost:8000/health
```

Example response:

```json
{
  "status": "ok",
  "model": "large-v3-turbo",
  "device": "cuda"
}
```

### `POST /transcribe`

Transcribes base64 audio. `audio_base64` can be either a `data:audio/webm;base64,...` URL or a raw base64 string.

Request:

```json
{
  "audio_base64": "base64-audio",
  "language": "en"
}
```

`language` is optional. If omitted, Whisper auto-detects the language.

Response:

```json
{
  "text": "transcribed text"
}
```

### `WS /ws/transcribe`

WebSocket endpoint for real-time browser recording chunks.

Message flow:

1. The client opens a WebSocket connection.
2. The client optionally sends a config message.
3. The client sends audio chunks as binary frames.
4. The client sends `{"type":"partial"}` when it wants an intermediate transcript.
5. The client sends `{"type":"stop"}` when recording ends.
6. The server sends a `final` message and closes the connection.

Config message:

```json
{
  "type": "config",
  "language": "en"
}
```

Partial request:

```json
{
  "type": "partial"
}
```

Partial response:

```json
{
  "type": "partial",
  "text": "partial transcript"
}
```

Stop request:

```json
{
  "type": "stop"
}
```

Final response:

```json
{
  "type": "final",
  "text": "final transcript"
}
```

## Concurrency

`main.py` uses semaphores to prevent too many transcription jobs from running at once.

| Job | Max concurrent jobs |
|---|---:|
| final transcription | 4 |
| partial transcription | 2 |

If a partial transcription is already running, additional partial requests are not queued. The server returns the latest partial text instead. Final transcription uses a separate semaphore so that recording stop is not blocked by the partial queue.

## Modal Deployment

`modal_stt_native.py` builds the runtime directly on Modal from a CUDA runtime image.

The script references `stt-server/main.py` by relative path, so run the deploy command from the repository root.

```bash
cd ..
modal deploy stt-server/modal_stt_native.py
```

After deployment, check `/health` on the Modal URL.

```bash
curl https://<modal-url>/health
```

## PWA Integration

The PWA uses the STT server URL from `pwa-app/app.js` or from deployment-time URL replacement. For local testing, use `ws://localhost:8000/ws/transcribe`. For an HTTPS-deployed PWA, use `wss://.../ws/transcribe`.

If the browser page is served over HTTPS, HTTP/WebSocket connections may be blocked by mixed content rules.

## Operational Notes

- CORS currently allows all origins. Restrict allowed origins before public deployment.
- This server does not implement authentication. Do not expose it directly to the public internet without an access-controlled proxy or private network boundary.
- WebM chunks are written to temporary files for transcription and deleted afterward. They are not stored long term.
- The first request or first deployment can be slow because the Whisper model must be downloaded and loaded.
