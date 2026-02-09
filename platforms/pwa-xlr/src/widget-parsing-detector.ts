/**
 * Widget Parsing Detector
 *
 * Detects when XLR has finished parsing widget actions from XLF layouts,
 * preventing ActionController from seeing undefined actions during the
 * async parsing window.
 *
 * Strategy: Monitor XLR's internal state to detect when layout parsing
 * completes, BEFORE emitting updateLoop event.
 */

import type { IXlr } from './types';

export class WidgetParsingDetector {
  private xlr: IXlr | null = null;

  /**
   * Attach detector to XLR instance for internal state monitoring
   */
  attachToXlr(xlr: IXlr): void {
    this.xlr = xlr;
    console.log('[WidgetParsing] Attached to XLR instance');
  }

  /**
   * Wait for XLR to finish parsing widget actions from layouts
   *
   * This prevents ActionController from seeing undefined actions during
   * the async parsing window after updateScheduleLayouts() completes.
   *
   * @param timeoutMs Maximum time to wait (default: 300ms)
   * @returns Promise that resolves when parsing is complete or timeout
   */
  async waitForParsingComplete(timeoutMs: number = 300): Promise<void> {
    if (!this.xlr) {
      console.warn('[WidgetParsing] Not attached to XLR, skipping wait');
      return;
    }

    console.log('[WidgetParsing] Waiting for XLR to finish parsing widget actions...');

    return new Promise((resolve) => {
      let elapsed = 0;
      const checkInterval = 20; // Check every 20ms
      const maxWait = timeoutMs;

      const checker = setInterval(() => {
        elapsed += checkInterval;

        // Check if XLR has finished internal layout parsing
        const isReady = this.checkXlrLayoutsParsed();

        if (isReady || elapsed >= maxWait) {
          clearInterval(checker);
          if (isReady) {
            console.log(`[WidgetParsing] ✓ Parsing complete after ${elapsed}ms`);
          } else {
            console.log(`[WidgetParsing] ⏱ Timeout after ${elapsed}ms, proceeding anyway`);
          }
          resolve();
        }
      }, checkInterval);
    });
  }

  /**
   * Check if XLR has finished parsing layouts internally
   *
   * CRITICAL: We check XLR's currentLayout (the actual parsed ILayout instance),
   * NOT uniqueLayouts (which stores raw InputLayoutType objects without regions).
   *
   * ActionController is created at the END of parseXlf(), so its presence
   * indicates the layout is fully initialized with parsed widget actions.
   *
   * @returns true if layouts have been parsed with regions/widgets
   */
  private checkXlrLayoutsParsed(): boolean {
    if (!this.xlr) return false;

    try {
      // Access XLR's internal state (it's not typed, so use 'any')
      const xlrInternal = this.xlr as any;

      // Check currentLayout (the actual parsed ILayout instance with regions)
      // NOT uniqueLayouts (which stores raw InputLayoutType objects)
      const currentLayout = xlrInternal.currentLayout;

      // ActionController is created at the END of parseXlf(), after all regions
      // If it exists, the Layout is fully initialized and actions are parsed
      if (currentLayout?.actionController) {
        console.log('[WidgetParsing] ✓ Detected ActionController ready - parsing complete');
        return true;
      }

      // Fallback: Check if regions array exists (means parsing started)
      if (currentLayout?.regions && Array.isArray(currentLayout.regions)) {
        if (currentLayout.regions.length > 0) {
          console.log('[WidgetParsing] ✓ Detected parsed layout with', currentLayout.regions.length, 'regions');
          return true;
        }
      }
    } catch (error) {
      // If we can't access internal state, assume not ready
      console.warn('[WidgetParsing] Error checking XLR state:', error);
      return false;
    }

    return false;
  }

  /**
   * Cleanup detector
   */
  cleanup(): void {
    this.xlr = null;
  }
}
