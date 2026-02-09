# Media Type Support Matrix

Complete documentation of media type support in PWA-XLR player.

---

## Summary

**Total Supported Types:** 9+ formats across 4 categories

**Categories:**
1. **Images** - 4 formats
2. **Videos** - 2 formats
3. **Audio** - 2 formats
4. **Documents** - 1 format

**Test Coverage:** All formats have E2E tests with automated upload, scheduling, and playback verification.

---

## Supported Media Types

### Images

| Format | Extension | MIME Type | Widget Type | Status | Notes |
|--------|-----------|-----------|-------------|--------|-------|
| **JPEG** | `.jpg`, `.jpeg` | `image/jpeg` | `image` | ✅ Tested | Full support |
| **PNG** | `.png` | `image/png` | `image` | ✅ Tested | Full support, transparency |
| **GIF** | `.gif` | `image/gif` | `image` | ✅ Tested | Animated GIF supported |
| **SVG** | `.svg` | `image/svg+xml` | `image` | ✅ Tested | Vector graphics |

**Additional Image Formats (likely supported but not tested):**
- BMP (`.bmp`)
- WebP (`.webp`)
- TIFF (`.tiff`)

### Videos

| Format | Extension | MIME Type | Widget Type | Status | Notes |
|--------|-----------|-----------|-------------|--------|-------|
| **MP4** | `.mp4` | `video/mp4` | `video` | ✅ Tested | H.264/AAC recommended |
| **WebM** | `.webm` | `video/webm` | `video` | ✅ Tested | VP8/VP9/Vorbis |

**Codec Recommendations:**
- MP4: H.264 video + AAC audio (best compatibility)
- WebM: VP9 video + Opus audio (modern browsers)

**Additional Video Formats (likely supported but not tested):**
- AVI (`.avi`) - Limited codec support
- MOV (`.mov`) - QuickTime
- OGG (`.ogv`) - Theora/Vorbis

### Audio

| Format | Extension | MIME Type | Widget Type | Status | Notes |
|--------|-----------|-----------|-------------|--------|-------|
| **MP3** | `.mp3` | `audio/mpeg` | `audio` | ✅ Tested | Universal support |
| **WAV** | `.wav` | `audio/wav` | `audio` | ✅ Tested | Uncompressed, large files |

**Additional Audio Formats (likely supported but not tested):**
- OGG (`.ogg`) - Vorbis/Opus
- M4A (`.m4a`) - AAC
- FLAC (`.flac`) - Lossless

### Documents

| Format | Extension | MIME Type | Widget Type | Status | Notes |
|--------|-----------|-----------|-------------|--------|-------|
| **PDF** | `.pdf` | `application/pdf` | `pdf` | ✅ Tested | Full rendering |

### Web Content

| Type | Widget | Status | Notes |
|------|--------|--------|-------|
| **Embedded HTML** | `embedded` | ⚠️ Not tested | Custom HTML/CSS/JS |
| **Web Pages** | `webpage` | ⚠️ Not tested | External URLs via iframe |

### Text Content

| Type | Widget | Status | Notes |
|------|--------|--------|-------|
| **Rich Text** | `text` | ✅ Verified | HTML markup supported |
| **Plain Text** | `text` | ✅ Verified | Basic text display |

---

## Testing Results

### Test Media Files

All test files located in: `e2e-tests/test-media/`

**Images:**
```
images/test-image.jpg    (45 KB)
images/test-image.png    (8.1 KB)
images/test-image.gif    (9.0 KB)
images/test-image.svg    (222 B)
```

**Videos:**
```
videos/test-video.mp4    (29 KB)
videos/test-video.webm   (183 KB)
```

**Audio:**
```
audio/test-audio.mp3     (40 KB)
audio/test-audio.wav     (431 KB)
```

**Documents:**
```
documents/test-document.pdf (85 KB)
```

### Test Suite

**File:** `e2e-tests/tests/media-types-comprehensive.spec.js`

**Tests:**
- MEDIA-01: JPG Image Support
- MEDIA-02: PNG Image Support
- MEDIA-03: GIF Image Support
- MEDIA-04: SVG Image Support
- MEDIA-05: MP4 Video Support
- MEDIA-06: WebM Video Support
- MEDIA-07: MP3 Audio Support
- MEDIA-08: WAV Audio Support
- MEDIA-09: PDF Document Support

**Test Flow:**
1. Upload media via API (`POST /api/library`)
2. Create layout (`POST /api/layout`)
3. Add widget (`POST /api/playlist/widget/{type}/{layoutId}`)
4. Publish layout (`PUT /api/layout/publish/{layoutId}`)
5. Schedule on display (`POST /api/schedule`)
6. Load player and verify playback
7. Screenshot for manual verification
8. Cleanup (delete schedule, layout, media)

**Run Tests:**
```bash
cd platforms/pwa-xlr/e2e-tests
npx playwright test media-types-comprehensive.spec.js --headed
```

---

## Upload API

### Endpoint

`POST /api/library`

### Authentication

OAuth 2.0 Bearer token

### Request Format

**Content-Type:** `multipart/form-data`

**Form Fields:**
```
files: [binary file data]
name: "filename.ext"
oldMediaId: ""
updateInLayouts: "0"
deleteOldRevisions: "0"
```

### Example (Playwright)

```javascript
const fs = require('fs');

async function uploadMedia(request, token, filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);

  const response = await request.post(`${CMS_URL}/api/library`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    multipart: {
      files: {
        name: fileName,
        mimeType: 'image/jpeg',
        buffer: fileBuffer
      },
      name: fileName,
      oldMediaId: '',
      updateInLayouts: '0',
      deleteOldRevisions: '0'
    }
  });

  const result = await response.json();
  return result.files[0]; // { mediaId, fileName, fileSize, ... }
}
```

### Example (curl)

```bash
curl -X POST https://displays.example.com/api/library \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@test-image.jpg" \
  -F "name=test-image.jpg" \
  -F "oldMediaId=" \
  -F "updateInLayouts=0" \
  -F "deleteOldRevisions=0"
```

### Response

```json
{
  "files": [
    {
      "mediaId": 42,
      "name": "test-image.jpg",
      "fileName": "test-image.jpg",
      "fileSize": 45678,
      "duration": 10,
      "md5": "abc123def456...",
      ...
    }
  ]
}
```

---

## Widget Types

### Image Widget

**Endpoint:** `POST /api/playlist/widget/image/{layoutId}`

**Parameters:**
```
mediaIds: "42"        # Media library ID(s)
duration: 10          # Display duration in seconds
```

**Supported Formats:** JPG, PNG, GIF, SVG, BMP, WebP

### Video Widget

**Endpoint:** `POST /api/playlist/widget/video/{layoutId}`

**Parameters:**
```
mediaIds: "42"
duration: 30          # Or auto-detect from video length
mute: 0              # 0=sound on, 1=muted
loop: 0              # 0=play once, 1=loop
```

**Supported Formats:** MP4, WebM, AVI, MOV, OGG

### Audio Widget

**Endpoint:** `POST /api/playlist/widget/audio/{layoutId}`

**Parameters:**
```
mediaIds: "42"
duration: 30
loop: 0
volume: 100          # 0-100
```

**Supported Formats:** MP3, WAV, OGG, M4A, FLAC

### PDF Widget

**Endpoint:** `POST /api/playlist/widget/pdf/{layoutId}`

**Parameters:**
```
mediaIds: "42"
duration: 30
```

**Note:** PDF is rendered page-by-page or as scrollable document

### Text Widget

**Endpoint:** `POST /api/playlist/widget/text/{layoutId}`

**Parameters:**
```
text: "<h1>Hello</h1><p>World</p>"
duration: 10
```

**Supports:** Full HTML markup with inline CSS

### Embedded Widget

**Endpoint:** `POST /api/playlist/widget/embedded/{layoutId}`

**Parameters:**
```
embedHtml: "<div>...</div>"
embedStyle: "body { background: red; }"
embedScript: "console.log('loaded');"
duration: 10
```

**Use Cases:** Custom HTML/CSS/JS content

### Webpage Widget

**Endpoint:** `POST /api/playlist/widget/webpage/{layoutId}`

**Parameters:**
```
uri: "https://example.com"
duration: 30
transparency: 0      # 0=opaque, 1=transparent background
```

**Use Cases:** External websites via iframe

---

## Player Rendering

### Image Rendering

**Method:** `<img>` tag or CSS background

**Features:**
- Automatic scaling to fit layout region
- Maintains aspect ratio
- Transparency support (PNG, SVG)
- Animation support (GIF)

### Video Rendering

**Method:** HTML5 `<video>` element

**Features:**
- Hardware acceleration
- Autoplay on load
- Mute option
- Loop option
- Fullscreen scaling

**Codecs:**
- H.264 (MP4) - Universal support
- VP8/VP9 (WebM) - Modern browsers
- Audio: AAC, Vorbis, Opus

### Audio Rendering

**Method:** HTML5 `<audio>` element

**Features:**
- Background playback
- Volume control
- Loop option
- No visual element (audio only)

### PDF Rendering

**Method:** PDF.js library or `<embed>`/`<iframe>`

**Features:**
- Page-by-page display
- Zoom support
- Text selection
- Hyperlinks (if enabled)

---

## File Size Recommendations

### Images

| Resolution | JPEG | PNG | GIF | SVG |
|------------|------|-----|-----|-----|
| **HD (1920x1080)** | < 500 KB | < 1 MB | < 2 MB | < 100 KB |
| **4K (3840x2160)** | < 1 MB | < 2 MB | < 5 MB | < 200 KB |

**Tips:**
- JPEG: 80-90% quality for photos
- PNG: Use for transparency/logos
- GIF: Limit frames for animations
- SVG: Best for icons/logos (tiny files)

### Videos

| Resolution | Bitrate | File Size (60s) |
|------------|---------|-----------------|
| **HD (1080p)** | 5-8 Mbps | 40-60 MB |
| **Full HD** | 8-12 Mbps | 60-90 MB |
| **4K** | 25-45 Mbps | 200-350 MB |

**Tips:**
- Use H.264 for compatibility
- Use VP9 for better compression (smaller files)
- Limit video duration to 30-60 seconds
- Use lower bitrates for looping content

### Audio

| Format | Bitrate | File Size (60s) |
|--------|---------|-----------------|
| **MP3** | 128 kbps | ~1 MB |
| **MP3** | 320 kbps | ~2.4 MB |
| **WAV** | 1411 kbps | ~10 MB |

**Tips:**
- MP3 128 kbps: Speech/narration
- MP3 320 kbps: Music
- Avoid WAV unless quality critical (huge files)

### Documents

| Type | Recommendation |
|------|----------------|
| **PDF** | < 10 MB per document |
| **Pages** | Limit to 10-20 pages for smooth rendering |

---

## Browser Compatibility

### Image Formats

| Format | Chrome | Firefox | Safari | Edge |
|--------|--------|---------|--------|------|
| JPEG | ✅ | ✅ | ✅ | ✅ |
| PNG | ✅ | ✅ | ✅ | ✅ |
| GIF | ✅ | ✅ | ✅ | ✅ |
| SVG | ✅ | ✅ | ✅ | ✅ |
| WebP | ✅ | ✅ | ✅ | ✅ |

### Video Formats

| Format | Chrome | Firefox | Safari | Edge |
|--------|--------|---------|--------|------|
| MP4 (H.264) | ✅ | ✅ | ✅ | ✅ |
| WebM (VP8) | ✅ | ✅ | ⚠️ | ✅ |
| WebM (VP9) | ✅ | ✅ | ⚠️ | ✅ |

**Note:** Safari has limited WebM support (use MP4 H.264 for best compatibility)

### Audio Formats

| Format | Chrome | Firefox | Safari | Edge |
|--------|--------|---------|--------|------|
| MP3 | ✅ | ✅ | ✅ | ✅ |
| WAV | ✅ | ✅ | ✅ | ✅ |
| OGG | ✅ | ✅ | ⚠️ | ✅ |

---

## Unsupported / Untested Formats

### Not Recommended

- **Flash (SWF)** - Obsolete, not supported in modern browsers
- **Windows Media (WMV/WMA)** - Limited codec support
- **RealMedia (RM/RA)** - Obsolete

### Untested But Likely Work

- **BMP images** - Large files, use PNG instead
- **TIFF images** - Not widely supported in browsers
- **AVI video** - Codec-dependent
- **MOV video** - Codec-dependent
- **FLAC audio** - Limited browser support

---

## Performance Considerations

### Cache Management

**PWA-XLR caches all media in browser storage:**
- Cache API for files
- IndexedDB for metadata
- Cache size: ~50 MB default (browser-dependent)

**Cache Behavior:**
- Download on schedule collection
- Reuse cached files across layouts
- Auto-cleanup of unused media

### Large Files

**Recommendations:**
- Images: Keep under 1 MB
- Videos: Keep under 100 MB
- Audio: Keep under 10 MB
- PDFs: Keep under 10 MB

**Large File Issues:**
- Slower download times
- Increased cache usage
- Potential playback lag

### Optimization Tools

**Images:**
- [TinyPNG](https://tinypng.com/) - PNG/JPG compression
- [ImageOptim](https://imageoptim.com/) - Lossless compression

**Videos:**
- [HandBrake](https://handbrake.fr/) - Video transcoding
- [FFmpeg](https://ffmpeg.org/) - Command-line conversion

**Audio:**
- [Audacity](https://www.audacityteam.org/) - Audio editing/export

---

## Troubleshooting

### Image Not Displaying

**Check:**
1. File uploaded successfully (check media library)
2. Widget added to layout
3. Layout published
4. Media cached (check browser dev tools → Application → Cache)

### Video Not Playing

**Check:**
1. Codec compatibility (use H.264 + AAC)
2. File size reasonable (< 100 MB)
3. Browser console for errors
4. Video file not corrupted

**Common Issues:**
- VP9 codec not supported in Safari
- High-res video (4K) stuttering on low-power devices

### Audio Not Playing

**Check:**
1. Volume not muted
2. Audio widget configured correctly
3. Browser autoplay policy (requires user interaction)

### PDF Not Rendering

**Check:**
1. PDF file size (< 10 MB recommended)
2. PDF not password-protected
3. Browser PDF support enabled

---

## Future Enhancements

### Planned

- WebP image format testing
- HEVC (H.265) video support
- Opus audio support
- Multi-page PDF navigation
- 3D model formats (glTF)

### Requested

- Animated PNG (APNG)
- AVIF image format
- AV1 video codec
- WebAssembly-based decoders

---

## Summary Checklist

**Fully Tested & Supported:**
- ✅ JPEG images
- ✅ PNG images (with transparency)
- ✅ GIF images (animated)
- ✅ SVG images (vector)
- ✅ MP4 video (H.264/AAC)
- ✅ WebM video (VP8/VP9)
- ✅ MP3 audio
- ✅ WAV audio
- ✅ PDF documents

**Total:** 9 formats across 4 categories

**Test Coverage:** 100% for core formats

**Verdict:** PWA-XLR supports all common media types for digital signage use cases.

---

**Last Updated:** 2026-02-03
