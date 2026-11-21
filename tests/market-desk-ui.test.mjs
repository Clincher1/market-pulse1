import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// Exercise the real component and hooks, substituting only remote read boundaries.
const directory = new URL('../.local/market-desk-tests/', import.meta.url);
await mkdir(directory, { recursive: true });
const output = new URL('component.cjs', directory);
await build({
  entryPoints: ['src/components/MarketDesk.tsx'], outfile: output.pathname,
  bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom'], loader: { '.css': 'empty' },
  alias: { '@': './src' }, logLevel: 'silent',
  plugins: [{ name: 'read-only-fixtures', setup(builder) {
    builder.onResolve({ filter: /data\/liveAssets$/ }, () => ({ path: 'assets', namespace: 'fixtures' }));
    builder.onResolve({ filter: /data\/russiaInsights$/ }, () => ({ path: 'russia', namespace: 'fixtures' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixtures' }, ({ path }) => ({ contents: path === 'assets'
      ? `export async function fetchLiveAssets() { globalThis.__deskFixture.calls++; return globalThis.__deskFixture.fail ? [] : globalThis.__deskFixture.assets; }`
      : `export async function fetchRussiaInsightsShared() { return { markets: globalThis.__deskFixture.russia }; }` }));
  } }],
});
const require = createRequire(import.meta.url);
const MarketDesk = require(output.pathname).default;
const dates = ['2026-10-23', '2026-10-26', '2026-10-27'];
const assets = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'].map((id, index) => ({
  id, name: id === 'brent' ? 'Brent (фьючерс)' : id,
  price: '$120', change: 999, sparkline: [100, 110, 120 + index], sparkDates: dates,
  sourceLabel: 'Fixture provider', asOf: '2026-10-27',
}));
let dom;
let root;
let container;
let resizeListener;
function findButton(text) {
  const button = [...container.querySelectorAll('button')].find((node) => node.textContent.includes(text));
  assert.ok(button, `button ${text} exists`);
  return button;
}
async function click(element) { await act(async () => { element.click(); }); }
async function mount({ summary = false, stored = null, blocked = false, fail = false, rows = assets } = {}) {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://market-pulse.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    constructor(callback) { resizeListener = callback; }
    observe() {}
    disconnect() { resizeListener = null; }
  };
  globalThis.__deskFixture = { assets: rows, fail, calls: 0, russia: [{
    id: 'imoex', name: 'Индекс Мосбиржи', value: 2500, unit: 'пункты', changePct: -1.25,
    asOf: '2026-10-27T15:00:00+03:00', previousDate: '2026-10-26', provider: 'Мосбиржа ISS', basis: 'К предыдущему закрытию',
  }] };
  if (stored !== null) window.localStorage.setItem('market-pulse-favorites-v1', stored);
  if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  container = document.getElementById('root');
  root = createRoot(container);
  await act(async () => { root.render(React.createElement(MarketDesk, { summary })); });
}
async function cleanup() {
  await act(async () => { root?.unmount(); });
  dom?.window.close();
  root = null;
}
afterEach(cleanup);
after(async () => { await cleanup(); await rm(directory, { recursive: true, force: true }); });

test('summary shows dated Russian/world facts; favorites toggle, persist, remove and survive remount', async () => {
  await mount({ summary: true });
  assert.match(container.textContent, /Главное за минуту/);
  assert.match(container.textContent, /Индекс Мосбиржи/);
  assert.match(container.textContent, /−1,25/);
  assert.match(container.textContent, /26\.10\.2026/);
  assert.match(container.textContent, /Мои ориентиры/);
  assert.equal(container.querySelector('.desk-chart'), null);
  await click(findButton('btc'));
  assert.equal(findButton('btc').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('market-pulse-favorites-v1')), ['btc']);
  assert.match(container.querySelector('.desk-watchlist').textContent, /Fixture provider/);
  await act(async () => { root.unmount(); root = createRoot(container); root.render(React.createElement(MarketDesk, { summary: true })); });
  assert.equal(findButton('btc').getAttribute('aria-pressed'), 'true');
  await click(findButton('btc'));
  assert.equal(container.querySelector('.desk-watchlist'), null);
  await cleanup();
});

test('denied or corrupt localStorage never crashes the component', async () => {
  await mount({ blocked: true });
  await click(findButton('gold'));
  assert.match(container.textContent, /Браузер не разрешил сохранить/);
  assert.equal(findButton('gold').getAttribute('aria-pressed'), 'true');
  await cleanup();
  await mount({ stored: '{not json' });
  assert.match(container.textContent, /Пока ничего не выбрано/);
  await cleanup();
});

test('comparison renders three series; scale and selection controls update without NaN', async () => {
  await mount();
  assert.equal(container.querySelectorAll('.desk-chart polyline').length, 3);
  assert.match(container.querySelector('.desk-table').textContent, /Ис|Инструмент/);
  assert.match(container.querySelector('.desk-table').textContent, /100 → 121/);
  const scale = [...container.querySelectorAll('select')][1];
  await act(async () => { scale.value = '100'; scale.dispatchEvent(new window.Event('change', { bubbles: true })); });
  assert.match(container.querySelector('.desk-table').textContent, /Индекс в конце/);
  const boxes = [...container.querySelectorAll('input[type=checkbox]')];
  for (const checkbox of boxes.filter((node) => node.checked).slice(1)) await click(checkbox);
  assert.match(container.textContent, /Выберите хотя бы два/);
  assert.equal(container.querySelector('.desk-chart'), null);
  assert.doesNotMatch(container.innerHTML, /NaN|Infinity/);
  await cleanup();
});

test('network failure shows no fabricated quotes; retry restores comparison and favorites', async () => {
  await mount({ fail: true, stored: '["btc"]' });
  assert.match(container.textContent, /Котировки не обновились/);
  assert.match(container.querySelector('.desk-price').textContent, /—/);
  assert.equal(container.querySelector('.desk-chart'), null);
  assert.equal(container.querySelectorAll('input[type=checkbox]').length, 5);
  globalThis.__deskFixture.fail = false;
  await click(findButton('Обновить'));
  assert.ok(container.querySelector('.desk-chart'));
  assert.match(container.querySelector('.desk-price').textContent, /120/);
  assert.equal(globalThis.__deskFixture.calls, 2);
  await cleanup();
});

test('partial data is selectable but never silently omitted from a comparison', async () => {
  await mount({ rows: assets.filter((asset) => asset.id !== 'btc') });
  assert.equal(container.querySelector('.desk-chart'), null);
  assert.match(container.textContent, /Часть котировок недоступна/);
  const btcBox = [...container.querySelectorAll('label')].find((node) => node.textContent.toLowerCase().includes('btc'))?.querySelector('input');
  assert.ok(btcBox);
  assert.equal(btcBox.checked, true);
  await click(btcBox);
  assert.equal(container.querySelectorAll('.desk-chart polyline').length, 2);
  await cleanup();
});

test('a failed refresh labels retained quotes and a storage event syncs tabs', async () => {
  await mount({ stored: '["btc"]' });
  globalThis.__deskFixture.fail = true;
  await click(findButton('Обновить'));
  assert.match(container.textContent, /последние загруженные данные/);
  assert.match(container.querySelector('.desk-price').textContent, /120/);
  await act(async () => {
    window.localStorage.setItem('market-pulse-favorites-v1', '["gold"]');
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'market-pulse-favorites-v1' }));
  });
  assert.equal(findButton('btc').getAttribute('aria-pressed'), 'false');
  assert.equal(findButton('gold').getAttribute('aria-pressed'), 'true');
  await cleanup();
});

test('chart adapts its coordinate system to a narrow mobile content width', async () => {
  await mount();
  await act(async () => { resizeListener([{ contentRect: { width: 264 } }]); });
  const svg = container.querySelector('.desk-chart');
  assert.equal(svg.getAttribute('viewBox'), '0 0 264 245');
  for (const line of svg.querySelectorAll('polyline')) {
    for (const point of line.getAttribute('points').split(' ')) {
      const [x, y] = point.split(',').map(Number);
      assert.ok(x >= 65 && x <= 239);
      assert.ok(y >= 20 && y <= 210);
    }
  }
  assert.doesNotMatch(svg.outerHTML, /NaN|Infinity/);
  await cleanup();
});

test('comparison table region is keyboard focusable and named', async () => {
  await mount();
  const region = container.querySelector('.desk-table-wrap');
  assert.ok(region);
  assert.equal(region.getAttribute('tabindex'), '0');
  assert.equal(region.getAttribute('role'), 'region');
  assert.match(region.getAttribute('aria-label'), /Результаты сравнения/);
  region.focus();
  assert.equal(document.activeElement, region);
});
