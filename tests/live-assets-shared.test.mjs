import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const directory = new URL('../.local/shared-assets-tests/', import.meta.url);
await mkdir(directory, { recursive: true });
const output = new URL('hook.cjs', directory);
await build({ entryPoints: ['src/hooks/useLiveAssets.ts'], outfile: output.pathname,
  bundle: true, platform: 'node', format: 'cjs', external: ['react'], alias: { '@': './src' }, logLevel: 'silent',
  plugins: [{ name: 'read-boundary', setup(b) {
    b.onResolve({ filter: /data\/liveAssets$/ }, () => ({ path: 'assets', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function fetchLiveAssets(options) { return globalThis.__assetRead(options); }' }));
  } }],
});
const { useLiveAssets } = createRequire(import.meta.url)(output.pathname);
let dom, root;
const views = {};
function Consumer({ id }) {
  const state = useLiveAssets();
  views[id] = state;
  return React.createElement('output', { id }, state.assets.find(a => a.id === 'btc')?.price);
}
const row = price => [{ id: 'btc', name: 'BTC', price, change: 1, sparkline: [100, 101], sparkDates: ['2026-10-26', '2026-10-27'] }];
async function mount() {
  dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(React.Fragment, null,
    React.createElement(Consumer, { id: 'ticker' }), React.createElement(Consumer, { id: 'tiles' }))));
}
afterEach(async () => {
  await act(async () => root?.unmount()); root = null;
  dom?.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.__assetRead;
});
after(() => rm(directory, { recursive: true, force: true }));

test('one refresh updates every displayed asset block, not only the clicked block', async () => {
  let current = row('$101');
  globalThis.__assetRead = async () => current;
  await mount();
  current = row('$102');
  await act(async () => views.tiles.refresh());
  assert.equal(document.getElementById('ticker').textContent, '$102');
  assert.equal(document.getElementById('tiles').textContent, '$102');
  assert.equal(views.ticker.assets, views.tiles.assets);
});

test('simultaneous initial loads and refreshes share a request and failure state', async () => {
  let calls = 0, finish;
  globalThis.__assetRead = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  await mount();
  assert.equal(calls, 1, 'mounted blocks must not race independent snapshots');
  await act(async () => { finish(row('$101')); });
  let first, second;
  await act(async () => { first = views.ticker.refresh(); second = views.tiles.refresh(); });
  assert.equal(calls, 2);
  assert.equal(views.ticker.isRefreshing, true);
  assert.equal(views.tiles.isRefreshing, true);
  await act(async () => { finish([]); await Promise.all([first, second]); });
  assert.equal(views.ticker.error, views.tiles.error);
  assert.ok(views.ticker.error);
  assert.equal(document.getElementById('ticker').textContent, '$101');
  assert.equal(document.getElementById('tiles').textContent, '$101');
  assert.equal(views.tiles.isRefreshing, false);
});

test('an unmounted page cannot publish its late response over the next page', async () => {
  const reads = [];
  globalThis.__assetRead = () => new Promise(resolve => reads.push(resolve));
  await mount();
  await act(async () => root.unmount());
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Consumer, { id: 'tiles' })));
  await act(async () => { reads.at(-1)(row('$202')); });
  await act(async () => { reads[0](row('$101')); });
  assert.equal(document.getElementById('tiles').textContent, '$202');
});
