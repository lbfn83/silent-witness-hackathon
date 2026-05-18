# Silent Witness LLM Server

This FastAPI server analyzes text and images collected by the Silent Witness PWA. It sends requests to a Gemma model served by Ollama, classifies the evidence type, and returns structured JSON analysis.

## Purpose

- `/analyze`: accepts evidence text and an optional image, classifies the evidence type, then returns structured analysis using the matching prompt.
- `/chat`: general chat endpoint for development and testing. If an image is provided, it is attached to the last user message.
- `/health`: checks the FastAPI server and Ollama connection state.
- `/ping`: simple health check endpoint.

## Gemma 4 Implementation

This service is the visible Gemma 4 implementation layer for Silent Witness.

The runtime path is:

```text
PWA evidence capture
  -> pwa-app/inference_chat.js
  -> POST /analyze
  -> FastAPI llm-server/main.py
  -> Ollama /api/chat
  -> Gemma 4 model: gemma4:e2b
  -> structured JSON returned to the PWA
  -> user review before final save
```

The model is selected in `main.py`:

```python
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL      = os.getenv("LLM_MODEL",  "gemma4:e2b")
```

`/analyze` uses Gemma 4 in two stages:

1. **Evidence classification**: `CLASSIFIER_PROMPT` asks Gemma 4 to choose one evidence type, such as `injury_photo`, `digital_communication_photo`, or `journal_entry_photo`.
2. **Structured extraction**: the server loads `prompts/{evidence_type}.v1.md` and calls Gemma 4 again with a JSON schema (`EXTRACT_FORMAT`) so the PWA receives stable structured fields.

Image evidence is passed to Gemma through Ollama's chat `images` field:

```python
if req.image_base64:
    user_msg["images"] = [req.image_base64]
```

The Docker Compose and Modal deployment paths both use the same model setting:

```text
LLM_MODEL=gemma4:e2b
```

This makes the implementation easy to verify in code:

| File | What to check |
|---|---|
| `main.py` | FastAPI endpoints, Gemma model selection, `/analyze` pipeline |
| `prompts/*.v1.md` | Evidence-type-specific Gemma prompts |
| `docker-compose.yml` | Local Ollama runtime and `LLM_MODEL` |
| `modal_deploy_llm.py` | Modal GPU deployment with Ollama and model cache |
| `pwa-app/inference_chat.js` | Frontend call into `/analyze` and `/chat` |

## Structure

```text
llm-server/
|-- main.py                 # FastAPI app, Ollama calls, analyze/chat APIs
|-- prompts/                # Gemma prompts and schema docs by evidence type
|-- docker-compose.yml      # Local Ollama + LLM API runtime
|-- Dockerfile              # LLM API container
|-- modal_deploy_llm.py     # Modal GPU deployment script
`-- requirements.txt        # Python dependencies
```

## Environment Variables

| Name | Default | Description |
|---|---:|---|
| `LLM_MODEL` | `gemma4:e2b` | Ollama model name |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL used by the LLM API |
| `PYTHONUNBUFFERED` | none | Forces immediate log output in Docker |

## Run With Docker Compose

CPU:

```bash
cd llm-server
docker compose --profile cpu up --build
```

GPU:

```bash
cd llm-server
docker compose --profile gpu up --build
```

After startup, the LLM API runs at `http://localhost:8001`, and Ollama runs at `http://localhost:11434`.

On first run, the `ollama-pull-*` service downloads the model specified by `LLM_MODEL`. The download can take time. GPU mode requires NVIDIA Container Toolkit.

## Run Locally With Python

If Ollama is already running locally and the model is available, you can run only the API server.

```bash
cd llm-server
pip install -r requirements.txt
ollama pull gemma4:e2b
uvicorn main:app --host 0.0.0.0 --port 8001
```

To use a different Ollama URL or model:

```bash
set OLLAMA_URL=http://localhost:11434
set LLM_MODEL=gemma4:e2b
uvicorn main:app --host 0.0.0.0 --port 8001
```

In PowerShell:

```powershell
$env:OLLAMA_URL = "http://localhost:11434"
$env:LLM_MODEL = "gemma4:e2b"
uvicorn main:app --host 0.0.0.0 --port 8001
```

## API

### `GET /health`

Returns the current model and whether Ollama is reachable.

```bash
curl http://localhost:8001/health
```

Example response:

```json
{
  "status": "ok",
  "model": "gemma4:e2b",
  "ollama": true
}
```

### `POST /analyze`

Analyzes evidence. `image_base64` is optional and should be passed as a raw base64 string.

```bash
curl -X POST http://localhost:8001/analyze \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Bruising on left arm after incident.\",\"image_base64\":null}"
```

Request body:

```json
{
  "text": "User note or transcript",
  "image_base64": "optional-base64-image"
}
```

The response is JSON containing the classified evidence type and extracted analysis fields. Important common fields:

| Field | Description |
|---|---|
| `evidence_type` | Classified evidence type |
| `narrative.model_summary` | Court-appropriate observational summary |
| `severity_signals` | Risk signals from a fixed enum |
| `confidence` | Model confidence score |
| `paired_evidence_suggested` | Related evidence that may be useful to collect |
| `gaps` | Fields the model could not determine and suggested follow-up |

### `POST /chat`

Development chat endpoint.

```json
{
  "messages": [
    {"role": "user", "content": "Summarize this evidence."}
  ],
  "image_base64": null
}
```

Response:

```json
{
  "content": "model response"
}
```

## Analysis Flow

1. `/analyze` receives text and an optional image.
2. `CLASSIFIER_PROMPT` classifies the evidence type.
3. The server loads `prompts/{evidence_type}.v1.md`.
4. The server calls Ollama `/api/chat` with the structured output schema.
5. The server parses JSON from the model response and returns it to the client.

If a prompt file is missing, the server falls back to `GENERIC_FALLBACK_PROMPT`.

## Modal Deployment

The Modal deployment script runs Ollama inside the same Modal function and stores model cache in the `/root/.ollama` volume.

```bash
cd llm-server
modal deploy modal_deploy_llm.py
```

After deployment, check `/health` on the Modal URL.

```bash
curl https://<modal-url>/health
```

## PWA Integration

The PWA uses the LLM server URL from `pwa-app/app.js`. For local testing, set it to `http://localhost:8001` or to the deployed server URL.

If the PWA is served over HTTPS, the LLM server must also be reachable over HTTPS. Otherwise, the browser may block the request because of mixed content rules.

## Operational Notes

- CORS currently allows all origins. Restrict allowed origins before public deployment.
- This server does not implement authentication. Do not expose it directly to the public internet without an access-controlled proxy or private network boundary.
- Model responses can fail JSON parsing. If parsing fails, `/analyze` returns `{"error":"parse_failed", ...}` with part of the raw model output.
- Analysis results are drafts for user review and correction, not automatic determinations.
