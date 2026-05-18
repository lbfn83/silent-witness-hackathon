// inference_chat.js
// HTTP client for Silent Witness LLM server (Ollama + FastAPI on RunPod).

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

export class InferenceChat {
  constructor({ serverUrl } = {}) {
    this._loaded = false;
    this._serverUrl = serverUrl;
  }

  get isLoaded()   { return this._loaded; }
  get isLoading()  { return false; }
  get serverUrl()  { return this._serverUrl; }

  async ensureLoaded(onProgress = () => {}) {
    if (this._loaded) return;
    onProgress(100, 'LLM server ready');
    this._loaded = true;
  }

  async analyze({ textNotes, image = null, onProgress = () => {} }) {
    await this.ensureLoaded(onProgress);

    onProgress(10, 'Sending to LLM server...');

    let image_base64 = null;
    if (image) {
      image_base64 = image.includes(',') ? image.split(',')[1] : image;
    }

    const resp = await fetch(`${this._serverUrl}/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: textNotes?.trim() || '', image_base64 }),
    });

    if (!resp.ok) throw new Error(`LLM server error: ${resp.status}`);

    onProgress(90, 'Parsing response...');
    const result = await resp.json();
    onProgress(100, 'Analysis complete');
    return result;
  }

  async chat({ messages }) {
    await this.ensureLoaded();

    const resp = await fetch(`${this._serverUrl}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages }),
    });

    if (!resp.ok) throw new Error(`LLM server error: ${resp.status}`);
    const data = await resp.json();
    return data.content ?? '';
  }

  async rawChat(input, imageDataUrl = null) {
    const messages   = Array.isArray(input?.messages)
      ? input.messages
      : [{ role: 'user', content: String(input ?? '') }];
    const image      = input?.imageDataUrl ?? imageDataUrl;
    const onProgress = input?.onProgress   ?? (() => {});

    await this.ensureLoaded(onProgress);

    onProgress(10, 'Sending to LLM server...');

    let image_base64 = null;
    if (image) {
      image_base64 = image.includes(',') ? image.split(',')[1] : image;
    }

    const resp = await fetch(`${this._serverUrl}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages, image_base64 }),
    });

    if (!resp.ok) throw new Error(`LLM server error: ${resp.status}`);
    const data = await resp.json();
    onProgress(100, 'Done');
    return data.content ?? '';
  }

  _parseOutput(raw) {
    const cleaned = String(raw).trim();
    try { return JSON.parse(cleaned); } catch (_) {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
    console.warn('[InferenceChat] Could not parse model output as JSON:', raw);
    return {
      photo_quality:             { usable: true, issue: null, suggestion: null },
      injury_description:        'Could not parse AI output',
      injury_locations:          [],
      severity_assessment:       'mild',
      visible_indicators:        [],
      recommended_documentation: [],
      summary:                   cleaned.slice(0, 500),
      _raw_output:               cleaned,
    };
  }
}
