/**
 * Configuration management using localStorage
 */

const STORAGE_KEY = 'xibo_config';

export class Config {
  constructor() {
    this.data = this.load();
  }

  load() {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) {
      try {
        return JSON.parse(json);
      } catch (e) {
        console.error('Failed to parse config:', e);
      }
    }
    return {
      cmsAddress: '',
      cmsKey: '',
      displayName: '',
      hardwareKey: this.generateHardwareKey(),
      xmrChannel: this.generateXmrChannel()
    };
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  isConfigured() {
    return !!(this.data.cmsAddress && this.data.cmsKey && this.data.displayName);
  }

  generateHardwareKey() {
    // Generate a unique hardware key based on browser fingerprint
    // In production, use more stable identifiers
    const nav = navigator;
    const screen = window.screen;
    const parts = [
      nav.userAgent,
      nav.language,
      screen.colorDepth,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset()
    ];
    return this.hash(parts.join('|')).substring(0, 32);
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
    // Simple hash function for hardware key generation
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(32, '0');
  }

  get cmsAddress() { return this.data.cmsAddress; }
  set cmsAddress(val) { this.data.cmsAddress = val; this.save(); }

  get cmsKey() { return this.data.cmsKey; }
  set cmsKey(val) { this.data.cmsKey = val; this.save(); }

  get displayName() { return this.data.displayName; }
  set displayName(val) { this.data.displayName = val; this.save(); }

  get hardwareKey() { return this.data.hardwareKey; }
  get xmrChannel() { return this.data.xmrChannel; }
}

export const config = new Config();
