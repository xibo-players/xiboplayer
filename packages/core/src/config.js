/**
 * Configuration management using localStorage
 */

const STORAGE_KEY = 'xibo_config';

export class Config {
  constructor() {
    this.data = this.load();
  }

  load() {
    // Try to load from localStorage
    const json = localStorage.getItem(STORAGE_KEY);

    if (json) {
      try {
        const config = JSON.parse(json);

        // CRITICAL: Hardware key must persist
        if (!config.hardwareKey || config.hardwareKey.length < 10) {
          console.error('[Config] CRITICAL: Invalid/missing hardwareKey in localStorage!');
          console.error('[Config] Stored config:', config);
          console.error('[Config] Generating new hardware key (this should only happen once)');

          config.hardwareKey = this.generateStableHardwareKey();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
          console.log('[Config] Saved new hardwareKey to localStorage');
        } else {
          // Hardware key exists and is valid
          console.log('[Config] ✓ Loaded existing hardwareKey:', config.hardwareKey);
        }

        return config;
      } catch (e) {
        console.error('[Config] Failed to parse config from localStorage:', e);
        console.error('[Config] Stored JSON:', json);
        // Fall through to create new config
      }
    }

    // No config in localStorage - first time setup
    console.log('[Config] No config in localStorage - first time setup');

    const newConfig = {
      cmsAddress: '',
      cmsKey: '',
      displayName: '',
      hardwareKey: this.generateStableHardwareKey(),
      xmrChannel: this.generateXmrChannel()
    };

    // Save immediately
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    console.log('[Config] ✓ Saved new config to localStorage');
    console.log('[Config] Hardware key will persist across reloads:', newConfig.hardwareKey);

    return newConfig;
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  isConfigured() {
    return !!(this.data.cmsAddress && this.data.cmsKey && this.data.displayName);
  }

  generateStableHardwareKey() {
    // Generate a stable UUID-based hardware key
    // CRITICAL: This is generated ONCE and saved to localStorage
    // It NEVER changes unless localStorage is cleared manually

    // Use crypto.randomUUID if available (best randomness)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      const uuid = crypto.randomUUID().replace(/-/g, ''); // Remove dashes
      const hardwareKey = 'pwa-' + uuid.substring(0, 28);
      console.log('[Config] Generated new UUID-based hardware key:', hardwareKey);
      return hardwareKey;
    }

    // Fallback: Generate random hex string
    const randomHex = Array.from({ length: 28 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const hardwareKey = 'pwa-' + randomHex;
    console.log('[Config] Generated new random hardware key:', hardwareKey);
    return hardwareKey;
  }

  getCanvasFingerprint() {
    // Generate stable canvas fingerprint (same for same GPU/driver)
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'no-canvas';

      // Draw test pattern (same rendering = same device)
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Xibo Player', 2, 15);

      return canvas.toDataURL();
    } catch (e) {
      return 'canvas-error';
    }
  }

  generateHardwareKey() {
    // For backwards compatibility
    return this.generateStableHardwareKey();
  }

  generateXmrChannel() {
    // Generate UUID for XMR channel
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  hash(str) {
    // FNV-1a hash algorithm (better distribution than simple hash)
    // Produces high-entropy 32-character hex string
    let hash = 2166136261; // FNV offset basis

    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    // Convert to unsigned 32-bit integer
    hash = hash >>> 0;

    // Extend to 32 characters by hashing multiple times with different seeds
    let result = '';
    for (let round = 0; round < 4; round++) {
      let roundHash = hash + round * 1234567;
      for (let i = 0; i < str.length; i++) {
        roundHash ^= str.charCodeAt(i) + round;
        roundHash += (roundHash << 1) + (roundHash << 4) + (roundHash << 7) + (roundHash << 8) + (roundHash << 24);
      }
      roundHash = roundHash >>> 0;
      result += roundHash.toString(16).padStart(8, '0');
    }

    return result.substring(0, 32);
  }

  get cmsAddress() { return this.data.cmsAddress; }
  set cmsAddress(val) { this.data.cmsAddress = val; this.save(); }

  get cmsKey() { return this.data.cmsKey; }
  set cmsKey(val) { this.data.cmsKey = val; this.save(); }

  get displayName() { return this.data.displayName; }
  set displayName(val) { this.data.displayName = val; this.save(); }

  get hardwareKey() {
    // CRITICAL: Ensure hardware key never becomes undefined
    if (!this.data.hardwareKey) {
      console.error('[Config] CRITICAL: hardwareKey missing! Generating emergency key.');
      this.data.hardwareKey = this.generateStableHardwareKey();
      this.save();
    }
    return this.data.hardwareKey;
  }
  get xmrChannel() { return this.data.xmrChannel; }
}

export const config = new Config();
