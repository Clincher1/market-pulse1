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

function contrastAgainstInk(background) {
  const match = background.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  assert.ok(match, `expected a rendered RGB tile fill, received: ${background}`);
  const luminance = channels => {
    const [r, g, b] = channels.map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const light = luminance(match.slice(1).map(Number));
  const dark = luminance([23, 32, 51]);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

test('heatmap change and scale wrap independently instead of clipping the scale in narrow mobile tiles', () => {
  const html = renderToStaticMarkup(React.createElement(MarketHeatmap, {
    loading: false,
    assets: [
      { id: 'btc', name: 'BTC', price: '$123 456', change: -12.34, sparkline: [100, 87.66], sparkDates: ['2026-10-26', '2026-10-27'], asOf: '2026-10-27' },
      { id: 'sp500', name: 'S&P 500', price: '7 232', change: 1.5, sparkline: [100, 101.5], sparkDates: ['2026-10-26', '2026-10-27'], asOf: '2026-10-27' },
    ],
  }));
  const dom = new JSDOM(html);
  const row = dom.window.document.querySelector('[data-testid="heat-tile-change-scale"]');
  assert.ok(row);
  assert.ok(row.classList.contains('flex-wrap'));
  assert.equal(row.children.length, 2);
  assert.match(row.children[0].textContent, /12,34/);
  assert.match(row.children[1].textContent, /шкала ±6/);
  const tile = dom.window.document.querySelector('.heat-tile');
  assert.ok(tile);
  assert.match(tile.getAttribute('style') ?? '', /--heat-tile-bg:\s*rgb\(/,
    'the heatmap renders a direction-and-intensity tint instead of neutral white tiles');
  const tiles = [...dom.window.document.querySelectorAll('.heat-tile')];
  assert.equal(tiles.length, 2);
  for (const coloredTile of tiles) {
    assert.ok(contrastAgainstInk(coloredTile.getAttribute('style') ?? '') >= 4.5,
      'positive and negative fills keep dark text at WCAG AA contrast');
  }
  assert.ok(dom.window.document.querySelector('.heat-tile__price'));
  assert.match(html, /grid-cols-1[^\"]*min-\[520px\]:grid-cols-2/,
    'tiles use the full width on narrow phones before switching to a two-column layout');
  assert.match(html, /Цвет показывает направление и силу изменения/);
  dom.window.close();
});
