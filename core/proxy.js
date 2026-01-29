/**
 * Simple CORS proxy for development
 * Usage: node proxy.js
 * Then set CMS address to http://localhost:8080 in the player
 */

import http from 'http';

const ACTUAL_CMS = process.env.CMS_URL || 'http://your-cms-address';
const PORT = 8080;

const server = http.createServer(async (req, res) => {
  console.log(`[Proxy] ${req.method} ${req.url}`);

  // Forward request to actual CMS
  const options = {
    method: req.method,
    headers: {
      ...req.headers,
      host: new URL(ACTUAL_CMS).host
    }
  };

  const proxyReq = http.request(ACTUAL_CMS + req.url, options, (proxyRes) => {
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
