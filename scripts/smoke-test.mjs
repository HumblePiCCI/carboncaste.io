const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8126').replace(/\/$/, '');
const expectations = [
  ['/', 200, 'We found you.'],
  ['/privacy.html', 200, 'Small surface.'],
  ['/terms.html', 200, 'Clear terms.'],
  ['/contact.html', 200, 'Send a signal.'],
  ['/robots.txt', 200, 'Sitemap: https://carboncaste.io/sitemap.xml'],
  ['/.well-known/security.txt', 200, 'admin@carboncaste.io'],
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
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`HTTP smoke passed for ${expectations.length} routes at ${baseUrl}.`);
