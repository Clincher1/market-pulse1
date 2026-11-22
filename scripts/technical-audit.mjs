// Read-only lab audit: no writers, selfcheck, snapshots, accounts or paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, firefox, webkit } from '../.local/production-browser/node_modules/playwright/index.mjs';
import lighthouse from '../.local/production-browser/node_modules/lighthouse/core/index.js';
import desktopConfig from '../.local/production-browser/node_modules/lighthouse/core/config/desktop-config.js';
import { launch } from '../.local/production-browser/node_modules/chrome-launcher/dist/index.js';
const origin = 'https://market-pulse1-eta.vercel.app';
const sb = 'https://hekzplfftannlzwvgwwm.supabase.co';
const key = (await fs.readFile('src/lib/supabase.ts', 'utf8')).match(/'(sb_publishable_[^']+)'/)[1];
const output = process.env.TECHNICAL_AUDIT_OUTPUT || '.local/production-audit';
await fs.mkdir(output, { recursive: true });
const report = { started: new Date().toISOString(), data: [], browsers: [], lighthouse: [], instrumentationRetries: [], failures: [] };
async function check(name, run) {
  try { await run(); } catch (e) { report.failures.push(`${name}: ${e.message}`); }
}
async function json(url, publicData = false) {
  const r = await fetch(url, { headers: publicData ? { apikey: key } : {}, signal: AbortSignal.timeout(60000) });
  assert.equal(r.status, 200, new URL(url).pathname);
  return r.json();
}
const ids = { 'usd-eur': 'eurusd_ecb_daily', sp500: 'sp500_yahoo_gspc', brent: 'brent_yahoo_bzf', btc: 'btc_kraken_xbtusd_daily' };
await check('cached vs expanded world history', async () => {
  const assets = await json(sb + '/rest/v1/cached_assets?select=id,sparkline,spark_dates', true);
  for (const asset of assets.filter(a => ids[a.id])) {
    await check(asset.id, async () => {
      const rows = await json(`${sb}/rest/v1/asset_price_history_v1?select=observation_date,close,price&instrument_id=eq.${ids[asset.id]}&order=observation_date.desc,updated_at.desc&limit=100`, true);
      const byDate = new Map();
      for (const row of rows) if (!byDate.has(row.observation_date)) {
        const value = Number(row.close ?? row.price);
        byDate.set(row.observation_date, asset.id === 'usd-eur' ? 1 / value : value);
      }
      assert.equal(asset.sparkline.length, asset.spark_dates.length);
      let compared = 0;
      for (const [i, date] of asset.spark_dates.entries()) {
        assert.ok(byDate.has(date), `expanded history missing cached date ${date}`);
        const actual = asset.sparkline[i], other = byDate.get(date);
        assert.ok(Math.abs(actual - other) <= Math.max(0.000001, Math.abs(other) * 1e-8), `${date}: cache=${actual}, panel=${other}`);
        compared++;
      }
      assert.ok(compared >= 2);
      report.data.push({ id: asset.id, cachedAndExpandedPointsCompared: compared });
    });
  }
});
await check('Russian values vs their history', async () => {
  const current = await json(origin + '/api/russia-insights');
  const history = await json(origin + '/api/russia-history');
  assert.deepEqual(current.errors, []);
  assert.deepEqual(history.errors, []);
  for (const series of history.series) {
    const market = current.markets.find(m => m.id === series.id);
    assert.ok(market && Number.isFinite(market.value));
    assert.ok(market.provider && market.unit && market.asOf && market.sourceUrl);
    assert.ok(series.points.length);
    assert.equal(new Set(series.points.map(p => p.date)).size, series.points.length);
    for (let i = 0; i < series.points.length; i++) {
      assert.ok(Number.isFinite(series.points[i].value));
      if (i) assert.ok(series.points[i].date > series.points[i - 1].date);
    }
    const sameDay = series.points.find(p => p.date === market.asOf.slice(0, 10));
    const entry = { id: series.id, points: series.points.length, current: market.value, asOf: market.asOf };
    // An intraday quote is not a close. Check exact dates for daily official series only.
    if (sameDay && !['imoex', 'rgbi'].includes(series.id)) {
      assert.ok(Math.abs(sameDay.value - market.value) < 0.00001, `${series.id}: official daily value differs`);
      entry.sameDateValueAgrees = true;
    }
    if (series.id === 'key-rate') {
      assert.equal(series.points.at(-1).value, market.value);
      entry.stepValueAgrees = true;
    }
    const previous = series.points.find(p => p.date === market.previousDate);
    if (previous && Number.isFinite(market.changePct)) {
      const expected = (market.value / previous.value - 1) * 100;
      assert.ok(Math.abs(expected - market.changePct) < 0.02, `${series.id}: percentage ${market.changePct}, expected ${expected}`);
      entry.changeExpected = expected; entry.changeStored = market.changePct;
    }
    report.data.push(entry);
  }
});
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  await check(name, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [390, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.route('**/*', route => {
          const r = route.request();
          if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()) || r.url().includes('/functions/v1/')) return route.abort();
          return route.continue();
        });
        try {
          for (const path of ['/', '/world', '/russia', '/news']) {
            await check(`${name} ${width} ${path}`, async () => {
              const page = await context.newPage();
              try {
                const errors = [];
                page.on('pageerror', e => errors.push(e.message));
                const response = await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 90000 });
                assert.equal(response.status(), 200);
                await page.locator('main').waitFor();
                await page.waitForTimeout(1000);
                const result = await page.evaluate(() => ({
                  overflow: document.documentElement.scrollWidth > innerWidth + 1,
                  text: document.querySelector('main').innerText.length,
                  cookie: document.cookie,
                  hosts: [...new Set(performance.getEntriesByType('resource').map(r => new URL(r.name).hostname))],
                  unsafeLinks: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /^(javascript|data):/i.test(h)),
                  storage: Object.keys(localStorage),
                }));
                assert.equal(result.overflow, false); assert.ok(result.text > 100);
                assert.equal(result.cookie, ''); assert.deepEqual(await context.cookies(), []);
                assert.deepEqual(result.unsafeLinks, []);
                assert.deepEqual(result.hosts.filter(h => ![locationHost(origin), locationHost(sb)].includes(h)), []);
                assert.deepEqual(result.storage.filter(k => !['market-pulse-favorites-v1', 'market-pulse-heatmap-palette'].includes(k)), []);
                assert.deepEqual(errors, []);
                if (path === '/world') {
                  // Reveal the containing section before measuring descendants:
                  // its remembered off-screen size is not their painted layout.
                  await page.locator('#global-economy').scrollIntoViewIfNeeded();
                  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                  const strip = page.locator('section[aria-labelledby="market-strip-title"] li');
                  result.quoteComparisons = [];
                  for (const [i, id] of ['usd-eur', 'sp500', 'brent', 'gold', 'btc'].entries()) {
                    const value = await strip.nth(i).locator(':scope > div').nth(1).innerText();
                    assert.notEqual(value, '—', `${id}: live value missing`);
                    const tile = page.locator(`#heat-tile-${id}`);
                    // Native content-visibility can omit off-screen innerText.
                    // Compare what a reader actually sees after revealing the tile,
                    // never treat an unpainted subtree as a different quote.
                    await tile.scrollIntoViewIfNeeded();
                    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                    const quoteField = tile.locator(':scope > div').nth(1);
                    // Wait only for non-empty rendering, never for equality with
                    // the expected quote. A wrong value must fail on first read.
                    await page.waitForFunction(node => node.innerText.trim().length > 0, await quoteField.elementHandle(), { timeout: 5000 });
                    const tilePrice = await quoteField.innerText();
                    result.quoteComparisons.push({ id, ticker: value, tile: tilePrice });
                    assert.equal(tilePrice, value, `${id}: ticker ${value} and revealed tile ${tilePrice} disagree`);
                  }
                }
                report.browsers.push({ name, width, path, ...result, errors });
              } finally { await page.close(); }
            });
          }
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  });
}
function locationHost(url) { return new URL(url).hostname; }
// Lab measurements, not real-user Core Web Vitals or a load/capacity test.
for (const path of ['/', '/world']) {
  for (const mode of ['mobile', 'desktop']) {
    await check(`Lighthouse ${mode} ${path}`, async () => {
      let lhr;
      for (let attempt = 0; attempt < 2; attempt++) {
        const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'] });
        try {
          const config = mode === 'desktop' ? desktopConfig : undefined;
          ({ lhr } = await lighthouse(origin + path, { port: chrome.port, logLevel: 'error', output: 'json', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] }, config));
        } finally { await chrome.kill(); }
        // NO_NAVSTART contains no usable trace; never retry a valid bad metric.
        if (attempt === 0 && lhr.runtimeError?.code === 'NO_NAVSTART') {
          await fs.writeFile(`${output}/lighthouse-${mode}-${path === '/' ? 'home' : 'world'}-NO_NAVSTART.json`, JSON.stringify(lhr));
          report.instrumentationRetries.push({ path, mode, reason: 'NO_NAVSTART', attempt: 1 });
          continue;
        }
        break;
      }
        const entry = { path, mode, scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, v.score])),
          lcpMs: lhr.audits['largest-contentful-paint'].numericValue,
          cls: lhr.audits['cumulative-layout-shift'].numericValue,
          tbtMs: lhr.audits['total-blocking-time'].numericValue,
          diagnostics: Object.fromEntries(['label-content-name-mismatch', 'target-size', 'lcp-breakdown-insight', 'largest-contentful-paint-element', 'render-blocking-insight'].filter(k => lhr.audits[k]).map(k => [k, lhr.audits[k].details])),
          findings: Object.values(lhr.audits).filter(a => a.score !== null && a.score < 0.9).map(a => ({ id: a.id, score: a.score, title: a.title, displayValue: a.displayValue })),
        };
        report.lighthouse.push(entry);
        await fs.writeFile(`${output}/lighthouse-${mode}-${path === '/' ? 'home' : 'world'}.json`, JSON.stringify(lhr));
        assert.notEqual(lhr.audits['label-content-name-mismatch']?.score, 0, 'visible and accessible names disagree');
        assert.ok(!lhr.runtimeError, lhr.runtimeError?.message);
        assert.ok(entry.scores.performance >= 0.9, `performance ${entry.scores.performance}`);
        assert.ok(entry.lcpMs <= 2500, `LCP ${entry.lcpMs}ms`);
        assert.ok(entry.cls <= 0.1, `CLS ${entry.cls}`);
        assert.ok(entry.tbtMs <= 200, `TBT ${entry.tbtMs}ms`);
        for (const category of ['accessibility', 'best-practices', 'seo']) assert.equal(entry.scores[category], 1, category);
    });
  }
}
report.finished = new Date().toISOString();
await fs.writeFile(`${output}/technical.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
for (const failure of report.failures) console.error(`::error::${failure.replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D')}`);
for (const result of report.lighthouse) console.log(`::notice::${JSON.stringify(result).replaceAll('%', '%25')}`);
if (report.failures.length) process.exitCode = 1;
