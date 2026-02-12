/**
 * API Integration Tests: OAuth2 Authentication
 *
 * Tests against a real CMS instance. Requires .env configuration.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestHelper } from '../../src/cms-test-helper.js';

describe('OAuth2 Authentication', () => {
  const helper = createTestHelper();

  it('should authenticate with valid credentials', async () => {
    const api = helper.getApi();
    const token = await api.authenticate();

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
  });

  it('should reuse token on subsequent calls (no re-auth)', async () => {
    const api = helper.getApi();
    await api.authenticate();

    const firstToken = api.accessToken;
    const firstExpiry = api.tokenExpiry;

    // ensureToken should NOT re-authenticate (token still valid)
    await api.ensureToken();

    expect(api.accessToken).toBe(firstToken);
    expect(api.tokenExpiry).toBe(firstExpiry);
  });

  it('should fail with invalid credentials', async () => {
    const badApi = createTestHelper({
      cmsUrl: helper.config.cmsUrl,
      clientId: 'invalid-id',
      clientSecret: 'invalid-secret'
    }).getApi();

    await expect(badApi.authenticate()).rejects.toThrow();
  });

  it('should list resolutions after authentication', async () => {
    const api = helper.getApi();
    await api.authenticate();

    const resolutions = await api.listResolutions();

    expect(Array.isArray(resolutions)).toBe(true);
    expect(resolutions.length).toBeGreaterThan(0);
    expect(resolutions[0]).toHaveProperty('resolutionId');
    expect(resolutions[0]).toHaveProperty('width');
    expect(resolutions[0]).toHaveProperty('height');
  });
});
