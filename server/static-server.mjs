#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.env.CARBONCASTE_WEB_ROOT || process.argv[2] || '.');
const host = process.env.CARBONCASTE_WEB_HOST || '127.0.0.1';
const port = Number(process.env.CARBONCASTE_WEB_PORT || 8126);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function pathForRequest(url) {
  const parsed = new URL(url, 'http://localhost');
  const decoded = decodeURIComponent(parsed.pathname);
  const relative = normalize(decoded.replace(/^\/+/, ''));
  const candidate = resolve(root, relative || 'index.html');
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

function headersFor(filePath, status = 200) {
  const extension = extname(filePath).toLowerCase();
  return {
    ...securityHeaders,
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    'X-Robots-Tag': status === 404 ? 'noindex' : 'all',
  };
}

function sendFile(req, res, filePath, status = 200) {
  const stat = statSync(filePath);
  res.writeHead(status, { ...headersFor(filePath, status), 'Content-Length': stat.size });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  if (!req.url || !['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405, { ...securityHeaders, Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const candidate = pathForRequest(req.url);
  if (!candidate) {
    sendFile(req, res, join(root, '404.html'), 404);
    return;
  }

  let filePath = candidate;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendFile(req, res, join(root, '404.html'), 404);
    return;
  }
  sendFile(req, res, filePath);
});

server.listen(port, host, () => {
  console.log(`Carbon Caste static server listening on http://${host}:${port} root=${root}`);
});
