#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import {
  extname,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createIceland26Store, StoreValidationError } from './iceland26-store.mjs';

const root = resolve(process.env.CARBONCASTE_WEB_ROOT || process.argv[2] || '.');
const host = process.env.CARBONCASTE_WEB_HOST || '127.0.0.1';
const port = Number(process.env.CARBONCASTE_WEB_PORT || 8126);
const icelandDataPath = resolve(
  process.env.ICELAND26_DATA_PATH || join(root, '.data', 'iceland26-state.json'),
);
const itinerary = JSON.parse(readFileSync(join(root, 'iceland26', 'itinerary.json'), 'utf8'));
const catalogOptionIds = itinerary.legs.flatMap((leg) => leg.options.map((option) => option.id));
const icelandStore = await createIceland26Store({ dataPath: icelandDataPath, catalogOptionIds });
const icelandAccessHash = String(process.env.ICELAND26_ACCESS_HASH || '').toLowerCase();
const icelandSessionSecret = String(process.env.ICELAND26_SESSION_SECRET || '');
const icelandInstanceNonce = /^[A-Za-z0-9-]{1,128}$/.test(
  String(process.env.ICELAND26_INSTANCE_NONCE || ''),
)
  ? String(process.env.ICELAND26_INSTANCE_NONCE)
  : '';
const icelandAuthConfigured = /^[a-f0-9]{64}$/.test(icelandAccessHash)
  && icelandSessionSecret.length >= 32;
const icelandSessionTtlSeconds = 60 * 60 * 24 * 30;
const icelandCookieName = 'iceland26_session';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};
const icelandSecurityHeaders = {
  ...securityHeaders,
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
};
const publicRootFiles = new Set([
  '/',
  '/index.html',
  '/mobius.html',
  '/privacy.html',
  '/terms.html',
  '/contact.html',
  '/404.html',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.gif',
  '/favicon.ico',
  '/styles.css',
  '/.well-known/security.txt',
]);
const publicIcelandFiles = new Set([
  '/iceland26',
  '/iceland26/',
  '/iceland26/index.html',
  '/iceland26/styles.css',
  '/iceland26/app.js',
  '/iceland26/itinerary.json',
  '/iceland26/access.html',
  '/iceland26/access.css',
  '/iceland26/access.js',
]);

function isPublicStaticPath(path) {
  return publicRootFiles.has(path)
    || publicIcelandFiles.has(path)
    || path.startsWith('/dist/')
    || path.startsWith('/fonts/');
}

function requestDetails(url) {
  try {
    const parsed = new URL(url, 'http://localhost');
    const decoded = decodeURIComponent(parsed.pathname);
    if (decoded.includes('\0')) return null;
    const normalizedRelative = normalize(decoded.replace(/^\/+/, ''));
    const candidate = resolve(root, normalizedRelative || 'index.html');
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
    const canonicalRelative = relative(root, candidate).split(sep).join('/');
    return {
      filePath: candidate,
      path: canonicalRelative === 'index.html' && /^\/+$/.test(decoded)
        ? '/'
        : `/${canonicalRelative}`,
    };
  } catch {
    return null;
  }
}

function headersFor(filePath, status = 200, requestPath = '') {
  const extension = extname(filePath).toLowerCase();
  const isIceland = requestPath.startsWith('/iceland26');
  return {
    ...(isIceland ? icelandSecurityHeaders : securityHeaders),
    'Cache-Control': isIceland
      ? 'private, no-store'
      : (extension === '.html' ? 'no-cache' : 'public, max-age=3600'),
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    'X-Robots-Tag': status === 404 || isIceland
      ? 'noindex, nofollow'
      : 'all',
    ...(isIceland ? { Vary: 'Cookie' } : {}),
  };
}

function sendFile(req, res, filePath, status = 200, requestPath = '') {
  const stat = statSync(filePath);
  res.writeHead(status, {
    ...headersFor(filePath, status, requestPath),
    'Content-Length': stat.size,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function sendJson(req, res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...icelandSecurityHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    Vary: 'Cookie',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extraHeaders,
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

function requestHost(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  return (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host || '';
}

function allowedMutationOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const expectedHost = requestHost(req);
    return originUrl.host === expectedHost && ['http:', 'https:'].includes(originUrl.protocol);
  } catch {
    return false;
  }
}

const mutationWindows = new Map();
const loginWindows = new Map();

function withinRateLimit(req, windows, maximum) {
  const now = Date.now();
  const key = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown');
  const existing = windows.get(key);
  if (!existing || now - existing.startedAt >= 60_000) {
    windows.set(key, { startedAt: now, count: 1 });
    if (windows.size > 2_000) {
      for (const [candidateKey, window] of windows) {
        if (now - window.startedAt >= 120_000) windows.delete(candidateKey);
      }
    }
    return true;
  }
  existing.count += 1;
  return existing.count <= maximum;
}

async function readJsonBody(req) {
  const contentType = String(req.headers['content-type'] || '').split(';', 1)[0].trim();
  if (contentType !== 'application/json') {
    throw new StoreValidationError('Requests must use application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new StoreValidationError('Request body is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value;
  } catch {
    throw new StoreValidationError('Request body must be a JSON object.');
  }
}

function parseCookies(req) {
  const cookies = new Map();
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  });
  return cookies;
}

function sessionSignature(payload) {
  return createHmac('sha256', icelandSessionSecret).update(payload).digest('base64url');
}

function sessionToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + icelandSessionTtlSeconds;
  const payload = `${expiresAt}.${randomBytes(18).toString('base64url')}`;
  return `${payload}.${sessionSignature(payload)}`;
}

function validSession(req) {
  if (!icelandAuthConfigured) return false;
  const token = parseCookies(req).get(icelandCookieName);
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expiresAtText, nonce, suppliedSignature] = parts;
  if (!/^\d{10}$/.test(expiresAtText) || !/^[A-Za-z0-9_-]{20,}$/.test(nonce)) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const payload = `${expiresAtText}.${nonce}`;
  const expectedSignature = sessionSignature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function validAccessCode(value) {
  if (!icelandAuthConfigured || typeof value !== 'string' || value.length > 256) return false;
  const candidate = createHash('sha256').update(value).digest('hex');
  const supplied = Buffer.from(candidate, 'hex');
  const expected = Buffer.from(icelandAccessHash, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function sessionCookie(req, token, maxAge = icelandSessionTtlSeconds) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const secure = forwardedProto === 'https' || process.env.ICELAND26_COOKIE_SECURE === 'true';
  return [
    `${icelandCookieName}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

async function handleIcelandApi(req, res, path) {
  if (path === '/api/iceland26/health') {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
      return true;
    }
    const ready = icelandAuthConfigured && !icelandStore.loadError();
    sendJson(req, res, ready ? 200 : 503, {
      ready,
      ...(icelandInstanceNonce ? { instance: icelandInstanceNonce } : {}),
    });
    return true;
  }
  if (path === '/api/iceland26/login') {
    if (req.method !== 'POST') {
      sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      return true;
    }
    if (!icelandAuthConfigured) {
      sendJson(req, res, 503, { error: 'Trip access has not been configured.' });
      return true;
    }
    if (!allowedMutationOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site') {
      sendJson(req, res, 403, { error: 'Cross-site login is not allowed.' });
      return true;
    }
    if (!withinRateLimit(req, loginWindows, 10)) {
      sendJson(req, res, 429, { error: 'Too many access attempts. Try again in a minute.' }, {
        'Retry-After': '60',
      });
      return true;
    }
    try {
      const body = await readJsonBody(req);
      if (!validAccessCode(body.code)) {
        sendJson(req, res, 401, { error: 'That trip code is not valid.' });
        return true;
      }
      sendJson(req, res, 200, { authenticated: true }, {
        'Set-Cookie': sessionCookie(req, sessionToken()),
      });
    } catch (error) {
      if (error instanceof StoreValidationError) sendJson(req, res, 400, { error: error.message });
      else sendJson(req, res, 500, { error: 'Trip access could not be checked.' });
    }
    return true;
  }
  if (path === '/api/iceland26/logout') {
    if (req.method !== 'POST') {
      sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      return true;
    }
    if (!allowedMutationOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site') {
      sendJson(req, res, 403, { error: 'Cross-site logout is not allowed.' });
      return true;
    }
    sendJson(req, res, 200, { authenticated: false }, {
      'Set-Cookie': sessionCookie(req, '', 0),
    });
    return true;
  }
  if (!validSession(req)) {
    sendJson(req, res, 401, { error: 'Enter the shared trip code to continue.' });
    return true;
  }
  if (path === '/api/iceland26' && ['GET', 'HEAD'].includes(req.method || '')) {
    sendJson(req, res, 200, icelandStore.snapshot());
    return true;
  }
  const mutationRoutes = new Map([
    ['/api/iceland26/preference', (body) => icelandStore.setPreference(body)],
    ['/api/iceland26/comment', (body) => icelandStore.addComment(body)],
    ['/api/iceland26/suggestion', (body) => icelandStore.addSuggestion(body)],
  ]);
  if (!mutationRoutes.has(path)) return false;
  if (req.method !== 'POST') {
    sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    return true;
  }
  if (!allowedMutationOrigin(req) || req.headers['sec-fetch-site'] === 'cross-site') {
    sendJson(req, res, 403, { error: 'Cross-site updates are not allowed.' });
    return true;
  }
  if (!withinRateLimit(req, mutationWindows, 80)) {
    sendJson(req, res, 429, { error: 'Too many updates. Try again in a minute.' }, {
      'Retry-After': '60',
    });
    return true;
  }
  try {
    const result = await mutationRoutes.get(path)(await readJsonBody(req));
    sendJson(req, res, 200, result);
  } catch (error) {
    if (error instanceof StoreValidationError) {
      sendJson(req, res, 400, { error: error.message });
    } else if (error?.code === 'E_STATE_UNAVAILABLE') {
      sendJson(req, res, 503, { error: error.message });
    } else {
      console.error(`Iceland API mutation failed: ${error?.stack || error}`);
      sendJson(req, res, 500, { error: 'The update could not be saved.' });
    }
  }
  return true;
}

const server = createServer(async (req, res) => {
  const details = requestDetails(req.url || '');
  const requestPath = details?.path || '';

  if (requestPath.startsWith('/api/iceland26')) {
    if (await handleIcelandApi(req, res, requestPath)) return;
    sendJson(req, res, 404, { error: 'API route not found.' });
    return;
  }

  const publicIcelandPaths = new Set([
    '/iceland26/access.html',
    '/iceland26/access.css',
    '/iceland26/access.js',
  ]);
  if (requestPath === '/iceland26' || requestPath.startsWith('/iceland26/')) {
    if (!publicIcelandPaths.has(requestPath) && !validSession(req)) {
      const destination = requestPath.startsWith('/iceland26') ? requestPath : '/iceland26/';
      res.writeHead(302, {
        ...icelandSecurityHeaders,
        'Cache-Control': 'no-store',
        Location: `/iceland26/access.html?next=${encodeURIComponent(destination)}`,
        Vary: 'Cookie',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      res.end();
      return;
    }
  }

  if (!req.url || !['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405, { ...securityHeaders, Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  if (!isPublicStaticPath(requestPath)) {
    sendFile(req, res, join(root, '404.html'), 404, requestPath);
    return;
  }
  if (!details) {
    sendFile(req, res, join(root, '404.html'), 404, requestPath);
    return;
  }
  let filePath = details.filePath;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendFile(req, res, join(root, '404.html'), 404, requestPath);
    return;
  }
  sendFile(req, res, filePath, 200, requestPath);
});

server.listen(port, host, () => {
  console.log(
    `Carbon Caste server listening on http://${host}:${port} root=${root} `
    + `icelandState=${icelandDataPath} icelandAuth=${icelandAuthConfigured ? 'enabled' : 'disabled'}`,
  );
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.on('error', (error) => {
  console.error(`HTTP server failed: ${error.code || error.message}`);
  process.exitCode = 1;
});
server.on('clientError', (error, socket) => {
  console.error(`HTTP client error: ${error.code || error.message}`);
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

function gracefulShutdown(signal) {
  console.log(`Received ${signal}; draining HTTP requests.`);
  server.close((error) => {
    if (error) {
      console.error(`HTTP shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }
  });
  setTimeout(() => {
    console.error('HTTP shutdown timed out.');
    process.exit(1);
  }, 12_000).unref();
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
