import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
await mkdir('.local/chart-csv-tests', { recursive: true });
await build({ entryPoints: ['src/components/MarketHeatmap.tsx', 'src/lib/chartCsv.ts'], outdir: '.local/chart-csv-tests', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, jsx: 'automatic', external: ['react', 'react-dom'], alias: { '@': './src' }, logLevel: 'silent',
  plugins: [{ name: 'public-history', setup(b) {
    b.onResolve({ filter: /data\/assetPriceHistory$/ }, () => ({ path: 'history', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export async function fetchAssetPriceHistory() { return globalThis.__csvHistory; }' }));
  } }],
});
const require = createRequire(import.meta.url);
const MarketHeatmap = require('../.local/chart-csv-tests/components/MarketHeatmap.cjs').default;
const { buildChartCsv } = require('../.local/chart-csv-tests/lib/chartCsv.cjs');
const points = Array.from({ length: 121 }, (_, index) => ({ date: new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10), value: 90.123456789 + index }));
const history = { assetId: 'brent', instrumentId: 'brent_yahoo_bzf', provider: 'Yahoo Finance', providerSymbol: 'BZ=F', points, unfinishedDayExcluded: true };
const input = { assetId: 'brent', assetName: 'Brent (фьючерс)', sourceUrl: 'https://finance.yahoo.com/quote/BZ%3DF', history, points: points.slice(-40) };

test('CSV contains every selected actual observation, full precision, unit and matching source', () => {
  const csv = buildChartCsv(input);
  assert.ok(csv.text.startsWith('\uFEFF'));
  assert.equal(csv.text.split('\r\n').length, 42);
  assert.ok(csv.text.includes(String(input.points[0].value).replace('.', ',')));
  assert.ok(csv.text.includes('"$ за баррель"'));
  assert.ok(csv.text.includes('"BZ=F"'));
  assert.ok(!csv.text.includes(points[0].date));
  assert.equal(csv.filename, `market-pulse-brent-${points[81].date}-${points[120].date}.csv`);
});
test('CSV rejects other instruments, restricted history, interpolated rows, bad dates and undated sparklines', () => {
  for (const patch of [
    { history: { ...history, instrumentId: 'twelve_data_gold' } },
    { history: { ...history, assetId: 'btc' } },
    { points: [] }, { points: [points[0]] }, { points: [points[2], points[1]] },
    { points: [{ date: points[1].date, value: 999 }, points[2]] },
    { points: [{ date: '2026-02-30', value: 100 }, points[2]] },
    { points: [points[2], points[2]] }, { sourceUrl: 'javascript:alert(1)' },
  ]) assert.equal(buildChartCsv({ ...input, ...patch }), null);
});
test('CSV quotes delimiters/newlines and guards spreadsheet formulas in provider metadata', () => {
  const csv = buildChartCsv({ ...input, assetName: '=HYPERLINK("bad");name', history: { ...history, provider: ' \t+SUM(1,2)', providerSymbol: 'symbol;"quoted"\nnext' } });
  assert.ok(csv.text.includes('"\'=HYPERLINK(""bad"");name"'));
  assert.ok(csv.text.includes('"\' \t+SUM(1,2)"'));
  assert.ok(csv.text.includes('"symbol;""quoted""\nnext"'));
});
test('gold export identifies own UTC observations, never official closes', () => {
  const csv = buildChartCsv({ ...input, assetId: 'gold', assetName: 'Золото', history: { ...history, assetId: 'gold', instrumentId: 'gold_api_xau_observed_daily', provider: 'gold-api.com · наши наблюдения UTC', providerSymbol: 'XAU' } });
  assert.match(csv.text, /не официальный close/);
  assert.match(csv.text, /тройскую унцию/);
});
let root, dom;
const originalCreateUrl = URL.createObjectURL;
const originalRevokeUrl = URL.revokeObjectURL;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  dom?.window.close(); root = null;
  URL.createObjectURL = originalCreateUrl;
  URL.revokeObjectURL = originalRevokeUrl;
});
async function mount(loadedHistory = history) {
  dom = new JSDOM('<div id="root"></div>', { url: 'https://market-pulse.test' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__csvHistory = loadedHistory;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MarketHeatmap, { loading: false, assets: [{ id: 'brent', name: input.assetName, price: '$92.57', change: 1, sparkline: [90, 92.57], asOf: '2026-10-27', sourceLabel: 'Yahoo Finance' }] })));
  const tile = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-expanded') === 'false' && b.textContent.includes('Brent'));
  assert.ok(tile);
  await act(async () => tile.click());
}
function downloadButton() { return [...document.querySelectorAll('button')].find(b => b.textContent.includes('Скачать точки графика')); }
test('real expanded heatmap downloads exactly selected range, not last 30 table rows; switches range without fetching', async () => {
  await mount();
  let blob, filename;
  URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  assert.ok(document.querySelector('button').isConnected);
  for (const days of [90, 30, 180]) {
    await act(async () => document.getElementById(`asset-history-range-${days}`).click());
    await act(async () => downloadButton().click());
    const expectedPoints = points.filter(p => Date.parse(p.date) >= Date.parse(points.at(-1).date) - days * 86400000);
    const expected = buildChartCsv({ ...input, points: expectedPoints });
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), Buffer.from(expected.text, 'utf8'));
    assert.equal(filename, expected.filename);
    assert.equal(document.querySelector('a[download]'), null);
  }
});
test('undated history fallback never offers CSV', async () => {
  await mount(null);
  assert.equal(downloadButton(), undefined);
});
test('download errors are visible rather than reporting a successful save', async () => {
  await mount();
  URL.createObjectURL = () => { throw new Error('blocked'); };
  await act(async () => downloadButton().click());
  assert.match(document.getElementById('asset-panel').textContent, /Не удалось начать скачивание/);
});
