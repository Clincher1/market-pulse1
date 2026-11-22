// Read-only post-release smoke. Not a full source, uptime or performance audit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '../.local/feature-browser/node_modules/playwright/index.mjs';
import binary from '../.local/feature-browser/node_modules/@sparticuz/chromium/build/index.js';
const origin = process.env.SNAPSHOT_ORIGIN || 'https://market-pulse1-eta.vercel.app';
const output = '.local/snapshot-release';
const snapshot = JSON.parse(await fs.readFile('data/snapshot.json', 'utf8'));
const built = await fs.readFile('dist/index.html', 'utf8');
const expectedEntry = built.match(/src="([^"]+\/index-[^"]+\.js)"/)?.[1];
assert.ok(expectedEntry, 'Build the checked revision first');
const report = { origin, expectedEntry, scope: 'Live snapshot without JS and real React startup/navigation; GET-only, no data mocks', cases: [], failures: [] };
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], headless: true });
try {
  for (const round of ['A', 'B']) for (const width of [360, 768, 1024, 1440]) for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled, reducedMotion: 'reduce' });
    const errors = [], consoleErrors = [], failedResponses = [], blockedWrites = [];
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || url.pathname.includes('/functions/v1/')) {
        blockedWrites.push({ method: request.method(), path: url.pathname });
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => {
      if (response.status() >= 400) failedResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    try {
      const response = await page.goto(origin + '/', { waitUntil: 'networkidle', timeout: 60000 });
      assert.equal(response.status(), 200);
      const html = await response.text();
      assert.ok(html.includes(expectedEntry), 'Unexpected production entry');
      assert.ok(html.includes('Статический снимок данных'));
      assert.ok(html.includes('Данные актуальны на момент сборки'));
      if (!javaScriptEnabled) {
        const section = page.locator('[aria-labelledby="static-snapshot-title"]');
        await section.locator('table').waitFor({ state: 'visible' });
        assert.equal(await section.locator('tbody tr').count(), snapshot.items.length);
        assert.ok((await section.innerText()).includes(snapshot.exportedAt));
        for (const [index, item] of snapshot.items.entries()) {
          const row = section.locator('tbody tr').nth(index);
          assert.equal(await row.locator('th').textContent(), `${item.ticker} — ${item.instrument}`);
          const cells = row.locator('td');
          assert.equal(await cells.nth(0).textContent(), item.value);
          assert.equal(await cells.nth(1).textContent(), item.unit);
          assert.equal(await row.locator('time').getAttribute('datetime'), item.observedAt);
          assert.equal(await row.locator('a').getAttribute('href'), item.source.url);
          assert.equal(await cells.nth(4).textContent(), item.basis);
        }
        const region = section.locator('[role="region"]');
        await region.focus();
        assert.equal(await region.evaluate(el => document.activeElement === el), true);
        const geometry = await region.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, tableWidth: el.querySelector('table').getBoundingClientRect().width }));
        assert.ok(geometry.tableWidth >= 600);
        if (width === 360) assert.ok(geometry.scrollWidth > geometry.width);
      } else {
        await page.locator('.site-shell').waitFor();
        await page.locator('[data-initial-document]').waitFor({ state: 'detached' });
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('main').count(), 1);
        assert.equal(await page.locator('footer').count(), 1);
        if (round === 'A') await page.screenshot({ path: `${output}/react-${width}.png`, fullPage: true });
        const nav = page.locator(width >= 1024 ? '.desktop-navigation' : '.mobile-quick-nav');
        await nav.locator(':scope > a[href="/brief"]').click();
        await page.waitForURL(origin + '/brief');
        await page.getByRole('heading', { level: 1, name: 'Коротко о рынке', exact: true }).waitFor();
        assert.equal(await nav.locator(':scope > a[href="/brief"]').getAttribute('aria-current'), 'page');
        await nav.locator(':scope > a[href="/world"]').click();
        await page.waitForURL(origin + '/world');
        const tile = page.locator('#heat-tile-brent');
        await tile.waitFor();
        await tile.click();
        await page.getByRole('region', { name: /^Подробно об активе / }).waitFor();
        await page.getByRole('button', { name: 'Свернуть панель актива' }).click();
        await nav.locator(':scope > a[href="/"]').click();
        await page.waitForURL(origin + '/');
        await page.locator('.overview-hero').waitFor();
      }
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Page horizontal overflow');
      assert.deepEqual(errors, [], 'Uncaught JavaScript errors');
      assert.deepEqual(consoleErrors, [], 'Browser console errors');
      assert.deepEqual(failedResponses, [], 'Failed HTTP responses');
      assert.deepEqual(blockedWrites, [], 'Unexpected write/function requests');
      if (round === 'A' && !javaScriptEnabled) await page.screenshot({ path: `${output}/no-js-${width}.png`, fullPage: true });
      report.cases.push({ round, width, javaScriptEnabled, status: response.status(), errors, consoleErrors, failedResponses, blockedWrites });
    } catch (error) {
      report.failures.push({ round, width, javaScriptEnabled, message: error.message, errors, consoleErrors, failedResponses, blockedWrites });
    } finally {
      await context.close();
      await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(report, null, 2));
if (report.failures.length || report.cases.length !== 16) process.exitCode = 1;
