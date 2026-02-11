/**
 * RendererLite - Lightweight XLF Layout Renderer
 *
 * A standalone, reusable JavaScript library for rendering Xibo Layout Format (XLF) files.
 * Provides layout rendering without dependencies on XLR, suitable for any platform.
 *
 * Features:
 * - Parse XLF XML layout files
 * - Create region DOM elements with positioning
 * - Render widgets (text, image, video, audio, PDF, webpage)
 * - Handle widget duration timers
 * - Apply CSS transitions (fade, fly)
 * - Event emitter for lifecycle hooks
 * - Manage layout lifecycle
 *
 * Usage pattern (similar to xmr-wrapper.js):
 *
 * ```javascript
 * import { RendererLite } from './renderer-lite.js';
 *
 * const container = document.getElementById('player-container');
 * const renderer = new RendererLite({ cmsUrl: '...', hardwareKey: '...' }, container);
 *
 * // Listen to events
 * renderer.on('layoutStart', (layoutId) => console.log('Layout started:', layoutId));
 * renderer.on('layoutEnd', (layoutId) => console.log('Layout ended:', layoutId));
 * renderer.on('widgetStart', (widget) => console.log('Widget started:', widget));
 * renderer.on('widgetEnd', (widget) => console.log('Widget ended:', widget));
 * renderer.on('error', (error) => console.error('Error:', error));
 *
 * // Render a layout
 * await renderer.renderLayout(layoutXml, duration);
 *
 * // Stop current layout
 * renderer.stopCurrentLayout();
 *
 * // Cleanup
 * renderer.cleanup();
 * ```
 */

import { createNanoEvents } from 'nanoevents';
import { createLogger, isDebug } from '@xiboplayer/utils';

/**
 * Transition utilities for widget animations
 */
const Transitions = {
  /**
   * Apply fade in transition
   */
  fadeIn(element, duration) {
    const keyframes = [
      { opacity: 0 },
      { opacity: 1 }
    ];
    const timing = {
      duration: duration,
      easing: 'linear',
      fill: 'forwards'
    };
    return element.animate(keyframes, timing);
  },

  /**
   * Apply fade out transition
   */
  fadeOut(element, duration) {
    const keyframes = [
      { opacity: 1 },
      { opacity: 0 }
    ];
    const timing = {
      duration: duration,
      easing: 'linear',
      fill: 'forwards'
    };
    return element.animate(keyframes, timing);
  },

  /**
   * Get fly keyframes based on compass direction
   */
  getFlyKeyframes(direction, width, height, isIn) {
    const dirMap = {
      'N': { x: 0, y: isIn ? -height : height },
      'NE': { x: isIn ? width : -width, y: isIn ? -height : height },
      'E': { x: isIn ? width : -width, y: 0 },
      'SE': { x: isIn ? width : -width, y: isIn ? height : -height },
      'S': { x: 0, y: isIn ? height : -height },
      'SW': { x: isIn ? -width : width, y: isIn ? height : -height },
      'W': { x: isIn ? -width : width, y: 0 },
      'NW': { x: isIn ? -width : width, y: isIn ? -height : height }
    };

    const offset = dirMap[direction] || dirMap['N'];

    if (isIn) {
      return {
        from: {
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          opacity: 0
        },
        to: {
          transform: 'translate(0, 0)',
          opacity: 1
        }
      };
    } else {
      return {
        from: {
          transform: 'translate(0, 0)',
          opacity: 1
        },
        to: {
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          opacity: 0
        }
      };
    }
  },

  /**
   * Apply fly in transition
   */
  flyIn(element, duration, direction, regionWidth, regionHeight) {
    const keyframes = this.getFlyKeyframes(direction, regionWidth, regionHeight, true);
    const timing = {
      duration: duration,
      easing: 'ease-out',
      fill: 'forwards'
    };
    return element.animate([keyframes.from, keyframes.to], timing);
  },

  /**
   * Apply fly out transition
   */
  flyOut(element, duration, direction, regionWidth, regionHeight) {
    const keyframes = this.getFlyKeyframes(direction, regionWidth, regionHeight, false);
    const timing = {
      duration: duration,
      easing: 'ease-in',
      fill: 'forwards'
    };
    return element.animate([keyframes.from, keyframes.to], timing);
  },

  /**
   * Apply transition based on type
   */
  apply(element, transitionConfig, isIn, regionWidth, regionHeight) {
    if (!transitionConfig || !transitionConfig.type) {
      return null;
    }

    const type = transitionConfig.type.toLowerCase();
    const duration = transitionConfig.duration || 1000;
    const direction = transitionConfig.direction || 'N';

    switch (type) {
      case 'fadein':
        return isIn ? this.fadeIn(element, duration) : null;
      case 'fadeout':
        return isIn ? null : this.fadeOut(element, duration);
      case 'flyin':
        return isIn ? this.flyIn(element, duration, direction, regionWidth, regionHeight) : null;
      case 'flyout':
        return isIn ? null : this.flyOut(element, duration, direction, regionWidth, regionHeight);
      default:
        return null;
    }
  }
};

/**
 * RendererLite - Lightweight XLF renderer
 */
export class RendererLite {
  /**
   * @param {Object} config - Player configuration
   * @param {string} config.cmsUrl - CMS base URL
   * @param {string} config.hardwareKey - Display hardware key
   * @param {HTMLElement} container - DOM container for rendering
   * @param {Object} options - Renderer options
   * @param {Function} options.getMediaUrl - Function to get media file URL (mediaId) => url
   * @param {Function} options.getWidgetHtml - Function to get widget HTML (layoutId, regionId, widgetId) => html
   */
  constructor(config, container, options = {}) {
    this.config = config;
    this.container = container;
    this.options = options;

    // Logger with configurable level
    this.log = createLogger('RendererLite', options.logLevel);

    // Event emitter for lifecycle hooks
    this.emitter = createNanoEvents();

    // State
    this.currentLayout = null;
    this.currentLayoutId = null;
    this.regions = new Map(); // regionId => { element, widgets, currentIndex, timer }
    this.layoutTimer = null;
    this.widgetTimers = new Map(); // widgetId => timer
    this.mediaUrlCache = new Map(); // fileId => blob URL (for parallel pre-fetching)
    this.layoutBlobUrls = new Map(); // layoutId => Set<blobUrl> (for lifecycle tracking)

    // Overlay state
    this.overlayContainer = null;
    this.activeOverlays = new Map(); // layoutId => { container, layout, timer, regions }

    // Setup container styles
    this.setupContainer();

    this.log.info('Initialized');
  }

  /**
   * Setup container element
   */
  setupContainer() {
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100vh'; // Use viewport height, not percentage
    this.container.style.overflow = 'hidden';

    // Create overlay container for overlay layouts (higher z-index than main content)
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'overlay-container';
    this.overlayContainer.style.position = 'absolute';
    this.overlayContainer.style.top = '0';
    this.overlayContainer.style.left = '0';
    this.overlayContainer.style.width = '100%';
    this.overlayContainer.style.height = '100%';
    this.overlayContainer.style.zIndex = '1000'; // Above main layout (z-index 0-999)
    this.overlayContainer.style.pointerEvents = 'none'; // Don't block clicks on main layout
    this.container.appendChild(this.overlayContainer);
  }

  /**
   * Event emitter interface (like XMR wrapper)
   */
  on(event, callback) {
    return this.emitter.on(event, callback);
  }

  emit(event, ...args) {
    this.emitter.emit(event, ...args);
  }

  /**
   * Parse XLF XML to layout object
   * @param {string} xlfXml - XLF XML content
   * @returns {Object} Parsed layout
   */
  parseXlf(xlfXml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xlfXml, 'text/xml');

    const layoutEl = doc.querySelector('layout');
    if (!layoutEl) {
      throw new Error('Invalid XLF: no <layout> element');
    }

    const layoutDurationAttr = layoutEl.getAttribute('duration');
    const layout = {
      width: parseInt(layoutEl.getAttribute('width') || '1920'),
      height: parseInt(layoutEl.getAttribute('height') || '1080'),
      duration: layoutDurationAttr ? parseInt(layoutDurationAttr) : 0, // 0 = calculate from widgets
      bgcolor: layoutEl.getAttribute('bgcolor') || '#000000',
      regions: []
    };

    if (layoutDurationAttr) {
      this.log.info(`Layout duration from XLF: ${layout.duration}s`);
    } else {
      this.log.info(`Layout duration NOT in XLF, will calculate from widgets`);
    }

    // Parse regions
    for (const regionEl of doc.querySelectorAll('region')) {
      const region = {
        id: regionEl.getAttribute('id'),
        width: parseInt(regionEl.getAttribute('width')),
        height: parseInt(regionEl.getAttribute('height')),
        top: parseInt(regionEl.getAttribute('top')),
        left: parseInt(regionEl.getAttribute('left')),
        zindex: parseInt(regionEl.getAttribute('zindex') || '0'),
        widgets: []
      };

      // Parse media/widgets
      for (const mediaEl of regionEl.querySelectorAll('media')) {
        const widget = this.parseWidget(mediaEl);
        region.widgets.push(widget);
      }

      layout.regions.push(region);
    }

    // Calculate layout duration if not specified (duration=0)
    if (layout.duration === 0) {
      let maxDuration = 0;

      for (const region of layout.regions) {
        let regionDuration = 0;

        // Calculate region duration based on widgets
        for (const widget of region.widgets) {
          if (widget.duration > 0) {
            regionDuration += widget.duration;
          } else {
            // Widget with duration=0 means "use media length"
            // For now, default to 60s as we don't know actual media length yet
            // TODO: Get actual video duration from video element after load
            regionDuration = 60;
            break;
          }
        }

        maxDuration = Math.max(maxDuration, regionDuration);
      }

      layout.duration = maxDuration > 0 ? maxDuration : 60;
      this.log.info(`Calculated layout duration: ${layout.duration}s (not specified in XLF)`);
    }

    return layout;
  }

  /**
   * Parse widget from media element
   * @param {Element} mediaEl - Media XML element
   * @returns {Object} Widget config
   */
  parseWidget(mediaEl) {
    const type = mediaEl.getAttribute('type');
    const duration = parseInt(mediaEl.getAttribute('duration') || '10');
    const useDuration = parseInt(mediaEl.getAttribute('useDuration') || '1');
    const id = mediaEl.getAttribute('id');
    const fileId = mediaEl.getAttribute('fileId'); // Media library file ID

    // Parse options
    const options = {};
    const optionsEl = mediaEl.querySelector('options');
    if (optionsEl) {
      for (const child of optionsEl.children) {
        options[child.tagName] = child.textContent;
      }
    }

    // Parse raw content
    const rawEl = mediaEl.querySelector('raw');
    const raw = rawEl ? rawEl.textContent : '';

    // Parse transitions
    const transitions = {
      in: null,
      out: null
    };

    if (options.transIn) {
      transitions.in = {
        type: options.transIn,
        duration: parseInt(options.transInDuration || '1000'),
        direction: options.transInDirection || 'N'
      };
    }

    if (options.transOut) {
      transitions.out = {
        type: options.transOut,
        duration: parseInt(options.transOutDuration || '1000'),
        direction: options.transOutDirection || 'N'
      };
    }

    return {
      type,
      duration,
      useDuration, // Whether to use specified duration (1) or media length (0)
      id,
      fileId, // Media library file ID for cache lookup
      options,
      raw,
      transitions
    };
  }

  /**
   * Track blob URL for lifecycle management
   * @param {string} blobUrl - Blob URL to track
   */
  trackBlobUrl(blobUrl) {
    if (!this.currentLayoutId) return;

    if (!this.layoutBlobUrls.has(this.currentLayoutId)) {
      this.layoutBlobUrls.set(this.currentLayoutId, new Set());
    }

    this.layoutBlobUrls.get(this.currentLayoutId).add(blobUrl);
  }

  /**
   * Revoke all blob URLs for a specific layout
   * @param {number} layoutId - Layout ID
   */
  revokeBlobUrlsForLayout(layoutId) {
    const blobUrls = this.layoutBlobUrls.get(layoutId);
    if (blobUrls) {
      blobUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });
      this.layoutBlobUrls.delete(layoutId);
      this.log.info(`Revoked ${blobUrls.size} blob URLs for layout ${layoutId}`);
    }
  }

  /**
   * Update layout duration based on actual widget durations
   * Called when video metadata loads and we discover actual duration
   */
  updateLayoutDuration() {
    if (!this.currentLayout) return;

    // Calculate maximum region duration
    let maxRegionDuration = 0;

    for (const region of this.currentLayout.regions) {
      let regionDuration = 0;

      for (const widget of region.widgets) {
        if (widget.duration > 0) {
          regionDuration += widget.duration;
        }
      }

      maxRegionDuration = Math.max(maxRegionDuration, regionDuration);
    }

    // If we calculated a different duration, update layout
    if (maxRegionDuration > 0 && maxRegionDuration !== this.currentLayout.duration) {
      const oldDuration = this.currentLayout.duration;
      this.currentLayout.duration = maxRegionDuration;

      this.log.info(`Layout duration updated: ${oldDuration}s → ${maxRegionDuration}s (based on video metadata)`);

      // Reset layout timer with new duration
      if (this.layoutTimer) {
        clearTimeout(this.layoutTimer);
      }

      const layoutDurationMs = this.currentLayout.duration * 1000;
      this.layoutTimer = setTimeout(() => {
        this.log.info(`Layout ${this.currentLayoutId} duration expired (${this.currentLayout.duration}s)`);
        if (this.currentLayoutId) {
          this.emit('layoutEnd', this.currentLayoutId);
        }
      }, layoutDurationMs);

      this.log.info(`Layout timer reset to ${this.currentLayout.duration}s`);
    }
  }

  /**
   * Render a layout
   * @param {string} xlfXml - XLF XML content
   * @param {number} layoutId - Layout ID
   * @returns {Promise<void>}
   */
  async renderLayout(xlfXml, layoutId) {
    try {
      this.log.info(`Rendering layout ${layoutId}`);

      // Check if we're replaying the same layout
      const isSameLayout = this.currentLayoutId === layoutId;

      if (isSameLayout) {
        // OPTIMIZATION: Reuse existing elements for same layout (Arexibo pattern)
        this.log.info(`Replaying layout ${layoutId} - reusing elements (no recreation!)`);

        // Stop all region timers
        for (const [regionId, region] of this.regions) {
          if (region.timer) {
            clearTimeout(region.timer);
            region.timer = null;
          }
          // Reset to first widget
          region.currentIndex = 0;
        }

        // Clear layout timer
        if (this.layoutTimer) {
          clearTimeout(this.layoutTimer);
          this.layoutTimer = null;
        }

        // DON'T call stopCurrentLayout() - keep elements alive!
        // DON'T clear mediaUrlCache - keep blob URLs alive!
        // DON'T recreate regions/elements - already exist!

        // Emit layout start event
        this.emit('layoutStart', layoutId, this.currentLayout);

        // Restart all regions from widget 0
        for (const [regionId, region] of this.regions) {
          this.startRegion(regionId);
        }

        // Set layout timer
        if (this.currentLayout.duration > 0) {
          const layoutDurationMs = this.currentLayout.duration * 1000;
          this.log.info(`Layout ${layoutId} will end after ${this.currentLayout.duration}s`);

          this.layoutTimer = setTimeout(() => {
            this.log.info(`Layout ${layoutId} duration expired (${this.currentLayout.duration}s)`);
            if (this.currentLayoutId) {
              this.emit('layoutEnd', this.currentLayoutId);
            }
          }, layoutDurationMs);
        }

        this.log.info(`Layout ${layoutId} restarted (reused elements)`);
        return; // EARLY RETURN - skip recreation below
      }

      // Different layout - full teardown and rebuild
      this.log.info(`Switching to new layout ${layoutId}`);
      this.stopCurrentLayout();

      // Parse XLF
      const layout = this.parseXlf(xlfXml);
      this.currentLayout = layout;
      this.currentLayoutId = layoutId;

      // Set container background
      this.container.style.backgroundColor = layout.bgcolor;

      // PRE-FETCH: Get all media URLs in parallel (huge speedup!)
      if (this.options.getMediaUrl) {
        const mediaPromises = [];
        this.mediaUrlCache.clear(); // Clear previous layout's cache

        for (const region of layout.regions) {
          for (const widget of region.widgets) {
            if (widget.fileId) {
              const fileId = parseInt(widget.fileId || widget.id);
              if (!this.mediaUrlCache.has(fileId)) {
                mediaPromises.push(
                  this.options.getMediaUrl(fileId)
                    .then(url => {
                      this.mediaUrlCache.set(fileId, url);
                    })
                    .catch(err => {
                      this.log.warn(`Failed to fetch media ${fileId}:`, err);
                    })
                );
              }
            }
          }
        }

        if (mediaPromises.length > 0) {
          this.log.info(`Pre-fetching ${mediaPromises.length} media URLs in parallel...`);
          await Promise.all(mediaPromises);
          this.log.info(`All media URLs pre-fetched`);
        }
      }

      // Create regions
      for (const regionConfig of layout.regions) {
        await this.createRegion(regionConfig);
      }

      // PRE-CREATE: Build all widget elements upfront (Arexibo pattern)
      this.log.info('Pre-creating widget elements for instant transitions...');
      for (const [regionId, region] of this.regions) {
        for (let i = 0; i < region.widgets.length; i++) {
          const widget = region.widgets[i];
          widget.layoutId = this.currentLayoutId;
          widget.regionId = regionId;

          try {
            const element = await this.createWidgetElement(widget, region);
            element.style.visibility = 'hidden'; // Hidden by default
            element.style.opacity = '0';
            region.element.appendChild(element);
            region.widgetElements.set(widget.id, element);
          } catch (error) {
            this.log.error(`Failed to pre-create widget ${widget.id}:`, error);
          }
        }
      }
      this.log.info('All widget elements pre-created');

      // Emit layout start event
      this.emit('layoutStart', layoutId, layout);

      // Start all regions
      for (const [regionId, region] of this.regions) {
        this.startRegion(regionId);
      }

      // Set layout timer based on layout duration (not widget completion)
      if (layout.duration > 0) {
        const layoutDurationMs = layout.duration * 1000;
        this.log.info(`Layout ${layoutId} will end after ${layout.duration}s`);

        this.layoutTimer = setTimeout(() => {
          this.log.info(`Layout ${layoutId} duration expired (${layout.duration}s)`);
          // Fire layoutEnd regardless of widget/region state
          if (this.currentLayoutId) {
            this.emit('layoutEnd', this.currentLayoutId);
          }
        }, layoutDurationMs);
      }

      this.log.info(`Layout ${layoutId} started`);

    } catch (error) {
      this.log.error('Error rendering layout:', error);
      this.emit('error', { type: 'layoutError', error, layoutId });
      throw error;
    }
  }

  /**
   * Create a region element
   * @param {Object} regionConfig - Region configuration
   */
  async createRegion(regionConfig) {
    const regionEl = document.createElement('div');
    regionEl.id = `region_${regionConfig.id}`;
    regionEl.className = 'renderer-lite-region';
    regionEl.style.position = 'absolute';
    regionEl.style.left = `${regionConfig.left}px`;
    regionEl.style.top = `${regionConfig.top}px`;
    regionEl.style.width = `${regionConfig.width}px`;
    regionEl.style.height = `${regionConfig.height}px`;
    regionEl.style.zIndex = regionConfig.zindex;
    regionEl.style.overflow = 'hidden';

    this.container.appendChild(regionEl);

    // Store region state
    this.regions.set(regionConfig.id, {
      element: regionEl,
      config: regionConfig,
      widgets: regionConfig.widgets,
      currentIndex: 0,
      timer: null,
      width: regionConfig.width,
      height: regionConfig.height,
      complete: false, // Track if region has played all widgets once
      widgetElements: new Map() // widgetId -> DOM element (for element reuse)
    });
  }

  /**
   * Start playing a region's widgets
   * @param {string} regionId - Region ID
   */
  startRegion(regionId) {
    const region = this.regions.get(regionId);
    if (!region || region.widgets.length === 0) {
      return;
    }

    // If only one widget, just render it (no cycling)
    // Don't set completion timer - layout duration controls ending
    // Region completion is NOT tracked for single-widget regions
    // (they display continuously until layout timer expires)
    if (region.widgets.length === 1) {
      this.renderWidget(regionId, 0);
      return;
    }

    // Multiple widgets - cycle through them
    const playNext = () => {
      const widgetIndex = region.currentIndex;
      const widget = region.widgets[widgetIndex];

      // Render widget
      this.renderWidget(regionId, widgetIndex);

      // Schedule next widget
      const duration = widget.duration * 1000;
      region.timer = setTimeout(() => {
        this.stopWidget(regionId, widgetIndex);

        // Move to next widget (wraps to 0 if at end)
        const nextIndex = (region.currentIndex + 1) % region.widgets.length;

        // Check if completing full cycle (wrapped back to 0)
        if (nextIndex === 0 && !region.complete) {
          region.complete = true;
          this.log.info(`Region ${regionId} completed one full cycle`);
          this.checkLayoutComplete();
        }

        region.currentIndex = nextIndex;
        playNext();
      }, duration);
    };

    playNext();
  }

  /**
   * Create a widget element (extracted for pre-creation)
   * @param {Object} widget - Widget config
   * @param {Object} region - Region state
   * @returns {Promise<HTMLElement>} Widget DOM element
   */
  async createWidgetElement(widget, region) {
    switch (widget.type) {
      case 'image':
        return await this.renderImage(widget, region);
      case 'video':
        return await this.renderVideo(widget, region);
      case 'audio':
        return await this.renderAudio(widget, region);
      case 'text':
      case 'ticker':
        return await this.renderTextWidget(widget, region);
      case 'pdf':
        return await this.renderPdf(widget, region);
      case 'webpage':
        return await this.renderWebpage(widget, region);
      default:
        // Generic widget (clock, calendar, weather, etc.)
        return await this.renderGenericWidget(widget, region);
    }
  }

  /**
   * Helper: Find media element within widget (works for both direct and wrapped elements)
   * @param {HTMLElement} element - Widget element (might BE the media element or contain it)
   * @param {string} tagName - Tag name to find ('VIDEO', 'AUDIO', 'IMG', 'IFRAME')
   * @returns {HTMLElement|null}
   */
  findMediaElement(element, tagName) {
    // Check if element IS the tag, or contains it as a descendant
    return element.tagName === tagName ? element : element.querySelector(tagName.toLowerCase());
  }

  /**
   * Update media element for dynamic content (videos/audio need restart)
   * @param {HTMLElement} element - Widget element
   * @param {Object} widget - Widget config
   */
  updateMediaElement(element, widget) {
    // Videos: ALWAYS restart on widget show (even if looping)
    const videoEl = this.findMediaElement(element, 'VIDEO');
    if (videoEl) {
      videoEl.currentTime = 0;
      videoEl.play().catch(err => this.log.warn('Video play failed:', err));
      this.log.info(`Video restarted: ${widget.fileId || widget.id}`);
      return;
    }

    // Audio: ALWAYS restart on widget show (even if looping)
    const audioEl = this.findMediaElement(element, 'AUDIO');
    if (audioEl) {
      audioEl.currentTime = 0;
      audioEl.play().catch(err => this.log.warn('Audio play failed:', err));
      this.log.info(`Audio restarted: ${widget.fileId || widget.id}`);
      return;
    }

    // Images: Could refresh src if needed (future enhancement)
    // const imgEl = this.findMediaElement(element, 'IMG');

    // Iframes: Could reload if needed (future enhancement)
    // const iframeEl = this.findMediaElement(element, 'IFRAME');
  }

  /**
   * Render a widget in a region (using element reuse)
   * @param {string} regionId - Region ID
   * @param {number} widgetIndex - Widget index in region
   */
  async renderWidget(regionId, widgetIndex) {
    const region = this.regions.get(regionId);
    if (!region) return;

    const widget = region.widgets[widgetIndex];
    if (!widget) return;

    try {
      this.log.info(`Showing widget ${widget.type} (${widget.id}) in region ${regionId}`);

      // REUSE: Get existing element instead of creating new one
      let element = region.widgetElements.get(widget.id);

      if (!element) {
        // Fallback: create if doesn't exist (shouldn't happen with pre-creation)
        this.log.warn(`Widget ${widget.id} not pre-created, creating now`);
        widget.layoutId = this.currentLayoutId;
        widget.regionId = regionId;
        element = await this.createWidgetElement(widget, region);
        region.widgetElements.set(widget.id, element);
        region.element.appendChild(element);
      }

      // Hide all other widgets in region
      for (const [widgetId, widgetEl] of region.widgetElements) {
        if (widgetId !== widget.id) {
          widgetEl.style.visibility = 'hidden';
          widgetEl.style.opacity = '0';
        }
      }

      // Update media element if needed (restart videos)
      this.updateMediaElement(element, widget);

      // Show this widget
      element.style.visibility = 'visible';

      // Apply in transition
      if (widget.transitions.in) {
        Transitions.apply(element, widget.transitions.in, true, region.width, region.height);
      } else {
        element.style.opacity = '1';
      }

      // Emit widget start event
      this.emit('widgetStart', {
        widgetId: widget.id,
        regionId,
        layoutId: this.currentLayoutId,
        mediaId: parseInt(widget.fileId || widget.id) || null,
        type: widget.type,
        duration: widget.duration
      });

    } catch (error) {
      this.log.error(`Error rendering widget:`, error);
      this.emit('error', { type: 'widgetError', error, widgetId: widget.id, regionId });
    }
  }

  /**
   * Stop a widget (with element reuse - don't revoke blob URLs!)
   * @param {string} regionId - Region ID
   * @param {number} widgetIndex - Widget index
   */
  async stopWidget(regionId, widgetIndex) {
    const region = this.regions.get(regionId);
    if (!region) return;

    const widget = region.widgets[widgetIndex];
    if (!widget) return;

    // Get widget element from reuse cache
    const widgetElement = region.widgetElements.get(widget.id);
    if (!widgetElement) return;

    // Apply out transition
    if (widget.transitions.out) {
      const animation = Transitions.apply(
        widgetElement,
        widget.transitions.out,
        false,
        region.width,
        region.height
      );

      if (animation) {
        await new Promise(resolve => {
          animation.onfinish = resolve;
        });
      }
    }

    // Pause media elements (but DON'T revoke URLs - element will be reused!)
    const videoEl = widgetElement.querySelector('video');
    if (videoEl && widget.options.loop !== '1') {
      videoEl.pause();
      // Keep src intact for next cycle
    }

    const audioEl = widgetElement.querySelector('audio');
    if (audioEl && widget.options.loop !== '1') {
      audioEl.pause();
      // Keep src intact for next cycle
    }

    // Emit widget end event
    this.emit('widgetEnd', {
      widgetId: widget.id,
      regionId,
      layoutId: this.currentLayoutId,
      mediaId: parseInt(widget.fileId || widget.id) || null,
      type: widget.type
    });
  }

  /**
   * Render image widget
   */
  async renderImage(widget, region) {
    const img = document.createElement('img');
    img.className = 'renderer-lite-widget';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.opacity = '0';

    // Get media URL from cache (already pre-fetched!) or fetch on-demand
    const fileId = parseInt(widget.fileId || widget.id);
    let imageSrc = this.mediaUrlCache.get(fileId);

    if (!imageSrc && this.options.getMediaUrl) {
      imageSrc = await this.options.getMediaUrl(fileId);
    } else if (!imageSrc) {
      imageSrc = `${window.location.origin}/player/cache/media/${widget.options.uri}`;
    }

    img.src = imageSrc;
    return img;
  }

  /**
   * Render video widget
   */
  async renderVideo(widget, region) {
    const video = document.createElement('video');
    video.className = 'renderer-lite-widget';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.style.opacity = '1'; // Immediately visible
    video.autoplay = true;
    video.muted = widget.options.mute === '1';
    video.loop = false; // Don't use native loop - we handle it manually to avoid black frames
    video.controls = isDebug(); // Show controls only in debug mode
    video.playsInline = true; // Prevent fullscreen on mobile

    // Handle video end - pause on last frame instead of showing black
    // Widget cycling will restart the video via updateMediaElement()
    video.addEventListener('ended', () => {
      if (widget.options.loop === '1') {
        // For looping videos: seek back to start but stay paused on first frame
        // This avoids black frames - shows first frame until widget cycles
        video.currentTime = 0;
        this.log.info(`Video ${fileId} ended - reset to start, waiting for widget cycle to replay`);
      } else {
        // For non-looping videos: stay paused on last frame
        this.log.info(`Video ${fileId} ended - paused on last frame`);
      }
    });

    // Get media URL from cache (already pre-fetched!) or fetch on-demand
    const fileId = parseInt(widget.fileId || widget.id);
    let videoSrc = this.mediaUrlCache.get(fileId);

    if (!videoSrc && this.options.getMediaUrl) {
      videoSrc = await this.options.getMediaUrl(fileId);
    } else if (!videoSrc) {
      videoSrc = `${window.location.origin}/player/cache/media/${fileId}`;
    }

    video.src = videoSrc;

    // Detect video duration for dynamic layout timing (when useDuration=0)
    video.addEventListener('loadedmetadata', () => {
      const videoDuration = Math.floor(video.duration);
      this.log.info(`Video ${fileId} duration detected: ${videoDuration}s`);

      // If widget has useDuration=0, update widget duration with actual video length
      if (widget.duration === 0 || widget.useDuration === 0) {
        widget.duration = videoDuration;
        this.log.info(`Updated widget ${widget.id} duration to ${videoDuration}s (useDuration=0)`);

        // Recalculate layout duration if needed
        this.updateLayoutDuration();
      }
    });

    // Debug video loading
    video.addEventListener('loadeddata', () => {
      this.log.info('Video loaded and ready:', fileId);
    });

    // Handle video errors
    video.addEventListener('error', (e) => {
      const error = video.error;
      const errorCode = error?.code;
      const errorMessage = error?.message || 'Unknown error';

      // Log all video errors for debugging, but never show to users
      // These are often transient codec warnings that don't prevent playback
      this.log.warn(`Video error (non-fatal, logged only): ${fileId}, code: ${errorCode}, time: ${video.currentTime.toFixed(1)}s, message: ${errorMessage}`);

      // Do NOT emit error events - video errors are logged but not surfaced to UI
      // Video will either recover (transient decode error) or fail completely (handled elsewhere)
    });

    video.addEventListener('playing', () => {
      this.log.info('Video playing:', fileId);
    });

    this.log.info('Video element created:', fileId, video.src);

    return video;
  }

  /**
   * Render audio widget
   */
  async renderAudio(widget, region) {
    const container = document.createElement('div');
    container.className = 'renderer-lite-widget audio-widget';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    container.style.opacity = '0';

    // Audio element
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.loop = widget.options.loop === '1';
    audio.volume = parseFloat(widget.options.volume || '100') / 100;

    // Get media URL from cache (already pre-fetched!) or fetch on-demand
    const fileId = parseInt(widget.fileId || widget.id);
    let audioSrc = this.mediaUrlCache.get(fileId);

    if (!audioSrc && this.options.getMediaUrl) {
      audioSrc = await this.options.getMediaUrl(fileId);
    } else if (!audioSrc) {
      audioSrc = `${window.location.origin}/player/cache/media/${fileId}`;
    }

    audio.src = audioSrc;

    // Visual feedback
    const icon = document.createElement('div');
    icon.innerHTML = '♪';
    icon.style.fontSize = '120px';
    icon.style.color = 'white';
    icon.style.marginBottom = '20px';

    const info = document.createElement('div');
    info.style.color = 'white';
    info.style.fontSize = '24px';
    info.textContent = 'Playing Audio';

    const filename = document.createElement('div');
    filename.style.color = 'rgba(255,255,255,0.7)';
    filename.style.fontSize = '16px';
    filename.style.marginTop = '10px';
    filename.textContent = widget.options.uri;

    container.appendChild(audio);
    container.appendChild(icon);
    container.appendChild(info);
    container.appendChild(filename);

    return container;
  }

  /**
   * Render text/ticker widget
   */
  async renderTextWidget(widget, region) {
    const iframe = document.createElement('iframe');
    iframe.className = 'renderer-lite-widget';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';

    // Get widget HTML (may return { url } for cache-path loading or string for blob)
    let html = widget.raw;
    if (this.options.getWidgetHtml) {
      const result = await this.options.getWidgetHtml(widget);
      if (result && typeof result === 'object' && result.url) {
        // Use cache URL — SW serves HTML and intercepts sub-resources
        iframe.src = result.url;

        // On hard reload (Ctrl+Shift+R), iframe navigation bypasses SW → server 404
        // Detect and fall back to blob URL with original CMS signed URLs
        if (result.fallback) {
          const self = this;
          iframe.addEventListener('load', function() {
            try {
              // Our cached widget HTML has a <base> tag; server 404 page doesn't
              if (!iframe.contentDocument?.querySelector('base')) {
                console.warn('[RendererLite] Cache URL failed (hard reload?), using original CMS URLs');
                const blob = new Blob([result.fallback], { type: 'text/html' });
                const blobUrl = URL.createObjectURL(blob);
                self.trackBlobUrl(blobUrl);
                iframe.src = blobUrl;
              }
            } catch (e) { /* cross-origin — should not happen */ }
          }, { once: true });
        }

        return iframe;
      }
      html = result;
    }

    // Fallback: Create blob URL for iframe
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    iframe.src = blobUrl;

    // Track blob URL for lifecycle management
    this.trackBlobUrl(blobUrl);

    return iframe;
  }

  /**
   * Render PDF widget
   */
  async renderPdf(widget, region) {
    const container = document.createElement('div');
    container.className = 'renderer-lite-widget pdf-widget';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.backgroundColor = '#525659';
    container.style.opacity = '0';
    container.style.position = 'relative';

    // Load PDF.js if available
    if (typeof window.pdfjsLib === 'undefined') {
      try {
        const pdfjsModule = await import('pdfjs-dist');
        window.pdfjsLib = pdfjsModule;
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/player/pdf.worker.min.mjs`;
      } catch (error) {
        this.log.error('PDF.js not available:', error);
        container.innerHTML = '<div style="color:white;padding:20px;text-align:center;">PDF viewer unavailable</div>';
        container.style.opacity = '1';
        return container;
      }
    }

    // Get PDF URL from cache (already pre-fetched!) or fetch on-demand
    const fileId = parseInt(widget.fileId || widget.id);
    let pdfUrl = this.mediaUrlCache.get(fileId);

    if (!pdfUrl && this.options.getMediaUrl) {
      pdfUrl = await this.options.getMediaUrl(fileId);
    } else if (!pdfUrl) {
      pdfUrl = `${window.location.origin}/player/cache/media/${widget.options.uri}`;
    }

    // Render PDF
    try {
      const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); // Render first page

      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        region.width / viewport.width,
        region.height / viewport.height
      );
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      canvas.style.display = 'block';
      canvas.style.margin = 'auto';

      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport: scaledViewport }).promise;

      container.appendChild(canvas);

    } catch (error) {
      this.log.error('PDF render failed:', error);
      container.innerHTML = '<div style="color:white;padding:20px;text-align:center;">Failed to load PDF</div>';
    }

    container.style.opacity = '1';
    return container;
  }

  /**
   * Render webpage widget
   */
  async renderWebpage(widget, region) {
    const iframe = document.createElement('iframe');
    iframe.className = 'renderer-lite-widget';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.src = widget.options.uri;

    return iframe;
  }

  /**
   * Render generic widget (clock, calendar, weather, etc.)
   */
  async renderGenericWidget(widget, region) {
    const iframe = document.createElement('iframe');
    iframe.className = 'renderer-lite-widget';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';

    // Get widget HTML (may return { url } for cache-path loading or string for blob)
    let html = widget.raw;
    if (this.options.getWidgetHtml) {
      const result = await this.options.getWidgetHtml(widget);
      if (result && typeof result === 'object' && result.url) {
        // Use cache URL — SW serves HTML and intercepts sub-resources
        iframe.src = result.url;

        // On hard reload (Ctrl+Shift+R), iframe navigation bypasses SW → server 404
        // Detect and fall back to blob URL with original CMS signed URLs
        if (result.fallback) {
          const self = this;
          iframe.addEventListener('load', function() {
            try {
              // Our cached widget HTML has a <base> tag; server 404 page doesn't
              if (!iframe.contentDocument?.querySelector('base')) {
                console.warn('[RendererLite] Cache URL failed (hard reload?), using original CMS URLs');
                const blob = new Blob([result.fallback], { type: 'text/html' });
                const blobUrl = URL.createObjectURL(blob);
                self.trackBlobUrl(blobUrl);
                iframe.src = blobUrl;
              }
            } catch (e) { /* cross-origin — should not happen */ }
          }, { once: true });
        }

        return iframe;
      }
      html = result;
    }

    if (html) {
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      iframe.src = blobUrl;

      // Track blob URL for lifecycle management
      this.trackBlobUrl(blobUrl);
    } else {
      this.log.warn(`No HTML for widget ${widget.id}`);
      iframe.srcdoc = '<div style="padding:20px;">Widget content unavailable</div>';
    }

    return iframe;
  }

  /**
   * Check if all regions have completed one full cycle
   * This is informational only - layout timer is authoritative
   */
  checkLayoutComplete() {
    // Check if all regions with multiple widgets have completed one cycle
    let allComplete = true;
    for (const [regionId, region] of this.regions) {
      // Only check multi-widget regions
      if (region.widgets.length > 1 && !region.complete) {
        allComplete = false;
        break;
      }
    }

    if (allComplete && this.currentLayoutId) {
      this.log.info(`All multi-widget regions completed one cycle`);
      // NOTE: We DON'T emit layoutEnd here - layout timer is authoritative
      // This is just informational logging for debugging
    }
  }

  /**
   * Stop current layout
   */
  stopCurrentLayout() {
    if (!this.currentLayout) return;

    this.log.info(`Stopping layout ${this.currentLayoutId}`);

    // Clear layout timer
    if (this.layoutTimer) {
      clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }

    // Revoke all blob URLs for this layout (tracked lifecycle management)
    if (this.currentLayoutId) {
      this.revokeBlobUrlsForLayout(this.currentLayoutId);
    }

    // Stop all regions
    for (const [regionId, region] of this.regions) {
      if (region.timer) {
        clearTimeout(region.timer);
        region.timer = null;
      }

      // Stop current widget
      if (region.widgets.length > 0) {
        this.stopWidget(regionId, region.currentIndex);
      }

      // Remove region element
      region.element.remove();
    }

    // Revoke media blob URLs from cache
    for (const [fileId, blobUrl] of this.mediaUrlCache) {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    }

    // Clear state
    this.regions.clear();
    this.mediaUrlCache.clear();

    // Emit layout end event
    if (this.currentLayoutId) {
      this.emit('layoutEnd', this.currentLayoutId);
    }

    this.currentLayout = null;
    this.currentLayoutId = null;
  }

  /**
   * Render an overlay layout on top of the main layout
   * @param {string} xlfXml - XLF XML content for overlay
   * @param {number} layoutId - Overlay layout ID
   * @param {number} priority - Overlay priority (higher = on top)
   * @returns {Promise<void>}
   */
  async renderOverlay(xlfXml, layoutId, priority = 0) {
    try {
      this.log.info(`Rendering overlay ${layoutId} (priority ${priority})`);

      // Check if this overlay is already active
      if (this.activeOverlays.has(layoutId)) {
        this.log.warn(`Overlay ${layoutId} already active, skipping`);
        return;
      }

      // Parse XLF
      const layout = this.parseXlf(xlfXml);

      // Create overlay container
      const overlayDiv = document.createElement('div');
      overlayDiv.id = `overlay_${layoutId}`;
      overlayDiv.className = 'renderer-lite-overlay';
      overlayDiv.style.position = 'absolute';
      overlayDiv.style.top = '0';
      overlayDiv.style.left = '0';
      overlayDiv.style.width = '100%';
      overlayDiv.style.height = '100%';
      overlayDiv.style.zIndex = String(1000 + priority); // Higher priority = higher z-index
      overlayDiv.style.pointerEvents = 'auto'; // Enable clicks on overlay
      overlayDiv.style.backgroundColor = layout.bgcolor;

      // Pre-fetch all media URLs for overlay
      if (this.options.getMediaUrl) {
        const mediaPromises = [];
        for (const region of layout.regions) {
          for (const widget of region.widgets) {
            if (widget.fileId) {
              const fileId = parseInt(widget.fileId || widget.id);
              if (!this.mediaUrlCache.has(fileId)) {
                mediaPromises.push(
                  this.options.getMediaUrl(fileId)
                    .then(url => {
                      this.mediaUrlCache.set(fileId, url);
                    })
                    .catch(err => {
                      this.log.warn(`Failed to fetch overlay media ${fileId}:`, err);
                    })
                );
              }
            }
          }
        }

        if (mediaPromises.length > 0) {
          this.log.info(`Pre-fetching ${mediaPromises.length} overlay media URLs...`);
          await Promise.all(mediaPromises);
        }
      }

      // Create regions for overlay
      const overlayRegions = new Map();
      for (const regionConfig of layout.regions) {
        const regionEl = document.createElement('div');
        regionEl.id = `overlay_${layoutId}_region_${regionConfig.id}`;
        regionEl.className = 'renderer-lite-region overlay-region';
        regionEl.style.position = 'absolute';
        regionEl.style.left = `${regionConfig.left}px`;
        regionEl.style.top = `${regionConfig.top}px`;
        regionEl.style.width = `${regionConfig.width}px`;
        regionEl.style.height = `${regionConfig.height}px`;
        regionEl.style.zIndex = String(regionConfig.zindex);
        regionEl.style.overflow = 'hidden';

        overlayDiv.appendChild(regionEl);

        // Store region state
        overlayRegions.set(regionConfig.id, {
          element: regionEl,
          config: regionConfig,
          widgets: regionConfig.widgets,
          currentIndex: 0,
          timer: null,
          width: regionConfig.width,
          height: regionConfig.height,
          complete: false,
          widgetElements: new Map()
        });
      }

      // Pre-create widget elements for overlay
      for (const [regionId, region] of overlayRegions) {
        for (const widget of region.widgets) {
          widget.layoutId = layoutId;
          widget.regionId = regionId;

          try {
            const element = await this.createWidgetElement(widget, region);
            element.style.visibility = 'hidden';
            element.style.opacity = '0';
            region.element.appendChild(element);
            region.widgetElements.set(widget.id, element);
          } catch (error) {
            this.log.error(`Failed to pre-create overlay widget ${widget.id}:`, error);
          }
        }
      }

      // Add overlay to container
      this.overlayContainer.appendChild(overlayDiv);

      // Store overlay state
      this.activeOverlays.set(layoutId, {
        container: overlayDiv,
        layout: layout,
        regions: overlayRegions,
        timer: null,
        priority: priority
      });

      // Emit overlay start event
      this.emit('overlayStart', layoutId, layout);

      // Start all overlay regions
      for (const [regionId, region] of overlayRegions) {
        this.startOverlayRegion(layoutId, regionId);
      }

      // Set overlay timer based on duration
      if (layout.duration > 0) {
        const durationMs = layout.duration * 1000;
        const overlayState = this.activeOverlays.get(layoutId);
        if (overlayState) {
          overlayState.timer = setTimeout(() => {
            this.log.info(`Overlay ${layoutId} duration expired (${layout.duration}s)`);
            this.emit('overlayEnd', layoutId);
          }, durationMs);
        }
      }

      this.log.info(`Overlay ${layoutId} started`);

    } catch (error) {
      this.log.error('Error rendering overlay:', error);
      this.emit('error', { type: 'overlayError', error, layoutId });
      throw error;
    }
  }

  /**
   * Start playing an overlay region's widgets
   * @param {number} overlayId - Overlay layout ID
   * @param {string} regionId - Region ID
   */
  startOverlayRegion(overlayId, regionId) {
    const overlayState = this.activeOverlays.get(overlayId);
    if (!overlayState) return;

    const region = overlayState.regions.get(regionId);
    if (!region || region.widgets.length === 0) {
      return;
    }

    // If only one widget, just render it (no cycling)
    if (region.widgets.length === 1) {
      this.renderOverlayWidget(overlayId, regionId, 0);
      return;
    }

    // Multiple widgets - cycle through them
    const playNext = () => {
      const widgetIndex = region.currentIndex;
      const widget = region.widgets[widgetIndex];

      // Render widget
      this.renderOverlayWidget(overlayId, regionId, widgetIndex);

      // Schedule next widget
      const duration = widget.duration * 1000;
      region.timer = setTimeout(() => {
        this.stopOverlayWidget(overlayId, regionId, widgetIndex);

        // Move to next widget (wraps to 0 if at end)
        const nextIndex = (region.currentIndex + 1) % region.widgets.length;

        // Check if completing full cycle (wrapped back to 0)
        if (nextIndex === 0 && !region.complete) {
          region.complete = true;
          this.log.info(`Overlay ${overlayId} region ${regionId} completed one full cycle`);
        }

        region.currentIndex = nextIndex;
        playNext();
      }, duration);
    };

    playNext();
  }

  /**
   * Render a widget in an overlay region
   * @param {number} overlayId - Overlay layout ID
   * @param {string} regionId - Region ID
   * @param {number} widgetIndex - Widget index in region
   */
  async renderOverlayWidget(overlayId, regionId, widgetIndex) {
    const overlayState = this.activeOverlays.get(overlayId);
    if (!overlayState) return;

    const region = overlayState.regions.get(regionId);
    if (!region) return;

    const widget = region.widgets[widgetIndex];
    if (!widget) return;

    try {
      this.log.info(`Showing overlay widget ${widget.type} (${widget.id}) in overlay ${overlayId} region ${regionId}`);

      // Get existing element (pre-created)
      let element = region.widgetElements.get(widget.id);

      if (!element) {
        this.log.warn(`Overlay widget ${widget.id} not pre-created, creating now`);
        element = await this.createWidgetElement(widget, region);
        region.widgetElements.set(widget.id, element);
        region.element.appendChild(element);
      }

      // Hide all other widgets in region
      for (const [widgetId, widgetEl] of region.widgetElements) {
        if (widgetId !== widget.id) {
          widgetEl.style.visibility = 'hidden';
          widgetEl.style.opacity = '0';
        }
      }

      // Update media element if needed (restart videos)
      this.updateMediaElement(element, widget);

      // Show this widget
      element.style.visibility = 'visible';

      // Apply in transition
      if (widget.transitions.in) {
        Transitions.apply(element, widget.transitions.in, true, region.width, region.height);
      } else {
        element.style.opacity = '1';
      }

      // Emit widget start event
      this.emit('overlayWidgetStart', {
        overlayId,
        widgetId: widget.id,
        regionId,
        type: widget.type,
        duration: widget.duration
      });

    } catch (error) {
      this.log.error(`Error rendering overlay widget:`, error);
      this.emit('error', { type: 'overlayWidgetError', error, widgetId: widget.id, regionId, overlayId });
    }
  }

  /**
   * Stop an overlay widget
   * @param {number} overlayId - Overlay layout ID
   * @param {string} regionId - Region ID
   * @param {number} widgetIndex - Widget index
   */
  async stopOverlayWidget(overlayId, regionId, widgetIndex) {
    const overlayState = this.activeOverlays.get(overlayId);
    if (!overlayState) return;

    const region = overlayState.regions.get(regionId);
    if (!region) return;

    const widget = region.widgets[widgetIndex];
    if (!widget) return;

    const widgetElement = region.widgetElements.get(widget.id);
    if (!widgetElement) return;

    // Apply out transition
    if (widget.transitions.out) {
      const animation = Transitions.apply(
        widgetElement,
        widget.transitions.out,
        false,
        region.width,
        region.height
      );

      if (animation) {
        await new Promise(resolve => {
          animation.onfinish = resolve;
        });
      }
    }

    // Pause media elements
    const videoEl = widgetElement.querySelector('video');
    if (videoEl && widget.options.loop !== '1') {
      videoEl.pause();
    }

    const audioEl = widgetElement.querySelector('audio');
    if (audioEl && widget.options.loop !== '1') {
      audioEl.pause();
    }

    // Emit widget end event
    this.emit('overlayWidgetEnd', {
      overlayId,
      widgetId: widget.id,
      regionId,
      type: widget.type
    });
  }

  /**
   * Stop and remove an overlay layout
   * @param {number} layoutId - Overlay layout ID
   */
  stopOverlay(layoutId) {
    const overlayState = this.activeOverlays.get(layoutId);
    if (!overlayState) {
      this.log.warn(`Overlay ${layoutId} not active`);
      return;
    }

    this.log.info(`Stopping overlay ${layoutId}`);

    // Clear overlay timer
    if (overlayState.timer) {
      clearTimeout(overlayState.timer);
      overlayState.timer = null;
    }

    // Stop all overlay regions
    for (const [regionId, region] of overlayState.regions) {
      if (region.timer) {
        clearTimeout(region.timer);
        region.timer = null;
      }

      // Stop current widget
      if (region.widgets.length > 0) {
        this.stopOverlayWidget(layoutId, regionId, region.currentIndex);
      }
    }

    // Remove overlay container from DOM
    if (overlayState.container) {
      overlayState.container.remove();
    }

    // Revoke blob URLs for this overlay
    this.revokeBlobUrlsForLayout(layoutId);

    // Remove from active overlays
    this.activeOverlays.delete(layoutId);

    // Emit overlay end event
    this.emit('overlayEnd', layoutId);

    this.log.info(`Overlay ${layoutId} stopped`);
  }

  /**
   * Stop all active overlays
   */
  stopAllOverlays() {
    const overlayIds = Array.from(this.activeOverlays.keys());
    for (const overlayId of overlayIds) {
      this.stopOverlay(overlayId);
    }
    this.log.info('All overlays stopped');
  }

  /**
   * Get active overlay IDs
   * @returns {Array<number>}
   */
  getActiveOverlays() {
    return Array.from(this.activeOverlays.keys());
  }

  /**
   * Cleanup renderer
   */
  cleanup() {
    this.stopAllOverlays();
    this.stopCurrentLayout();
    this.container.innerHTML = '';
    this.log.info('Cleaned up');
  }
}
