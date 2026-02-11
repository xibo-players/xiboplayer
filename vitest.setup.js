/**
 * Vitest setup file
 * Global setup for all tests
 *
 * IMPORTANT: Don't mock APIs that jsdom already provides (DOMParser, etc.)
 * and use real implementations (fake-indexeddb) where possible to avoid
 * masking bugs in production code.
 */

import { vi } from 'vitest';
import 'fake-indexeddb/auto';

// DOMParser: use jsdom's built-in implementation (no mock needed)
// jsdom provides a real DOMParser that handles XML correctly

// IndexedDB: use fake-indexeddb (imported above) which provides a real
// in-memory IndexedDB implementation — much better than a broken stub.

// Mock fetch (will be overridden in tests)
global.fetch = vi.fn();

// Mock canvas for screenshot tests
global.HTMLCanvasElement = class HTMLCanvasElement {
  constructor() {
    this.width = 0;
    this.height = 0;
  }

  getContext() {
    return {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn()
    };
  }

  toDataURL() {
    return 'data:image/png;base64,mock';
  }
};

// Mock atob/btoa
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');

console.log('[vitest.setup] Global mocks initialized (fake-indexeddb active)');
