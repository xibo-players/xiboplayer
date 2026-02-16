/**
 * API Integration Tests: Media / Library
 *
 * Tests media upload, listing, and deletion against a real CMS instance.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHelper } from '../../src/cms-test-helper.js';

describe('Media / Library', () => {
  const helper = createTestHelper();

  beforeAll(async () => {
    await helper.setup();
  });

  afterAll(async () => {
    await helper.teardown();
  });

  it('should list media in the library', async () => {
    const media = await helper.getApi().listMedia();

    expect(Array.isArray(media)).toBe(true);
    // CMS should have at least some media (even if test environment)
  });

  it('should upload an image file', async () => {
    // Create a minimal 1x1 red PNG (67 bytes)
    const pngData = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, // 8-bit RGB
      0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, // compressed data
      0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, // red pixel
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
      0xAE, 0x42, 0x60, 0x82
    ]);

    const formData = new FormData();
    formData.append('files', new Blob([pngData], { type: 'image/png' }), `test-${Date.now()}.png`);
    formData.append('name', `test-image-${Date.now()}`);

    const result = await helper.getApi().uploadMedia(formData);

    // Xibo may return the media info directly or in a files array
    const mediaId = result?.mediaId || result?.files?.[0]?.mediaId;
    expect(mediaId).toBeDefined();

    if (mediaId) {
      helper.track('media', mediaId);
    }
  });

  it('should filter media by type', async () => {
    const images = await helper.getApi().listMedia({ type: 'image' });

    expect(Array.isArray(images)).toBe(true);
    // All results should be images (if any exist)
    for (const item of images) {
      expect(item.mediaType || item.type).toMatch(/image/i);
    }
  });

  it('should delete a media item', async () => {
    // Create a temporary PNG
    const pngData = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE,
      0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54,
      0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
      0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82
    ]);

    const formData = new FormData();
    const fileName = `delete-test-${Date.now()}.png`;
    formData.append('files', new Blob([pngData], { type: 'image/png' }), fileName);
    formData.append('name', fileName);

    const result = await helper.getApi().uploadMedia(formData);
    const mediaId = result?.mediaId || result?.files?.[0]?.mediaId;

    if (mediaId) {
      // Delete should not throw
      await helper.getApi().deleteMedia(mediaId);
    }
  });
});
