/**
 * Simple CORS proxy for development
 * Usage: CMS_URL=https://your-cms node proxy.js
 * Then set CMS address to http://localhost:8080 in the player
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

const ACTUAL_CMS = process.env.CMS_URL || 'http://your-cms-address';
const PORT = 8080;

const server = http.createServer(async (req, res) => {
  console.log(`[Proxy] ${req.method} ${req.url}`);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const targetUrl = new URL(ACTUAL_CMS + req.url);
  const isHttps = targetUrl.protocol === 'https:';

  console.log(`[Proxy] Forwarding to ${targetUrl.href}`);

  // Choose http or https module
  const httpModule = isHttps ? https : http;

  // Forward request to actual CMS
  const options = {
    method: req.method,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    headers: {
      ...req.headers,
      host: targetUrl.host
    }
  };

  const proxyReq = httpModule.request(options, (proxyRes) => {
    // Add CORS headers
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy] Error:', err);
    res.writeHead(500);
    res.end('Proxy error');
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`[Proxy] Running on http://localhost:${PORT}`);
  console.log(`[Proxy] Forwarding to ${ACTUAL_CMS}`);
  console.log('\nIn the player, set CMS address to: http://localhost:8080');
});
