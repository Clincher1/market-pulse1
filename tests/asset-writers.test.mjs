import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { checkChangeAgainstSeries } from '../supabase/functions/_shared/asset-truth.ts';
const directory = new URL('../.local/writer-tests/', import.meta.url);
await mkdir(directory, { recursive: true });
async function loadWriter(name) {
  const output = new URL(`${name}.mjs`, directory);
  await build({ entryPoints: [`supabase/functions/${name}/index.ts`], outfile: output.pathname,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'no-server', setup(builder) {
      builder.onResolve({ filter: /observability\.ts$/ }, () => ({ path: 'serve', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function serveWithErrorReporting() {}' }));
    } }],
  });
  return import(output.href);
}
const { makeAsset } = await loadWriter('update-assets');
const points = Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-${12 + i}`, value: 3900 - i * 20 }));
points[6].value = 3723.72756; points[7].value = 3666.8714;
function asset(overrides = {}) {
  return makeAsset({ id: 'gold', name: 'Gold', provider: 'gold-api.com + Twelve Data', instrument: 'XAU/USD',
    points, currentPrice: 3567.9, asOf: '2026-11-20T14:45:06Z', updatedAt: '2026-11-20T14:45:08Z',
    formingBarDate: '2026-11-20', format: (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`, ...overrides });
}
test('production row builder: live gold over cached yesterday history uses last close', () => {
  const { row, meta } = asset();
  assert.equal(meta.previous_price, 3666.8714);
  assert.equal(row.change, -2.6991);
  assert.equal(row.spark_dates.at(-1), '2026-11-19');
  assert.equal(row.as_of, '2026-11-20T14:45:06Z');
  assert.equal(checkChangeAgainstSeries(row).ok, true);
  assert.equal(checkChangeAgainstSeries({ ...row, change: -4.1861 }).ok, false);
});
test('same writer works both with forming bar and without live quote', () => {
  assert.equal(asset({ points: [...points, { date: '2026-11-20', value: 3555 }] }).row.change, -2.6991);
  const close = asset({ currentPrice: undefined, asOf: '2026-11-19', formingBarDate: null });
  assert.equal(close.meta.previous_price, 3723.72756);
  assert.equal(close.row.change, -1.5269);
  assert.equal(checkChangeAgainstSeries(close.row).ok, true);
});
test('fresh quote equal to yesterday close is zero, not the preceding daily move', () => {
  const { row } = asset({ currentPrice: points.at(-1).value });
  assert.equal(row.change, 0);
  assert.equal(checkChangeAgainstSeries(row).basis, 'quote');
  assert.equal(checkChangeAgainstSeries(row).ok, true);
});

after(() => rm(directory, { recursive: true, force: true }));
