// calculator.js
// Handles calculator display, arithmetic, and covert PIN detection.
// Default PIN sequence: digits "1337" followed by "=" triggers vault unlock.
// If the user has set a custom PIN, its SHA-256 hash is stored under '_ph'.
// We hash the entered buffer and compare — the raw PIN is never stored.

const DEFAULT_PIN      = '1337';
const PIN_HASH_KEY     = '_ph';   // localStorage key for the stored PIN hash
const PIN_LEN_KEY      = '_pl';   // localStorage key for PIN length
const DECOY_HASH_KEY   = '_dph';  // decoy PIN hash
const DECOY_LEN_KEY    = '_dpl';  // decoy PIN length

// Hash a string with SHA-256, return hex string
async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Calculator {
  constructor({ onPinMatch }) {
    this.onPinMatch = onPinMatch;
    this._pinLen     = parseInt(localStorage.getItem(PIN_LEN_KEY)    || String(DEFAULT_PIN.length), 10);
    this._storedHash = localStorage.getItem(PIN_HASH_KEY) || null;
    this._decoyHash  = localStorage.getItem(DECOY_HASH_KEY) || null;
    this._decoyLen   = parseInt(localStorage.getItem(DECOY_LEN_KEY) || '0', 10);

    this.displayResult = document.getElementById('calc-result');
    this.displayExpr = document.getElementById('calc-expression');

    this._resetState();
    this._bindButtons();
  }

  // ── Internal state ────────────────────────────────
  _resetState() {
    this.currentInput = '0';
    this.expression = '';
    this.operator = null;
    this.prevValue = null;
    this.waitingForOp = false;
    this.pinBuffer = '';          // collects digit presses for PIN check
    this._render();
  }

  // ── Button binding ────────────────────────────────
  _bindButtons() {
    document.querySelectorAll('.btn').forEach((btn) => {
      btn.addEventListener('click', () => this._handleButton(btn));
    });

    document.addEventListener('keydown', (e) => {
      const calcVisible = document.getElementById('calculator-screen')?.classList.contains('active');
      if (!calcVisible) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key >= '0' && e.key <= '9')   { e.preventDefault(); this._onDigit(e.key); }
      else if (e.key === '+')              { e.preventDefault(); this._onOperator('+'); }
      else if (e.key === '-')              { e.preventDefault(); this._onOperator('-'); }
      else if (e.key === '*')              { e.preventDefault(); this._onOperator('*'); }
      else if (e.key === '/')              { e.preventDefault(); this._onOperator('/'); }
      else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); this._onEquals(); }
      else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') { e.preventDefault(); this._resetState(); }
      else if (e.key === '.')              { e.preventDefault(); this._onDot(); }
      else if (e.key === '%')              { e.preventDefault(); this._onPercent(); }
      else if (e.key === 'Backspace')      { e.preventDefault(); this._onBackspace(); }
    });
  }

  _onBackspace() {
    if (this.currentInput.length > 1) {
      this.currentInput = this.currentInput.slice(0, -1);
      if (this.pinBuffer.length > 0) this.pinBuffer = this.pinBuffer.slice(0, -1);
    } else {
      this.currentInput = '0';
    }
    this._render();
  }

  _handleButton(btn) {
    const action = btn.dataset.action;
    const value = btn.dataset.value;

    switch (action) {
      case 'digit': this._onDigit(value); break;
      case 'operator': this._onOperator(value); break;
      case 'equals': this._onEquals(); break;
      case 'clear': this._resetState(); break;
      case 'dot': this._onDot(); break;
      case 'toggle-sign': this._onToggleSign(); break;
      case 'percent': this._onPercent(); break;
    }
  }

  // ── Digit ─────────────────────────────────────────
  _onDigit(d) {
    // accumulate for PIN detection
    this.pinBuffer += d;
    // re-read lengths fresh — PIN or decoy may have changed since construction
    const pinLen   = parseInt(localStorage.getItem(PIN_LEN_KEY)   || String(DEFAULT_PIN.length), 10);
    const decoyLen = parseInt(localStorage.getItem(DECOY_LEN_KEY) || '0', 10);
    const maxLen = Math.max(pinLen, decoyLen);
    if (this.pinBuffer.length > maxLen) {
      this.pinBuffer = this.pinBuffer.slice(-maxLen);
    }

    if (this.waitingForOp) {
      this.currentInput = d;
      this.waitingForOp = false;
    } else {
      this.currentInput = this.currentInput === '0' ? d : this.currentInput + d;
    }
    this._render();
  }

  // ── Operator ──────────────────────────────────────
  _onOperator(op) {
    this.pinBuffer = ''; // operator breaks PIN sequence

    if (this.prevValue !== null && !this.waitingForOp) {
      this._compute();
    } else {
      this.prevValue = parseFloat(this.currentInput);
    }

    this.operator = op;
    this.waitingForOp = true;
    this.expression = `${this._fmt(this.prevValue)} ${this._opSymbol(op)}`;
    this._render();
  }

  // ── Equals ────────────────────────────────────────
  _onEquals() {
    const candidate = this.pinBuffer;
    this.pinBuffer = '';

    // Async PIN check — hash the candidate and compare to stored hash (or default)
    this._checkPin(candidate).then(({ matched, isDecoy }) => {
      if (matched) {
        this._resetState();
        this.onPinMatch(candidate, isDecoy);
      }
    });

    // Always continue with normal calculator behaviour regardless
    // (no visual indication that a PIN attempt happened)

    if (this.operator && this.prevValue !== null) {
      this._compute();
      this.operator = null;
      this.prevValue = null;
      this.expression = '';
    }
    this._render();
  }

  // ── Dot ───────────────────────────────────────────
  _onDot() {
    this.pinBuffer = '';
    if (this.waitingForOp) {
      this.currentInput = '0.';
      this.waitingForOp = false;
    } else if (!this.currentInput.includes('.')) {
      this.currentInput += '.';
    }
    this._render();
  }

  // ── +/- ───────────────────────────────────────────
  _onToggleSign() {
    this.pinBuffer = '';
    this.currentInput = String(-parseFloat(this.currentInput));
    this._render();
  }

  // ── % ─────────────────────────────────────────────
  _onPercent() {
    this.pinBuffer = '';
    this.currentInput = String(parseFloat(this.currentInput) / 100);
    this._render();
  }

  // ── Compute ───────────────────────────────────────
  _compute() {
    const a = this.prevValue;
    const b = parseFloat(this.currentInput);
    let result;

    switch (this.operator) {
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '*': result = a * b; break;
      case '/': result = b !== 0 ? a / b : 'Error'; break;
      default: result = b;
    }

    this.expression = `${this._fmt(a)} ${this._opSymbol(this.operator)} ${this._fmt(b)} =`;
    this.currentInput = typeof result === 'number' ? this._fmt(result) : result;
    this.prevValue = typeof result === 'number' ? result : null;
    this.waitingForOp = true;
  }

  // ── Render ────────────────────────────────────────
  _render() {
    this.displayResult.textContent = this.currentInput;
    this.displayExpr.textContent = this.expression;

    // Shrink font for long numbers
    const len = this.currentInput.length;
    if (len > 12) this.displayResult.style.fontSize = '28px';
    else if (len > 9) this.displayResult.style.fontSize = '38px';
    else if (len > 6) this.displayResult.style.fontSize = '48px';
    else this.displayResult.style.fontSize = '56px';
  }

  // ── PIN check ─────────────────────────────────────
  async _checkPin(candidate) {
    if (!candidate) return { matched: false, isDecoy: false };
    const candidateHash = await sha256hex(candidate);

    // Check real PIN — read fresh so PIN changes take effect immediately
    const realHash = localStorage.getItem(PIN_HASH_KEY) || (await sha256hex(DEFAULT_PIN));
    if (candidateHash === realHash) return { matched: true, isDecoy: false };

    // Check decoy PIN — re-read fresh in case it was set after Calculator was constructed
    const decoyHash = localStorage.getItem(DECOY_HASH_KEY);
    if (decoyHash && candidateHash === decoyHash) {
      return { matched: true, isDecoy: true };
    }

    return { matched: false, isDecoy: false };
  }

  // Called from vault onboarding when user sets a custom PIN.
  // Stores the hash and length — never the raw PIN.
  static async storePin(pin) {
    const hash = await sha256hex(pin);
    localStorage.setItem(PIN_HASH_KEY, hash);
    localStorage.setItem(PIN_LEN_KEY, String(pin.length));
  }

  static async storeDecoyPin(pin) {
    const hash = await sha256hex(pin);
    localStorage.setItem(DECOY_HASH_KEY, hash);
    localStorage.setItem(DECOY_LEN_KEY, String(pin.length));
  }

  static clearDecoyPin() {
    localStorage.removeItem(DECOY_HASH_KEY);
    localStorage.removeItem(DECOY_LEN_KEY);
  }

  // ── Helpers ───────────────────────────────────────
  _fmt(n) {
    if (typeof n !== 'number') return String(n);
    // Avoid scientific notation for reasonable numbers
    if (Math.abs(n) < 1e12 && Math.abs(n) > 1e-7 || n === 0) {
      const s = String(parseFloat(n.toPrecision(10)));
      return s;
    }
    return n.toExponential(4);
  }

  _opSymbol(op) {
    return { '+': '+', '-': '−', '*': '×', '/': '÷' }[op] || op;
  }
}
