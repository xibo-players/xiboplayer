/**
 * Test Utilities for Xibo Player Cache package
 * Re-exports common test helpers.
 */

import { vi } from 'vitest';

/**
 * Mock fetch with controllable responses
 */
export function mockFetch(responses = {}) {
  global.fetch = vi.fn((url, options) => {
    const method = options?.method || 'GET';
    const key = `${method} ${url}`;
    const response = responses[key] || responses[url];

    if (!response) {
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: {
          get: () => null
        }
      });
    }

    return Promise.resolve({
      ok: response.ok !== false,
      status: response.status || 200,
      statusText: response.statusText || 'OK',
      headers: {
        get: (name) => response.headers?.[name] || null
      },
      blob: () => Promise.resolve(response.blob || new Blob()),
      text: () => Promise.resolve(response.text || ''),
      json: () => Promise.resolve(response.json || {}),
      arrayBuffer: () => Promise.resolve(response.arrayBuffer || new ArrayBuffer(0))
    });
  });

  return global.fetch;
}

/**
 * Mock fetch that supports Range request handling (for chunk download tests)
 * Returns the correct portion of a source blob based on the Range header.
 */
export function mockChunkedFetch(sourceBlob) {
  global.fetch = vi.fn(async (url, options) => {
    const method = options?.method || 'GET';

    if (method === 'HEAD') {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => {
            if (name === 'Content-Length') return String(sourceBlob.size);
            if (name === 'Content-Type') return sourceBlob.type || 'application/octet-stream';
            return null;
          }
        }
      };
    }

    // Handle Range requests
    const rangeHeader = options?.headers?.Range;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
      if (match) {
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        const chunk = sourceBlob.slice(start, end + 1);
        return {
          ok: true,
          status: 206,
          headers: {
            get: (name) => {
              if (name === 'Content-Length') return String(chunk.size);
              if (name === 'Content-Range') return `bytes ${start}-${end}/${sourceBlob.size}`;
              return null;
            }
          },
          blob: () => Promise.resolve(chunk)
        };
      }
    }

    // Full file download
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      blob: () => Promise.resolve(sourceBlob)
    };
  });

  return global.fetch;
}

/**
 * Create test blob of specified size
 */
export function createTestBlob(size = 1024, type = 'application/octet-stream') {
  const buffer = new ArrayBuffer(size);
  // Fill with non-zero data so chunks are distinguishable
  const view = new Uint8Array(buffer);
  for (let i = 0; i < size; i++) {
    view[i] = i % 256;
  }
  return new Blob([buffer], { type });
}

/**
 * Wait for condition to be true
 */
export async function waitFor(condition, timeout = 5000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * Create a spy
 */
export function createSpy() {
  return vi.fn();
}
