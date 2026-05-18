// storage.js
// Encrypted IndexedDB persistence using Web Crypto API (AES-GCM).
// Records are encrypted with a key derived from the device's install-time random salt.
// For POC: salt stored in localStorage. Production should use OPFS or platform keystore.

const DB_NAME = 'appdata';
const DB_VERSION = 1;
const STORE_NAME = 'records';
const SALT_KEY = '_ak1';
const DEK_KEY  = '_dk';   // encrypted Data Encryption Key

// PBKDF2 parameters
const KDF_ITERATIONS = 100_000;
const KDF_HASH = 'SHA-256';

export class Storage {
  constructor(dbName = DB_NAME) {
    this._dbName = dbName;
    this._db = null;
    this._key = null;
  }

  // ── Init ──────────────────────────────────────────
  // Derives encryption key from the user's PIN + a device-unique salt.
  // Pass the PIN string as the passphrase so each PIN produces a distinct key.
  async init(pin) {
    this._pin = pin;
    this._db = await this._openDB();
    const kek = await this._deriveKEK(pin);
    this._key = await this._loadOrCreateDEK(kek, pin);
  }

  // ── PIN change (re-wrap DEK, no record re-encryption needed) ─────
  async rekey(newPin) {
    const oldKek = await this._deriveKEK(this._pin);
    const stored = JSON.parse(localStorage.getItem(DEK_KEY));
    const dekRaw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(stored.iv) },
      oldKek,
      new Uint8Array(stored.ciphertext)
    );
    const newKek = await this._deriveKEK(newPin);
    await this._storeDEK(newKek, dekRaw);
    this._pin = newPin;
  }

  // ── Save incident ─────────────────────────────────
  // Returns the generated ID.
  async saveIncident(data) {
    const id = crypto.randomUUID();
    const record = { id, ...data };
    const enc = await this._encrypt(record);

    await this._put({ id, timestamp: data.timestamp, payload: enc });
    return id;
  }

  // ── List incidents ────────────────────────────────
  // Returns array of decrypted incident records.
  async listIncidents() {
    const rows = await this._getAll();
    const results = [];

    for (const row of rows) {
      try {
        const decrypted = await this._decrypt(row.payload);
        results.push(decrypted);
      } catch (err) {
        console.warn('[Storage] Could not decrypt record', row.id, err);
      }
    }

    return results;
  }

  // ── Update incident ───────────────────────────────
  async updateIncident(id, updates) {
    const rows = await this._getAll();
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`Record not found: ${id}`);
    const decrypted = await this._decrypt(row.payload);
    const updated = { ...decrypted, ...updates };
    const enc = await this._encrypt(updated);
    await this._put({ id, timestamp: row.timestamp, payload: enc });
  }

  // ── Get pending incidents (draft_raw = analyzing, pending_review = awaiting user review) ───
  async getPendingIncidents() {
    const rows = await this._getAll();
    const results = [];
    for (const row of rows) {
      try {
        const dec = await this._decrypt(row.payload);
        if (dec.status === 'draft_raw' || dec.status === 'pending_review') results.push(dec);
      } catch (_) { /* skip unreadable */ }
    }
    return results;
  }

  // ── Delete incident ───────────────────────────────
  async deleteIncident(id) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Clear all ─────────────────────────────────────
  async clearAll() {
    const tx = this._db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await this._promisifyRequest(store.clear());

    // Remove all app localStorage keys on full erase
    ['_ob', '_lg', '_pd', '_ph', '_pl', '_ak1', '_dk', '_tc_name', '_tc_rel', '_tc_phone'].forEach(k => localStorage.removeItem(k));
  }

  // ── IndexedDB helpers ─────────────────────────────
  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      };

      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  _put(record) {
    const tx = this._db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return this._promisifyRequest(store.put(record));
  }

  _getAll() {
    const tx = this._db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return this._promisifyRequest(store.getAll());
  }

  _promisifyRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Key derivation ────────────────────────────────
  // KEK: Key Encryption Key derived from PIN. Used only to wrap/unwrap the DEK.
  async _deriveKEK(pin) {
    const salt = this._getOrCreateSalt();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: KDF_HASH },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // DEK: Data Encryption Key. Random, stored encrypted with KEK.
  // Changing the PIN only re-wraps the DEK — records never need re-encryption.
  async _loadOrCreateDEK(kek, pin) {
    const stored = localStorage.getItem(DEK_KEY);
    if (stored) {
      const { iv, ciphertext } = JSON.parse(stored);
      const dekRaw = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        kek,
        new Uint8Array(ciphertext)
      );
      return crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    // Migration: records exist from before envelope encryption — old key WAS the PIN-derived key
    const rows = await this._getAll();
    if (rows.length > 0) {
      const dekRaw = await this._derivePinKeyRaw(pin);
      await this._storeDEK(kek, dekRaw);
      return crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    // Fresh install
    const dek = crypto.getRandomValues(new Uint8Array(32));
    await this._storeDEK(kek, dek);
    return crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async _derivePinKeyRaw(pin) {
    const salt = this._getOrCreateSalt();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: KDF_HASH },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    return crypto.subtle.exportKey('raw', key);
  }

  async _storeDEK(kek, dekRaw) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, dekRaw);
    localStorage.setItem(DEK_KEY, JSON.stringify({
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext)),
    }));
  }

  _getOrCreateSalt() {
    const existing = localStorage.getItem(SALT_KEY);
    if (existing) {
      return new Uint8Array(JSON.parse(existing));
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem(SALT_KEY, JSON.stringify(Array.from(salt)));
    return salt;
  }

  // ── Encryption ────────────────────────────────────
  async _encrypt(data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this._key,
      encoded
    );

    return {
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(cipherBuf)),
    };
  }

  // ── Decryption ────────────────────────────────────
  async _decrypt({ iv, ciphertext }) {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      this._key,
      new Uint8Array(ciphertext)
    );

    return JSON.parse(new TextDecoder().decode(plainBuf));
  }
}
