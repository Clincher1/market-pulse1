import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { buildBriefCard } from '../api/brief-image.js';

const directory = new URL('../.local/brief-tests/', import.meta.url);
await mkdir(directory, { recursive: true });
const output = new URL('brief.cjs', directory);
await build({ entryPoints: ['src/components/DailyBrief.tsx'], outfile: output.pathname,
  bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'],
  alias: { '@': './src' }, logLevel: 'silent',
  plugins: [{ name: 'remote-fixtures', setup(builder) {
    builder.onResolve({ filter: /hooks\/useLiveAssets$/ }, () => ({ path: 'assets', namespace: 'fixtures' }));
    builder.onResolve({ filter: /data\/russiaInsights$/ }, () => ({ path: 'russia', namespace: 'fixtures' }));
    builder.onResolve({ filter: /data\/dailySnapshots$/ }, () => ({ path: 'snapshot', namespace: 'fixtures' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixtures' }, ({ path }) => ({ contents: path === 'assets'
      ? `export function useLiveAssets() { return { assets: globalThis.__brief.assets, hasLiveData: true, fallbackAssetIds: [], loading: false }; }`
      : path === 'russia' ? `export async function fetchRussiaInsights() { return globalThis.__brief.russia; }`
      : `export async function fetchTodaySnapshot() { return { snapshot: globalThis.__brief.snapshot, error: false }; }` }));
  } }],
});
const Brief = createRequire(import.meta.url)(output.pathname).default;
const base = [
  { id: 'ruonia', name: 'RUONIA', value: 13.96, unit: '%', asOf: '2026-10-26', provider: 'Банк России', sourceUrl: 'https://www.cbr.ru/' },
  { id: 'ofz-10y', name: 'ОФЗ 10 лет', value: 16.99, unit: '%', asOf: '2026-10-26', provider: 'Мосбиржа ISS', sourceUrl: 'https://www.moex.com/' },
];
const assets = [{ id: 'gold', name: 'Gold', price: '$110.00', change: 1, sparkline: [100, 110], sparkDates: ['2026-10-26', '2026-10-27'], asOf: '2026-10-28T14:00:00Z' }];
const russia = { markets: base.map((row) => ({ ...row, value: row.id === 'ruonia' ? 14 : 17.07, asOf: '2026-10-27' })), headlines: [] };
const snapshot = { capturedAt: '2026-10-28T04:00:00Z', assets: [{ id: 'gold', name: 'Gold', last: 100, price: '$100.00', asOf: '2026-10-28T03:55:00Z' }], russiaMarkets: base };

test('rendered brief separates rates, uses point dates, labels missing snapshot dates', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://market-pulse.test/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__brief = { assets, russia, snapshot };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(Brief)));
    const text = document.body.textContent;
    assert.match(text, /\+0,04\s*п\.п\./);
    assert.match(text, /\+0,08\s*п\.п\./);
    assert.doesNotMatch(text, /\+0,29\s*%|\+0,47\s*%/);
    assert.match(text, /дата точки в снимке не сохранена → 27\.10\.2026/);
    assert.match(text, /Ставки и доходности · п\.п\./);
    const source = document.querySelector('li a[aria-label^="Открыть источник"]');
    assert.ok(source, 'fixture must include a source link');
    assert.ok(source.classList.contains('basis-full'), 'mobile source must not squeeze prose into a narrow column');
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    delete globalThis.__brief; delete globalThis.window; delete globalThis.document;
  }
});

test('Brief comparison annotates a point recorded as revised by its source', async () => {
  const original = globalThis.fetch;
  const brent = { id: 'brent', name: 'Brent', price: '$105.00', change: 5,
    sparkline: [100, 105], spark_dates: ['2026-10-26', '2026-10-27'],
    as_of: '2026-10-27T00:00:00Z', source_label: 'Yahoo Finance', updated_at: '2026-10-28T04:00:00Z' };
  const brentSnapshot = { captured_at: snapshot.capturedAt, assets: [{ id: 'brent', name: 'Brent',
    last: 100, last_date: '2026-10-26', price: '$100.00', as_of: '2026-10-26T00:00:00Z' }],
    russia: { markets: base } };
  globalThis.fetch = async (url) => {
    const address = String(url);
    const payload = address.includes('asset_price_revisions_public_v1')
      ? [{ instrument: 'brent_yahoo_bzf', observation_date: '2026-10-27',
        source: 'Yahoo Finance', status: 'accepted', original_value: '100', revised_value: '105', delta_pct: '5' }]
      : address.includes('daily_snapshots') ? [brentSnapshot]
      : address.includes('cached_assets') ? [brent] : russia;
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const card = await buildBriefCard();
    assert.ok(card.changes.some(text => text.includes('значение за дату пересмотрено источником')));
  } finally { globalThis.fetch = original; }
});

test('Telegram card uses the same units and dates as the browser', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const payload = String(url).includes('daily_snapshots') ? [{ captured_at: snapshot.capturedAt,
      assets: snapshot.assets.map((row) => ({ ...row, as_of: row.asOf })), russia: { markets: base } }]
      : String(url).includes('cached_assets') ? assets.map((row) => ({ ...row, spark_dates: row.sparkDates, as_of: row.asOf })) : russia;
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const card = await buildBriefCard();
    const text = card.changes.join(' ');
    assert.match(text, /\+0,04\s*п\.п\./);
    assert.match(text, /\+0,08\s*п\.п\./);
    assert.match(text, /дата точки в снимке не сохранена → 27\.10\.2026/);
    assert.doesNotMatch(text, /\+0,29\s*%|\+0,47\s*%/);
  } finally { globalThis.fetch = original; }
});
after(async () => { await rm(directory, { recursive: true, force: true }); });

test('HTTP diagnostics report the real rendered PNG, not a presumed successful build', async () => {
  const { default: handler } = await import('../api/brief-image.js');
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('cached_assets')
    ? assets.map((row) => ({ ...row, spark_dates: row.sparkDates, as_of: row.asOf }))
    : String(url).includes('daily_snapshots') ? [] : russia), { headers: { 'Content-Type': 'application/json' } });
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; } };
  try {
    await handler({ method: 'GET', url: '/api/brief-image?diag=json' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.signature, '89504e470d0a1a0a');
    assert.equal(response.payload.width, 1080);
    assert.ok(response.payload.height >= 900);
    assert.ok(response.payload.bytes > 10000);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.headers['Vercel-CDN-Cache-Control'], undefined);
  } finally { globalThis.fetch = original; }
});
