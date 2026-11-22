// Deterministic browser regression of the real expanded panel, not a live
// source/performance audit. Tooling is isolated from application dependencies:
// npm i --prefix .local/feature-browser --no-package-lock playwright @sparticuz/chromium
// npm run build && node scripts/check-quote-tools-browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { chromium } from '../.local/feature-browser/node_modules/playwright/index.mjs';
import binary from '../.local/feature-browser/node_modules/@sparticuz/chromium/build/index.js';
const out = '.local/quote-tools-browser';
await mkdir(out, { recursive: true });
const ids = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'];
const names = ['USD/EUR', 'S&P 500', 'Brent (фьючерс)', 'Золото (спот)', 'Bitcoin'];
const providers = ['ЕЦБ', 'Yahoo Finance', 'Yahoo Finance', 'gold-api.com', 'Kraken'];
const symbols = ['EURUSD', '^GSPC', 'BZ=F', 'XAU', 'XBTUSD'];
const instruments = ['eurusd_ecb_daily', 'sp500_yahoo_gspc', 'brent_yahoo_bzf', 'gold_api_xau_observed_daily', 'btc_kraken_xbtusd_daily'];
const historyPoints = Array.from({ length: 121 }, (_, i) => ({ date: new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10), value: 90.123456789 + i }));
const assets = ids.map((id, i) => ({ id, name: names[i], price: '$210.1234', change: 1, sparkline: historyPoints.map(p => p.value), sparkDates: historyPoints.map(p => p.date), asOf: '2026-09-29T12:34:56Z', sourceLabel: providers[i] }));
const histories = Object.fromEntries(ids.map((id, i) => [id, { assetId: id, instrumentId: instruments[i], provider: providers[i], providerSymbol: symbols[i], points: historyPoints, unfinishedDayExcluded: true }]));
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import MarketHeatmap from './src/components/MarketHeatmap'; createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-3"><MarketHeatmap assets={${JSON.stringify(assets)}} loading={false} /></main>);`, resolveDir: process.cwd(), loader: 'tsx' }, outfile: `${out}/fixture.js`, bundle: true, format: 'esm', jsx: 'automatic', alias: { '@': './src' }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'public-fixture', setup(b) {
    b.onResolve({ filter: /data\/assetPriceHistory$/ }, () => ({ path: 'history', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `const h=${JSON.stringify(histories)}; export async function fetchAssetPriceHistory(id) { return h[id] ?? null; }` }));
  } }],
});
const css = (await readdir('dist/assets')).find(name => /^index-.*\.css$/.test(name));
assert.ok(css, 'Build the real stylesheet first');
const server = createServer(async (req, res) => {
  const path = req.url === '/fixture.js' ? `${out}/fixture.js` : req.url === '/style.css' ? `dist/assets/${css}` : null;
  res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html');
  res.end(path ? await readFile(path) : '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote tools fixture</title><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>');
});
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
const origin = `http://localhost:${server.address().port}`;
const report = { scope: 'Real MarketHeatmap with deterministic public-series fixtures, Chromium, real built CSS. Not live values or performance acceptance.', cases: [], failures: [] };
try {
  for (const round of ['A', 'B']) for (const width of [360, 1280]) {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args, headless: true });
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: round === 'A' ? 'reduce' : 'no-preference', permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin);
      for (const [index, id] of ids.entries()) {
        await page.locator(`#heat-tile-${id}`).click();
        const panel = page.locator('#asset-panel');
        const copy = panel.getByRole('button', { name: 'Копировать котировку', exact: true });
        await copy.click();
        await panel.getByText('Котировка с датой и источником скопирована.', { exact: true }).waitFor();
        const text = await page.evaluate(() => navigator.clipboard.readText());
        for (const expected of [names[index], '210,1234', '2026-09-29T12:34:56Z', providers[index], 'https://']) assert.ok(text.includes(expected));
        assert.ok(await copy.evaluate(el => el.getBoundingClientRect().height >= 44));
        for (const days of [30, 90, 180]) {
          await panel.locator(`#asset-history-range-${days}`).click();
          const download = panel.getByRole('button', { name: 'Скачать точки графика · CSV', exact: true });
          assert.ok(await download.isEnabled());
          const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
          const bytes = await readFile(await file.path());
          assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
          const lines = bytes.toString('utf8').trimEnd().split('\r\n');
          const expected = historyPoints.filter(p => Date.parse(p.date) >= Date.parse(historyPoints.at(-1).date) - days * 86400000);
          assert.equal(lines.length - 1, expected.length);
          for (const [i, point] of expected.entries()) {
            assert.ok(lines[i + 1].startsWith(`"${point.date}";"${String(point.value).replace('.', ',')}";`));
            assert.ok(lines[i + 1].includes(instruments[index]));
          }
          assert.ok(file.suggestedFilename().includes(id));
          const count = (await panel.locator('summary').innerText()).match(/·\s*(\d+)/)?.[1];
          assert.equal(Number(count), expected.length);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
          report.cases.push({ round, width, id, days, points: expected.length, clipboard: 'pass', csv: 'pass', overflow: false });
        }
        if (id === 'brent' && round === 'A') await panel.screenshot({ path: `${out}/panel-${width}.png` });
      }
      // Test the browser-denial UI separately from the working native clipboard.
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }, configurable: true }));
      await page.getByRole('button', { name: 'Копировать котировку', exact: true }).click();
      const manual = page.getByLabel('Текст котировки для ручного копирования');
      await manual.waitFor();
      assert.ok((await manual.inputValue()).includes('Kraken'));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
} catch (error) { report.failures.push(error.stack); process.exitCode = 1; }
finally { server.close(); }
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ cases: report.cases.length, failures: report.failures }, null, 2));
