// Read-only document/bootstrap audit. External data and API calls are blocked:
// these measurements do not certify source values or uptime.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '../.local/feature-browser/node_modules/playwright/index.mjs';
import binary from '../.local/feature-browser/node_modules/@sparticuz/chromium/build/index.js';
import { routes, websiteJsonLd } from './static-document.mjs';

const origin = process.env.DOCUMENT_ORIGIN || 'http://127.0.0.1:5174';
const output = process.env.DOCUMENT_OUTPUT || '.local/initial-document';
const expected = process.env.DOCUMENT_EXPECTED_ENTRY;
const local = new URL(origin).hostname === '127.0.0.1';
const config = JSON.parse(await fs.readFile('vercel.json', 'utf8'));
const csp = config.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
const report = { scope: 'Initial HTML, JavaScript-off/failure recovery, bootstrap and visual equivalence; data requests blocked', origin, expected, cases: [], equivalence: [], failures: [] };
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], headless: true });
try {
  for (const round of ['A', 'B']) for (const width of [360, 768, 1024, 1440]) for (const mode of ['no-js', 'failed-entry', 'interactive']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: mode !== 'no-js', reducedMotion: 'reduce' });
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin !== origin || url.pathname.startsWith('/api/') || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort();
      if (mode === 'failed-entry' && request.resourceType() === 'script') return route.abort();
      if (local && request.resourceType() === 'document') {
        const response = await route.fetch();
        return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
      }
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.documentPolicyErrors = [];
      document.addEventListener('securitypolicyviolation', e => window.documentPolicyErrors.push({ directive: e.effectiveDirective, blocked: e.blockedURI }));
    });
    for (const [path, entry] of Object.entries(routes)) {
      try {
        const response = await page.goto(`${origin}/${path}`, { waitUntil: 'load' });
        assert.equal(response.status(), 200);
        const html = await response.text();
        assert.ok(html.includes(`data-initial-document="${entry.key}"`));
        assert.ok(html.includes(websiteJsonLd));
        if (expected) assert.ok(html.includes(expected), 'Wrong published entry');
        if (!local) {
          const actualCsp = response.headers()['content-security-policy'];
          const hash = createHash('sha256').update(websiteJsonLd).digest('base64');
          assert.ok(actualCsp?.includes(`'sha256-${hash}'`), 'Missing published JSON-LD CSP hash');
        }
        if (mode === 'interactive') {
          await page.locator('.site-shell').waitFor();
          await page.locator('[data-initial-document]').waitFor({ state: 'detached' });
        } else await page.locator(`[data-initial-document="${entry.key}"]`).waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('main').count(), 1);
        assert.equal(await page.locator('footer').count(), 1);
        if (mode !== 'interactive') {
          assert.equal(await page.locator('h1').textContent(), entry.title);
          assert.equal(await page.locator('nav a').count(), 9);
          await page.locator('a[href="#main"]').click();
          assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
        }
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          policyErrors: window.documentPolicyErrors || [],
          fallbackCount: document.querySelectorAll('[data-initial-document]').length,
          active: document.querySelector('.initial-document nav [aria-current="page"]')?.getAttribute('href') || null,
        }));
        assert.equal(metrics.overflow, false);
        assert.deepEqual(metrics.policyErrors, []);
        assert.deepEqual(errors, []);
        report.cases.push({ round, width, path: `/${path}`, mode, ...metrics });
        if (round === 'A' && path === '' && [360, 1440].includes(width) && mode !== 'failed-entry') {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `${output}/${mode}-${width}.png`, animations: 'disabled' });
        }
      } catch (e) { report.failures.push({ round, width, path, mode, message: e.message }); }
    }
    await context.close();
    await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  }
  // Same compiled app, same responses, only initial root present/absent.
  // Its final DOM must not depend on whether the initial HTML was populated.
  for (const width of [360, 768, 1024, 1440]) {
    const snapshots = [];
    for (const empty of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.abort();
        if (request.resourceType() === 'document') {
          const response = await route.fetch();
          let body = await response.text();
          if (empty) body = body.replace(/<div id="root">[\s\S]*<\/div>\s*(?=<\/body>)/, '<div id="root"></div>');
          if (empty) assert.ok(!body.includes('data-initial-document'), 'Baseline root stripping failed');
          return route.fulfill({ response, body });
        }
        return route.continue();
      });
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.locator('.site-shell').waitFor();
      await page.evaluate(() => document.fonts.ready);
      snapshots.push(await page.locator('.site-shell').evaluate(el => el.outerHTML.replace(/:r[0-9a-z]+:/g, ':id:').replace(/pulse-mobile-(nebula|orbit|mark|glow)-r[0-9a-z]+/g, 'pulse-mobile-$1-id')));
      await context.close();
    }
    const equal = snapshots[0] === snapshots[1];
    report.equivalence.push({ width, finalDomEqual: equal });
    if (!equal) report.failures.push({ width, message: 'Final interactive DOM differs from empty-root baseline' });
  }
} finally {
  await browser.close();
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ cases: report.cases.length, equivalence: report.equivalence, failures: report.failures }, null, 2));
if (report.failures.length || report.cases.length !== 216 || report.equivalence.length !== 4) process.exitCode = 1;
