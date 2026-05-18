// app.js
// Top-level orchestrator.
// Wires calculator (disguise) → PIN → vault unlock → all Silent Witness screens.

// ── Debug overlay (mobile) — remove before release ────────────────────────
(function () {
  const _el = () => document.getElementById('debug-log');
  const _ov = () => document.getElementById('debug-overlay');
  function debugLog(...args) {
    const el = _el(); if (!el) return;
    const tog = document.getElementById('debug-toggle');
    if (tog) tog.style.display = 'block';
    const line = document.createElement('div');
    line.textContent = `${new Date().toISOString().slice(11, 23)} ${args.join(' ')}`;
    el.appendChild(line);
    const ov = _ov();
    if (ov.style.display === 'block') el.scrollTop = el.scrollHeight;
  }
  const _log = console.log.bind(console);
  const _warn = console.warn.bind(console);
  const _err = console.error.bind(console);
  console.log = (...a) => { _log(...a); debugLog('[log]', ...a); };
  console.warn = (...a) => { _warn(...a); debugLog('[warn]', ...a); };
  console.error = (...a) => { _err(...a); debugLog('[ERR]', ...a); };
  window.onerror = (msg, src, line, col, err) =>
    debugLog('[onerror]', msg, `${src}:${line}:${col}`, err?.stack ?? '');
  window.onunhandledrejection = (e) =>
    debugLog('[unhandled]', e.reason?.stack ?? e.reason);
})();

import { Calculator } from './calculator.js';
import { Vault } from './vault.js';
import { Storage } from './storage.js';
import { InferenceChat } from './inference_chat.js';
import { importFromBlob } from './export.js';

// External server endpoints — injected at build time by GitHub Actions.
// Do not hardcode real URLs here; use placeholders only.
const LLM_SERVER_URL = '__LLM_SERVER_URL__';
const STT_URL        = '__STT_SERVER_URL__';

// ── Server warm-up (demo stability) ──────────────────
// Fire-and-forget pings on vault entry to reduce cold-start delays.
// 5-minute cooldown prevents redundant traffic.
let _lastWarmUp = 0;
function warmUpServers() {
  const now = Date.now();
  if (now - _lastWarmUp < 5 * 60 * 1000) return;
  _lastWarmUp = now;
  const sttHealthUrl = STT_URL.replace(/^wss?:\/\//, 'https://').replace('/ws/transcribe', '/health');
  fetch(`${LLM_SERVER_URL}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});
  fetch(sttHealthUrl,                { method: 'GET', cache: 'no-store' }).catch(() => {});
}
// ── Service Worker ────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { });
}

// ── Install prompt (disguised as a calculator utility) ────────────────
// We intercept the native beforeinstallprompt event and show our own
// banner instead — styled to look like a calculator feature, not a DV app.
// The banner sits on the calculator screen only, visible to anyone, which
// is correct: installing a calculator app raises no suspicion.
// We never show this banner from inside the vault.
(function bindInstallPrompt() {
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Only show if we're on the calculator screen (not inside vault)
    const calcVisible = document.getElementById('calculator-screen')?.classList.contains('active');
    if (!calcVisible) return;

    // Already installed or already dismissed this session — skip
    if (sessionStorage.getItem('install-dismissed')) return;

    showInstallBanner();
  });

  function showInstallBanner() {
    // Create a subtle banner that looks like a calculator tip — not an app promo
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.innerHTML = `
      <div style="
        position:fixed; bottom:0; left:0; right:0;
        background:#1e1e30; border-top:1px solid #2a2a3e;
        padding:14px 20px calc(14px + env(safe-area-inset-bottom));
        display:flex; align-items:center; gap:14px;
        z-index:9998; font-family:-apple-system,sans-serif;">
        <div style="
          width:40px; height:40px; border-radius:10px;
          background:#2a2a3e; display:flex; align-items:center;
          justify-content:center; flex-shrink:0;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="#7eb8f7" stroke-width="1.4"/>
            <path d="M8 12h8M12 8v8" stroke="#7eb8f7" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:14px; font-weight:500; color:#ffffff; margin-bottom:2px;">Add to Home Screen</div>
          <div style="font-size:12px; color:#5a6070; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Open faster, works offline</div>
        </div>
        <button id="install-confirm-btn" style="
          background:#0f3460; color:#7eb8f7; border:none;
          padding:8px 16px; border-radius:8px; font-size:13px;
          font-weight:500; cursor:pointer; flex-shrink:0;">Add</button>
        <button id="install-dismiss-btn" style="
          background:none; border:none; color:#5a6070;
          font-size:22px; cursor:pointer; padding:0 4px;
          line-height:1; flex-shrink:0;">&times;</button>
      </div>`;

    document.body.appendChild(banner);

    document.getElementById('install-confirm-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.remove();
      if (outcome === 'accepted') {
        // User installed — nothing to do, PWA takes over
      }
    });

    document.getElementById('install-dismiss-btn').addEventListener('click', () => {
      sessionStorage.setItem('install-dismissed', '1');
      banner.remove();
    });
  }

  // Remove banner immediately if user enters vault (safety: banner must not be
  // visible inside the app)
  window.addEventListener('vault-opened', () => {
    document.getElementById('install-banner')?.remove();
  });
}());

// ── Toast ─────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ── Screen switch ─────────────────────────────────
function showTopScreen(id) {
  document.querySelectorAll('.top-screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = id === 'vault-screen' ? '#F7F5F0' : '#1a1a2e';

  // Push a history entry when entering the vault so the back button
  // returns to calculator (not exits the PWA). Pop it silently on lock.
  if (id === 'vault-screen') {
    history.pushState({ vault: true }, '');
  }
}

// ── Back button panic exit (Android hardware back) ────
window.addEventListener('popstate', (e) => {
  // If we popped a vault state, lock immediately — no animation, no toast.
  if (e.state?.vault) {
    const calcScreen = document.getElementById('calculator-screen');
    if (calcScreen) {
      document.querySelectorAll('.top-screen').forEach((s) => s.classList.remove('active'));
      calcScreen.classList.add('active');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = '#1a1a2e';
    }
  }
});

// ── Shake-to-exit (Android only — no permission prompt needed) ───────
(function bindShake() {
  if (!window.DeviceMotionEvent) return;

  // Skip on iOS — requires permission prompt which would look suspicious
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) return;

  const SHAKE_THRESHOLD = 18; // m/s² — firm shake, not pocket jostling
  const SHAKE_COOLDOWN = 1000; // ms — prevent repeat fires
  let lastShake = 0;
  let lastAcc = { x: 0, y: 0, z: 0 };

  window.addEventListener('devicemotion', (e) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;

    const now = Date.now();
    if (now - lastShake < SHAKE_COOLDOWN) return;

    const delta = Math.abs(acc.x - lastAcc.x)
      + Math.abs(acc.y - lastAcc.y)
      + Math.abs(acc.z - lastAcc.z);

    lastAcc = { x: acc.x, y: acc.y, z: acc.z };

    if (delta > SHAKE_THRESHOLD) {
      // Only fire if the vault is currently visible
      const vaultVisible = document.getElementById('vault-screen')?.classList.contains('active');
      if (!vaultVisible) return;

      lastShake = now;
      document.querySelectorAll('.top-screen').forEach((s) => s.classList.remove('active'));
      document.getElementById('calculator-screen').classList.add('active');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = '#1a1a2e';
      // Clear history state so back button doesn't re-open vault
      history.replaceState(null, '');
    }
  });
}());

// ── Onboarding (pre-vault, first launch only) ─────
function runOnboarding(onComplete) {
  const goStep = (n) => {
    document.querySelectorAll('#ob-main .ob-step').forEach((s) => s.classList.remove('active'));
    const next = document.getElementById(`ob-step-${n}`);
    if (next) next.classList.add('active');
  };

  document.getElementById('ob-next-1')?.addEventListener('click', () => goStep(2));

  document.getElementById('ob-next-2')?.addEventListener('click', () => {
    const sel = document.querySelector('#onboarding-screen .sw-lang-opt.selected');
    if (sel) localStorage.setItem('_lg', sel.dataset.lang);
    goStep(3);
  });

  document.querySelectorAll('#onboarding-screen .sw-lang-opt').forEach((opt) => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#onboarding-screen .sw-lang-opt').forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  const pinInput = document.getElementById('ob-pin-input');
  const pinPreview = document.getElementById('ob-pin-preview');
  const pinError = document.getElementById('ob-pin-error');

  pinInput?.addEventListener('input', () => {
    const val = pinInput.value.replace(/\D/g, '');
    if (pinInput.value !== val) pinInput.value = val;
    const display = val.length >= 1 ? val : '1337';
    if (pinPreview) pinPreview.innerHTML = `On the calculator, tap: <strong>${display} =</strong>`;
    if (pinError) pinError.style.display = 'none';
  });

  document.getElementById('ob-finish-btn')?.addEventListener('click', async () => {
    const val = pinInput?.value.replace(/\D/g, '') || '';
    if (val.length > 0 && val.length < 3) {
      if (pinError) pinError.style.display = 'block';
      return;
    }
    if (val.length >= 3) {
      const { Calculator } = await import('./calculator.js');
      await Calculator.storePin(val);
    }
    const sel = document.querySelector('#onboarding-screen .sw-lang-opt.selected');
    if (sel) localStorage.setItem('_lg', sel.dataset.lang);
    localStorage.setItem('_ob', '1');
    localStorage.setItem('_demo_pending', '1');
    localStorage.setItem('_show_resources', '1');

    goStep(4);
    setTimeout(onComplete, 1800);
  });
}

// ── Init ──────────────────────────────────────────
async function init() {
  if (!localStorage.getItem('_ob')) {
    // First launch: wait for onboarding to finish, then fall through to calculator init
    await new Promise((resolve) => {
      runOnboarding(() => {
        showTopScreen('calculator-screen');
        resolve();
      });
    });
  } else {
    showTopScreen('calculator-screen');
  }

  let realStorage = null;
  let decoyStorage = null;
  let vault = null; // single instance — DOM bound once, storage swapped per mode
  const inference = new InferenceChat({ serverUrl: LLM_SERVER_URL });

  const calculator = new Calculator({
    onPinMatch: (pin, isDecoy) => unlockVault(pin, isDecoy),
  });

  async function unlockVault(pin, isDecoy = false) {
    if (isDecoy) {
      // Decoy mode: separate DB, empty vault — real data stays hidden
      if (!decoyStorage) {
        decoyStorage = new Storage('caldata');
        await decoyStorage.init(pin);
      }
      if (!vault) {
        vault = new Vault({
          storage: decoyStorage,
          inference,
          sttUrl: STT_URL,
          isDecoy: true,
          onLock: () => showTopScreen('calculator-screen'),
          showToast,
        });
        await vault.init();
      } else {
        await vault.switchStorage(decoyStorage, true);
      }
    } else {
      // Real mode
      if (!realStorage) {
        realStorage = new Storage();
        await realStorage.init(pin);
        if (localStorage.getItem('_demo_pending')) {
          localStorage.removeItem('_demo_pending');
          try {
            const resp = await fetch('./demo-data/sample_evidence_package.zip');
            const blob = await resp.blob();
            await importFromBlob(realStorage, blob, showToast);
          } catch (err) {
            console.warn('[Demo] failed to load sample data:', err);
          }
        }
      }
      if (!vault) {
        vault = new Vault({
          storage: realStorage,
          inference,
          sttUrl: STT_URL,
          onLock: () => showTopScreen('calculator-screen'),
          showToast,
        });
        await vault.init();
      } else {
        await vault.switchStorage(realStorage);
      }

      if (localStorage.getItem('_show_resources')) {
        localStorage.removeItem('_show_resources');
        vault._go('resources');
      }
    }

    // Silent — no toast. "Vault unlocked" visible from a distance is a safety risk.
    showTopScreen('vault-screen');
    warmUpServers();
    // Remove install banner if it was showing — must never be visible inside vault
    window.dispatchEvent(new Event('vault-opened'));
  }
}

init();
