#!/usr/bin/env node
/**
 * xiboplayer-proxy CLI — standalone CORS proxy + PWA server
 *
 * Usage:
 *   xiboplayer-proxy --port=8765 --pwa-path=/path/to/pwa/dist
 *   npx xiboplayer-proxy --pwa-path=../xiboplayer-pwa/dist
 */

import { startServer } from '../src/proxy.js';

const args = process.argv.slice(2);
const portArg = args.find(a => a.startsWith('--port='));
const pwaArg = args.find(a => a.startsWith('--pwa-path='));

const port = portArg ? parseInt(portArg.split('=')[1], 10) : 8765;
const pwaPath = pwaArg ? pwaArg.split('=')[1] : null;

if (!pwaPath) {
  console.error('Usage: xiboplayer-proxy --pwa-path=/path/to/pwa/dist [--port=8765]');
  process.exit(1);
}

startServer({ port, pwaPath, appVersion: '0.2.0' }).catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
