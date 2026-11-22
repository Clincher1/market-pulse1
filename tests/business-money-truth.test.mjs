import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dir = new URL('../.local/business-money-truth/', import.meta.url);
await mkdir(dir, { recursive: true });
const out = new URL('component.cjs', dir);
await build({
  entryPoints: ['src/components/BusinessMoney.tsx'], outfile: out.pathname,
  bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom'], alias: { '@': './src' }, logLevel: 'silent',
  plugins: [{ name: 'read-boundaries', setup(b) {
    b.onResolve({ filter: /hooks\/useLiveAssets$/ }, () => ({ path: 'assets', namespace: 'fixtures' }));
    b.onResolve({ filter: /data\/russiaInsights$/ }, () => ({ path: 'russia', namespace: 'fixtures' }));
    b.onLoad({ filter: /.*/, namespace: 'fixtures' }, ({ path }) => ({ contents: path === 'assets'
      ? 'export function useLiveAssets() { return { assets: [globalThis.__money.asset], fallbackAssetIds: [] }; }'
      : 'export async function fetchRussiaInsightsShared() { return { markets: globalThis.__money.markets }; }' }));
  } }],
});
const BusinessMoney = createRequire(import.meta.url)(out.pathname).default;
let root, dom, container;
const markets = [
  { id: 'usd-rub', value: 80, changePct: 1, asOf: '2026-11-20', provider: 'Банк России', sourceUrl: 'https://www.cbr.ru/currency_base/daily/' },
  { id: 'key-rate', value: 14, asOf: '2026-07-27', sourceUrl: 'https://www.cbr.ru/hd_base/KeyRate/' },
  { id: 'ruonia', value: 14.1, asOf: '2026-11-19', changeAbs: 0.1, sourceUrl: 'https://www.cbr.ru/hd_base/ruonia/' },
  { id: 'cny-rub-moex', value: 12.147, asOf: '2026-11-20', provider: 'Мосбиржа ISS' },
];
async function mount(change = null, rows = markets) {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://market-pulse.test/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__money = { markets: rows, asset: { id: 'brent', price: '$92.57', change, asOf: '2026-11-20' } };
  container = document.getElementById('root'); root = createRoot(container);
  await act(async () => root.render(React.createElement(BusinessMoney)));
}
afterEach(async () => { await act(async () => root?.unmount()); dom?.window.close(); root = null; });
after(async () => { await rm(dir, { recursive: true, force: true }); });
function fact(title) { return [...container.querySelectorAll('a')].find(a => a.textContent.includes(title)); }

test('missing Brent change keeps its valid price without inventing a zero percentage', async () => {
  await mount(null);
  const oil = fact('Нефть'); assert.ok(oil);
  assert.match(oil.textContent, /92,57/);
  assert.doesNotMatch(oil.textContent, /0,00\s*%/);
});
test('an actual zero Brent change is still displayed as zero', async () => {
  await mount(0);
  assert.match(fact('Нефть').textContent, /0,00\s*%/);
});


test('official calculation card never substitutes a MOEX yuan quote for the CBR rate', async () => {
  await mount(0);
  const fx = fact('Курс для расчётов');
  assert.doesNotMatch(fx.textContent, /CNY\/RUB|12,147/);
});
test('the official yuan reference is displayed when CBR actually supplies it', async () => {
  await mount(0, [...markets, { id: 'cny-rub-cbr', value: 12.2759, asOf: '2026-11-21' }]);
  const fx = fact('Курс для расчётов');
  assert.match(fx.textContent, /CNY\/RUB/);
  assert.match(fx.textContent, /12,2759/);
  assert.doesNotMatch(fx.textContent, /12,147/);
});


test('money card source follows its main key-rate value, not the secondary RUONIA', async () => {
  await mount();
  assert.equal(fact('Стоимость денег').getAttribute('href'), 'https://www.cbr.ru/hd_base/KeyRate/');
});
test('money card uses RUONIA source only when RUONIA is the main available value', async () => {
  await mount(0, markets.filter(m => m.id !== 'key-rate'));
  assert.equal(fact('Стоимость денег').getAttribute('href'), 'https://www.cbr.ru/hd_base/ruonia/');
});
