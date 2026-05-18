// Silent Witness Service Worker — Merged POC
const CACHE_NAME = 'app-shell-__CACHE_VERSION__';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './calculator.js',
  './vault.js',
  './inference_chat.js',
  './stt-client.js',
  './storage.js',
  './export.js',
  './demo-data/sample_evidence_package.zip',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Model proxy responses are large and should stream through the Worker.
  if (url.pathname.startsWith('/hf/')) {
    return;
  }
  // Let CDN / model downloads pass through uncached
  if (url.hostname.includes('huggingface') || url.hostname.includes('jsdelivr') || url.hostname.includes('fonts.googleapis')) {
    return;
  }
  // LLM server and STT server run on localhost — never cache, always pass through
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
