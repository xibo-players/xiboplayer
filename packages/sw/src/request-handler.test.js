// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestHandler } from './request-handler.js';

// Mock fetch for _handleXmdsFile
const mockFetch = vi.fn(() => Promise.resolve(new Response('ok')));
vi.stubGlobal('fetch', mockFetch);

describe('RequestHandler', () => {
  let handler;
  const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  beforeEach(() => {
    handler = new RequestHandler({ log: mockLog });
    mockFetch.mockClear();
    mockLog.info.mockClear();
  });

  describe('_handleXmdsFile', () => {
    const makeEvent = (urlStr) => ({
      request: { headers: new Headers() },
    });

    it('should route layout files (type=L) to /layouts/{itemId}', () => {
      const url = new URL('https://cms.example.com/xmds.php?file=42.xlf&type=L&itemId=42');
      const event = makeEvent(url.href);

      handler._handleXmdsFile(event, url);

      expect(mockFetch).toHaveBeenCalledWith(
        '/player/api/v2/layouts/42',
        expect.objectContaining({ headers: expect.any(Headers) })
      );
    });

    it('should route dependency files (type=P) to /dependencies/{filename}', () => {
      const url = new URL('https://cms.example.com/xmds.php?file=bundle.min.js&type=P&itemId=1');
      const event = makeEvent(url.href);

      handler._handleXmdsFile(event, url);

      expect(mockFetch).toHaveBeenCalledWith(
        '/player/api/v2/dependencies/bundle.min.js',
        expect.any(Object)
      );
    });

    it('should route media files (type=M) to /media/file/{filename}', () => {
      const url = new URL('https://cms.example.com/xmds.php?file=42.mp4&type=M&itemId=42');
      const event = makeEvent(url.href);

      handler._handleXmdsFile(event, url);

      expect(mockFetch).toHaveBeenCalledWith(
        '/player/api/v2/media/file/42.mp4',
        expect.any(Object)
      );
    });

    it('should pass original CMS URL in X-Cms-Download-Url header', () => {
      const url = new URL('https://cms.example.com/xmds.php?file=42.mp4&type=M&X-Amz-Signature=abc');
      const event = makeEvent(url.href);

      handler._handleXmdsFile(event, url);

      const passedHeaders = mockFetch.mock.calls[0][1].headers;
      expect(passedHeaders.get('X-Cms-Download-Url')).toBe(url.href);
    });

    it('should default unknown types to media/file path', () => {
      const url = new URL('https://cms.example.com/xmds.php?file=font.otf&type=X');
      const event = makeEvent(url.href);

      handler._handleXmdsFile(event, url);

      expect(mockFetch).toHaveBeenCalledWith(
        '/player/api/v2/media/file/font.otf',
        expect.any(Object)
      );
    });
  });
});
