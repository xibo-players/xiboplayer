/**
 * XLR File Adapter
 *
 * Adapts PWA's Cache API-based file storage to XLR's file access expectations.
 * XLR expects files accessible via URLs, but PWA stores them in Cache API.
 * This adapter creates blob URLs from cached files.
 */

import type { CacheManager } from './types';

export class XlrFileAdapter {
  private blobUrls: Map<string, string> = new Map();

  constructor(private cacheManager: CacheManager) {}

  /**
   * Provide a layout XLF file to XLR
   *
   * @param layoutId - Layout ID
   * @param forceRefresh - If true, creates new blob URL even if one exists (for updated layouts)
   * @returns Blob URL or null if not cached
   */
  async provideLayoutFile(layoutId: number, forceRefresh: boolean = false): Promise<string | null> {
    const cacheKey = `layout-${layoutId}`;

    // If force refresh, clean up old blob URL first
    if (forceRefresh && this.blobUrls.has(cacheKey)) {
      const oldUrl = this.blobUrls.get(cacheKey)!;
      URL.revokeObjectURL(oldUrl);
      this.blobUrls.delete(cacheKey);
      console.log(`[XLR-Adapter] Force refreshing blob URL for layout ${layoutId}`);
    }

    // Return existing blob URL if already created (and not forcing refresh)
    if (!forceRefresh && this.blobUrls.has(cacheKey)) {
      return this.blobUrls.get(cacheKey)!;
    }

    // Get XLF from cache (will be updated if file changed)
    const blob = await this.cacheManager.getCachedFile('layout', layoutId);
    if (!blob) {
      console.warn(`[XLR-Adapter] Layout ${layoutId} not in cache`);
      return null;
    }

    // Create blob URL
    const blobUrl = URL.createObjectURL(blob);
    this.blobUrls.set(cacheKey, blobUrl);

    console.log(`[XLR-Adapter] Created blob URL for layout ${layoutId}${forceRefresh ? ' (refreshed)' : ''}`);
    return blobUrl;
  }

  /**
   * Provide a media file to XLR
   *
   * @param mediaId - Media file ID
   * @returns Blob URL or null if not cached
   */
  async provideMediaFile(mediaId: number): Promise<string | null> {
    const cacheKey = `media-${mediaId}`;

    // Return existing blob URL if already created
    if (this.blobUrls.has(cacheKey)) {
      return this.blobUrls.get(cacheKey)!;
    }

    // Get media from cache
    // @ts-ignore - getCachedResponse exists in cache.js
    const response = await this.cacheManager.getCachedResponse?.('media', mediaId);

    let blob;
    let contentType = 'application/octet-stream';

    if (response) {
      // Get Content-Type from cached Response
      blob = await response.blob();
      contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    } else {
      // Fallback to getCachedFile (no Content-Type)
      blob = await this.cacheManager.getCachedFile('media', mediaId);
      if (!blob) {
        console.warn(`[XLR-Adapter] Media ${mediaId} not in cache`);
        return null;
      }
      // Guess Content-Type from media ID (video IDs are typically in certain ranges)
      contentType = 'video/mp4'; // Default for videos
    }

    // Create typed blob with correct Content-Type
    const typedBlob = new Blob([blob], { type: contentType });
    const blobUrl = URL.createObjectURL(typedBlob);
    this.blobUrls.set(cacheKey, blobUrl);

    console.log(`[XLR-Adapter] Created blob URL for media ${mediaId} (${contentType})`);
    return blobUrl;
  }

  /**
   * Get XLF content as string
   *
   * @param layoutId - Layout ID
   * @returns XLF XML content
   */
  async getLayoutXlf(layoutId: number): Promise<string | null> {
    const blob = await this.cacheManager.getCachedFile('layout', layoutId);
    if (!blob) {
      return null;
    }

    return await blob.text();
  }

  /**
   * Cleanup blob URLs to prevent memory leaks
   */
  cleanup(): void {
    for (const url of this.blobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls.clear();
    console.log('[XLR-Adapter] Cleaned up blob URLs');
  }

  /**
   * Cleanup specific layout blob URL
   */
  cleanupLayout(layoutId: number): void {
    const cacheKey = `layout-${layoutId}`;
    const url = this.blobUrls.get(cacheKey);
    if (url) {
      URL.revokeObjectURL(url);
      this.blobUrls.delete(cacheKey);
    }
  }
}
