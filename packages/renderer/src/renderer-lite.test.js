/**
 * RendererLite Test Suite
 *
 * Comprehensive tests for XLF rendering, element reuse, transitions,
 * and memory management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RendererLite } from './renderer-lite.js';

describe('RendererLite', () => {
  let container;
  let renderer;
  let mockGetMediaUrl;
  let mockGetWidgetHtml;

  beforeEach(() => {
    // Create test container
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    // Mock URL.createObjectURL and URL.revokeObjectURL (not available in jsdom)
    if (!global.URL.createObjectURL) {
      global.URL.createObjectURL = vi.fn((blob) => `blob:test-${Math.random()}`);
    }
    if (!global.URL.revokeObjectURL) {
      global.URL.revokeObjectURL = vi.fn();
    }

    // Mock callbacks
    mockGetMediaUrl = vi.fn((fileId) => Promise.resolve(`blob://test-${fileId}`));
    mockGetWidgetHtml = vi.fn((widget) => Promise.resolve(`<html>Widget ${widget.id}</html>`));

    // Create renderer instance
    renderer = new RendererLite(
      { cmsUrl: 'https://test.com', hardwareKey: 'test-key' },
      container,
      {
        getMediaUrl: mockGetMediaUrl,
        getWidgetHtml: mockGetWidgetHtml
      }
    );
  });

  afterEach(() => {
    // Cleanup
    renderer.cleanup();
    container.remove();
  });

  describe('XLF Parsing', () => {
    it('should parse valid XLF with layout attributes', () => {
      const xlf = `
        <layout width="1920" height="1080" duration="60" bgcolor="#000000">
          <region id="r1" width="1920" height="1080" top="0" left="0" zindex="0">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>test.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      const layout = renderer.parseXlf(xlf);

      expect(layout.width).toBe(1920);
      expect(layout.height).toBe(1080);
      expect(layout.duration).toBe(60);
      expect(layout.bgcolor).toBe('#000000');
      expect(layout.regions).toHaveLength(1);
    });

    it('should use defaults when attributes missing', () => {
      const xlf = `<layout><region id="r1"></region></layout>`;
      const layout = renderer.parseXlf(xlf);

      expect(layout.width).toBe(1920);
      expect(layout.height).toBe(1080);
      expect(layout.duration).toBeGreaterThanOrEqual(0); // Calculated or default
      expect(layout.bgcolor).toBe('#000000');
    });

    it('should parse multiple regions', () => {
      const xlf = `
        <layout>
          <region id="r1" width="960" height="1080" top="0" left="0"></region>
          <region id="r2" width="960" height="1080" top="0" left="960"></region>
        </layout>
      `;

      const layout = renderer.parseXlf(xlf);
      expect(layout.regions).toHaveLength(2);
      expect(layout.regions[0].id).toBe('r1');
      expect(layout.regions[1].id).toBe('r2');
    });

    it('should parse widget with all attributes', () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="video" duration="30" useDuration="0" fileId="5">
              <options>
                <uri>test.mp4</uri>
                <loop>1</loop>
                <mute>0</mute>
              </options>
              <raw>Some content</raw>
            </media>
          </region>
        </layout>
      `;

      const layout = renderer.parseXlf(xlf);
      const widget = layout.regions[0].widgets[0];

      expect(widget.type).toBe('video');
      expect(widget.duration).toBe(30);
      expect(widget.useDuration).toBe(0);
      expect(widget.id).toBe('m1');
      expect(widget.fileId).toBe('5');
      expect(widget.options.uri).toBe('test.mp4');
      expect(widget.options.loop).toBe('1');
      expect(widget.raw).toBe('Some content');
    });

    it('should parse transitions', () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10">
              <options>
                <transIn>fadeIn</transIn>
                <transInDuration>2000</transInDuration>
                <transOut>flyOut</transOut>
                <transOutDuration>1500</transOutDuration>
                <transOutDirection>S</transOutDirection>
              </options>
            </media>
          </region>
        </layout>
      `;

      const layout = renderer.parseXlf(xlf);
      const widget = layout.regions[0].widgets[0];

      expect(widget.transitions.in).toEqual({
        type: 'fadeIn',
        duration: 2000,
        direction: 'N'
      });

      expect(widget.transitions.out).toEqual({
        type: 'flyOut',
        duration: 1500,
        direction: 'S'
      });
    });
  });

  describe('Region Creation', () => {
    it('should create region element with correct positioning', async () => {
      const regionConfig = {
        id: 'r1',
        width: 960,
        height: 540,
        top: 100,
        left: 200,
        zindex: 5,
        widgets: []
      };

      await renderer.createRegion(regionConfig);

      const regionEl = container.querySelector('#region_r1');
      expect(regionEl).toBeTruthy();
      expect(regionEl.style.position).toBe('absolute');
      expect(regionEl.style.width).toBe('960px');
      expect(regionEl.style.height).toBe('540px');
      expect(regionEl.style.top).toBe('100px');
      expect(regionEl.style.left).toBe('200px');
      expect(regionEl.style.zIndex).toBe('5');
    });

    it('should store region state in Map', async () => {
      const regionConfig = {
        id: 'r1',
        width: 1920,
        height: 1080,
        top: 0,
        left: 0,
        zindex: 0,
        widgets: []
      };

      await renderer.createRegion(regionConfig);

      const region = renderer.regions.get('r1');
      expect(region).toBeTruthy();
      expect(region.config).toEqual(regionConfig);
      expect(region.currentIndex).toBe(0);
      expect(region.widgetElements).toBeInstanceOf(Map);
    });
  });

  describe('Widget Element Creation', () => {
    it('should create image widget element', async () => {
      const widget = {
        type: 'image',
        id: 'm1',
        fileId: '1',
        options: { uri: 'test.png' },
        duration: 10,
        transitions: { in: null, out: null }
      };

      const region = { width: 1920, height: 1080 };
      const element = await renderer.renderImage(widget, region);

      expect(element.tagName).toBe('IMG');
      expect(element.className).toBe('renderer-lite-widget');
      expect(element.style.width).toBe('100%');
      expect(element.style.height).toBe('100%');
      expect(mockGetMediaUrl).toHaveBeenCalledWith(1);
    });

    it('should create video widget element', async () => {
      const widget = {
        type: 'video',
        id: 'm2',
        fileId: '5',
        options: { uri: '5.mp4', loop: '1', mute: '1' },
        duration: 30,
        transitions: { in: null, out: null }
      };

      const region = { width: 1920, height: 1080 };
      const element = await renderer.renderVideo(widget, region);

      expect(element.tagName).toBe('VIDEO');
      expect(element.autoplay).toBe(true);
      expect(element.muted).toBe(true);
      // loop is intentionally false - handled manually via 'ended' event to avoid black frames
      expect(element.loop).toBe(false);
      expect(mockGetMediaUrl).toHaveBeenCalledWith(5);
    });

    it('should create text widget with iframe (blob fallback)', async () => {
      const widget = {
        type: 'text',
        id: 'm3',
        layoutId: 1,
        regionId: 'r1',
        options: {},
        raw: '<h1>Test</h1>',
        duration: 15,
        transitions: { in: null, out: null }
      };

      const region = { width: 1920, height: 1080 };
      const element = await renderer.renderTextWidget(widget, region);

      expect(element.tagName).toBe('IFRAME');
      expect(element.src).toContain('blob:');
      expect(mockGetWidgetHtml).toHaveBeenCalledWith(widget);
    });

    it('should use cache URL when getWidgetHtml returns { url }', async () => {
      // Override mock to return { url } object (cache path)
      mockGetWidgetHtml.mockResolvedValueOnce({ url: '/player/pwa/cache/widget/1/r1/m4' });

      const widget = {
        type: 'text',
        id: 'm4',
        layoutId: 1,
        regionId: 'r1',
        options: {},
        raw: '<h1>Test</h1>',
        duration: 15,
        transitions: { in: null, out: null }
      };

      const region = { width: 1920, height: 1080 };
      const element = await renderer.renderTextWidget(widget, region);

      expect(element.tagName).toBe('IFRAME');
      // Should use cache URL directly, NOT blob URL
      expect(element.src).toContain('/player/pwa/cache/widget/1/r1/m4');
      expect(element.src).not.toContain('blob:');
      expect(mockGetWidgetHtml).toHaveBeenCalledWith(widget);
    });

    it('should use cache URL for generic widget when getWidgetHtml returns { url }', async () => {
      mockGetWidgetHtml.mockResolvedValueOnce({ url: '/player/pwa/cache/widget/1/r1/m5' });

      const widget = {
        type: 'clock',
        id: 'm5',
        layoutId: 1,
        regionId: 'r1',
        options: {},
        raw: '<div>Clock</div>',
        duration: 10,
        transitions: { in: null, out: null }
      };

      const region = { width: 1920, height: 1080 };
      const element = await renderer.renderGenericWidget(widget, region);

      expect(element.tagName).toBe('IFRAME');
      expect(element.src).toContain('/player/pwa/cache/widget/1/r1/m5');
      expect(element.src).not.toContain('blob:');
    });
  });

  describe('Element Reuse Pattern', () => {
    it('should pre-create all widget elements on layout load', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
            <media id="m2" type="image" duration="10" fileId="2">
              <options><uri>2.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);

      const region = renderer.regions.get('r1');
      expect(region.widgetElements.size).toBe(2);
      expect(region.widgetElements.has('m1')).toBe(true);
      expect(region.widgetElements.has('m2')).toBe(true);
    });

    it('should reuse elements on widget cycling', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="1" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);

      const region = renderer.regions.get('r1');
      const firstElement = region.widgetElements.get('m1');

      // Render widget again
      await renderer.renderWidget('r1', 0);

      const secondElement = region.widgetElements.get('m1');

      // Should be SAME element reference (reused)
      expect(secondElement).toBe(firstElement);
    });

    it('should reuse elements on layout replay', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="video" duration="5" fileId="5">
              <options><uri>5.mp4</uri></options>
            </media>
          </region>
        </layout>
      `;

      // First render
      await renderer.renderLayout(xlf, 1);
      const region1 = renderer.regions.get('r1');
      const element1 = region1.widgetElements.get('m1');

      // Replay same layout (simulating layoutEnd → collect → renderLayout)
      renderer.stopCurrentLayout = vi.fn(); // Mock to verify it's NOT called
      await renderer.renderLayout(xlf, 1);

      const region2 = renderer.regions.get('r1');
      const element2 = region2.widgetElements.get('m1');

      // stopCurrentLayout should NOT be called (elements reused)
      expect(renderer.stopCurrentLayout).not.toHaveBeenCalled();

      // Elements should be reused
      expect(element2).toBe(element1);
    });

    it('should NOT reuse elements on layout switch', async () => {
      const xlf1 = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      const xlf2 = `
        <layout>
          <region id="r1">
            <media id="m2" type="image" duration="10" fileId="2">
              <options><uri>2.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      // Render layout 1
      await renderer.renderLayout(xlf1, 1);
      const region1 = renderer.regions.get('r1');
      const element1 = region1?.widgetElements.get('m1');

      // Switch to layout 2
      await renderer.renderLayout(xlf2, 2);
      const region2 = renderer.regions.get('r1');
      const element2 = region2?.widgetElements.get('m2');

      // Elements should be different (new layout, new elements)
      expect(element1).toBeTruthy();
      expect(element2).toBeTruthy();
      expect(element1).not.toBe(element2);

      // Old region should be cleared
      expect(region1).not.toBe(region2);
    });
  });

  describe('Video Duration Detection', () => {
    // Skip: jsdom doesn't support real video element properties
    it.skip('should detect video duration from metadata', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="video" duration="0" useDuration="0" fileId="5">
              <options><uri>5.mp4</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);

      // Mock video element with duration
      const region = renderer.regions.get('r1');
      const videoElement = region.widgetElements.get('m1');
      const video = videoElement.querySelector('video');

      // Simulate loadedmetadata event
      Object.defineProperty(video, 'duration', { value: 45.5, writable: false });
      video.dispatchEvent(new Event('loadedmetadata'));

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10));

      // Widget duration should be updated
      const widget = region.widgets[0];
      expect(widget.duration).toBe(45); // Floor of 45.5
    });

    // Skip: jsdom doesn't support real video element properties
    it.skip('should update layout duration when video metadata loads', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="video" duration="0" useDuration="0" fileId="5">
              <options><uri>5.mp4</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);

      const region = renderer.regions.get('r1');
      const videoElement = region.widgetElements.get('m1');
      const video = videoElement.querySelector('video');

      // Simulate video with 45s duration
      Object.defineProperty(video, 'duration', { value: 45, writable: false });
      video.dispatchEvent(new Event('loadedmetadata'));

      await new Promise(resolve => setTimeout(resolve, 10));

      // Layout duration should be updated
      expect(renderer.currentLayout.duration).toBe(45);
    });

    // Skip: jsdom doesn't support real video element properties
    it.skip('should NOT update duration when useDuration=1', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="video" duration="30" useDuration="1" fileId="5">
              <options><uri>5.mp4</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);

      const region = renderer.regions.get('r1');
      const videoElement = region.widgetElements.get('m1');
      const video = videoElement.querySelector('video');

      // Simulate video with 45s duration
      Object.defineProperty(video, 'duration', { value: 45, writable: false });
      video.dispatchEvent(new Event('loadedmetadata'));

      await new Promise(resolve => setTimeout(resolve, 10));

      // Widget duration should stay 30 (useDuration=1 overrides)
      const widget = region.widgets[0];
      expect(widget.duration).toBe(30);
    });
  });

  describe('Media Element Restart', () => {
    // Skip: jsdom video elements don't support currentTime properly
    it.skip('should restart video on updateMediaElement()', async () => {
      const widget = {
        type: 'video',
        id: 'm1',
        fileId: '5',
        options: { loop: '0', mute: '1' },
        duration: 30
      };

      const region = { width: 1920, height: 1080 };
      const element = await renderer.renderVideo(widget, region);
      const video = element.querySelector('video');

      // Mock video methods
      video.currentTime = 25.5;
      video.play = vi.fn(() => Promise.resolve());

      // Call updateMediaElement
      renderer.updateMediaElement(element, widget);

      // Should restart from beginning
      expect(video.currentTime).toBe(0);
      expect(video.play).toHaveBeenCalled();
    });

    // Skip: jsdom video elements don't support currentTime properly
    it.skip('should restart looping videos too', async () => {
      const widget = {
        type: 'video',
        id: 'm1',
        fileId: '5',
        options: { loop: '1', mute: '1' }, // Looping video
        duration: 30
      };

      const region = { width: 1920, height: 1080 };
      const element = await renderer.renderVideo(widget, region);
      const video = element.querySelector('video');

      video.currentTime = 10;
      video.play = vi.fn(() => Promise.resolve());

      renderer.updateMediaElement(element, widget);

      // Should STILL restart (even when looping)
      expect(video.currentTime).toBe(0);
      expect(video.play).toHaveBeenCalled();
    });
  });

  describe('Layout Lifecycle', () => {
    it('should emit layoutStart event', async () => {
      const xlf = `<layout><region id="r1"></region></layout>`;
      const layoutStartHandler = vi.fn();

      renderer.on('layoutStart', layoutStartHandler);
      await renderer.renderLayout(xlf, 1);

      expect(layoutStartHandler).toHaveBeenCalledWith(1, expect.any(Object));
    });

    it('should emit layoutEnd event after duration expires', async () => {
      vi.useFakeTimers();

      const xlf = `
        <layout duration="2">
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      const layoutEndHandler = vi.fn();
      renderer.on('layoutEnd', layoutEndHandler);

      // Don't await directly — renderLayout waits for widget readiness (image load
      // or 10s timeout). With fake timers we must advance time to unblock it.
      const renderPromise = renderer.renderLayout(xlf, 1);

      // Advance past the 10s image-ready timeout, flushing microtasks
      await vi.advanceTimersByTimeAsync(10000);
      await renderPromise;

      // Now advance 2s to trigger the layout duration timer
      vi.advanceTimersByTime(2000);

      expect(layoutEndHandler).toHaveBeenCalledWith(1);

      vi.useRealTimers();
    });

    it('should emit widgetStart event', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      const widgetStartHandler = vi.fn();
      renderer.on('widgetStart', widgetStartHandler);

      await renderer.renderLayout(xlf, 1);

      expect(widgetStartHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          widgetId: 'm1',
          regionId: 'r1',
          type: 'image'
        })
      );
    });
  });

  describe('Transitions', () => {
    // Skip: jsdom doesn't support Web Animations API
    it.skip('should apply fade in transition', async () => {
      const element = document.createElement('div');
      element.style.opacity = '0';

      const transition = {
        type: 'fadeIn',
        duration: 1000,
        direction: 'N'
      };

      // Import Transitions utility
      const { Transitions } = await import('./renderer-lite.js');
      const animation = Transitions.apply(element, transition, true, 1920, 1080);

      expect(animation).toBeTruthy();
      expect(animation.effect.getKeyframes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ opacity: '0' }),
          expect.objectContaining({ opacity: '1' })
        ])
      );
    });

    // Skip: jsdom doesn't support Web Animations API
    it.skip('should apply fly out transition with direction', async () => {
      const element = document.createElement('div');

      const transition = {
        type: 'flyOut',
        duration: 1500,
        direction: 'S' // South
      };

      const { Transitions } = await import('./renderer-lite.js');
      const animation = Transitions.apply(element, transition, false, 1920, 1080);

      expect(animation).toBeTruthy();
      const keyframes = animation.effect.getKeyframes();

      // Should translate to south (positive Y)
      expect(keyframes[1].transform).toContain('1080px'); // Height offset
    });
  });

  describe('Memory Management', () => {
    it('should clear mediaUrlCache on layout switch', async () => {
      const xlf1 = `<layout><region id="r1"></region></layout>`;
      const xlf2 = `<layout><region id="r2"></region></layout>`;

      await renderer.renderLayout(xlf1, 1);
      renderer.mediaUrlCache.set(1, 'blob://test-1');

      // Switch to different layout
      await renderer.renderLayout(xlf2, 2);

      // Cache should be cleared
      expect(renderer.mediaUrlCache.size).toBe(0);
    });

    it('should clear regions on stopCurrentLayout', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);
      expect(renderer.regions.size).toBe(1);

      renderer.stopCurrentLayout();

      expect(renderer.regions.size).toBe(0);
      expect(renderer.currentLayout).toBeNull();
      expect(renderer.currentLayoutId).toBeNull();
    });

    it('should clear timers on cleanup', async () => {
      vi.useFakeTimers();

      const xlf = `
        <layout duration="60">
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      // renderLayout waits for widget readiness — advance past image timeout
      const renderPromise = renderer.renderLayout(xlf, 1);
      await vi.advanceTimersByTimeAsync(10000);
      await renderPromise;

      const layoutTimerId = renderer.layoutTimer;
      expect(layoutTimerId).toBeTruthy();

      renderer.stopCurrentLayout();

      expect(renderer.layoutTimer).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('Layout Replay Optimization', () => {
    it('should detect same layout and reuse elements', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      // First render
      await renderer.renderLayout(xlf, 1);
      const region1 = renderer.regions.get('r1');
      const element1 = region1.widgetElements.get('m1');

      // Spy on stopCurrentLayout
      const stopSpy = vi.spyOn(renderer, 'stopCurrentLayout');

      // Replay same layout
      await renderer.renderLayout(xlf, 1);

      // stopCurrentLayout should NOT be called
      expect(stopSpy).not.toHaveBeenCalled();

      // Should reuse same elements
      const region2 = renderer.regions.get('r1');
      const element2 = region2.widgetElements.get('m1');
      expect(element2).toBe(element1);
    });
  });

  describe('Parallel Media Pre-fetch', () => {
    it('should pre-fetch all media URLs in parallel', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="5" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
            <media id="m2" type="video" duration="10" fileId="5">
              <options><uri>5.mp4</uri></options>
            </media>
            <media id="m3" type="image" duration="5" fileId="7">
              <options><uri>7.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);

      // All media URLs should have been fetched
      expect(mockGetMediaUrl).toHaveBeenCalledTimes(3);
      expect(mockGetMediaUrl).toHaveBeenCalledWith(1);
      expect(mockGetMediaUrl).toHaveBeenCalledWith(5);
      expect(mockGetMediaUrl).toHaveBeenCalledWith(7);

      // All should be in cache
      expect(renderer.mediaUrlCache.size).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should emit error event on widget render failure', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="invalid" duration="10">
              <options></options>
            </media>
          </region>
        </layout>
      `;

      const errorHandler = vi.fn();
      renderer.on('error', errorHandler);

      await renderer.renderLayout(xlf, 1);

      // Should handle unknown widget type gracefully
      // (renderGenericWidget fallback)
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should handle missing fileId gracefully', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10">
              <options><uri>missing.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      // Should not throw
      await expect(renderer.renderLayout(xlf, 1)).resolves.not.toThrow();
    });
  });

  describe('Duration Calculation', () => {
    it('should calculate layout duration from widgets when not specified', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
            <media id="m2" type="image" duration="20" fileId="2">
              <options><uri>2.png</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);

      // Duration should be sum of widgets in region: 10 + 20 = 30
      expect(renderer.currentLayout.duration).toBe(30);
    });

    it('should use max region duration for layout', async () => {
      const xlf = `
        <layout>
          <region id="r1">
            <media id="m1" type="image" duration="10" fileId="1">
              <options><uri>1.png</uri></options>
            </media>
          </region>
          <region id="r2">
            <media id="m2" type="video" duration="45" fileId="5">
              <options><uri>5.mp4</uri></options>
            </media>
          </region>
        </layout>
      `;

      await renderer.renderLayout(xlf, 1);

      // Duration should be max(10, 45) = 45
      expect(renderer.currentLayout.duration).toBe(45);
    });
  });
});
