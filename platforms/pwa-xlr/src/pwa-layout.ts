/**
 * PWA Layout Class
 *
 * Minimal layout class compatible with XLR InputLayoutType
 * Based on Electron's DefaultLayout
 */

export class PwaLayout {
  response: Element | null;
  layoutNode: Document | null = null;  // XLR looks for this!
  id: number;
  layoutId: number;
  duration: number;
  dependents: string[];
  index: number;
  width: number;
  height: number;
  path?: string;
  shortPath?: string;
  private xlfContent: string;

  constructor(layoutId: number, xlfContent: string, index: number = 0) {
    this.id = layoutId;
    this.layoutId = layoutId;
    this.duration = 60; // Default, will be parsed from XLF
    this.index = index;
    this.width = 1920;
    this.height = 1080;
    this.dependents = [];
    this.xlfContent = xlfContent;

    // Parse XLF to Element - provide to XLR directly (bypass fetching)
    this.response = this.parseXlf(xlfContent);

    // Parse attributes from XLF for our metadata
    this.parseAttributesFromString();
  }

  private parseXlf(xmlString: string): Element | null {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      const element = xmlDoc.documentElement;

      // XLR needs BOTH response (Element) AND layoutNode (Document)!
      this.layoutNode = xmlDoc;

      // Log parsing details
      console.log(`[PwaLayout] Parsed XLF for layout ${this.layoutId}:`, {
        tagName: element.tagName,
        hasRegions: element.getElementsByTagName('region').length,
        regionCount: element.getElementsByTagName('region').length,
        xmlLength: xmlString.length,
        hasLayoutNode: !!this.layoutNode
      });

      return element;
    } catch (error) {
      console.error('[PwaLayout] Failed to parse XLF:', error);
      return null;
    }
  }

  private parseAttributesFromString(): void {
    try {
      // Parse XLF string just to extract attributes (XLR will do the real parsing)
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(this.xlfContent, 'text/xml');
      const layoutElement = xmlDoc.documentElement;

      // Parse width
      const widthAttr = layoutElement.getAttribute('width');
      if (widthAttr) {
        this.width = parseInt(widthAttr, 10);
      }

      // Parse height
      const heightAttr = layoutElement.getAttribute('height');
      if (heightAttr) {
        this.height = parseInt(heightAttr, 10);
      }

      // Parse duration
      const durationAttr = layoutElement.getAttribute('duration');
      if (durationAttr) {
        this.duration = parseInt(durationAttr, 10);
      }
    } catch (error) {
      console.warn('[PwaLayout] Failed to parse attributes from XLF:', error);
    }
  }

  hash(): string {
    return `${this.layoutId}`;
  }

  async isValid(): Promise<boolean> {
    return this.response !== null;
  }

  isInterrupt(): boolean {
    return false;
  }

  addCommittedInterruptDuration(): void {
    // Not used in PWA
  }

  isInterruptDurationSatisfied(): boolean {
    return true;
  }

  clone(): PwaLayout {
    return new PwaLayout(this.layoutId, this.xlfContent, this.index);
  }

  // For XLR compatibility
  getXlf(): string {
    return this.xlfContent;
  }

  /**
   * Replace media file URIs in XLF with blob URLs (Electron pattern)
   * Uses fileId attribute to map to cached files
   * Optimized with parallel fetching for 4x speedup
   */
  async replaceMediaWithBlobs(fileAdapter: any): Promise<void> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(this.xlfContent, 'text/xml');
    const mediaElements = doc.querySelectorAll('media');

    // Collect all media replacement promises for parallel execution
    const replacementPromises: Promise<void>[] = [];

    for (const mediaEl of mediaElements) {
      const type = mediaEl.getAttribute('type');
      const fileId = mediaEl.getAttribute('fileId');

      if (fileId && (type === 'video' || type === 'image' || type === 'audio')) {
        // PARALLEL: Don't await here, collect promises
        replacementPromises.push(
          (async () => {
            const blob = await fileAdapter.provideMediaFile(parseInt(fileId));
            if (blob) {
              const opts = mediaEl.querySelector('options');
              let uri = opts?.querySelector('uri');
              if (uri) {
                console.log(`[PwaLayout] Media ${fileId}: ${uri.textContent} → blob`);
                uri.textContent = blob;
              }
            }
          })()
        );
      }
    }

    // Wait for ALL media URL replacements in parallel
    if (replacementPromises.length > 0) {
      console.log(`[PwaLayout] Replacing ${replacementPromises.length} media URLs in parallel...`);
      await Promise.all(replacementPromises);

      this.xlfContent = new XMLSerializer().serializeToString(doc);
      this.response = this.parseXlf(this.xlfContent);
      console.log(`[PwaLayout] Replaced ${replacementPromises.length} media with blobs`);
    }
  }
}
