# Silent Witness

**A calculator-disguised evidence vault for domestic violence survivors, powered by Gemma 4.**

Submission: [Gemma 4 Good Hackathon](https://www.kaggle.com/competitions/gemma-4-good-hackathon) 

---

## The Problem

Survivors of domestic violence need to document evidence — injuries, threatening messages, incidents — but the act of doing so is itself dangerous. A dedicated evidence app on a phone can be found. A browser history entry can be seen. Sending photos or notes to a cloud service leaves a trail.

## What Silent Witness Does

Silent Witness is a PWA that looks and works exactly like a calculator. Entering the correct PIN opens an encrypted evidence vault. The vault lets a survivor capture photo, voice, and text evidence; Gemma 4 analyzes each entry and returns a structured, court-appropriate description. Records are stored encrypted on the device. There is no account and no cloud sync; inference requests are sent only to the project's private Gemma/STT servers.

When the survivor is ready to act, they can export the complete evidence package as a ZIP file containing structured JSON records, a readable report, and all attached photos.

---

## What We Tried That Didn't Work

### Browser-based speech-to-text (Whisper WASM / WebGPU)

Our original goal was to run transcription entirely in the browser so no audio ever left the device. We first considered using Gemma itself for transcription: it was already in the stack, and eliminating a second model would have simplified the architecture. The deal breaker was streaming. Survivors needed to see their words appear in real time as they spoke, and Gemma's architecture is not suited to incremental audio transcription the way a dedicated STT model is.

We moved to Whisper and tested several browser-based approaches: `whisper.cpp` compiled to WASM, `transformers.js`, and Web Whisper. Whisper Tiny was fast enough but produced transcripts too inaccurate to be useful as legal testimony. Whisper Small was accurate but unusable in practice: on iOS PWA, the model took over 30 seconds to load and 40-60 seconds to transcribe a single voice note. A survivor recording a distressing incident cannot wait a minute per sentence.

We abandoned browser-based STT and moved to self-hosted `faster-whisper large-v3-turbo` on a GPU, which delivers near-realtime partial transcripts over WebSocket.

### Pure on-device inference (the zero-network original vision)

The earliest design spec had a hard constraint: zero HTTP requests, ever. Evidence never leaves the device. We explored running Gemma 4 E2B directly in the browser via WebGPU using `transformers.js`.

That constraint had a significant downstream consequence: `transformers.js` does not support function calling, so the entire prompt and analysis architecture had to be designed around a single system prompt with the JSON structure specified inline, relying on the model to follow the format, with manual parsing to verify that the output was valid JSON at all.

We built that system. However, even quantized versions of the model were too large to run reliably in the browser, and iOS WebGPU support was insufficient. Pure on-device inference was impractical within the hackathon timeline and likely impractical in production for the foreseeable future.

Moving to a private server unlocked Ollama's native `format` parameter for token-level JSON schema enforcement. That shift allowed us to redesign the analysis pipeline around hard structured output, which is what the two-stage classifier plus per-type extractor architecture relies on today.

The compromise preserves the spirit of the original constraint: records stay encrypted on the device, and AI inference runs on project-controlled infrastructure, not on any commercial AI provider. No evidence touches Google, Apple, OpenAI, or any third-party AI service.

---

## Architecture

```
┌─────────────────────────────────────────┐
│           Browser (PWA)                  │
│                                          │
│  Calculator screen (disguise)            │
│       ↓ correct PIN                      │
│  Evidence Vault                          │
│  ├── Photo / Voice / Text capture        │
│  ├── IndexedDB (AES-GCM encrypted)       │
│  ├── stt-client.js ──────────────────────┼──→ STT Server
│  │     WebSocket audio chunks            │     faster-whisper large-v3-turbo
│  │     ← partial + final transcript      │     Modal GPU
│  └── inference_chat.js ─────────────────┼──→ LLM Server
│        POST /analyze                     │     Ollama + Gemma 4 (gemma4:e2b)
│        ← structured JSON                 │     Modal GPU
└─────────────────────────────────────────┘
```

### Gemma 4 Analysis Pipeline (two stages)

```
POST /analyze (text + optional image_base64)
  │
  ├─ Stage 1: CLASSIFIER_PROMPT
  │    Gemma 4 reads the evidence and returns one of 9 evidence types:
  │    injury_photo, digital_communication_photo, scene_photo, ...
  │
  └─ Stage 2: prompts/{evidence_type}.v1.md + EXTRACT_FORMAT (JSON schema)
       Gemma 4 returns structured fields:
       narrative.model_summary, severity_signals[], confidence, gaps[]
```

---

## Gemma 4 Implementation Map

The Gemma 4 path is intentionally small and easy to inspect:

| Implementation point | File |
|---|---|
| Model selection: `gemma4:e2b` via Ollama | `llm-server/main.py` |
| Main analysis endpoint: `POST /analyze` | `llm-server/main.py` |
| Image input passed through Ollama `images` | `llm-server/main.py` |
| Evidence-type prompt loading | `llm-server/prompts/*.v1.md` |
| PWA client call into `/analyze` | `pwa-app/inference_chat.js` |

Evidence-type prompts: `llm-server/prompts/injury_photo.v1.md`, `digital_communication_photo.v1.md`, `scene_photo.v1.md`, and 6 others.

---

## Repo Structure

```
silent-witness-hackathon/
├── pwa-app/                    # Browser PWA
│   ├── index.html              # All screens: calculator, onboarding, vault
│   ├── app.js                  # Entrypoint, PIN unlock, server URLs
│   ├── vault.js                # Evidence capture, review, timeline
│   ├── inference_chat.js       # LLM server HTTP client
│   ├── stt-client.js           # STT WebSocket client
│   ├── storage.js              # AES-GCM IndexedDB
│   ├── export.js               # ZIP export/import
│   ├── calculator.js           # Calculator + PIN detection
│   └── demo-data/
│       └── sample_evidence_package.zip   # Demo records (fictional)
├── llm-server/                 # Gemma 4 analysis server
│   ├── main.py                 # FastAPI: /analyze, /chat, /health
│   ├── prompts/                # Per-evidence-type Gemma prompts
│   ├── modal_deploy_llm.py     # Modal GPU deployment
│   └── docker-compose.yml      # Local Ollama runtime
└── stt-server/                 # Speech-to-text server
    ├── main.py                 # FastAPI: /transcribe, /ws/transcribe
    ├── modal_stt_native.py     # Modal GPU deployment
    └── docker-compose.yml      # CPU/GPU runtime
```

---

## Running Locally

### PWA

No build step required.

```bash
python -m http.server 5501 --directory pwa-app
```

Open `http://localhost:5501`. Default PIN: `1337 =`.

Replace the placeholder URLs in `pwa-app/app.js` before testing with local servers:

```js
const LLM_SERVER_URL = 'http://localhost:8001';
const STT_URL        = 'ws://localhost:8000/ws/transcribe';
```

### LLM Server

Requires Ollama installed and running.

```bash
cd llm-server
pip install -r requirements.txt
ollama pull gemma4:e2b
uvicorn main:app --host 0.0.0.0 --port 8001
```

Or with Docker Compose (pulls the model automatically):

```bash
cd llm-server
docker compose --profile cpu up --build   # CPU
docker compose --profile gpu up --build   # GPU (NVIDIA)
```

### STT Server

Requires `ffmpeg`.

```bash
cd stt-server
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Or with Docker Compose:

```bash
cd stt-server
docker compose --profile cpu up --build   # CPU (uses whisper base)
docker compose --profile gpu up --build   # GPU (uses large-v3-turbo)
```

### Deployed Servers (Modal)

```bash
modal deploy llm-server/modal_deploy_llm.py
modal deploy stt-server/modal_stt_native.py
```

---

## Security Model

| Property | Implementation |
|---|---|
| Disguise | PWA manifest: name `Calculator`, icon is a calculator |
| Encryption | AES-GCM via Web Crypto API; PIN → PBKDF2-SHA256 (100k iterations) → KEK → DEK |
| Decoy vault | Second PIN opens a separate empty `caldata` database |
| Panic exit | Android hardware back, shake-to-exit, safety exit button |
| No stored PIN | Only hash + length stored in localStorage |

Evidence is encrypted before being written to IndexedDB. The PIN is never stored.

---

## Track Eligibility

| Track | Basis |
|---|---|
| **Safety & Trust** | Survivor safety tool with on-device encryption, disguised UI, and zero persistent network footprint from the device |
| **Ollama** | Gemma 4 (`gemma4:e2b`) runs via Ollama on both local Docker Compose and Modal GPU deployment |
| **Main Track** | Functional PWA with real Gemma 4 multimodal analysis, deployed live |

---

## Demo Notes

- Default PIN: `1337 =`
- The deployed GPU servers may cold start.
- Voice transcription requires the STT server to be available.

## Known Limitations

- Silent Witness is not legal or medical advice.
- AI output must be reviewed by the user before it is treated as final.
- Deployed GPU servers may cold start.

## License

MIT License. See `LICENSE.txt`.
