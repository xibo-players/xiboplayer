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
        // Use absolute URL within service worker scope
        const videoSrc = `${window.location.origin}/player/cache/media/${media.options.uri}`;
        startFn = `() => {
        const video = document.createElement('video');
        video.className = 'media';
        video.src = '${videoSrc}';
        video.autoplay = true;
        video.muted = ${media.options.mute === '1' ? 'true' : 'false'};
        document.getElementById('region_${regionId}').innerHTML = '';
        document.getElementById('region_${regionId}').appendChild(video);
      }`;
        stopFn = `() => {
        const video = document.querySelector('#region_${regionId} video');
        if (video) video.pause();
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
