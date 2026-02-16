/**
 * Mock for hls.js — used by renderer-lite.js for HLS streaming.
 * In tests, we don't need real HLS playback.
 */
class Hls {
  constructor() {
    this.media = null;
  }

  static isSupported() {
    return false;
  }

  loadSource() {}
  attachMedia() {}
  destroy() {}

  on() {}
  off() {}
}

Hls.Events = {
  MANIFEST_PARSED: 'hlsManifestParsed',
  ERROR: 'hlsError'
};

export default Hls;
