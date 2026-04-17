// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * Unit tests for shared SW routing helpers.
 *
 * These helpers are pure URL-parsing functions — no browser APIs,
 * no fetch, no caches. Run in either jsdom or node env; we stay on
 * the default (jsdom) to avoid special-casing.
 */

import { describe, it, expect } from 'vitest';
import { PLAYER_API } from '@xiboplayer/utils';
import { BASE } from './sw-utils.js';
import {
  isStaticPage,
  isXmdsFileRequest,
  isCacheableApiPath,
  CACHEABLE_API_PATTERNS,
  rewriteXmdsToApiPath,
} from './routing.js';

const origin = 'https://cms.example.com';

function u(path) {
  return new URL(path, origin);
}

describe('isStaticPage', () => {
  it('matches the BASE root, index, and setup pages', () => {
    expect(isStaticPage(u(`${BASE}/`))).toBe(true);
    expect(isStaticPage(u(`${BASE}/index.html`))).toBe(true);
    expect(isStaticPage(u(`${BASE}/setup.html`))).toBe(true);
  });

  it('rejects nested player URLs and sibling paths', () => {
    expect(isStaticPage(u(`${BASE}/layout/42`))).toBe(false);
    expect(isStaticPage(u(`${BASE}/index.html/x`))).toBe(false);
    expect(isStaticPage(u('/other/setup.html'))).toBe(false);
  });
});

describe('isXmdsFileRequest', () => {
  it('matches xmds.php with a file query param', () => {
    expect(isXmdsFileRequest(u('/xmds.php?file=a.mp4'))).toBe(true);
    expect(isXmdsFileRequest(u('/sub/xmds.php?file=a.mp4&type=M'))).toBe(true);
  });

  it('rejects xmds.php without file', () => {
    expect(isXmdsFileRequest(u('/xmds.php?request=required'))).toBe(false);
  });

  it('rejects other paths with a file query param', () => {
    expect(isXmdsFileRequest(u('/other.php?file=a.mp4'))).toBe(false);
  });
});

describe('isCacheableApiPath', () => {
  it('returns true for the five cacheable resource categories', () => {
    expect(isCacheableApiPath(`${PLAYER_API}/media/file/x.png`)).toBe(true);
    expect(isCacheableApiPath(`${PLAYER_API}/media/42`)).toBe(true);
    expect(isCacheableApiPath(`${PLAYER_API}/layouts/99`)).toBe(true);
    expect(isCacheableApiPath(`${PLAYER_API}/widgets/1/2/3`)).toBe(true);
    expect(isCacheableApiPath(`${PLAYER_API}/dependencies/fonts.css`)).toBe(true);
  });

  it('returns false for non-cacheable API calls', () => {
    expect(isCacheableApiPath(`${PLAYER_API}/display/status`)).toBe(false);
    expect(isCacheableApiPath(`${PLAYER_API}/schedule`)).toBe(false);
    expect(isCacheableApiPath(`${PLAYER_API}/auth/refresh`)).toBe(false);
    expect(isCacheableApiPath(`${PLAYER_API}/inventory`)).toBe(false);
  });

  it('CACHEABLE_API_PATTERNS is frozen (caller cannot mutate it)', () => {
    expect(Object.isFrozen(CACHEABLE_API_PATTERNS)).toBe(true);
  });
});

describe('rewriteXmdsToApiPath', () => {
  it('maps type=L to /layouts/{itemId}', () => {
    const url = u('/xmds.php?file=layout-42.xlf&type=L&itemId=42');
    expect(rewriteXmdsToApiPath(url)).toBe(`${PLAYER_API}/layouts/42`);
  });

  it('maps type=P to /dependencies/{filename}', () => {
    const url = u('/xmds.php?file=bundle.min.js&type=P&itemId=1');
    expect(rewriteXmdsToApiPath(url)).toBe(`${PLAYER_API}/dependencies/bundle.min.js`);
  });

  it('maps type=M to /media/file/{filename}', () => {
    const url = u('/xmds.php?file=hero.mp4&type=M&itemId=123');
    expect(rewriteXmdsToApiPath(url)).toBe(`${PLAYER_API}/media/file/hero.mp4`);
  });

  it('treats unknown types as media (safe default)', () => {
    const url = u('/xmds.php?file=x.bin&type=Q&itemId=1');
    expect(rewriteXmdsToApiPath(url)).toBe(`${PLAYER_API}/media/file/x.bin`);
  });

  it('returns null when file= is missing', () => {
    const url = u('/xmds.php?request=required');
    expect(rewriteXmdsToApiPath(url)).toBeNull();
  });

  it('preserves filename with path separators unchanged (no sanitisation)', () => {
    // The function's job is mapping, not validation. Upstream decides
    // whether a filename is safe. This test documents that contract.
    const url = u('/xmds.php?file=../etc/passwd&type=M');
    expect(rewriteXmdsToApiPath(url)).toBe(`${PLAYER_API}/media/file/../etc/passwd`);
  });
});
