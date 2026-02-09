/**
 * Schedule Bridge
 *
 * Converts schedule.js output to XLR InputLayoutType format.
 * Handles the translation between PWA's schedule representation and XLR's expectations.
 */

import type { ScheduleManager } from './types';
import { XlrFileAdapter } from './xlr-adapter';
import { PwaLayout } from './pwa-layout';

export class ScheduleBridge {
  constructor(
    private scheduleManager: ScheduleManager,
    private fileAdapter: XlrFileAdapter
  ) {}

  /**
   * Convert current schedule layouts to XLR format
   *
   * @returns Array of PwaLayout instances for XLR
   */
  async convertToXlrFormat(): Promise<PwaLayout[]> {
    // Get current layout files from schedule manager (returns strings like "1.xlf")
    const layoutFiles = this.scheduleManager.getCurrentLayouts();

    if (!layoutFiles || layoutFiles.length === 0) {
      console.warn('[ScheduleBridge] No layouts in current schedule');
      return [];
    }

    console.log('[ScheduleBridge] Converting layouts:', layoutFiles);

    // Convert each layout to XLR format
    const xlrLayouts: PwaLayout[] = [];

    for (let index = 0; index < layoutFiles.length; index++) {
      const layoutFile = layoutFiles[index];
      const layoutId = this.extractLayoutId(layoutFile);

      if (!layoutId) {
        console.warn('[ScheduleBridge] Could not extract layout ID from:', layoutFile);
        continue;
      }

      // Get XLF content
      const xlfContent = await this.fileAdapter.getLayoutXlf(layoutId);

      if (!xlfContent) {
        console.warn(`[ScheduleBridge] No XLF content for layout ${layoutId}`);
        continue;
      }

      // Note: We don't replace URIs in XLF because XLR wraps them with xmds.php?file=
      // Instead, we fix image URLs after XLR renders (see fixImageWidgetUrls in main.ts)


      // Create blob URL for the layout (like Electron's local server)
      const blobUrl = await this.fileAdapter.provideLayoutFile(layoutId);
      if (!blobUrl) {
        console.warn(`[ScheduleBridge] Could not create blob URL for layout ${layoutId}`);
        continue;
      }

      // Create PwaLayout instance (like Electron's DefaultLayout)
      const pwaLayout = new PwaLayout(layoutId, xlfContent, index);
      pwaLayout.path = blobUrl; // Use blob URL instead of static path
      pwaLayout.shortPath = `${layoutId}.xlf`;

      console.log(`[ScheduleBridge] Created PwaLayout:`, {
        layoutId: pwaLayout.layoutId,
        path: pwaLayout.path,
        blobUrl,
        duration: pwaLayout.duration,
        hasResponse: !!pwaLayout.response,
        hasGetXlf: typeof pwaLayout.getXlf === 'function'
      });

      xlrLayouts.push(pwaLayout);
    }

    console.log(`[ScheduleBridge] Converted ${xlrLayouts.length} layouts to XLR format`);
    return xlrLayouts;
  }

  /**
   * Extract layout ID from filename or ID string
   *
   * @param filename - Layout filename (e.g., "123.xlf" or "123")
   * @returns Layout ID or null
   */
  private extractLayoutId(filename: string): number | null {
    // Handle both "123.xlf" and "123" formats
    const match = filename.match(/^(\d+)(\.xlf)?$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Check if schedule has changed and needs XLR update
   *
   * @param currentXlrLayouts - Current XLR layouts
   * @returns True if schedule changed
   */
  hasScheduleChanged(currentXlrLayouts: PwaLayout[]): boolean {
    const currentLayoutFiles = this.scheduleManager.getCurrentLayouts(); // Returns ["1.xlf", "2.xlf", ...]

    // Check if count changed
    if (currentLayoutFiles.length !== currentXlrLayouts.length) {
      return true;
    }

    // Check if layout IDs changed
    for (let i = 0; i < currentLayoutFiles.length; i++) {
      const layoutId = this.extractLayoutId(currentLayoutFiles[i]);
      if (layoutId !== currentXlrLayouts[i]?.layoutId) {
        return true;
      }
    }

    return false;
  }
}
