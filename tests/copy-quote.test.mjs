import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
await mkdir('.local/copy-quote-tests', { recursive: true });
await build({ entryPoints: ['src/components/CopyQuoteButton.tsx', 'src/lib/quoteCopy.ts'], outdir: '.local/copy-quote-tests', bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, jsx: 'automatic', external: ['react', 'react-dom'], alias: { '@': './src' }, logLevel: 'silent' });
const require = createRequire(import.meta.url);
const CopyQuoteButton = require('../.local/copy-quote-tests/components/CopyQuoteButton.cjs').default;
const { quoteCopyText } = require('../.local/copy-quote-tests/lib/quoteCopy.cjs');
const asset = { id: 'brent', name: 'Brent (фьючерс)', price: '$92.57', change: null, sparkline: [], asOf: '2026-10-27', updatedAt: '2026-10-28T09:00:00Z', sourceLabel: 'Yahoo Finance' };
const sourceUrl = 'https://finance.yahoo.com/quote/BZ%3DF';

test('copy preserves instrument, precision, observation date, unit and source, never cache refresh time', () => {
  const text = quoteCopyText(asset, sourceUrl);
  for (const part of ['Brent (фьючерс)', '$92,57', '$ за баррель', '27.10.2026', 'Yahoo Finance', sourceUrl]) assert.ok(text.includes(part));
  assert.ok(!text.includes(asset.updatedAt));
  assert.ok(!text.includes('0,00'));
  assert.ok(quoteCopyText({ ...asset, asOf: '2026-10-27T20:00:00+03:00' }, sourceUrl).includes('27.10.2026 17:00 UTC'));
});
test('copy refuses fallback, missing observations, invalid dates, prices or unsafe links', () => {
  assert.equal(quoteCopyText(asset, sourceUrl, true), null);
  for (const patch of [{ asOf: null }, { asOf: '2026-02-30' }, { price: '—' }, { sourceLabel: '' }, { id: 'unknown' }]) assert.equal(quoteCopyText({ ...asset, ...patch }, sourceUrl), null);
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.org', 'not a URL']) assert.equal(quoteCopyText(asset, url), null);
});
let root, dom;
afterEach(async () => { if (root) await act(async () => root.unmount()); dom?.window.close(); root = null; });
async function mount(clipboard) {
  dom = new JSDOM('<div id="root"></div>', { url: 'https://market-pulse.test' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(CopyQuoteButton, { asset, sourceUrl })));
}
test('real copy button writes exactly the dated quote and reports success only after writing', async () => {
  let written;
  await mount({ async writeText(text) { written = text; } });
  await act(async () => document.querySelector('button').click());
  assert.equal(written, quoteCopyText(asset, sourceUrl));
  assert.match(document.querySelector('[role="status"]').textContent, /скопирована/);
});
test('clipboard denial provides selectable text, without claiming success', async () => {
  await mount({ async writeText() { throw new Error('NotAllowedError'); } });
  await act(async () => document.querySelector('button').click());
  assert.match(document.querySelector('[role="status"]').textContent, /не разрешил/);
  assert.equal(document.querySelector('textarea').value, quoteCopyText(asset, sourceUrl));
  assert.equal(document.querySelector('textarea').readOnly, true);
});
test('missing Clipboard API also provides manual copy; changed observation clears old status', async () => {
  await mount(undefined);
  await act(async () => document.querySelector('button').click());
  assert.ok(document.querySelector('textarea'));
  await act(async () => root.render(React.createElement(CopyQuoteButton, { asset: { ...asset, asOf: '2026-10-28' }, sourceUrl })));
  assert.equal(document.querySelector('textarea'), null);
  assert.equal(document.querySelector('[role="status"]').textContent, '');
});
