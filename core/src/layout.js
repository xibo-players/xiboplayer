/**
 * Layout translator - XLF to HTML
 * Based on arexibo layout.rs
 */

export class LayoutTranslator {
  constructor(xmds) {
    this.xmds = xmds;
  }

  /**
   * Translate XLF XML to playable HTML
   */
  async translateXLF(layoutId, xlfXml, cacheManager) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xlfXml, 'text/xml');

    const layoutEl = doc.querySelector('layout');
    if (!layoutEl) {
      throw new Error('Invalid XLF: no <layout> element');
    }

    const width = parseInt(layoutEl.getAttribute('width') || '1920');
    const height = parseInt(layoutEl.getAttribute('height') || '1080');
    const bgcolor = layoutEl.getAttribute('bgcolor') || '#000000';

    const regions = [];
    for (const regionEl of doc.querySelectorAll('region')) {
      regions.push(await this.translateRegion(layoutId, regionEl, cacheManager));
    }

    return this.generateHTML(width, height, bgcolor, regions);
  }

  /**
   * Translate a single region
   */
  async translateRegion(layoutId, regionEl, cacheManager) {
    const id = regionEl.getAttribute('id');
    const width = parseInt(regionEl.getAttribute('width'));
    const height = parseInt(regionEl.getAttribute('height'));
    const top = parseInt(regionEl.getAttribute('top'));
    const left = parseInt(regionEl.getAttribute('left'));
    const zindex = parseInt(regionEl.getAttribute('zindex') || '0');

    const media = [];
    for (const mediaEl of regionEl.querySelectorAll('media')) {
      media.push(await this.translateMedia(layoutId, id, mediaEl, cacheManager));
    }

    return {
      id,
      width,
      height,
      top,
      left,
      zindex,
      media
    };
  }

  /**
   * Translate a single media item
   */
  async translateMedia(layoutId, regionId, mediaEl, cacheManager) {
    const type = mediaEl.getAttribute('type');
    const duration = parseInt(mediaEl.getAttribute('duration') || '10');
    const id = mediaEl.getAttribute('id');

    const optionsEl = mediaEl.querySelector('options');
    const rawEl = mediaEl.querySelector('raw');

    const options = {};
    if (optionsEl) {
      for (const child of optionsEl.children) {
        options[child.tagName] = child.textContent;
      }
    }

    // Check if this media is a streaming file (large video not fully cached)
    // MUST be AFTER options are populated to access options.uri
    if (type === 'video' && options.uri && cacheManager) {
      // Look up by filename, not media ID (IDs don't match between XLF and RequiredFiles)
      const filename = options.uri; // e.g., "2.mp4"
      console.log(`[Layout] Checking if video ${filename} (media ${id}) is streaming file...`);

      // Get all files and find by matching path/filename
      const allFiles = await cacheManager.getAllFiles();
      const streamingFile = allFiles.find(f =>
        f.isStreaming && (f.path?.includes(filename) || f.downloadUrl?.includes(filename))
      );

      console.log(`[Layout] Streaming file search for ${filename}:`, streamingFile ? 'FOUND' : 'not found');

      if (streamingFile && streamingFile.downloadUrl) {
        options.streamingUrl = streamingFile.downloadUrl;
        console.log(`[Layout] ✓ Video ${filename} will stream from server:`, streamingFile.downloadUrl);
      } else {
        console.log(`[Layout] Video ${filename} will use cache URL`);
      }
    }

    let raw = rawEl ? rawEl.textContent : '';

    // For widgets (clock, calendar, etc.), fetch rendered HTML from CMS
    const widgetTypes = ['clock', 'clock-digital', 'clock-analogue', 'calendar', 'weather',
                         'currencies', 'stocks', 'twitter', 'global', 'embedded', 'text', 'ticker'];
    if (widgetTypes.some(w => type.includes(w))) {
      try {
        console.log(`[Layout] Fetching resource for ${type} widget (layout=${layoutId}, region=${regionId}, media=${id})`);
        raw = await this.xmds.getResource(layoutId, regionId, id);
        console.log(`[Layout] Got resource HTML (${raw.length} chars)`);

        // Store widget HTML in cache and save cache key for iframe src generation
        const widgetCacheKey = await cacheManager.cacheWidgetHtml(layoutId, regionId, id, raw);
        options.widgetCacheKey = widgetCacheKey;
      } catch (error) {
        console.error(`[Layout] Failed to get resource for ${type}:`, error);
        raw = `<div>Widget ${type} unavailable</div>`;
      }
    }

    return {
      type,
      duration,
      id,
      options,
      raw
    };
  }

  /**
   * Generate HTML from parsed layout
   */
  generateHTML(width, height, bgcolor, regions) {
    const regionHTML = regions.map(r => this.generateRegionHTML(r)).join('\n');
    const regionJS = regions.map(r => this.generateRegionJS(r)).join(',\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, height=${height}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { background-color: ${bgcolor}; }
    .region {
      position: absolute;
      overflow: hidden;
    }
    .media {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    iframe {
      border: none;
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
${regionHTML}
<script>
const regions = {
${regionJS}
};

// Auto-start all regions
Object.keys(regions).forEach(id => {
  playRegion(id);
});

function playRegion(id) {
  const region = regions[id];
  if (!region || region.media.length === 0) return;

  // If only one media item, just show it and don't cycle (arexibo behavior)
  if (region.media.length === 1) {
    const media = region.media[0];
    if (media.start) media.start();
    return; // Don't schedule stop/restart
  }

  // Multiple media items - cycle normally
  let currentIndex = 0;

  function playNext() {
    const media = region.media[currentIndex];
    if (media.start) media.start();

    const duration = media.duration || 10;
    setTimeout(() => {
      if (media.stop) media.stop();
      currentIndex = (currentIndex + 1) % region.media.length;
      playNext();
    }, duration * 1000);
  }

  playNext();
}
</script>
</body>
</html>`;
  }

  /**
   * Generate HTML for a region container
   */
  generateRegionHTML(region) {
    return `  <div id="region_${region.id}" class="region" style="
    left: ${region.left}px;
    top: ${region.top}px;
    width: ${region.width}px;
    height: ${region.height}px;
    z-index: ${region.zindex};
  "></div>`;
  }

  /**
   * Generate JavaScript for region media control
   */
  generateRegionJS(region) {
    const mediaJS = region.media.map(m => this.generateMediaJS(m, region.id)).join(',\n    ');

    return `  '${region.id}': {
    media: [
${mediaJS}
    ]
  }`;
  }

  /**
   * Generate JavaScript for a single media item
   */
  generateMediaJS(media, regionId) {
    const duration = media.duration || 10;
    let startFn = 'null';
    let stopFn = 'null';

    switch (media.type) {
      case 'image':
        // Use absolute URL within service worker scope
        const imageSrc = `${window.location.origin}/player/cache/media/${media.options.uri}`;
        startFn = `() => {
        const img = document.createElement('img');
        img.className = 'media';
        img.src = '${imageSrc}';
        document.getElementById('region_${regionId}').innerHTML = '';
        document.getElementById('region_${regionId}').appendChild(img);
      }`;
        break;

      case 'video':
        // Check if this is a streaming file (large, not fully cached)
        // For streaming files, use direct CMS URL; for cached files, use cache URL
        const videoSrc = media.options.streamingUrl
          ? media.options.streamingUrl
          : `${window.location.origin}/player/cache/media/${media.options.uri}`;

        startFn = `() => {
        const video = document.createElement('video');
        video.className = 'media';
        video.src = '${videoSrc}';
        video.autoplay = true;
        video.muted = ${media.options.mute === '1' ? 'true' : 'false'};
        video.loop = false;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        document.getElementById('region_${regionId}').innerHTML = '';
        document.getElementById('region_${regionId}').appendChild(video);
        console.log('[Video] Playing:', '${videoSrc}');
      }`;
        stopFn = `() => {
        const video = document.querySelector('#region_${regionId} video');
        if (video) {
          video.pause();
          video.remove();
        }
      }`;
        break;

      case 'text':
      case 'ticker':
        // Use cache URL pattern for text/ticker widgets - must be in /player/ scope for SW
        if (media.options.widgetCacheKey) {
          const textUrl = `${window.location.origin}/player${media.options.widgetCacheKey}`;
          const iframeId = `widget_${regionId}_${media.id}`;
          startFn = `() => {
        const region = document.getElementById('region_${regionId}');
        let iframe = document.getElementById('${iframeId}');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = '${iframeId}';
          iframe.src = '${textUrl}';
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = 'none';
          iframe.scrolling = 'no';
          region.innerHTML = '';
          region.appendChild(iframe);
        } else {
          iframe.style.display = 'block';
        }
      }`;
          stopFn = `() => {
        const iframe = document.getElementById('${iframeId}');
        if (iframe) iframe.style.display = 'none';
      }`;
        } else {
          console.warn(`[Layout] Text media without widgetCacheKey`);
          startFn = `() => console.log('Text media without cache key')`;
        }
        break;

      case 'pdf':
        const pdfSrc = `${window.location.origin}/player/cache/media/${media.options.uri}`;
        const pdfContainerId = `pdf_${regionId}_${media.id}`;
        startFn = `async () => {
        const container = document.createElement('div');
        container.className = 'media pdf-container';
        container.id = '${pdfContainerId}';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.overflow = 'hidden';
        container.style.backgroundColor = '#525659';

        const region = document.getElementById('region_${regionId}');
        region.innerHTML = '';
        region.appendChild(container);

        // Load PDF.js if not already loaded
        if (typeof pdfjsLib === 'undefined') {
          try {
            const pdfjsModule = await import('pdfjs-dist');
            window.pdfjsLib = pdfjsModule;
            pdfjsLib.GlobalWorkerOptions.workerSrc = '${window.location.origin}/player/pdf.worker.min.mjs';
          } catch (error) {
            console.error('[PDF] Failed to load PDF.js:', error);
            container.innerHTML = '<div style="color:white;padding:20px;text-align:center;">PDF viewer unavailable</div>';
            return;
          }
        }

        // Render PDF
        try {
          const loadingTask = pdfjsLib.getDocument('${pdfSrc}');
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);

          const containerWidth = container.offsetWidth || ${width};
          const containerHeight = container.offsetHeight || ${height};
          const viewport = page.getViewport({ scale: 1 });

          // Calculate scale to fit page within container
          const scaleX = containerWidth / viewport.width;
          const scaleY = containerHeight / viewport.height;
          const scale = Math.min(scaleX, scaleY);

          const scaledViewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;

          // Center canvas in container
          canvas.style.display = 'block';
          canvas.style.margin = 'auto';
          canvas.style.marginTop = Math.max(0, (containerHeight - scaledViewport.height) / 2) + 'px';

          container.appendChild(canvas);

          await page.render({
            canvasContext: context,
            viewport: scaledViewport
          }).promise;

          console.log('[PDF] Rendered:', '${pdfSrc}');
        } catch (error) {
          console.error('[PDF] Render failed:', error);
          container.innerHTML = '<div style="color:white;padding:20px;text-align:center;">Failed to load PDF</div>';
        }
      }`;
        stopFn = `() => {
        const container = document.getElementById('${pdfContainerId}');
        if (container) container.remove();
      }`;
        break;

      case 'webpage':
        const url = media.options.uri;
        startFn = `() => {
        const iframe = document.createElement('iframe');
        iframe.src = '${url}';
        document.getElementById('region_${regionId}').innerHTML = '';
        document.getElementById('region_${regionId}').appendChild(iframe);
      }`;
        break;

      default:
        // Widgets (clock, calendar, weather, etc.) - use cache URL pattern in /player/ scope for SW
        // Keep widget iframes alive across duration cycles (arexibo behavior)
        if (media.options.widgetCacheKey) {
          const widgetUrl = `${window.location.origin}/player${media.options.widgetCacheKey}`;
          const iframeId = `widget_${regionId}_${media.id}`;
          startFn = `() => {
        const region = document.getElementById('region_${regionId}');
        let iframe = document.getElementById('${iframeId}');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = '${iframeId}';
          iframe.src = '${widgetUrl}';
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = 'none';
          iframe.scrolling = 'no';
          region.innerHTML = '';
          region.appendChild(iframe);
        } else {
          iframe.style.display = 'block';
        }
      }`;
          stopFn = `() => {
        const iframe = document.getElementById('${iframeId}');
        if (iframe) iframe.style.display = 'none';
      }`;
        } else {
          console.warn(`[Layout] Unsupported media type: ${media.type}`);
          startFn = `() => console.log('Unsupported media type: ${media.type}')`;
        }
    }

    return `      {
        start: ${startFn},
        stop: ${stopFn},
        duration: ${duration}
      }`;
  }
}

export const layoutTranslator = new LayoutTranslator();
