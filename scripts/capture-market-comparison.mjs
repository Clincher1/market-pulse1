// Actual revealed section captures: a full-page screenshot may legitimately omit
// content-visibility:auto subtrees that are outside the current viewport.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '../.local/production-browser/node_modules/playwright/index.mjs';
const origin = 'https://market-pulse1-eta.vercel.app';
const output = 'docs/audit-evidence/visual-comparison';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { purpose: 'Real viewport reveal and section captures, not a performance acceptance retry.', pages: [] };
try {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const request = route.request();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || request.url().includes('/functions/v1/')) return route.abort();
      return route.continue();
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/world', { waitUntil: 'networkidle', timeout: 60000 });
      const section = page.locator('section.market-desk').filter({ has: page.getByRole('heading', { name: 'Сравнить динамику', exact: true }) });
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      const text = await section.innerText();
      assert.ok(text.includes('Сравнить динамику'));
      assert.ok(await section.locator('table tbody tr').count() >= 2);
      assert.deepEqual(errors, []);
      await section.screenshot({ path: `${output}/comparison-${width}.png` });
      const quotes = [];
      const strip = page.locator('section[aria-labelledby="market-strip-title"] li');
      for (const [index, id] of ['usd-eur', 'sp500', 'brent', 'gold', 'btc'].entries()) {
        const ticker = await strip.nth(index).locator(':scope > div').nth(1).innerText();
        const tile = page.locator(`#heat-tile-${id}`);
        await tile.scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const tilePrice = await tile.locator(':scope > div').nth(1).innerText();
        quotes.push({ id, ticker, tile: tilePrice, agrees: ticker === tilePrice });
      }
      await page.locator('#global-economy').screenshot({ path: `${output}/world-markets-${width}.png` });
      report.pages.push({ width, observedAt: new Date().toISOString(), text, quotes, errors,
        entryBundle: await page.locator('script[type="module"][src]').first().getAttribute('src') });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
