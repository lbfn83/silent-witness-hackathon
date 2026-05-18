// stt-client.js
// Drop-in replacement for AudioCapture.
// Streams MediaRecorder audio chunks to a private faster-whisper WebSocket
// server instead of using Web Speech API (which requires Google/Apple servers).
//
// Protocol (matches stt-server/main.py):
//   → {"type":"config","language":"ko"}
//   → <ArrayBuffer>  (MediaRecorder chunk, every CHUNK_INTERVAL_MS)
//   → {"type":"partial"}   (poll)  ← {"type":"partial","text":"..."}
//   → {"type":"stop"}              ← {"type":"final","text":"..."}  server closes

const CHUNK_INTERVAL_MS  = 1500;  // emit audio chunk every 1.5 s
const PARTIAL_INTERVAL_MS = 3000;  // request partial transcript every 3 s
const WS_CONNECT_TIMEOUT  = 5000;  // give up connecting after 5 s

export class SttClient {
  constructor({
    url,
    onStateChange   = () => {},
    onInterim       = () => {},
    onFinal         = () => {},
    onError         = () => {},
    onLocalFallback = () => {},
  } = {}) {
    this._url               = url;
    this._onStateChange     = onStateChange;
    this._onInterim         = onInterim;
    this._onFinal           = onFinal;
    this._onError           = onError;
    this._onLocalFallback   = onLocalFallback;

    this._ws              = null;
    this._mediaRecorder   = null;
    this._chunks          = [];
    this._blob            = null;
    this._state           = 'idle';
    this._localOnly       = false;
    this._partialPoller   = null;
    this._finalResolve    = null;
    this._finalReject     = null;

    console.log('[STT] client created. url:', url);
  }

  get state() { return this._state; }
  getBlob()   { return this._blob;  }

  // ── Public API (same surface as AudioCapture) ─────

  async start() {
    console.log('[STT] start() called. state:', this._state);
    if (this._state !== 'idle') {
      console.warn('[STT] start() ignored — not idle');
      return;
    }

    // Try WebSocket — fall back to local-only recording if unavailable
    this._localOnly = false;
    console.log('[STT] connecting to', this._url);
    try {
      const ws = await this._openWs();
      this._ws = ws;
      const lang = (localStorage.getItem('_lg') || 'en').split('-')[0];
      console.log('[STT] WebSocket connected ✓ — language:', lang);
      ws.send(JSON.stringify({ type: 'config', language: lang }));
    } catch (err) {
      console.warn('[STT] WebSocket unavailable — switching to local recording only:', err.message);
      this._localOnly = true;
      this._ws = null;
      this._onLocalFallback();
    }

    console.log('[STT] requesting mic...');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[STT] mic acquired ✓');
    } catch (err) {
      console.error('[STT] mic error:', err.name, err.message);
      if (this._ws) { try { this._ws.close(); } catch (_) {} this._ws = null; }
      this._localOnly = false;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this._onError(new Error('Microphone permission denied. Please allow access in settings.'));
      } else if (err.name === 'NotFoundError') {
        this._onError(new Error('No microphone found on this device.'));
      } else {
        this._onError(new Error(`Mic error: ${err.message}`));
      }
      return;
    }

    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      '',
    ].find(t => t === '' || MediaRecorder.isTypeSupported(t));

    console.log('[STT] MediaRecorder mimeType:', mimeType || '(browser default)', '| localOnly:', this._localOnly);

    this._chunks = [];
    this._mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    this._mediaRecorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      this._chunks.push(e.data);
      console.log(`[STT] chunk ${this._chunks.length}: ${e.data.size}B`);
      if (!this._localOnly && this._ws?.readyState === WebSocket.OPEN) {
        e.data.arrayBuffer().then(buf => {
          if (this._ws?.readyState === WebSocket.OPEN) {
            this._ws.send(buf);
            console.log(`[STT] chunk sent to server (${buf.byteLength}B)`);
          }
        });
      }
    };

    this._mediaRecorder.start(CHUNK_INTERVAL_MS);
    console.log('[STT] MediaRecorder started. chunk interval:', CHUNK_INTERVAL_MS, 'ms');

    if (!this._localOnly) {
      this._partialPoller = setInterval(() => {
        if (this._ws?.readyState === WebSocket.OPEN) {
          console.log('[STT] polling partial transcript...');
          this._ws.send(JSON.stringify({ type: 'partial' }));
        }
      }, PARTIAL_INTERVAL_MS);
    }

    this._setState('recording');
    console.log('[STT] recording ✓ | mode:', this._localOnly ? 'local-only' : 'streaming');
  }

  stop() {
    console.log('[STT] stop() called. state:', this._state);
    if (this._state !== 'recording') {
      console.warn('[STT] stop() ignored — not recording');
      return Promise.resolve(null);
    }
    this._setState('transcribing');

    clearInterval(this._partialPoller);
    this._partialPoller = null;

    return new Promise((resolve, reject) => {
      this._finalResolve = resolve;
      this._finalReject  = reject;

      this._mediaRecorder.onstop = () => {
        const mimeType = this._mediaRecorder?.mimeType || 'audio/webm';
        this._blob = new Blob(this._chunks, { type: mimeType });
        console.log(`[STT] MediaRecorder stopped. blob: ${this._blob.size}B, chunks: ${this._chunks.length}, localOnly: ${this._localOnly}`);
        this._mediaRecorder?.stream.getTracks().forEach(t => t.stop());
        this._mediaRecorder = null;

        if (this._localOnly) {
          // No transcription server — resolve with empty transcript, blob is available via getBlob()
          this._onFinal('');
          this._setState('idle');
          this._finalResolve?.(this._blob);
          this._finalResolve = null;
          this._finalReject  = null;
        } else if (this._ws?.readyState === WebSocket.OPEN) {
          console.log('[STT] sending stop → waiting for final...');
          this._ws.send(JSON.stringify({ type: 'stop' }));
        } else {
          console.error('[STT] WS not open at stop time. readyState:', this._ws?.readyState);
          const err = new Error('Voice transcription server disconnected.');
          this._onError(err);
          this._finalReject?.(err);
          this._finalResolve = null;
          this._finalReject  = null;
          this._setState('idle');
        }
      };

      this._mediaRecorder.stop();
    });
  }

  cancel() {
    console.log('[STT] cancel() called');
    this._localOnly = false;
    clearInterval(this._partialPoller);
    this._partialPoller = null;

    if (this._mediaRecorder) {
      try {
        this._mediaRecorder.stream.getTracks().forEach(t => t.stop());
        this._mediaRecorder.stop();
      } catch (_) {}
      this._mediaRecorder = null;
    }

    if (this._ws) {
      try { this._ws.close(); } catch (_) {}
      this._ws = null;
    }

    if (this._finalReject) {
      this._finalReject(new Error('cancelled'));
      this._finalResolve = null;
      this._finalReject  = null;
    }

    this._setState('idle');
  }

  // ── Private ────────────────────────────────────────

  _openWs() {
    return new Promise((resolve, reject) => {
      let opened = false;
      console.log('[STT] opening WebSocket:', this._url);
      const ws = new WebSocket(this._url);

      const timeout = setTimeout(() => {
        console.error('[STT] connection timed out after', WS_CONNECT_TIMEOUT, 'ms');
        ws.close();
        reject(new Error('STT server connection timed out'));
      }, WS_CONNECT_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(timeout);
        opened = true;
        console.log('[STT] ws.onopen ✓');

        ws.onmessage = (event) => this._handleMessage(event);

        ws.onclose = (e) => {
          console.warn('[STT] ws.onclose. code:', e.code, 'reason:', e.reason);
          if (this._state === 'idle') return;
          const err = new Error('Voice transcription server disconnected.');
          this._onError(err);
          if (this._finalReject) {
            this._finalReject(err);
            this._finalResolve = null;
            this._finalReject  = null;
          }
          clearInterval(this._partialPoller);
          this._partialPoller = null;
          this._setState('idle');
        };

        resolve(ws);
      };

      ws.onerror = (e) => {
        console.error('[STT] ws.onerror:', e);
        clearTimeout(timeout);
        if (!opened) reject(new Error('STT server unreachable'));
      };

      ws.onclose = (e) => {
        console.warn('[STT] ws.onclose (before open). code:', e.code);
        clearTimeout(timeout);
        if (!opened) reject(new Error('STT server unreachable'));
      };
    });
  }

  _handleMessage(event) {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    console.log('[STT] ← server:', data.type, data.text ? `"${data.text.slice(0, 60)}..."` : '');

    if (data.type === 'partial') {
      if (data.text) this._onInterim(data.text);

    } else if (data.type === 'final') {
      console.log('[STT] final transcript:', `"${data.text}"`);
      this._onFinal(data.text || '');
      this._ws = null;
      this._setState('idle');
      if (this._finalResolve) {
        this._finalResolve(this._blob);
        this._finalResolve = null;
        this._finalReject  = null;
      }

    } else if (data.type === 'error') {
      console.error('[STT] server error:', data.message);
      const err = new Error(data.message || 'STT transcription error');
      this._onError(err);
      this._ws = null;
      this._setState('idle');
      if (this._finalReject) {
        this._finalReject(err);
        this._finalResolve = null;
        this._finalReject  = null;
      }
    }
  }

  _setState(state) {
    console.log('[STT] state:', this._state, '→', state);
    this._state = state;
    this._onStateChange(state);
  }
}
