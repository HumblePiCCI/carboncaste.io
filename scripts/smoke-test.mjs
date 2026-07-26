const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8126').replace(/\/$/, '');
const expectations = [
  ['/', 200, 'We found you.'],
  ['/privacy.html', 200, 'Small surface.'],
  ['/terms.html', 200, 'Clear terms.'],
  ['/contact.html', 200, 'Send a signal.'],
  ['/iceland26', 200, 'The road is'],
  ['/iceland26/', 200, 'The road is'],
  ['/iceland26/access.html', 200, 'The road is'],
  ['/api/iceland26/health', 503, '"ready":false'],
  ['/api/iceland26', 401, 'Enter the shared trip code'],
  ['/robots.txt', 200, 'Sitemap: https://carboncaste.io/sitemap.xml'],
  ['/.well-known/security.txt', 200, 'admin@carboncaste.io'],
  ['/README.md', 404, 'This path ends here.'],
  ['/package.json', 404, 'This path ends here.'],
  ['/server/static-server.mjs', 404, 'This path ends here.'],
  ['/deploy/carboncaste-web.service', 404, 'This path ends here.'],
  ['/not-a-real-route', 404, 'This path ends here.'],
];

const failures = [];

for (const [path, expectedStatus, expectedText] of expectations) {
  try {
    const response = await fetch(`${baseUrl}${path}`);
    const body = await response.text();
    if (response.status !== expectedStatus) {
      failures.push(`${path}: expected HTTP ${expectedStatus}, received ${response.status}`);
    }
    if (!body.includes(expectedText)) {
      failures.push(`${path}: response is missing ${JSON.stringify(expectedText)}`);
    }
    if (path === '/' && !response.headers.get('content-security-policy')) {
      failures.push('/: Content-Security-Policy header is missing');
    }
    if (path === '/') {
      const csp = response.headers.get('content-security-policy') || '';
      const styleDirective = csp.split(';').find((directive) => directive.trim().startsWith('style-src')) || '';
      if (styleDirective.includes("'unsafe-inline'")) {
        failures.push('/: style-src must remain free of unsafe-inline');
      }
    }
    if (path.startsWith('/iceland26') || path.startsWith('/api/iceland26')) {
      const robots = response.headers.get('x-robots-tag') || '';
      if (!robots.includes('noindex')) failures.push(`${path}: must be marked noindex`);
    }
    if (path.startsWith('/iceland26')) {
      const csp = response.headers.get('content-security-policy') || '';
      const scriptDirective = csp.split(';').find((directive) => (
        directive.trim().startsWith('script-src')
      )) || '';
      if (scriptDirective.includes("'unsafe-inline'")) {
        failures.push(`${path}: private trip surface must not allow inline scripts`);
      }
    }
    if (path === '/api/iceland26' && response.headers.get('cache-control') !== 'no-store') {
      failures.push('/api/iceland26: shared state must not be cached');
    }
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

for (const path of [
  '/dist/..%2fserver/static-server.mjs',
  '/fonts/..%2fdeploy/carboncaste-web.service',
]) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  if (response.status !== 404) {
    failures.push(`${path}: encoded traversal must return HTTP 404, received ${response.status}`);
  }
}

const privateTraversal = await fetch(
  `${baseUrl}/dist/..%2ficeland26/itinerary.json`,
  { redirect: 'manual' },
);
if (privateTraversal.status !== 302
    || !privateTraversal.headers.get('location')?.startsWith('/iceland26/access.html')) {
  failures.push('/dist/..%2ficeland26/itinerary.json: encoded traversal bypassed trip access');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`HTTP smoke passed for ${expectations.length} routes at ${baseUrl}.`);
