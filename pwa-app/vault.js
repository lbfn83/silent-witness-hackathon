// vault.js
// Manages all Silent Witness vault screens.
// Wires real backends (Gemma inference, AudioCapture, Storage)
// into the POC_UI design system screen flow.
//
// Screen flow:
//   home → photo/voice/text capture → gap screens → corroboration → complete
//   bottom nav → timeline | resources | settings

import { SttClient } from './stt-client.js';
import { runFullExport, runImport } from './export.js';

const BODY_REGION_OPTIONS = [
  'head_face','head_scalp','neck_front','neck_back',
  'shoulder_left','shoulder_right','upper_arm_left','upper_arm_right',
  'elbow_left','elbow_right','forearm_left','forearm_right',
  'wrist_left','wrist_right','hand_left','hand_right',
  'chest','breast_left','breast_right','abdomen','lower_back','upper_back',
  'hip_left','hip_right','groin',
  'thigh_left','thigh_right','knee_left','knee_right',
  'lower_leg_left','lower_leg_right','ankle_left','ankle_right',
  'foot_left','foot_right','unknown',
];

const INJURY_TYPE_OPTIONS = [
  'bruise','cut','burn','scratch','swelling','scar',
  'fracture_visible','strangulation_marks','bite_mark','other',
];

const SEVERITY_OPTIONS = ['minor','moderate','severe','critical']; // legacy fallback

const SEVERITY_SIGNAL_OPTIONS = [
  'strangulation_marker_neck','strangulation_marker_petechiae',
  'defensive_pattern','weapon_pattern','head_or_face_injury',
  'pregnancy_risk','hand_grip_pattern','repeated_within_30d',
  'child_present','loss_of_consciousness','escalation_from_prior','threat_to_kill',
];

const SEVERITY_SIGNAL_LABELS = {
  strangulation_marker_neck:       'Strangulation (neck)',
  strangulation_marker_petechiae:  'Strangulation (petechiae)',
  defensive_pattern:               'Defensive pattern',
  weapon_pattern:                  'Weapon pattern',
  head_or_face_injury:             'Head / face injury',
  pregnancy_risk:                  'Pregnancy risk',
  hand_grip_pattern:               'Hand grip pattern',
  repeated_within_30d:             'Repeated within 30 days',
  child_present:                   'Child present',
  loss_of_consciousness:           'Loss of consciousness',
  escalation_from_prior:           'Escalation from prior',
  threat_to_kill:                  'Threat to kill',
};

const INJURY_KIND_OPTIONS = [
  'bruise','laceration','abrasion','swelling','burn',
  'bite','strangulation_mark','fracture_suspected','pattern_injury','other',
];

const INJURY_KIND_LABELS = {
  bruise:               'Bruise',
  laceration:           'Laceration',
  abrasion:             'Abrasion',
  swelling:             'Swelling',
  burn:                 'Burn',
  bite:                 'Bite mark',
  strangulation_mark:   'Strangulation mark',
  fracture_suspected:   'Fracture (suspected)',
  pattern_injury:       'Pattern injury',
  other:                'Other',
};

const EVIDENCE_TYPE_OPTIONS = [
  'injury_photo','digital_communication_photo','financial_record_photo',
  'clothing_object_photo','legal_document_photo','medical_document_photo',
  'property_damage_photo','scene_photo','journal_entry_photo',
];

const EVIDENCE_TYPE_LABELS = {
  injury_photo:                  'Injury photo',
  digital_communication_photo:   'Digital communication',
  financial_record_photo:        'Financial record',
  clothing_object_photo:         'Clothing / object',
  legal_document_photo:          'Legal document',
  medical_document_photo:        'Medical document',
  property_damage_photo:         'Property damage',
  scene_photo:                   'Scene photo',
  journal_entry_photo:           'Journal entry',
};

const BODY_REGION_LABELS = {
  head_face:'Head / Face', head_scalp:'Head (scalp)',
  neck_front:'Neck (front)', neck_back:'Neck (back)',
  shoulder_left:'Shoulder (left)', shoulder_right:'Shoulder (right)',
  upper_arm_left:'Upper arm (left)', upper_arm_right:'Upper arm (right)',
  elbow_left:'Elbow (left)', elbow_right:'Elbow (right)',
  forearm_left:'Forearm (left)', forearm_right:'Forearm (right)',
  wrist_left:'Wrist (left)', wrist_right:'Wrist (right)',
  hand_left:'Hand (left)', hand_right:'Hand (right)',
  chest:'Chest', breast_left:'Breast (left)', breast_right:'Breast (right)',
  abdomen:'Abdomen', lower_back:'Lower back', upper_back:'Upper back',
  hip_left:'Hip (left)', hip_right:'Hip (right)', groin:'Groin',
  thigh_left:'Thigh (left)', thigh_right:'Thigh (right)',
  knee_left:'Knee (left)', knee_right:'Knee (right)',
  lower_leg_left:'Lower leg (left)', lower_leg_right:'Lower leg (right)',
  ankle_left:'Ankle (left)', ankle_right:'Ankle (right)',
  foot_left:'Foot (left)', foot_right:'Foot (right)',
  unknown:'Unknown',
};

const humanizeRegion = (val) =>
  BODY_REGION_LABELS[val] || (val ? val.replace(/_/g, ' ') : '—');

function normalizeAiAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return raw;

  // narrative: nested obj → use as-is; string → wrap; flat key fallback
  const narrative = raw.narrative && typeof raw.narrative === 'object'
    ? raw.narrative
    : typeof raw.narrative === 'string' && raw.narrative
      ? { model_summary: raw.narrative }
      : { model_summary: raw['narrative.model_summary'] ?? null };

  // severity_signals: filter sentinel values not in canonical enum
  const severity_signals = Array.isArray(raw.severity_signals)
    ? raw.severity_signals.filter((s) => s && s !== 'none' && SEVERITY_SIGNAL_OPTIONS.includes(s))
    : [];

  // injury_kind: ensure array of strings — LLM sometimes returns [{type:'x'}] instead of ['x']
  const injury_kind = Array.isArray(raw.injury_kind)
    ? raw.injury_kind.flatMap((k) => {
        if (typeof k === 'string') return [k];
        if (k && typeof k === 'object') return Object.values(k).filter((v) => typeof v === 'string');
        return [];
      })
    : [];

  // coloration: LLM sometimes returns array instead of string
  const coloration = Array.isArray(raw.coloration) ? (raw.coloration[0] ?? null) : (raw.coloration ?? null);

  // body_region: strip null-string
  const body_region = raw.body_region === 'null' ? null : (raw.body_region ?? null);

  return { ...raw, narrative, severity_signals, injury_kind, coloration, body_region };
}

// Which bottom nav tab each screen belongs to
const NAV_TAB_MAP = {
  onboarding: 'home',
  home: 'home',
  capture_photo: 'home', capture_voice: 'home', capture_text: 'home',
  gap_timestamp: 'home', gap_body: 'home', gap_narrative: 'home',
  photo_coaching: 'home', corroboration: 'home', complete: 'home',
  timeline: 'timeline', pattern: 'timeline', record_detail: 'timeline',
  resources: 'resources',
  settings: 'settings',
};

export class Vault {
  constructor({ storage, inference, onLock, showToast, sttUrl, isDecoy = false }) {
    this.storage = storage;
    this.inference = inference;
    this.onLock = onLock;
    this.showToast = showToast;
    this._isDecoy = isDecoy;

    this._sttUrl = sttUrl;
    this._phoneEl = document.getElementById('vaultApp');
    this._currentScreen = 'home';
    this._timelineDirty = true;

    // STT client: streams audio to private faster-whisper server over WebSocket.
    // onFinal fires once with the complete transcript when recording stops.
    // onLocalFallback fires when the WS server is unreachable — recording continues without transcription.
    this._audio = new SttClient({
      url: sttUrl,
      onStateChange: () => { },
      onInterim: (text) => this._onAudioInterim(text),
      onFinal: (text) => { this._lastFinalTranscript = text; },
      onError: (err) => this.showToast(`Mic error: ${err.message}`),
      onLocalFallback: () => {
        this._voiceLocalOnly = true;
        const banner = document.getElementById('voice-mode-banner');
        if (banner) banner.style.display = 'block';
        const hintEl = document.getElementById('voiceHint');
        if (hintEl) hintEl.textContent = 'Recording audio only — no live transcript';
      },
    });

    this._voiceRecording = false;
    this._voiceTimer = null;
    this._voiceSeconds = 0;
    this._lastFinalTranscript = '';
    this._isRecording = false; // CC-006: tracks active mic state for nav guard
    this._voiceLocalOnly = false; // true when STT server unavailable — skip transcript editor
    this._retryInProgress = false;
    this._analyzingIds = new Set();
    this._pendingCorrections = {};

    // Current entry being built through gap screens
    this._entry = this._blankEntry();

    // Auto-lock inactivity timer
    this._autoLockTimer = null;
    this._setupAutoLock();
  }

  // ── Init ──────────────────────────────────────────
  async init() {
    this._bindNavigation();
    this._bindSafetyExit();
    this._bindPhoto();
    this._bindVoice();
    this._bindText();
    this._bindTimestampScreen();
    this._bindBodyScreen();
    this._bindNarrativeScreen();
    this._bindCorroboration();
    this._bindTimeline();
    this._bindSettings();
    this._go('home');

    // Pre-warm Gemma, then retry any draft_raw records from previous sessions
    setTimeout(() => {
      this.inference.ensureLoaded(() => { }).then(() => {
        localStorage.setItem('sw-model-cached', '1');
        return this._retryPendingAnalysis();
      }).catch(() => { });
    }, 2000);

    // Check for pending records from previous sessions
    this._checkPendingBanner();
  }

  // ── Storage swap (decoy / real mode switch) ───────
  async switchStorage(newStorage, isDecoy = false) {
    this.storage = newStorage;
    this._isDecoy = isDecoy;
    this._go('home');
    await this._checkPendingBanner();
    this._refreshTimeline();
  }

  // ── Auto-lock ──────────────────────────────────────
  _triggerAutoLock() {
    const vaultVisible = document.getElementById('vault-screen')?.classList.contains('active');
    if (vaultVisible) {
      localStorage.removeItem('_lockAt');
      this.options.onLock();
    }
  }

  _setupAutoLock() {
    const resetTimer = () => {
      clearTimeout(this._autoLockTimer);
      const minutes = parseInt(localStorage.getItem('_alt') || '0', 10);
      if (!minutes) { localStorage.removeItem('_lockAt'); return; }
      const lockAt = Date.now() + minutes * 60 * 1000;
      localStorage.setItem('_lockAt', String(lockAt));
      this._autoLockTimer = setTimeout(() => this._triggerAutoLock(), minutes * 60 * 1000);
    };

    ['touchstart', 'pointerdown', 'keydown'].forEach((ev) => {
      document.getElementById('vault-screen')?.addEventListener(ev, resetTimer, { passive: true });
    });

    // Background → foreground: check if lock should have fired while tab was hidden
    if (!this._visibilityHandler) {
      this._visibilityHandler = () => {
        if (document.visibilityState !== 'visible') return;
        const lockAt = parseInt(localStorage.getItem('_lockAt') || '0', 10);
        if (!lockAt) return;
        if (Date.now() >= lockAt) {
          this._triggerAutoLock();
        } else {
          clearTimeout(this._autoLockTimer);
          this._autoLockTimer = setTimeout(() => this._triggerAutoLock(), lockAt - Date.now());
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }

    resetTimer();
  }

  // ── Navigation ────────────────────────────────────
  _bindNavigation() {
    // Delegate all [data-goto] and [data-nav-goto] clicks
    this._phoneEl.addEventListener('click', (e) => {
      const gotoEl = e.target.closest('[data-goto]');
      if (gotoEl) {
        const target = gotoEl.dataset.goto;
        this._handleGoTo(target);
        return;
      }
      const navEl = e.target.closest('[data-nav-goto]');
      if (navEl) {
        const target = navEl.dataset.navGoto;
        this._handleGoTo(target);
      }
    });
  }

  _handleGoTo(target) {
    // CC-006: stop mic if user navigates away from voice capture while recording
    if (this._currentScreen === 'capture_voice' && target !== 'capture_voice' && this._isRecording) {
      this._stopMic();
    }

    // Special handling for screens that need setup
    if (target === 'timeline') { this._refreshTimeline(); }
    if (target === 'pattern') { this._renderPatternScreen(); }
    if (target === 'settings') { this._refreshSettings(); }
    if (target === 'resources') { this._refreshResources(); }
    if (target === 'home') {
      this._resetEntry();
      // Background retry: if audio-only draft_raw records exist and STT just came online
      this._retryPendingAnalysis();
    }
    if (target === 'complete') { return; } // complete is shown only after save
    this._go(target);
  }

  _go(screenId) {
    // Hide all vault panels
    this._phoneEl.querySelectorAll('.vault-panel').forEach((p) => {
      p.classList.remove('active');
    });

    const target = document.getElementById(`s-${screenId}`);
    if (target) {
      target.classList.add('active');
      // Scroll phone to top
      if (this._phoneEl) this._phoneEl.scrollTop = 0;
    }

    this._currentScreen = screenId;
    this._updateBottomNav(screenId);
  }

  _updateBottomNav(screenId) {
    const activeTab = NAV_TAB_MAP[screenId] || 'home';
    this._phoneEl.querySelectorAll('.sw-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.navTab === activeTab);
    });
  }

  // ── Safety exit ───────────────────────────────────
  _bindSafetyExit() {
    // Panic exit: instant cut to calculator. No overlay. No animation. No second tap.
    // onLock() switches the top-level screen back to #calculator-screen immediately.
    document.getElementById('safety-exit-btn').addEventListener('click', () => {
      this.onLock();
    });
  }

  // ── Photo capture ─────────────────────────────────
  _bindPhoto() {
    const zone = document.getElementById('photo-zone');
    const cameraInput = document.getElementById('camera-input');
    const libraryInput = document.getElementById('library-input');
    const picker = document.getElementById('photo-source-picker');
    const takeBtn = document.getElementById('photo-take-btn');
    const uploadBtn = document.getElementById('photo-upload-btn');
    const preview = document.getElementById('photo-preview-img');
    const placeholder = document.getElementById('photo-zone-placeholder');
    const continueBtn = document.getElementById('photo-continue-btn');
    const retakeBtn = document.getElementById('photo-retake-btn');
    const zoneText = document.getElementById('photo-zone-text');

    const showPicker = () => { picker.style.display = 'block'; };
    const hidePicker = () => { picker.style.display = 'none'; };

    // Tap the zone → show picker (unless a photo is already previewing)
    zone.addEventListener('click', () => {
      if (preview.style.display === 'block') return; // already have photo — don't re-open
      showPicker();
    });

    // Desktop camera viewfinder (getUserMedia)
    const viewfinder  = document.getElementById('camera-viewfinder');
    const camVideo    = document.getElementById('camera-video');
    const camCanvas   = document.getElementById('camera-canvas');
    const shutterBtn  = document.getElementById('camera-shutter-btn');
    const camCloseBtn = document.getElementById('camera-close-btn');
    let desktopStream = null;

    const stopDesktopCamera = () => {
      desktopStream?.getTracks().forEach((t) => t.stop());
      desktopStream = null;
      viewfinder.style.display = 'none';
    };

    shutterBtn.addEventListener('click', () => {
      if (!desktopStream) return;
      camCanvas.width  = camVideo.videoWidth;
      camCanvas.height = camVideo.videoHeight;
      camCanvas.getContext('2d').drawImage(camVideo, 0, 0);
      const dataUrl = camCanvas.toDataURL('image/jpeg', 0.92);
      stopDesktopCamera();

      this._entry.photoDataUrl = dataUrl;
      this._entry.photoFile    = null;
      this._entry.modality     = 'photo';
      hidePicker();
      placeholder.style.display = 'none';
      preview.src               = dataUrl;
      preview.style.display     = 'block';
      zone.style.padding        = '0';
      continueBtn.style.display = 'flex';
      if (retakeBtn) retakeBtn.style.display = 'flex';
    });

    camCloseBtn.addEventListener('click', stopDesktopCamera);

    // Take photo → camera input on mobile, getUserMedia on desktop
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    takeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hidePicker();
      if (isMobile) {
        cameraInput.click();
      } else {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
          .then((stream) => {
            desktopStream      = stream;
            camVideo.srcObject = stream;
            viewfinder.style.display = 'flex';
          })
          .catch(() => {
            // No camera on desktop — fall back to file input
            cameraInput.removeAttribute('capture');
            cameraInput.click();
          });
      }
    });

    // Choose from library → library input (no capture attribute)
    uploadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hidePicker();
      libraryInput.click();
    });

    // Retake / use different photo → show picker again, clear current preview
    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        // Reset preview
        preview.src = '';
        preview.style.display = 'none';
        placeholder.style.display = 'flex';
        zone.style.padding = '';
        continueBtn.style.display = 'none';
        retakeBtn.style.display = 'none';
        // Clear stored photo from entry
        this._entry.photoDataUrl = null;
        this._entry.photoFile = null;
        // Show picker immediately
        showPicker();
      });
    }

    // Shared file handler for both inputs
    const handleFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        if (zoneText) zoneText.textContent = 'Tap to add a photo';
        return;
      }
      e.target.value = '';
      hidePicker();

      const dataUrl = await this._readFileAsDataUrl(file);
      this._entry.photoDataUrl = dataUrl;
      this._entry.photoFile = file;
      this._entry.modality = 'photo';

      // Show preview — fill capture zone
      placeholder.style.display = 'none';
      preview.src = dataUrl;
      preview.style.display = 'block';
      zone.style.padding = '0';
      continueBtn.style.display = 'flex';
      if (retakeBtn) retakeBtn.style.display = 'flex';
    };

    cameraInput.addEventListener('change', handleFile);
    libraryInput.addEventListener('change', handleFile);

    cameraInput.addEventListener('error', () => {
      if (zoneText) zoneText.textContent = 'Camera not available. Try the library option.';
      showPicker();
    });
  }

  // ── Voice capture ──────────────────────────────────
  _bindVoice() {
    const recordBtn = document.getElementById('recordBtn');
    const timerEl = document.getElementById('voiceTimer');
    const hintEl = document.getElementById('voiceHint');
    const interimEl = document.getElementById('voiceInterim');
    const doneSection = document.getElementById('voiceTranscriptSection');

    // Wire error handler to reset UI on mic failure (permission denied, no device, etc.)
    this._audio._onError = (err) => {
      this._isRecording = false;
      this._voiceRecording = false;
      clearInterval(this._voiceTimer);
      this._voiceTimer = null;
      this._resetVoiceUI();
      this.showToast(err.message);
    };

    recordBtn.addEventListener('click', async () => {
      if (!this._voiceRecording) {
        // Attempt to start mic FIRST — only update UI if it succeeds
        this._voiceSeconds = 0;
        this._lastFinalTranscript = '';
        this._entry.modality = 'voice';

        // Try to start — errors surface via onError callback above
        await this._audio.start();

        // If audio failed, _onError already reset state — bail out
        if (this._audio.state !== 'recording') return;

        // Mic is confirmed live — now update UI
        this._isRecording = true;
        this._voiceRecording = true;

        recordBtn.classList.add('recording');
        recordBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="5" y="5" width="10" height="10" rx="2" fill="white"/>
        </svg>`;
        hintEl.textContent = 'Recording... tap to stop';
        interimEl.textContent = '';
        interimEl.classList.remove('hidden');

        this._voiceTimer = setInterval(() => {
          this._voiceSeconds++;
          const m = Math.floor(this._voiceSeconds / 60);
          const s = this._voiceSeconds % 60;
          timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
        }, 1000);

      } else {
        // Stop recording
        this._isRecording = false; // CC-006
        this._voiceRecording = false;
        clearInterval(this._voiceTimer);
        this._voiceTimer = null;

        recordBtn.classList.remove('recording');
        recordBtn.style.display = 'none';
        hintEl.style.display = 'none';
        interimEl.classList.add('hidden');

        try {
          await this._audio.stop();
        } catch (err) {
          this.showToast('Could not stop recording');
          this._resetVoiceUI();
          return;
        }

        // Capture audio blob before transcript — SttClient already assembled it on stop()
        const audioBlob = this._audio.getBlob();
        if (audioBlob && audioBlob.size > 0) {
          this._entry.audioBlob = audioBlob;
          this._entry.audioMime = audioBlob.type || 'audio/webm';
        }

        // _lastFinalTranscript is set by SttClient.onFinal before stop() resolves
        const transcript = this._lastFinalTranscript.trim();
        this._entry.transcript = transcript;

        timerEl.textContent = `${Math.floor(this._voiceSeconds / 60)}:${String(this._voiceSeconds % 60).padStart(2, '0')}`;

        if (this._voiceLocalOnly) {
          // No transcription — audio saved, skip editor and continue
          this._go('gap_timestamp');
        } else {
          doneSection.style.display = 'block';
          if (!transcript) {
            this._showTranscriptEmpty();
          } else {
            this._showTranscriptEditor(transcript);
          }
        }
      }
    });
  }

  // CC-006: programmatic mic stop — called when navigating away mid-recording
  async _stopMic() {
    if (!this._isRecording) return;
    this._isRecording = false;
    this._voiceRecording = false;
    clearInterval(this._voiceTimer);
    this._voiceTimer = null;
    // cancel() aborts immediately without waiting for a final transcript
    if (typeof this._audio.cancel === 'function') {
      this._audio.cancel();
    } else {
      try { await this._audio.stop(); } catch (_) { }
    }
    // Reset UI so voice screen is clean if user returns
    this._resetVoiceUI();
  }

  _onAudioInterim(text) {
    const el = document.getElementById('voiceInterim');
    if (el) el.textContent = text;
  }

  _resetVoiceUI() {
    this._voiceRecording = false;
    clearInterval(this._voiceTimer);
    document.getElementById('voiceTimer').textContent = '0:00';
    document.getElementById('recordBtn').classList.remove('recording');
    document.getElementById('recordBtn').style.display = 'flex';
    document.getElementById('recordBtn').innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="6" y="3" width="8" height="14" rx="4" fill="white"/>
    </svg>`;
    document.getElementById('voiceHint').style.display = 'block';
    document.getElementById('voiceHint').textContent = 'Tap to start recording';
    document.getElementById('voiceInterim').classList.add('hidden');
    document.getElementById('voiceTranscriptSection').style.display = 'none';
    this._voiceLocalOnly = false;
    const modeBanner = document.getElementById('voice-mode-banner');
    if (modeBanner) modeBanner.style.display = 'none';
    // Also reset the edit bar state
    const editBar = document.getElementById('transcript-edit-bar');
    if (editBar) editBar.style.display = 'none';
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.value = '';
  }

  // ── Transcript edit/review flow ───────────────────
  _showTranscriptEmpty() {
    // Nothing was captured — show recovery state, not a blank editor
    const chatInput = document.getElementById('chat-input');
    const editBar = document.getElementById('transcript-edit-bar');

    chatInput.value = '';
    chatInput.placeholder = "Nothing was captured. You can type what happened here, or tap Discard to try recording again.";
    chatInput.focus();

    // Show the edit bar — Discard lets them retry, Confirm lets them proceed with typed text
    editBar.style.display = 'flex';
    document.getElementById('transcript-confirm-btn').onclick = () => this._confirmTranscript();
    document.getElementById('transcript-discard-btn').onclick = () => this._discardTranscript();
  }

  _showTranscriptEditor(transcript) {
    const chatInput = document.getElementById('chat-input');
    const editBar = document.getElementById('transcript-edit-bar');

    // Populate editable field and select all so the user can immediately retype
    chatInput.value = transcript;
    chatInput.focus();
    chatInput.select();

    // Reveal the edit bar
    editBar.style.display = 'flex';

    // Wire buttons (use onclick so re-calling this never double-binds)
    document.getElementById('transcript-confirm-btn').onclick = () => this._confirmTranscript();
    document.getElementById('transcript-discard-btn').onclick = () => this._discardTranscript();
  }

  _confirmTranscript() {
    const chatInput = document.getElementById('chat-input');
    const editBar = document.getElementById('transcript-edit-bar');

    // Persist whatever text is in the editor into the entry
    this._entry.transcript = chatInput.value.trim();

    // Hide edit UI
    editBar.style.display = 'none';

    // Navigate to the next gap screen — same as the old "Continue" button did
    this._go('gap_timestamp');
  }

  _discardTranscript() {
    const chatInput = document.getElementById('chat-input');
    const editBar = document.getElementById('transcript-edit-bar');

    // Clear transcript
    this._entry.transcript = '';
    chatInput.value = '';

    // Hide edit bar and the whole transcript section
    editBar.style.display = 'none';
    document.getElementById('voiceTranscriptSection').style.display = 'none';

    // Reset mic so user can try again
    this._resetVoiceUI();
  }

  // ── Text entry ─────────────────────────────────────
  _bindText() {
    document.getElementById('text-continue-btn').addEventListener('click', () => {
      const text = document.getElementById('text-entry-input').value.trim();
      this._entry.textInput = text;
      this._entry.modality = 'text';
      this._go('gap_timestamp');
    });
  }

  // ── Timestamp screen ──────────────────────────────
  _bindTimestampScreen() {
    const input = document.getElementById('timestamp-input');
    const nextBtn = document.getElementById('timestamp-next-btn');
    const skipBtn = document.getElementById('timestamp-skip-btn');
    const backBtn = document.getElementById('timestamp-back-btn');

    nextBtn.addEventListener('click', () => {
      this._entry.timestamp = input.value.trim();
      this._go('gap_body');
    });
    skipBtn.addEventListener('click', () => {
      this._entry.timestamp = '';
      this._go('gap_body');
    });
    backBtn.addEventListener('click', () => {
      // Back goes to whichever modality screen we came from
      const backTarget = `capture_${this._entry.modality || 'text'}`;
      this._go(backTarget);
    });
  }

  // ── Body region screen ────────────────────────────
  _bindBodyScreen() {
    // Front/back toggle
    document.getElementById('bodyFrontBtn').addEventListener('click', () => {
      document.getElementById('bodyFrontBtn').classList.add('active');
      document.getElementById('bodyBackBtn').classList.remove('active');
      document.getElementById('bodyFront').style.display = 'grid';
      document.getElementById('bodyBack').style.display = 'none';
    });
    document.getElementById('bodyBackBtn').addEventListener('click', () => {
      document.getElementById('bodyBackBtn').classList.add('active');
      document.getElementById('bodyFrontBtn').classList.remove('active');
      document.getElementById('bodyFront').style.display = 'none';
      document.getElementById('bodyBack').style.display = 'grid';
    });

    // Region selection
    this._phoneEl.addEventListener('click', (e) => {
      const region = e.target.closest('.sw-body-region');
      if (!region) return;
      this._phoneEl.querySelectorAll('.sw-body-region').forEach((r) => r.classList.remove('selected'));
      region.classList.add('selected');
      this._entry.bodyRegion = region.dataset.region;
      // Also set the text input to match
      document.getElementById('body-region-input').value = region.dataset.region;
    });

    document.getElementById('body-next-btn').addEventListener('click', () => {
      // Prefer tapped region, fall back to typed input
      const typed = document.getElementById('body-region-input').value.trim();
      if (typed) this._entry.bodyRegion = typed;
      this._goAfterBody();
    });
    document.getElementById('body-skip-btn').addEventListener('click', () => {
      this._entry.bodyRegion = '';
      this._goAfterBody();
    });
  }

  _goAfterBody() {
    // Voice transcript IS the narrative — skip narrative screen
    if (this._entry.modality === 'voice') {
      this._go('corroboration');
    } else {
      this._go('gap_narrative');
    }
  }

  // ── Narrative screen ──────────────────────────────
  _bindNarrativeScreen() {
    document.getElementById('narrative-next-btn').addEventListener('click', () => {
      this._entry.narrative = document.getElementById('narrative-input').value.trim();
      if (this._entry.modality === 'photo') {
        this._go('photo_coaching');
      } else {
        this._go('corroboration');
      }
    });
    document.getElementById('narrative-skip-btn').addEventListener('click', () => {
      this._entry.narrative = '';
      if (this._entry.modality === 'photo') {
        this._go('photo_coaching');
      } else {
        this._go('corroboration');
      }
    });
  }

  // ── Corroboration ─────────────────────────────────
  _bindCorroboration() {
    // Back button: for voice go back to gap_body, for others go back to photo_coaching / gap_narrative
    document.getElementById('corr-back-btn').addEventListener('click', () => {
      if (this._entry.modality === 'voice') {
        this._go('gap_body');
      } else if (this._entry.modality === 'photo') {
        this._go('photo_coaching');
      } else {
        this._go('gap_narrative');
      }
    });

    // Toggle switches
    this._phoneEl.querySelectorAll('.sw-corr-item').forEach((item) => {
      item.addEventListener('click', () => {
        const key = item.dataset.corr;
        const toggle = item.querySelector('.sw-corr-toggle');
        toggle.classList.toggle('on');
        this._entry.corroboration[key] = toggle.classList.contains('on');
      });
    });

    // Save
    document.getElementById('save-entry-btn').addEventListener('click', () => {
      this._saveEntry();
    });
  }

  // ── Save entry ────────────────────────────────────
  // Step 1: encrypt + save raw immediately (never blocked by AI)
  // Step 2: analyze in foreground background — updates record when done
  async _saveEntry() {
    const notes       = this._composeNotes();
    const photoUrl    = this._entry.photoDataUrl ?? null;
    const audioOnlyNoTranscript =
      this._entry.modality === 'voice' && !this._entry.transcript && !!this._entry.audioBlob;

    console.log('[Vault:save] starting — modality:', this._entry.modality, '| photo:', !!photoUrl, '| audio:', !!this._entry.audioBlob, '| transcription_pending:', audioOnlyNoTranscript);

    const narrative = this._entry.modality === 'voice'
      ? this._entry.transcript
      : (this._entry.modality === 'text' ? this._entry.textInput : this._entry.narrative);

    // Convert audio Blob → base64 data URL so it survives JSON.stringify encryption
    const audioDataUrl = this._entry.audioBlob
      ? await this._readFileAsDataUrl(this._entry.audioBlob)
      : null;

    const record = {
      modality:         this._entry.modality,
      textNotes:        notes,
      narrative:        narrative || '',
      photoDataUrl:     photoUrl,
      audioDataUrl:     audioDataUrl,
      audioMime:        this._entry.audioMime ?? null,
      bodyRegion:       this._entry.bodyRegion,
      timestamp:        this._entry.timestamp,
      corroboration:    { ...this._entry.corroboration },
      status:                'draft_raw',
      aiAnalysis:            null,
      analysis_source:       'none',
      analysis_ready:        false,
      transcription_pending: audioOnlyNoTranscript,
      user_corrections:      [],
      savedAt:               new Date().toISOString(),
    };

    let savedId;
    try {
      savedId = await this.storage.saveIncident(record);
      this._timelineDirty = true;
      console.log('[Vault:save] raw saved ✓ id:', savedId);
    } catch (err) {
      console.error('[Vault:save] FAILED to save:', err);
      this.showToast('Save failed');
      return;
    }

    this._go('home');
    this._checkPendingBanner();

    if (audioOnlyNoTranscript) {
      this.showToast('Audio saved. Will analyze when transcription is available.');
      console.log('[Vault:save] audio-only record — skipping analysis until STT available');
    } else {
      this.showToast('Saved. Analyzing evidence...');
      console.log('[Vault:save] navigated home, starting AI analysis fire-and-forget');
      this._analyzeAndUpdate(savedId, notes, photoUrl);
    }
  }

  async _analyzeAndUpdate(id, notes, photoUrl) {
    if (this._analyzingIds.has(id)) {
      console.log('[Vault:analyze] skipping id:', id, '— already in flight');
      return;
    }
    this._analyzingIds.add(id);
    console.log('[Vault:analyze] starting for id:', id, '| model loaded:', this.inference.isLoaded);
    const t0 = performance.now();

    let aiAnalysis;
    try {
      aiAnalysis = await this.inference.analyze({
        textNotes:  notes,
        image:      photoUrl,
        onProgress: (pct, msg) => console.log(`[Vault:analyze] progress ${pct}% — ${msg}`),
      });
      console.log('[Vault:analyze] done in', Math.round(performance.now() - t0), 'ms | result:', aiAnalysis);
    } catch (err) {
      console.error('[Vault:analyze] FAILED — record kept as draft_raw. Reason:', err.message ?? err);
      this.showToast('Analysis failed. Evidence is saved.');
      this._analyzingIds.delete(id);
      return;
    }

    try {
      await this.storage.updateIncident(id, {
        status:          'pending_review',
        aiAnalysis:      normalizeAiAnalysis(aiAnalysis),
        analysis_source: 'server',
        analysis_ready:  true,
      });
      console.log('[Vault:analyze] record updated → pending_review ✓');
    } catch (err) {
      console.error('[Vault:analyze] failed to update record:', err);
    }

    this._analyzingIds.delete(id);
    this._timelineDirty = true;
    this._checkPendingBanner();
    this._refreshTimeline();
    this.showToast('Analysis complete.');
  }

  async _checkPendingBanner() {
    const banner = document.getElementById('pending-banner');
    if (!banner) return;
    try {
      const pending = await this.storage.getPendingIncidents();
      const analyzing = pending.filter((r) => r.status === 'draft_raw').length;
      const toReview  = pending.filter((r) => r.status === 'pending_review');

      banner.style.display = pending.length > 0 ? 'flex' : 'none';

      const msgEl  = document.getElementById('pending-banner-msg');
      const arrow  = document.getElementById('pending-banner-arrow');

      if (analyzing > 0) {
        // Still analyzing — not tappable, hide arrow
        if (msgEl) msgEl.textContent = `Analyzing ${analyzing} record${analyzing > 1 ? 's' : ''}...`;
        banner.style.cursor = 'default';
        banner.onclick = null;
        if (arrow) arrow.style.opacity = '0';
      } else if (toReview.length > 0) {
        // Analysis done, waiting for user review — tappable
        if (msgEl) msgEl.textContent = `${toReview.length} record${toReview.length > 1 ? 's' : ''} ready to review`;
        banner.style.cursor = 'pointer';
        banner.onclick = () => this._showRecordDetail(toReview[0]);
        if (arrow) arrow.style.opacity = '0.5';
      }

      console.log('[Vault:banner] draft_raw:', analyzing, '| pending_review:', toReview.length);
    } catch (_) {
      banner.style.display = 'none';
    }
  }

  async _retryPendingAnalysis() {
    if (this._retryInProgress) return;
    this._retryInProgress = true;
    console.log('[Vault:retry] checking for draft_raw records...');
    let pending;
    try {
      pending = await this.storage.getPendingIncidents();
    } catch (_) { this._retryInProgress = false; return; }

    const drafts = pending.filter((r) => r.status === 'draft_raw');
    console.log('[Vault:retry]', drafts.length, 'draft_raw record(s) found');
    if (drafts.length === 0) { this._retryInProgress = false; return; }

    // Check if STT server is reachable before attempting audio-only records
    let sttAlive = false;
    const audioOnlyDrafts = drafts.filter((r) => r.transcription_pending === true);
    if (audioOnlyDrafts.length > 0) {
      try {
        const sttHealthUrl = this._sttUrl.replace(/^wss?:\/\//, 'https://').replace('/ws/transcribe', '/health');
        const _hc = new AbortController(); setTimeout(() => _hc.abort(), 3000);
        const r = await fetch(sttHealthUrl, { signal: _hc.signal });
        sttAlive = r.ok;
        console.log('[Vault:retry] STT health check:', r.status, r.ok);
      } catch (err) {
        console.log('[Vault:retry] STT health check failed:', err.message);
      }
      console.log('[Vault:retry] STT server alive:', sttAlive, '| audio-only records:', audioOnlyDrafts.length);
    }

    try {
      for (const record of drafts) {
        const isAudioOnly = record.transcription_pending === true;
        if (isAudioOnly && !sttAlive) {
          console.log('[Vault:retry] skipping audio-only id:', record.id, '— STT server not available');
          continue;
        }

        let notes = record.textNotes ?? '';

        if (isAudioOnly && sttAlive) {
          console.log('[Vault:retry] transcribing audio for id:', record.id);
          const msgEl = document.getElementById('pending-banner-msg');
          if (msgEl) msgEl.textContent = 'Transcribing recording...';
          try {
            const httpSttUrl = this._sttUrl.replace(/^wss?:\/\//, 'https://').replace('/ws/transcribe', '/transcribe');
            const resp = await fetch(httpSttUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio_base64: record.audioDataUrl }),
              signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 120000); return c.signal; })(),
            });
            if (!resp.ok) {
              console.warn('[Vault:retry] STT /transcribe returned', resp.status, '— skipping');
              continue;
            }
            const { text } = await resp.json();
            if (!text) { continue; }
            notes = `Voice transcript: ${text}`;
            await this.storage.updateIncident(record.id, {
              textNotes: notes,
              narrative: text,
              transcription_pending: false,
            });
            console.log('[Vault:retry] transcript received:', text.slice(0, 80));
          } catch (err) {
            console.warn('[Vault:retry] STT HTTP failed:', err.message);
            continue;
          }
        }

        console.log('[Vault:retry] analyzing id:', record.id);
        const msgEl2 = document.getElementById('pending-banner-msg');
        if (msgEl2) msgEl2.textContent = 'Analyzing evidence...';
        await this._analyzeAndUpdate(record.id, notes, record.photoDataUrl ?? null);
      }
    } finally {
      this._retryInProgress = false;
      console.log('[Vault:retry] all retries complete');
    }
  }

  _composeNotes() {
    const parts = [];
    if (this._entry.modality === 'voice' && this._entry.transcript) {
      parts.push(`Voice transcript: ${this._entry.transcript}`);
    }
    if (this._entry.modality === 'text' && this._entry.textInput) {
      parts.push(this._entry.textInput);
    }
    if (this._entry.narrative) {
      parts.push(`Narrative: ${this._entry.narrative}`);
    }
    if (this._entry.timestamp) {
      parts.push(`When: ${this._entry.timestamp}`);
    }
    if (this._entry.bodyRegion) {
      parts.push(`Body region: ${this._entry.bodyRegion}`);
    }
    const corrOn = Object.entries(this._entry.corroboration)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (corrOn.length) {
      parts.push(`Corroboration flags: ${corrOn.join(', ')}`);
    }
    return parts.join('\n\n') || '(No notes)';
  }

  _renderCompleteScreen(record) {
    const modality = record.modality || 'entry';
    document.getElementById('complete-type').textContent = this._capitalize(modality);
    document.getElementById('complete-region').textContent = record.bodyRegion || '—';
    document.getElementById('complete-when').textContent = record.timestamp || '—';

    const aiRow = document.getElementById('complete-ai-row');
    aiRow.style.display = record.aiAnalysis ? 'flex' : 'none';

    // CC-003: show disclaimer alongside AI row
    const aiDisclaimer = document.getElementById('complete-ai-disclaimer');
    if (aiDisclaimer) aiDisclaimer.style.display = record.aiAnalysis ? 'block' : 'none';

    // CC-004: for photo entries, be honest that only notes were analyzed (not the photo)
    if (record.modality === 'photo' && record.aiAnalysis) {
      const aiLabel = document.getElementById('complete-ai-label');
      if (aiLabel) aiLabel.textContent = 'Photo and notes analyzed by AI';
    } else {
      const aiLabel = document.getElementById('complete-ai-label');
      if (aiLabel) aiLabel.textContent = 'AI analysis';
    }

    // Check for pattern (same body region appearing in a previous record)
    if (record.bodyRegion) {
      this._checkPatternForComplete(record.bodyRegion);
    }

    // Injury photo follow-up reminder
    const followupEl = document.getElementById('complete-followup-msg');
    if (record.modality === 'photo') {
      followupEl.textContent = 'Bruises can change over the next few days. Consider photographing again in 2–3 days.';
      followupEl.classList.remove('hidden');
    } else {
      followupEl.classList.add('hidden');
    }

    // Reset new entry UI so it's fresh next time
    document.getElementById('doc-another-btn').dataset.goto = 'home';
  }

  async _checkPatternForComplete(region) {
    const patternEl = document.getElementById('complete-pattern-msg');
    try {
      const records = await this.storage.listIncidents();
      const count = records.filter((r) => r.bodyRegion === region).length;
      if (count >= 2) {
        patternEl.textContent = `This is the ${count === 2 ? 'second' : `${count}th`} time you've documented an injury to your ${region}. Patterns like this can be significant.`;
        patternEl.classList.remove('hidden');
      } else {
        patternEl.classList.add('hidden');
      }
    } catch (_) {
      patternEl.classList.add('hidden');
    }
  }

  // ── Timeline ──────────────────────────────────────
  _bindTimeline() {
    document.getElementById('export-btn').addEventListener('click', () => {
      runFullExport(this.storage, this.showToast);
    });
    document.getElementById('export-readable-btn').addEventListener('click', () => {
      this._handleExportReadable();
    });
    document.getElementById('import-btn').addEventListener('click', () => {
      runImport(this.storage, this.showToast, () => {
        this._refreshTimeline();
        this.showToast('Backup restored');
      });
    });
    document.getElementById('record-detail-back-btn').addEventListener('click', () => {
      this._go('timeline');
    });
  }

  async _refreshTimeline() {
    if (!this._timelineDirty) return;
    this._timelineDirty = false;
    const listEl = document.getElementById('timeline-list');

    let records = [];
    try {
      records = await this.storage.listIncidents();
    } catch (err) {
      listEl.innerHTML = '<div class="sw-empty-state">Could not load records.</div>';
      return;
    }

    listEl.innerHTML = '';

    if (records.length === 0) {
      listEl.innerHTML = '<div class="sw-empty-state">No entries yet.<br>When something happens, come back and tell me.</div>';
      document.getElementById('view-patterns-btn').style.display = 'none';
      return;
    }

    // Check for any repeated body regions (for timeline card badges)
    const regionCounts = {};
    records.forEach((r) => {
      if (r.bodyRegion && r.bodyRegion !== 'unknown') regionCounts[r.bodyRegion] = (regionCounts[r.bodyRegion] || 0) + 1;
    });
    document.getElementById('view-patterns-btn').style.display = 'none';

    records
      .sort((a, b) => new Date(b.savedAt || b.timestamp) - new Date(a.savedAt || a.timestamp))
      .forEach((r) => {
        listEl.appendChild(this._buildTimelineCard(r, regionCounts));
      });
  }

  _buildTimelineCard(r, regionCounts) {
    if (r.aiAnalysis) r = { ...r, aiAnalysis: normalizeAiAnalysis(r.aiAnalysis) };
    const date = new Date(r.savedAt || r.timestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const modality = this._capitalize(r.modality || 'entry');
    const _full = r.aiAnalysis?.narrative?.model_summary || r.aiAnalysis?.analysis?.structured_description || r.aiAnalysis?.summary || r.narrative || '';
    const excerpt = _full.length > 120 ? _full.slice(0, 120) + '…' : _full;
    const region = r.bodyRegion || r.aiAnalysis?.body_region;
    const isRepeat = region && (regionCounts[region] || 0) >= 2;
    const needsReview = r.status === 'pending_review';

    const card = document.createElement('div');
    card.className = 'sw-timeline-entry';
    card.innerHTML = `
      <div class="sw-tl-header">
        <span class="sw-tl-type">${this._escape(modality)}</span>
        <span class="sw-tl-date">${this._escape(date)}</span>
        <button class="sw-tl-delete-btn" data-delete-id="${this._escape(r.id)}" title="Delete entry" style="background:none;border:none;cursor:pointer;font-size:16px;padding:0 0 0 8px;line-height:1;color:var(--sw-text-hint);">🗑</button>
      </div>
      ${region ? `<div style="font-size:12px; color:var(--sw-text-hint); margin-bottom:4px;">${this._escape(humanizeRegion(region))}</div>` : ''}
      <div class="sw-tl-excerpt">${this._escape(excerpt)}</div>
      ${needsReview ? `<div class="sw-tl-badge" style="background:#E8F4F0;color:#1D6B52;border:1px solid #1D6B52;">Review analysis</div>` : ''}
      ${isRepeat ? `<div class="sw-tl-badge sw-tl-badge-danger">Repeated: ${this._escape(humanizeRegion(region))}</div>` : ''}
    `;

    card.querySelector('.sw-tl-delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      this._showConfirm('Delete this entry?', async () => {
        try {
          await this.storage.deleteIncident(r.id);
          this._timelineDirty = true;
          this._refreshTimeline();
        } catch (err) {
          this.showToast('Delete failed');
        }
      });
    });

    card.addEventListener('click', () => {
      this._showRecordDetail(r);
    });

    return card;
  }

  // ── Record detail ─────────────────────────────────
  _showRecordDetail(record) {
    // Normalize aiAnalysis at read time (covers records saved before normalizer was added)
    if (record.aiAnalysis) record = { ...record, aiAnalysis: normalizeAiAnalysis(record.aiAnalysis) };

    // Show AI followup suggestions from gaps[]
    // const followups = (record.aiAnalysis?.gaps ?? [])
    //   .map((g) => g.suggested_followup)
    //   .filter((s) => s && typeof s === 'string');
    // followups.forEach((msg, i) => {
    //   setTimeout(() => this.showToast(msg), 400 + i * 2500);
    // });

    // Clean up any previous review state before rendering
    this._cleanupReviewMode();

    // Date / type badge
    const date = new Date(record.savedAt || record.timestamp).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    document.getElementById('detail-type-badge').textContent =
      this._capitalize(record.modality || 'entry');
    document.getElementById('detail-date').textContent = date;

    // Evidence photo (issue #1)
    const photoWrap = document.getElementById('detail-photo-wrap');
    const photoImg  = document.getElementById('detail-photo-img');
    if (photoWrap && photoImg) {
      if (record.modality === 'photo' && record.photoDataUrl) {
        photoImg.src = record.photoDataUrl;
        photoWrap.style.display = 'block';
      } else {
        photoWrap.style.display = 'none';
        photoImg.src = '';
      }
    }

    // Audio player — voice records with saved recording
    document.getElementById('detail-audio-wrap')?.remove();
    if (record.modality === 'voice' && record.audioDataUrl) {
      const audioWrap = document.createElement('div');
      audioWrap.id = 'detail-audio-wrap';
      audioWrap.style.cssText = 'margin:12px 0 4px;';
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = record.audioDataUrl;
      audio.style.cssText = 'width:100%;border-radius:8px;height:40px;';
      audioWrap.appendChild(audio);
      photoWrap.insertAdjacentElement('afterend', audioWrap);
    }

    // Body region — prefer AI-extracted, fall back to user-entered; humanize enum
    const rawRegion = record.aiAnalysis?.body_region || record.bodyRegion || '';
    document.getElementById('detail-region').textContent = rawRegion ? humanizeRegion(rawRegion) : 'Not specified';

    // Notes — show user-written narrative only; textNotes is LLM context, not user display text
    const notesText = record.narrative || record.transcript || record.textInput || '';
    const notesEl = document.getElementById('detail-notes');
    notesEl.textContent = notesText || '(No notes — tap Edit to add your account)';

    // Section label: voice → "Your statement (voice transcript)", others → "Your account"
    const notesTitleEl = document.getElementById('detail-notes-section-title');
    if (notesTitleEl) {
      if (record.modality === 'voice') {
        notesTitleEl.innerHTML = 'Your statement <span style="font-size:11px;font-weight:400;color:var(--sw-text-hint);margin-left:4px;">(voice transcript)</span>';
      } else {
        notesTitleEl.textContent = 'Your account';
      }
    }

    // Wire narrative edit button — always available
    const notesEditBtn    = document.getElementById('detail-notes-edit-btn');
    const notesEditWrap   = document.getElementById('detail-notes-edit-wrap');
    const notesTextarea   = document.getElementById('detail-notes-textarea');
    const notesSaveBtn    = document.getElementById('detail-notes-save-btn');
    const notesCancelBtn  = document.getElementById('detail-notes-cancel-btn');
    if (notesEditBtn) {
      notesEditBtn.onclick = () => {
        notesTextarea.value = notesText;
        notesEl.style.display = 'none';
        notesEditWrap.style.display = 'block';
        notesTextarea.focus();
      };
      notesSaveBtn.onclick = async () => {
        const newText = notesTextarea.value.trim();
        notesEl.textContent = newText || '(No notes)';
        notesEl.style.display = '';
        notesEditWrap.style.display = 'none';
        try {
          await this.storage.updateIncident(record.id, { narrative: newText, textNotes: newText });
          record.narrative = newText; record.textNotes = newText;
        } catch (_) { this.showToast('Could not save note'); }
      };
      notesCancelBtn.onclick = () => {
        notesEl.style.display = '';
        notesEditWrap.style.display = 'none';
      };
    }

    // Evidence type pill (header)
    const evTypeEl = document.getElementById('detail-evidence-type');
    const evType = record.aiAnalysis?.evidence_type;
    if (evTypeEl) {
      if (evType && evType !== 'null') {
        evTypeEl.textContent = EVIDENCE_TYPE_LABELS[evType] || evType.replace(/_/g, ' ');
        evTypeEl.style.display = 'inline-block';
      } else {
        evTypeEl.style.display = 'none';
      }
    }

    // Evidence type row (editable in review mode)
    const evTypeRowEl  = document.getElementById('detail-evidence-type-row');
    const evTypeValEl  = document.getElementById('detail-evidence-type-value');
    if (evTypeRowEl && evTypeValEl) {
      if (evType && evType !== 'null') {
        evTypeValEl.textContent = EVIDENCE_TYPE_LABELS[evType] || evType.replace(/_/g, ' ');
        evTypeRowEl.style.display = 'flex';
      } else {
        evTypeRowEl.style.display = 'none';
      }
    }

    // Incident type pill
    const incTypeEl = document.getElementById('detail-incident-type');
    if (incTypeEl) {
      const incType = record.aiAnalysis?.incident_type;
      if (incType && incType !== 'null') {
        incTypeEl.textContent = incType;
        incTypeEl.style.display = 'inline-block';
      } else {
        incTypeEl.style.display = 'none';
      }
    }

    // Analysis source pill
    const srcEl = document.getElementById('detail-analysis-source');
    if (srcEl) {
      const src = record.analysis_source;
      if (src && src !== 'none') {
        srcEl.textContent = src === 'server' ? 'server analysis' : src === 'on_device_draft' ? 'draft (offline)' : src;
        srcEl.style.display = 'inline-block';
      } else {
        srcEl.style.display = 'none';
      }
    }

    // AI Analysis section
    const aiSection = document.getElementById('detail-ai-section');
    if (record.aiAnalysis) {
      aiSection.style.display = 'block';

      // Structured description
      document.getElementById('detail-ai-summary').textContent =
        record.aiAnalysis.narrative?.model_summary ||
        record.aiAnalysis.analysis?.structured_description ||
        record.aiAnalysis.summary || 'Analysis not available';

      // Severity — severity_signals[] already filtered by normalizeAiAnalysis
      const signals = record.aiAnalysis.severity_signals ?? [];
      const severityRowEl = document.getElementById('detail-severity-row');
      if (signals.length) {
        document.getElementById('detail-severity').textContent =
          signals.map((s) => SEVERITY_SIGNAL_LABELS[s] || s.replace(/_/g, ' ')).join(', ');
        if (severityRowEl) severityRowEl.style.display = 'flex';
      } else {
        if (severityRowEl) severityRowEl.style.display = 'none';
      }

      // Injury type — canonical: injury_kind[] array; show label or raw value
      const injKind = record.aiAnalysis.injury_kind;
      const injuriesRowEl = document.getElementById('detail-injuries-row');
      if (Array.isArray(injKind) && injKind.length) {
        document.getElementById('detail-injuries').textContent =
          injKind.map((k) => INJURY_KIND_LABELS[k] || k).join(', ');
        if (injuriesRowEl) injuriesRowEl.style.display = 'flex';
      } else {
        const legacyInj = record.aiAnalysis.injury_type === 'null' ? null : record.aiAnalysis.injury_type;
        if (legacyInj) {
          document.getElementById('detail-injuries').textContent = legacyInj;
          if (injuriesRowEl) injuriesRowEl.style.display = 'flex';
        } else {
          if (injuriesRowEl) injuriesRowEl.style.display = 'none';
        }
      }

      // Defensive injury — canonical: severity_signals includes 'defensive_pattern'
      const defensiveRowEl = document.getElementById('detail-defensive-row');
      const isDefensive = signals.includes('defensive_pattern') || record.aiAnalysis.is_defensive_injury;
      if (isDefensive != null && isDefensive !== 'null') {
        document.getElementById('detail-defensive').textContent =
          isDefensive === true || isDefensive === 'true' ? 'Yes' : 'No';
        if (defensiveRowEl) defensiveRowEl.style.display = 'flex';
      } else {
        if (defensiveRowEl) defensiveRowEl.style.display = 'none';
      }

      // Visible indicators
      const indicators = record.aiAnalysis.visible_indicators;
      const indWrap = document.getElementById('detail-indicators-wrap');
      const indList = document.getElementById('detail-indicators');
      if (Array.isArray(indicators) && indicators.length) {
        indList.innerHTML = indicators.map((i) => `<li>${this._escape(i)}</li>`).join('');
        if (indWrap) indWrap.style.display = 'block';
      } else {
        if (indWrap) indWrap.style.display = 'none';
      }

      // Photo quality warning
      const pqWrap = document.getElementById('detail-photo-quality-wrap');
      const pqMsg = document.getElementById('detail-photo-quality-msg');
      const pq = record.aiAnalysis.photo_quality;
      if (pq && pq.usable === false && record.modality === 'photo') {
        pqMsg.textContent = pq.suggestion || `Issue: ${pq.issue || 'quality problem'}`;
        if (pqWrap) pqWrap.style.display = 'block';
      } else {
        if (pqWrap) pqWrap.style.display = 'none';
      }

      // paired_evidence_suggested — not shown in UI; gaps[].suggested_followup handles actionable guidance via toast
      const recWrap = document.getElementById('detail-recommendations-wrap');
      if (recWrap) recWrap.style.display = 'none';

    } else {
      aiSection.style.display = 'none';
      const severityRowEl = document.getElementById('detail-severity-row');
      const injuriesRowEl = document.getElementById('detail-injuries-row');
      const defensiveRowEl = document.getElementById('detail-defensive-row');
      if (severityRowEl) severityRowEl.style.display = 'none';
      if (injuriesRowEl) injuriesRowEl.style.display = 'none';
      if (defensiveRowEl) defensiveRowEl.style.display = 'none';
    }

    // Review / save button — shown whenever aiAnalysis exists (issue #5: edit after confirm)
    const reviewBtn = document.getElementById('detail-review-btn');
    if (reviewBtn) {
      if (record.aiAnalysis) {
        reviewBtn.style.display = 'flex';
        // Button label reflects status
        reviewBtn.textContent = record.status === 'pending_review' ? 'Confirm analysis' : 'Save changes';

        reviewBtn.onclick = async () => {
          const corrections = Object.entries(this._pendingCorrections).map(([field, { original, corrected }]) => ({
            field,
            original_value: original,
            corrected_value: corrected,
            timestamp: new Date().toISOString(),
          }));

          const updatedAI = record.aiAnalysis ? { ...record.aiAnalysis } : {};
          for (const [field, { corrected }] of Object.entries(this._pendingCorrections)) {
            if (field === 'structured_description') {
              updatedAI.analysis = { ...(updatedAI.analysis || {}), structured_description: corrected };
            } else {
              updatedAI[field] = corrected;
            }
          }

          // Only advance status if still pending_review
          const statusUpdate = record.status === 'pending_review' ? { status: 'reviewed' } : {};

          try {
            await this.storage.updateIncident(record.id, {
              ...statusUpdate,
              aiAnalysis: updatedAI,
              user_corrections: [
                ...(record.user_corrections || []),
                ...corrections,
              ],
            });
            this._timelineDirty = true;
            this._cleanupReviewMode();
            await this._checkPendingBanner();
            this._go('timeline');
            this._refreshTimeline();
          } catch (err) {
            this.showToast('Could not save changes');
          }
        };

        this._enterReviewMode(record);
      } else {
        reviewBtn.style.display = 'none';
      }
    }

    // Corroboration — tappable toggles that save immediately (issue #3)
    const corrKeys = ['doctor', 'witnesses', 'police', 'digital'];
    corrKeys.forEach((key) => {
      const dot  = document.getElementById(`detail-corr-${key}-dot`);
      if (!dot) return;
      const item = dot.closest('.sw-detail-corr-item') || dot.parentElement;
      dot.classList.toggle('on', !!(record.corroboration?.[key]));
      item.style.cursor = 'pointer';
      item.onclick = async () => {
        const newVal = !dot.classList.contains('on');
        dot.classList.toggle('on', newVal);
        const updatedCorr = { ...(record.corroboration || {}), [key]: newVal };
        record.corroboration = updatedCorr;
        try {
          await this.storage.updateIncident(record.id, { corroboration: updatedCorr });
        } catch (_) { this.showToast('Could not save'); }
      };
    });

    // Delete button
    const deleteBtn = document.getElementById('detail-delete-btn');
    deleteBtn.onclick = () => {
      this._showConfirm('Delete this entry?', async () => {
        try {
          await this.storage.deleteIncident(record.id);
          this._timelineDirty = true;
          this._refreshTimeline();
          this._go('timeline');
        } catch (err) {
          this.showToast('Delete failed');
        }
      });
    };

    this._go('record_detail');
  }

  // ── Review mode (pending_review → reviewed) ──────────
  _enterReviewMode(record) {
    this._pendingCorrections = {};

    const banner = document.getElementById('detail-review-banner');
    if (banner) banner.style.display = 'block';

    const ai = record.aiAnalysis || {};

    this._attachFieldEditor({
      rowId: 'detail-evidence-type-row', displayId: 'detail-evidence-type-value',
      field: 'evidence_type', originalValue: ai.evidence_type,
      editType: 'select', options: EVIDENCE_TYPE_OPTIONS, labelMap: EVIDENCE_TYPE_LABELS,
    });
    this._attachFieldEditor({
      rowId: 'detail-severity-row', displayId: 'detail-severity',
      field: 'severity_signals',
      originalValue: Array.isArray(ai.severity_signals) ? ai.severity_signals : (ai.severity ? [ai.severity] : []),
      editType: 'chips', options: SEVERITY_SIGNAL_OPTIONS, labelMap: SEVERITY_SIGNAL_LABELS,
    });
    this._attachFieldEditor({
      rowId: 'detail-region-row', displayId: 'detail-region',
      field: 'body_region', originalValue: ai.body_region || record.bodyRegion,
      editType: 'select', options: BODY_REGION_OPTIONS,
    });
    this._attachFieldEditor({
      rowId: 'detail-injuries-row', displayId: 'detail-injuries',
      field: 'injury_kind',
      originalValue: Array.isArray(ai.injury_kind) ? ai.injury_kind : (ai.injury_type ? [ai.injury_type] : []),
      editType: 'chips', options: INJURY_KIND_OPTIONS, labelMap: INJURY_KIND_LABELS,
    });
    if (ai.is_defensive_injury != null) {
      this._attachFieldEditor({
        rowId: 'detail-defensive-row', displayId: 'detail-defensive',
        field: 'is_defensive_injury', originalValue: ai.is_defensive_injury,
        editType: 'toggle',
      });
    }
    this._attachDescriptionEditor(ai.narrative?.model_summary || ai.analysis?.structured_description || '');
  }

  _attachFieldEditor({ rowId, displayId, field, originalValue, editType, options = [], labelMap = BODY_REGION_LABELS }) {
    const row = document.getElementById(rowId);
    const display = document.getElementById(displayId);
    if (!row || !display || row.dataset.reviewAttached) return;
    row.dataset.reviewAttached = '1';

    // Wrap value + edited-dot + pencil button
    const wrap = document.createElement('div');
    wrap.className = 'sw-review-field-wrap';
    display.parentNode.insertBefore(wrap, display);
    wrap.appendChild(display);

    const dot = document.createElement('span');
    dot.className = 'sw-review-dot';
    dot.style.display = 'none';
    wrap.appendChild(dot);

    const pencil = document.createElement('button');
    pencil.className = 'sw-review-pencil';
    pencil.setAttribute('aria-label', `Edit ${field}`);
    pencil.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    wrap.appendChild(pencil);

    const activate = () => {
      display.style.display = 'none';
      pencil.style.display = 'none';

      if (editType === 'select') {
        const sel = document.createElement('select');
        sel.className = 'sw-review-select';
        options.forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt; o.textContent = labelMap[opt] || opt;
          if (opt === originalValue) o.selected = true;
          sel.appendChild(o);
        });
        wrap.insertBefore(sel, dot);
        sel.focus();

        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const val = sel.value;
          sel.remove();
          display.textContent = labelMap[val] || val;
          display.style.display = '';
          pencil.style.display = '';
          if (val !== String(originalValue ?? '')) {
            this._pendingCorrections[field] = { original: originalValue, corrected: val };
            dot.style.display = 'inline-block';
          } else {
            delete this._pendingCorrections[field];
            dot.style.display = 'none';
          }
        };
        sel.addEventListener('change', commit);
        sel.addEventListener('blur', () => { if (sel.parentNode) commit(); });

      } else if (editType === 'toggle') {
        const tWrap = document.createElement('div');
        tWrap.style.cssText = 'display:flex;gap:4px;';
        [true, false].forEach((val) => {
          const b = document.createElement('button');
          b.textContent = val ? 'Yes' : 'No';
          b.className = 'sw-review-toggle-btn' + (originalValue === val ? ' active' : '');
          b.addEventListener('click', () => {
            tWrap.remove();
            display.textContent = val ? 'Yes' : 'No';
            display.style.display = '';
            pencil.style.display = '';
            if (val !== originalValue) {
              this._pendingCorrections[field] = { original: originalValue, corrected: val };
              dot.style.display = 'inline-block';
            } else {
              delete this._pendingCorrections[field];
              dot.style.display = 'none';
            }
          });
          tWrap.appendChild(b);
        });
        wrap.insertBefore(tWrap, dot);

      } else if (editType === 'chips') {
        const origArr = Array.isArray(originalValue) ? originalValue : (originalValue ? [originalValue] : []);
        const selected = new Set(origArr);

        const updatePending = () => {
          const newVal = [...selected];
          const changed = JSON.stringify([...newVal].sort()) !== JSON.stringify([...origArr].sort());
          if (changed) {
            this._pendingCorrections[field] = { original: originalValue, corrected: newVal };
            dot.style.display = 'inline-block';
          } else {
            delete this._pendingCorrections[field];
            dot.style.display = 'none';
          }
        };

        const chipWrap = document.createElement('div');
        chipWrap.className = 'sw-review-chips';
        options.forEach((opt) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'sw-review-chip' + (selected.has(opt) ? ' active' : '');
          chip.textContent = labelMap[opt] || opt.replace(/_/g, ' ');
          chip.addEventListener('click', () => {
            if (selected.has(opt)) { selected.delete(opt); chip.classList.remove('active'); }
            else { selected.add(opt); chip.classList.add('active'); }
            updatePending();
          });
          chipWrap.appendChild(chip);
        });

        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'sw-review-chip-done';
        doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', () => {
          const finalVal = [...selected];
          chipWrap.remove();
          doneBtn.remove();
          display.textContent = finalVal.length
            ? finalVal.map((v) => labelMap[v] || v.replace(/_/g, ' ')).join(', ') : '—';
          display.style.display = '';
          pencil.style.display = '';
          updatePending();
        });

        wrap.insertBefore(chipWrap, dot);
        wrap.insertBefore(doneBtn, dot);
      }
    };

    pencil.addEventListener('click', (e) => { e.stopPropagation(); activate(); });
  }

  _attachDescriptionEditor(originalText) {
    const summaryEl = document.getElementById('detail-ai-summary');
    const editWrap  = document.getElementById('detail-description-edit-wrap');
    const textarea  = document.getElementById('detail-description-textarea');
    const saveBtn   = document.getElementById('detail-description-save-btn');
    const cancelBtn = document.getElementById('detail-description-cancel-btn');
    if (!summaryEl || !editWrap || !textarea || summaryEl.dataset.descAttached) return;
    summaryEl.dataset.descAttached = '1';

    // "Edit" button below the paragraph
    const editBtn = document.createElement('button');
    editBtn.id = 'detail-desc-edit-btn';
    editBtn.className = 'sw-review-text-edit-btn';
    editBtn.textContent = 'Edit this text';
    summaryEl.insertAdjacentElement('afterend', editBtn);

    editBtn.addEventListener('click', () => {
      textarea.value = summaryEl.textContent.trim();
      editWrap.style.display = 'block';
      editBtn.style.display = 'none';
      textarea.focus();
    });

    saveBtn.onclick = () => {
      const newText = textarea.value.trim();
      if (newText && newText !== originalText) {
        this._pendingCorrections['structured_description'] = { original: originalText, corrected: newText };
        summaryEl.textContent = newText;
        // Show correction badge on the section title
        const dot = summaryEl.closest('.sw-detail-section')?.querySelector('.sw-review-dot');
        if (!dot) {
          const d = document.createElement('span');
          d.className = 'sw-review-dot';
          summaryEl.insertAdjacentElement('beforebegin', d);
        }
      }
      editWrap.style.display = 'none';
      editBtn.style.display = 'block';
    };

    cancelBtn.onclick = () => {
      editWrap.style.display = 'none';
      editBtn.style.display = 'block';
    };
  }

  _cleanupReviewMode() {
    this._pendingCorrections = {};

    // Hide review banner
    const banner = document.getElementById('detail-review-banner');
    if (banner) banner.style.display = 'none';

    // Remove dynamically added edit controls and reset row state
    document.querySelectorAll('[data-review-attached]').forEach((el) => {
      delete el.dataset.reviewAttached;
    });
    document.querySelectorAll('[data-desc-attached]').forEach((el) => {
      delete el.dataset.descAttached;
    });
    document.getElementById('detail-desc-edit-btn')?.remove();
    document.getElementById('detail-description-edit-wrap')?.setAttribute('style', 'display:none;margin-top:8px;');

    // Un-wrap any .sw-review-field-wrap (restore original DOM)
    document.querySelectorAll('.sw-review-field-wrap').forEach((wrap) => {
      const display = wrap.querySelector('.sw-detail-value');
      if (display) {
        display.style.display = '';
        wrap.parentNode.insertBefore(display, wrap);
      }
      wrap.remove();
    });
  }

  // ── Pattern screen ────────────────────────────────
  async _renderPatternScreen() {
    const el = document.getElementById('pattern-content');
    el.innerHTML = '';

    let records = [];
    try {
      records = await this.storage.listIncidents();
    } catch (_) { return; }

    const regionCounts = {};
    records.forEach((r) => {
      if (r.bodyRegion && r.bodyRegion !== 'unknown') regionCounts[r.bodyRegion] = (regionCounts[r.bodyRegion] || 0) + 1;
    });

    const first = records.reduce((a, b) =>
      new Date(a.savedAt) < new Date(b.savedAt) ? a : b, records[0] || {});
    const last = records.reduce((a, b) =>
      new Date(a.savedAt) > new Date(b.savedAt) ? a : b, records[0] || {});

    const summaryCard = document.createElement('div');
    summaryCard.className = 'sw-evidence-card';
    summaryCard.innerHTML = `
      <div class="sw-ev-header">Summary</div>
      <div class="sw-ev-row"><span class="sw-ev-label">Total entries</span><span class="sw-ev-value">${records.length}</span></div>
      <div class="sw-ev-row"><span class="sw-ev-label">Date range</span><span class="sw-ev-value">${records.length >= 2
        ? `${new Date(first.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(last.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : '—'}</span></div>
    `;
    el.appendChild(summaryCard);

    const repeated = Object.entries(regionCounts).filter(([, c]) => c >= 2);
    if (repeated.length) {
      const patternCard = document.createElement('div');
      patternCard.className = 'sw-evidence-card';
      patternCard.innerHTML = `<div class="sw-ev-header">Patterns detected</div>`;
      repeated.forEach(([region, count]) => {
        patternCard.innerHTML += `
          <div style="padding:8px 0;">
            <div class="sw-tl-badge sw-tl-badge-danger">Repeated region: ${this._escape(region)} (${count} entries)</div>
            <div style="font-size:13px; color:var(--sw-text-sec); margin-top:6px; line-height:1.5;">
              You've documented ${count} injuries to your ${this._escape(region)}. Repeated injury to the same area is significant.
            </div>
          </div>`;
      });
      el.appendChild(patternCard);
    } else {
      const noPattern = document.createElement('div');
      noPattern.className = 'sw-empty-state';
      noPattern.textContent = 'No repeated regions detected yet.';
      el.appendChild(noPattern);
    }
  }

  // ── Export ─────────────────────────────────────────
  async _handleExport() {
    let records = [];
    try {
      records = await this.storage.listIncidents();
    } catch (_) { }

    if (records.length === 0) {
      this.showToast('No records to export');
      return;
    }

    const blob = new Blob([JSON.stringify({
      exported_at: new Date().toISOString(),
      record_count: records.length,
      records,
    }, null, 2)], { type: 'application/json' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast('Export downloaded');
  }

  async _handleExportReadable() {
    let records = [];
    try {
      records = await this.storage.listIncidents();
    } catch (_) { }

    if (records.length === 0) {
      this.showToast('No records to export');
      return;
    }

    const sorted = records
      .slice()
      .sort((a, b) => new Date(a.savedAt || a.timestamp) - new Date(b.savedAt || b.timestamp));

    const exportDate = new Date().toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

    const header = [
      'SILENT WITNESS — EVIDENCE RECORD',
      `Exported: ${exportDate}`,
      `Total entries: ${sorted.length}`,
      '',
    ].join('\n');

    const dividerLine = '─'.repeat(40);
    const dividerShort = '─'.repeat(40);

    const blocks = sorted.map((r, i) => {
      const dateFmt = new Date(r.savedAt || r.timestamp).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });

      const notes = r.textNotes || r.transcript || r.textInput || 'Photo entry';
      const bodyRegion = r.bodyRegion || 'Not specified';
      const modality = this._capitalize(r.modality || 'entry');

      const aiSummary = r.aiAnalysis?.narrative?.model_summary || r.aiAnalysis?.analysis?.structured_description || r.aiAnalysis?.summary || 'Analysis not available';
      const severity = r.aiAnalysis?.severity || r.aiAnalysis?.severity_assessment || '—';
      const injType = r.aiAnalysis?.injury_type;
      const injClin = r.aiAnalysis?.injury_type_clinical;
      const injuries = injType ? (injClin ? `${injType} (${injClin})` : injType)
        : (Array.isArray(r.aiAnalysis?.injury_locations) ? r.aiAnalysis.injury_locations.join(', ') : 'None reported');

      const corr = r.corroboration || {};
      const yesNo = (v) => (v ? 'Yes' : 'No');

      return [
        `── ENTRY [${i + 1}] ${dividerShort}`,
        `Date logged: ${dateFmt}`,
        `Type: ${modality}`,
        `Body region: ${bodyRegion}`,
        '',
        'Notes:',
        notes,
        '',
        'AI Analysis:',
        aiSummary,
        '',
        `Severity: ${severity}`,
        `Injuries noted: ${injuries}`,
        '',
        'Corroboration:',
        `- Medical attention: ${yesNo(corr.doctor)}`,
        `- Witnesses present: ${yesNo(corr.witnesses)}`,
        `- Police involved: ${yesNo(corr.police)}`,
        `- Digital evidence: ${yesNo(corr.digital)}`,
        dividerLine,
      ].join('\n');
    });

    const fullText = header + blocks.join('\n\n');

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `record-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast('Readable report downloaded');
  }

  // ── Settings ───────────────────────────────────────
  _bindSettings() {
    document.getElementById('erase-btn').addEventListener('click', () => {
      this._showConfirm('Delete all evidence records? This cannot be undone.', async () => {
        try {
          await this.storage.clearAll();
          this.showToast('All data erased');
          this._refreshSettings();
        } catch (err) {
          this.showToast('Erase failed');
        }
      });
    });

    // App lock (PIN change)
    document.getElementById('app-lock-btn')?.addEventListener('click', () => {
      this._showChangePinModal();
    });

    // Decoy PIN setup
    document.getElementById('decoy-pin-btn')?.addEventListener('click', () => {
      this._showDecoyPinModal();
    });

    // Auto-lock timeout
    document.getElementById('auto-lock-select')?.addEventListener('change', (e) => {
      localStorage.setItem('_alt', e.target.value);
      clearTimeout(this._autoLockTimer);
      this._setupAutoLock();
    });

    // Language
    document.getElementById('lang-select')?.addEventListener('change', (e) => {
      localStorage.setItem('_lg', e.target.value);
    });

    // Trusted contact save
    document.getElementById('tc-save-btn')?.addEventListener('click', () => {
      const name  = document.getElementById('tc-name-input')?.value.trim() || '';
      const rel   = document.getElementById('tc-rel-input')?.value.trim() || '';
      const phone = document.getElementById('tc-phone-input')?.value.trim() || '';
      if (!phone) { this.showToast('Enter a phone number'); return; }
      localStorage.setItem('_tc_name', name);
      localStorage.setItem('_tc_rel', rel);
      localStorage.setItem('_tc_phone', phone);
      this._refreshResources();
      this.showToast('Contact saved');
    });

    // Trusted contact edit
    document.getElementById('tc-edit-btn')?.addEventListener('click', () => {
      document.getElementById('tc-saved-view').style.display = 'none';
      document.getElementById('tc-edit-view').style.display = 'block';
    });

    // Trusted contact delete
    document.getElementById('tc-delete-btn')?.addEventListener('click', () => {
      ['_tc_name', '_tc_rel', '_tc_phone'].forEach((k) => localStorage.removeItem(k));
      this._refreshResources();
      this.showToast('Contact removed');
    });
  }

  _showChangePinModal() {
    const overlay    = document.getElementById('change-pin-overlay');
    const currentEl  = document.getElementById('change-pin-current');
    const newEl      = document.getElementById('change-pin-new');
    const confirmEl  = document.getElementById('change-pin-confirm');
    const errorEl    = document.getElementById('change-pin-error');
    const saveBtn    = document.getElementById('change-pin-save');
    const cancelBtn  = document.getElementById('change-pin-cancel');
    if (!overlay) return;

    [currentEl, newEl, confirmEl].forEach((el) => { if (el) el.value = ''; });
    if (errorEl) errorEl.style.display = 'none';
    overlay.classList.remove('hidden');

    const showError = (msg) => {
      if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
    };
    const hashPin = async (s) => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    };

    const onSave = async () => {
      const current = currentEl?.value.replace(/\D/g, '') || '';
      const newPin  = newEl?.value.replace(/\D/g, '') || '';
      const confirm = confirmEl?.value.replace(/\D/g, '') || '';

      if (errorEl) errorEl.style.display = 'none';

      if (!current)          return showError('Enter your current code.');
      if (newPin.length < 3) return showError('New code must be at least 3 digits.');
      if (newPin !== confirm) return showError('Codes do not match.');

      const currentHash = await hashPin(current);
      const storedHash  = localStorage.getItem('_ph') || await hashPin('1337');
      if (currentHash !== storedHash) return showError('Current code is incorrect.');

      const { Calculator } = await import('./calculator.js');

      try {
        await this.storage.rekey(newPin);
        await Calculator.storePin(newPin);
        cleanup();
        this.showToast('Secret code updated');
      } catch (e) {
        showError('Failed to update code. Try again.');
      }
    };

    const cleanup = () => {
      overlay.classList.add('hidden');
      saveBtn?.removeEventListener('click', onSave);
    };

    saveBtn?.addEventListener('click', onSave);
    cancelBtn?.addEventListener('click', cleanup, { once: true });
  }

  _showDecoyPinModal() {
    const overlay = document.getElementById('decoy-pin-overlay');
    const input   = document.getElementById('decoy-pin-input');
    const error   = document.getElementById('decoy-pin-error');
    const saveBtn = document.getElementById('decoy-pin-save');
    const clearBtn = document.getElementById('decoy-pin-clear');
    const cancelBtn = document.getElementById('decoy-pin-cancel');
    if (!overlay) return;

    if (input) input.value = '';
    if (error) error.style.display = 'none';
    overlay.classList.remove('hidden');

    const cleanup = () => overlay.classList.add('hidden');

    saveBtn?.addEventListener('click', async () => {
      const val = input?.value.replace(/\D/g, '') || '';
      if (val.length < 3) { if (error) error.style.display = 'block'; return; }
      const { Calculator } = await import('./calculator.js');
      await Calculator.storeDecoyPin(val);
      cleanup();
      this._refreshSettings();
      this.showToast('Decoy code saved');
    }, { once: true });

    clearBtn?.addEventListener('click', async () => {
      const { Calculator } = await import('./calculator.js');
      Calculator.clearDecoyPin();
      cleanup();
      this._refreshSettings();
      this.showToast('Decoy code removed');
    }, { once: true });

    cancelBtn?.addEventListener('click', cleanup, { once: true });
  }

  _refreshResources() {
    const name  = localStorage.getItem('_tc_name')  || '';
    const rel   = localStorage.getItem('_tc_rel')   || '';
    const phone = localStorage.getItem('_tc_phone') || '';

    const savedView = document.getElementById('tc-saved-view');
    const editView  = document.getElementById('tc-edit-view');

    if (phone) {
      // Show saved state
      if (savedView) savedView.style.display = 'block';
      if (editView)  editView.style.display  = 'none';

      const displayName = document.getElementById('tc-display-name');
      const displayMeta = document.getElementById('tc-display-meta');
      const callBtn     = document.getElementById('tc-call-btn');
      if (displayName) displayName.textContent = name || phone;
      if (displayMeta) displayMeta.textContent = [rel, phone].filter(Boolean).join(' · ');
      if (callBtn) {
        callBtn.href = `tel:${phone}`;
        callBtn.textContent = name ? `Call ${name}` : `Call ${phone}`;
      }
    } else {
      // Show edit/add state
      if (savedView) savedView.style.display = 'none';
      if (editView)  editView.style.display  = 'block';

      const nameInput  = document.getElementById('tc-name-input');
      const relInput   = document.getElementById('tc-rel-input');
      const phoneInput = document.getElementById('tc-phone-input');
      if (nameInput)  nameInput.value  = '';
      if (relInput)   relInput.value   = '';
      if (phoneInput) phoneInput.value = '';
    }
  }

  async _refreshSettings() {
    try {
      const records = await this.storage.listIncidents();
      document.getElementById('storage-hint').textContent =
        `${records.length} record${records.length !== 1 ? 's' : ''}`;
    } catch (_) { }

    // Restore persisted values
    const altSel = document.getElementById('auto-lock-select');
    if (altSel) altSel.value = localStorage.getItem('_alt') || '0';

    const langSel = document.getElementById('lang-select');
    if (langSel) langSel.value = localStorage.getItem('_lg') || 'en';

    const decoyBtn = document.getElementById('decoy-pin-btn');
    if (decoyBtn) {
      if (this._isDecoy) {
        decoyBtn.style.display = 'none';
      } else {
        decoyBtn.style.display = '';
        const decoyHint = document.getElementById('decoy-pin-hint');
        if (decoyHint) decoyHint.textContent = localStorage.getItem('_dph') ? 'Set' : 'Not set';
      }
    }

    // Server status checks (parallel, 3s timeout each)
    const checkServer = async (url) => {
      try {
        const _sc = new AbortController(); setTimeout(() => _sc.abort(), 3000);
        const r = await fetch(url, { signal: _sc.signal });
        return r.ok;
      } catch (_) { return false; }
    };

    const [llmOk, sttOk] = await Promise.all([
      checkServer(`${this.inference.serverUrl}/health`),
      checkServer(this._sttUrl.replace(/^wss?:\/\//, 'https://').replace('/ws/transcribe', '/health')),
    ]);

    const llmDot  = document.getElementById('server-llm-dot');
    const llmHint = document.getElementById('server-llm-hint');
    const sttDot  = document.getElementById('server-stt-dot');
    const sttHint = document.getElementById('server-stt-hint');

    if (llmDot)  llmDot.style.background  = llmOk ? '#1D6B52' : '#C43B3B';
    if (llmHint) llmHint.textContent       = llmOk ? 'Online — Gemma 4 ready' : 'Offline';
    if (sttDot)  sttDot.style.background  = sttOk ? '#1D6B52' : '#C43B3B';
    if (sttHint) sttHint.textContent       = sttOk ? 'Online — transcription ready' : 'Offline';
  }

  // ── Model loading overlay ─────────────────────────
  _showModelOverlay(msg = 'Loading AI model...') {
    document.getElementById('modelOverlayText').textContent = msg;
    document.getElementById('modelProgressFill').style.width = '0%';
    document.getElementById('modelOverlay').classList.remove('hidden');
  }

  _updateModelOverlay(pct, msg) {
    document.getElementById('modelOverlayText').textContent = msg;
    document.getElementById('modelProgressFill').style.width = `${pct}%`;
  }

  _hideModelOverlay() {
    document.getElementById('modelOverlay').classList.add('hidden');
  }

  // ── In-DOM confirmation dialog ────────────────────
  // Replaces confirm() to avoid iOS Safari showing the page URL.
  _showConfirm(message, onConfirm) {
    const overlay = document.getElementById('confirm-overlay');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    msgEl.textContent = message;
    overlay.classList.remove('hidden');

    const hide = () => overlay.classList.add('hidden');

    // Use one-shot listeners so repeated calls never double-bind
    const onOk = () => { hide(); onConfirm(); };
    const onCancel = () => hide();

    okBtn.addEventListener('click', onOk, { once: true });
    cancelBtn.addEventListener('click', onCancel, { once: true });
  }

  // ── Helpers ───────────────────────────────────────
  _blankEntry() {
    return {
      modality: null,
      photoDataUrl: null,
      photoFile: null,
      audioBlob: null,
      audioMime: null,
      transcript: '',
      textInput: '',
      timestamp: '',
      bodyRegion: '',
      narrative: '',
      corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    };
  }

  _resetEntry() {
    this._entry = this._blankEntry();

    // Reset photo screen
    document.getElementById('photo-zone-placeholder').style.display = 'flex';
    const previewImg = document.getElementById('photo-preview-img');
    previewImg.src = '';
    previewImg.style.display = 'none';
    document.getElementById('photo-zone').style.padding = '';
    document.getElementById('photo-continue-btn').style.display = 'none';
    const retakeBtn = document.getElementById('photo-retake-btn');
    if (retakeBtn) retakeBtn.style.display = 'none';
    const picker = document.getElementById('photo-source-picker');
    if (picker) picker.style.display = 'none';

    // Reset voice screen
    this._resetVoiceUI();

    // Reset text screen
    document.getElementById('text-entry-input').value = '';

    // Reset gap screens
    document.getElementById('timestamp-input').value = '';
    document.getElementById('body-region-input').value = '';
    document.getElementById('narrative-input').value = '';

    // Reset body map selections
    this._phoneEl.querySelectorAll('.sw-body-region').forEach((r) => r.classList.remove('selected'));

    // Reset corroboration toggles
    this._phoneEl.querySelectorAll('.sw-corr-toggle').forEach((t) => t.classList.remove('on'));
    Object.keys(this._entry.corroboration).forEach((k) => this._entry.corroboration[k] = false);

    // Reset complete screen
    document.getElementById('complete-pattern-msg').classList.add('hidden');
    document.getElementById('complete-followup-msg').classList.add('hidden');
  }

  _readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  _escape(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
