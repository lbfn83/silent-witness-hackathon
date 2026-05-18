# Silent Witness PWA App

This is the browser client for Silent Witness. It is a Progressive Web App (PWA) disguised as a calculator. When the correct PIN is entered, the encrypted evidence vault opens. The app is built with plain HTML, CSS, and JavaScript, with no frontend framework.

## Purpose

- Disguise the app behind a functional calculator UI.
- Open the encrypted vault after PIN entry.
- Collect photo, voice, and text evidence.
- Connect to the STT server over WebSocket for speech-to-text transcription.
- Send evidence to the LLM server and receive structured AI analysis drafts.
- Let the user review and correct AI-generated fields before finalizing records.
- Store records in IndexedDB encrypted with AES-GCM.
- Provide ZIP export/import, timeline, pattern view, settings, and decoy vault support.

## Structure

```text
pwa-app/
|-- index.html              # Main screen structure: onboarding, calculator, vault
|-- styles.css              # App-wide styling
|-- app.js                  # App entrypoint, PIN unlock, server URLs, PWA install, safety exit
|-- calculator.js           # Calculator behavior and PIN/decoy PIN detection
|-- vault.js                # Vault screens, evidence capture flow, review/timeline/settings
|-- storage.js              # Encrypted IndexedDB storage
|-- stt-client.js           # STT WebSocket client
|-- inference_chat.js       # LLM server HTTP client
|-- audio.js                # Legacy audio capture helper
|-- export.js               # ZIP export/import
|-- sw.js                   # Service Worker and app shell cache
|-- manifest.json           # PWA manifest disguised as a calculator
`-- demo-data/
    `-- seed.js             # Fictional demo evidence dataset loaded on first vault open
```

## Run Locally

This is a static app and does not require a build step. Do not open it directly with `file://`; browser APIs such as Service Worker, Web Crypto, and MediaRecorder should be tested through an HTTP server.

From the repository root:

```bash
python -m http.server 5501 --directory pwa-app
```

Or:

```bash
npx serve pwa-app
```

Open:

```text
http://localhost:5501
```

The default PIN is `1337`. On the calculator screen, enter `1337` and press `=` to open the vault. A different PIN can be set during first-run onboarding.

## Server Configuration

`app.js` stores backend URLs as placeholders:

```js
const LLM_SERVER_URL = '__LLM_SERVER_URL__';
const STT_URL        = '__STT_SERVER_URL__';
```

During GitHub Pages deployment, `.github/workflows/deploy.yml` replaces these values using GitHub Actions Variables.

| Variable | Example | Description |
|---|---|---|
| `LLM_SERVER_URL` | `https://example-llm.modal.run` | LLM FastAPI server URL |
| `STT_SERVER_URL` | `wss://example-stt.modal.run/ws/transcribe` | STT WebSocket URL |

For quick local testing, you can temporarily replace the placeholders in `app.js`:

```js
const LLM_SERVER_URL = 'http://localhost:8001';
const STT_URL        = 'ws://localhost:8000/ws/transcribe';
```

Do not commit real deployment URLs unless that is intentional.

## Backend Requirements

The PWA connects to two backend services.

| Server | Default local URL | Purpose |
|---|---|---|
| LLM server | `http://localhost:8001` | `/analyze`, `/chat`, `/health` |
| STT server | `ws://localhost:8000/ws/transcribe` | Real-time speech transcription |

If the PWA is served over HTTPS, the backend services must also be reachable over HTTPS/WSS. Browsers may block HTTP or `ws://` requests from an HTTPS page because of mixed content rules.

## Gemma 4 Integration Flow

The PWA does not run Gemma 4 directly in the browser. Instead, it sends user evidence to the `llm-server` `/analyze` endpoint, and the server calls Gemma 4 (`gemma4:e2b`) through Ollama.

Actual code path:

```text
User evidence input
  -> vault.js
  -> _analyzeAndUpdate()
  -> inference_chat.js
  -> POST {LLM_SERVER_URL}/analyze
  -> llm-server/main.py
  -> Ollama /api/chat
  -> Gemma 4 gemma4:e2b
  -> structured JSON analysis result
  -> vault.js saves the record as pending_review
  -> user reviews/corrects the analysis before finalizing
```

Files that show the Gemma 4 integration from the PWA side:

| File | Role |
|---|---|
| `app.js` | Holds the `LLM_SERVER_URL` placeholder and creates `InferenceChat`. |
| `vault.js` | Calls LLM analysis from `_analyzeAndUpdate()` after evidence is saved, then applies results to the record. |
| `inference_chat.js` | Sends `/analyze` and `/chat` HTTP requests. If an image is present, it strips the data URL prefix and sends `image_base64`. |
| `llm-server/main.py` | Implements the actual Gemma 4 call and prompt selection on the server side. |

The PWA sends `/analyze` requests in this shape:

```json
{
  "text": "User notes or voice transcript",
  "image_base64": "optional image base64"
}
```

Gemma 4 output is not saved as a final record automatically. The app saves the raw evidence first, then marks the record as `pending_review` after successful analysis. The user can inspect and correct AI-generated fields before the record is treated as reviewed.

## Main Flow

1. The user completes onboarding.
2. The calculator screen appears.
3. PIN + `=` unlocks the vault.
4. On the first real vault open, if there are no records, `demo-data/seed.js` is loaded automatically.
5. The user saves photo, voice, or text evidence.
6. The raw record is encrypted and saved to IndexedDB first.
7. If LLM analysis succeeds, the record moves to `pending_review`.
8. The user reviews and corrects the analysis before managing it as a final record.

If the STT server is unavailable, voice recording continues in local-only mode. Audio records without transcripts remain in `draft_raw` so transcription and analysis can be retried later when the STT server is available.

## Storage And Security

- Record payloads are stored in IndexedDB.
- Stored records are encrypted with AES-GCM through the Web Crypto API.
- The PIN derives a KEK (Key Encryption Key) using PBKDF2-SHA256 with 100,000 iterations.
- Records are encrypted with a separate DEK (Data Encryption Key).
- Changing the PIN re-wraps the DEK; records do not need to be re-encrypted.
- The PIN itself is not stored. Only hash and length metadata are stored in localStorage.
- A decoy PIN opens a separate empty vault backed by a separate IndexedDB database (`caldata`).

The current POC stores the salt and wrapped DEK in localStorage. That is acceptable for hackathon-stage demonstration, but production hardening should consider OS keystore support, OPFS, or a native wrapper.

## PWA Behavior

`manifest.json` sets the app name to `Calculator` and the short name to `Calc`. When installed to the home screen, the app is designed to look like a calculator utility.

`sw.js` caches the app shell.

- HTML, CSS, JavaScript, and demo data are cached.
- LLM/STT server requests are not cached.
- localhost requests are not cached.
- During GitHub Pages deployment, `__CACHE_VERSION__` is replaced with the commit SHA and run number.

## Safety Features

- Calculator disguise screen
- Android back button panic exit
- Shake-to-exit
- Vault idle auto-lock
- Auto-lock check when the app resumes
- Safety exit button
- Decoy PIN and decoy vault
- PWA install banner is removed inside the vault

## Export / Import

`export.js` uses JSZip to create a ZIP export.

The ZIP contains:

- `data.json`: full record JSON
- `report.md`: human-readable summary report
- `attachments/photos/`: photo attachments
- `attachments/audio/`: audio attachments

If the browser supports the Web Share API, export uses the native share sheet. Otherwise, it falls back to a download link.

## GitHub Pages Deployment

The deployment workflow is `.github/workflows/deploy.yml`.

Currently, it runs on pushes to `wonjae/additional_prompts` or through manual dispatch.

Required GitHub Actions Variables:

```text
LLM_SERVER_URL
STT_SERVER_URL
```

Deployment-time replacements:

```bash
sed -i "s|__LLM_SERVER_URL__|${{ vars.LLM_SERVER_URL }}|g" pwa-app/app.js
sed -i "s|__STT_SERVER_URL__|${{ vars.STT_SERVER_URL }}|g" pwa-app/app.js
sed -i "s|__CACHE_VERSION__|${{ github.sha }}-${{ github.run_number }}|g" pwa-app/sw.js
```

Then the entire `pwa-app` directory is uploaded as the GitHub Pages artifact.

## Browser Requirements

Recommended:

- Latest Chrome or Safari
- HTTPS deployment
- MediaRecorder support
- Web Crypto API support
- IndexedDB support
- Service Worker support

Camera, microphone, PWA install, and export behavior can vary across mobile browsers and operating systems. Before a demo, test photo capture, voice recording, home-screen install, and export on the target device.

## Development Notes

- Avoid committing real backend URLs in `app.js`.
- If changes do not appear immediately, clear browser caches or unregister the Service Worker in DevTools.
- `demo-data/seed.js` is a fictional dataset and does not represent a real person.
- Mobile debug overlay logic still exists in the app. Verify whether it is visible before release.
- If LLM analysis fails, the raw evidence is still saved first so the user can review it later.
