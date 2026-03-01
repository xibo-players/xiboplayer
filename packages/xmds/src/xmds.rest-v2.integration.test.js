/**
 * XMDS REST v2 API — Live Integration Tests
 *
 * Tests the RestClientV2 transport against a real Xibo CMS instance
 * with the Player API v2 patch applied.
 *
 * Prerequisites:
 *   - CMS at CMS_URL must have /api/v2/player/* endpoints deployed
 *   - A display with the given HARDWARE_KEY must exist and be authorized
 *   - The SERVER_KEY must match the CMS setting
 *
 * Run with:
 *   CMS_URL=https://displays.superpantalles.com \
 *   CMS_KEY=isiSdUCy \
 *   HARDWARE_KEY=pwa-11e79847294d418ba74df4ba534d \
 *   npx vitest run src/xmds.rest-v2.integration.test.js
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { RestClientV2 } from './rest-client-v2.js';
import { RestClient } from './rest-client.js';

// ─── Configuration ─────────────────────────────────────────────────

const CMS_URL = process.env.CMS_URL || 'https://your-cms.example.com';
const CMS_KEY = process.env.CMS_KEY || 'your-cms-key';
const HARDWARE_KEY = process.env.HARDWARE_KEY || 'pwa-your-hardware-key';
const DISPLAY_NAME = process.env.DISPLAY_NAME || 'REST v2 Integration Test';

// Skip all tests if no CMS_URL is provided
const SKIP = !process.env.CMS_URL && !process.env.CI && !process.env.RUN_INTEGRATION;

// ─── Test Suite ────────────────────────────────────────────────────

describe.skipIf(SKIP)('REST v2 API — Live Integration', () => {
  /** @type {RestClientV2} */
  let v2;
  /** @type {RestClient} */
  let v1;

  beforeAll(() => {
    // Restore real fetch (vitest.setup.js mocks it for unit tests)
    if (global.__nativeFetch) global.fetch = global.__nativeFetch;

    const baseConfig = {
      cmsUrl: CMS_URL,
      cmsKey: CMS_KEY,
      hardwareKey: HARDWARE_KEY,
      displayName: DISPLAY_NAME,
      xmrChannel: 'v2-integration-test',
      retryOptions: { maxRetries: 1, baseDelayMs: 500 },
    };

    v2 = new RestClientV2(baseConfig);
    v1 = new RestClient(baseConfig);
  });

  // ──────────────────────────────────────────────────────────────────
  // Health & Availability
  // ──────────────────────────────────────────────────────────────────

  describe('Health & Availability', () => {
    it('should detect v2 availability via static isAvailable()', async () => {
      const available = await RestClientV2.isAvailable(CMS_URL);
      expect(available).toBe(true);
    });

    it('should return false for a CMS without v2', async () => {
      // Use a routable IP that will refuse quickly, not a DNS name that hangs
      const available = await RestClientV2.isAvailable('http://127.0.0.1:1', { maxRetries: 0 });
      expect(available).toBe(false);
    }, 10000);
  });

  // ──────────────────────────────────────────────────────────────────
  // JWT Authentication
  // ──────────────────────────────────────────────────────────────────

  describe('JWT Authentication', () => {
    it('should authenticate and obtain a JWT token', async () => {
      // Force fresh auth
      v2._token = null;
      await v2._authenticate();

      expect(v2._token).toBeDefined();
      expect(v2._token.length).toBeGreaterThan(50);
      expect(v2._displayId).toBeGreaterThan(0);
      expect(v2._tokenExpiresAt).toBeGreaterThan(Date.now());
    });

    it('should reuse token for subsequent calls', async () => {
      const token1 = await v2._getToken();
      const token2 = await v2._getToken();
      expect(token1).toBe(token2);
    });

    it('should fail auth with wrong server key', async () => {
      const bad = new RestClientV2({
        cmsUrl: CMS_URL,
        cmsKey: 'wrong-key',
        hardwareKey: HARDWARE_KEY,
        retryOptions: { maxRetries: 0 },
      });

      await expect(bad._authenticate()).rejects.toThrow(/403|forbidden|server key/i);
    });

    it('should fail auth with wrong hardware key', async () => {
      const bad = new RestClientV2({
        cmsUrl: CMS_URL,
        cmsKey: CMS_KEY,
        hardwareKey: 'nonexistent-display',
        retryOptions: { maxRetries: 0 },
      });

      await expect(bad._authenticate()).rejects.toThrow(/403|not found|denied/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // RegisterDisplay
  // ──────────────────────────────────────────────────────────────────

  describe('RegisterDisplay', () => {
    it('should register and return READY', async () => {
      const result = await v2.registerDisplay();

      expect(result).toBeDefined();
      expect(result.code).toBe('READY');
      expect(result.settings).toBeDefined();
      expect(result.message).toContain('Display is active');
    });

    it('should return same code as v1', async () => {
      const v2Result = await v2.registerDisplay();
      const v1Result = await v1.registerDisplay();

      expect(v2Result.code).toBe(v1Result.code);
    });

    it('should include expected settings keys', async () => {
      const result = await v2.registerDisplay();
      if (result.code !== 'READY') return;

      for (const key of ['collectInterval', 'statsEnabled', 'xmrNetworkAddress']) {
        expect(result.settings, `Missing setting: ${key}`).toHaveProperty(key);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // RequiredFiles (media)
  // ──────────────────────────────────────────────────────────────────

  describe('RequiredFiles', () => {
    it('should return files in flat format', async () => {
      const result = await v2.requiredFiles();

      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('purge');
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should include media files with download URLs', async () => {
      const { files } = await v2.requiredFiles();
      const media = files.filter(f => f.type === 'media');

      expect(media.length).toBeGreaterThan(0);
      for (const file of media) {
        expect(file.id).toBeDefined();
        expect(file.md5).toBeDefined();
        expect(file.path).toMatch(/^https?:\/\//);
      }
    });

    it('should include layout files', async () => {
      const { files } = await v2.requiredFiles();
      const layouts = files.filter(f => f.type === 'layout');

      expect(layouts.length).toBeGreaterThan(0);
      for (const layout of layouts) {
        expect(layout.id).toBeDefined();
        expect(layout.md5).toBeDefined();
      }
    });

    it('should return same file count as v1', async () => {
      v2._etags.clear();
      v2._responseCache.clear();
      v1._etags.clear();
      v1._responseCache.clear();

      const v2Result = await v2.requiredFiles();
      const v1Result = await v1.requiredFiles();

      // v2 returns { files, purge }, v1 returns a flat array
      const v2Files = v2Result.files;
      const v1Files = Array.isArray(v1Result) ? v1Result : v1Result.files || [];

      expect(v2Files.length).toBe(v1Files.length);
    });

    it('should support ETag caching', async () => {
      v2._etags.clear();
      v2._responseCache.clear();

      await v2.requiredFiles();
      const hasEtag = v2._etags.has(`/displays/${v2._displayId}/media`);
      expect(hasEtag).toBe(true);

      // Second call should use cache
      const result2 = await v2.requiredFiles();
      expect(result2.files.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Schedule
  // ──────────────────────────────────────────────────────────────────

  describe('Schedule', () => {
    it('should return native JSON schedule', async () => {
      const schedule = await v2.schedule();

      expect(schedule).toBeDefined();
      // v2 returns server-parsed JSON directly
      expect(schedule).toHaveProperty('layouts');
      expect(schedule).toHaveProperty('overlays');
      expect(Array.isArray(schedule.layouts)).toBe(true);
    });

    it('should include default layout', async () => {
      const schedule = await v2.schedule();

      // Default layout is always present
      expect(schedule.default).toBeDefined();
    });

    // v1 schedule() uses DOMParser (browser-only), skip in node environment
    it.skipIf(typeof globalThis.DOMParser === 'undefined')(
      'should match v1 schedule structure', async () => {
        v2._etags.clear();
        v2._responseCache.clear();

        const v2Schedule = await v2.schedule();
        const v1Schedule = await v1.schedule();

        expect(String(v2Schedule.default)).toBe(String(v1Schedule.default));
        expect(v2Schedule.layouts.length).toBe(v1Schedule.layouts.length);
        expect(v2Schedule.overlays.length).toBe(v1Schedule.overlays.length);
      });

    it('should support ETag caching', async () => {
      v2._etags.clear();
      v2._responseCache.clear();

      await v2.schedule();
      expect(v2._etags.has(`/displays/${v2._displayId}/schedule`)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Reporting Endpoints
  // ──────────────────────────────────────────────────────────────────

  describe('NotifyStatus', () => {
    it('should report status successfully', async () => {
      const result = await v2.notifyStatus({
        currentLayoutId: 483,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('SubmitLog', () => {
    it('should submit logs as XML string', async () => {
      const result = await v2.submitLog(
        '<logs><log date="2026-03-01" category="info" type="info" message="v2 integration test" method="test" /></logs>'
      );
      expect(result).toBe(true);
    });

    it('should submit logs as array', async () => {
      const result = await v2.submitLog([
        { date: new Date().toISOString(), category: 'General', type: 'info', message: 'v2 array log test' },
      ]);
      expect(result).toBe(true);
    });
  });

  describe('SubmitStats', () => {
    it('should submit proof-of-play stats', async () => {
      const now = new Date();
      const result = await v2.submitStats([{
        type: 'layout',
        fromDt: new Date(now - 60000).toISOString(),
        toDt: now.toISOString(),
        scheduleId: '0',
        layoutId: '483',
        mediaId: '',
        tag: 'v2-integration-test',
      }]);
      expect(result).toBe(true);
    });
  });

  describe('MediaInventory', () => {
    it('should submit inventory as array', async () => {
      const result = await v2.mediaInventory([
        { id: '1', complete: '1', md5: 'abf73257821e2cf601d299c509726c03', lastChecked: new Date().toISOString() },
      ]);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Full Boot Sequence
  // ──────────────────────────────────────────────────────────────────

  describe('Full Player Boot Sequence (v2)', () => {
    it('should execute the complete boot sequence', async () => {
      const client = new RestClientV2({
        cmsUrl: CMS_URL,
        cmsKey: CMS_KEY,
        hardwareKey: HARDWARE_KEY,
        displayName: 'Boot Sequence v2 Test',
        xmrChannel: 'v2-boot-test',
        retryOptions: { maxRetries: 1, baseDelayMs: 500 },
      });

      // 1. Register
      const reg = await client.registerDisplay();
      expect(reg.code).toBe('READY');
      console.log(`  Register: ${reg.code}`);

      // 2. RequiredFiles
      const { files } = await client.requiredFiles();
      expect(files.length).toBeGreaterThan(0);
      const counts = { media: 0, layout: 0 };
      for (const f of files) counts[f.type] = (counts[f.type] || 0) + 1;
      console.log(`  RequiredFiles: ${files.length} total (${counts.media} media, ${counts.layout} layouts)`);

      // 3. Schedule
      const schedule = await client.schedule();
      expect(schedule).toBeDefined();
      console.log(`  Schedule: default=${schedule.default}, ${schedule.layouts.length} scheduled, ${schedule.overlays.length} overlays`);

      // 4. Status
      const status = await client.notifyStatus({ currentLayoutId: schedule.default || 0 });
      expect(status.success).toBe(true);
      console.log(`  NotifyStatus: OK`);

      // 5. Log
      const logOk = await client.submitLog([{
        date: new Date().toISOString(), category: 'General', type: 'info',
        message: 'v2 boot sequence complete',
      }]);
      expect(logOk).toBe(true);
      console.log(`  SubmitLog: OK`);

      // 6. Stats
      const now = new Date();
      const statsOk = await client.submitStats([{
        type: 'layout', fromDt: new Date(now - 10000).toISOString(),
        toDt: now.toISOString(), scheduleId: '0',
        layoutId: String(schedule.default || '0'), mediaId: '', tag: 'v2-boot',
      }]);
      expect(statsOk).toBe(true);
      console.log(`  SubmitStats: OK`);

      // 7. Inventory
      const inv = await client.mediaInventory(files.filter(f => f.type === 'media').slice(0, 5).map(f => ({
        id: f.id, complete: '1', md5: f.md5 || '', lastChecked: now.toISOString(),
      })));
      expect(inv.success).toBe(true);
      console.log(`  MediaInventory: OK`);

      console.log('  Boot sequence v2: COMPLETE');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // API Method Parity
  // ──────────────────────────────────────────────────────────────────

  describe('v2 ↔ v1 API Parity', () => {
    it('should expose the same business methods as v1', () => {
      const businessMethods = [
        'getResource', 'getWeather', 'mediaInventory', 'notifyStatus',
        'registerDisplay', 'reportFaults', 'requiredFiles', 'schedule',
        'submitLog', 'submitScreenShot', 'submitStats',
      ].sort();

      const v2Methods = Object.getOwnPropertyNames(Object.getPrototypeOf(v2))
        .filter(m => !m.startsWith('_') && m !== 'constructor')
        .sort();

      for (const method of businessMethods) {
        expect(v2Methods, `v2 missing method: ${method}`).toContain(method);
      }
    });
  });
});
