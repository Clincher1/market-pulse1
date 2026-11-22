import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const directory = new URL('../.local/heatmap-layout-tests/', import.meta.url);
await mkdir(directory, { recursive: true });
const output = new URL('heatmap.cjs', directory).pathname;
await build({
  entryPoints: ['src/components/MarketHeatmap.tsx'], outfile: output,
  bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom'], alias: { '@': './src' }, logLevel: 'silent',
  plugins: [{ name: 'no-remote-history', setup(builder) {
    builder.onResolve({ filter: /data\/assetPriceHistory$/ }, () => ({ path: 'history', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export async function fetchAssetPriceHistory() { return null; }' }));
  } }],
});
const MarketHeatmap = createRequire(import.meta.url)(output).default;

test('heatmap change and scale wrap independently instead of clipping the scale in narrow mobile tiles', () => {
  const html = renderToStaticMarkup(React.createElement(MarketHeatmap, {
    loading: false,
    assets: [{ id: 'btc', name: 'BTC', price: '$123 456', change: -12.34, sparkline: [100, 87.66], sparkDates: ['2026-10-26', '2026-10-27'], asOf: '2026-10-27' }],
  }));
  const dom = new JSDOM(html);
  const row = dom.window.document.querySelector('[data-testid="heat-tile-change-scale"]');
  assert.ok(row);
  assert.ok(row.classList.contains('flex-wrap'));
  assert.equal(row.children.length, 2);
  assert.match(row.children[0].textContent, /12,34/);
  assert.match(row.children[1].textContent, /шкала ±6/);
  dom.window.close();
});
