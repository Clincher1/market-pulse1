import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
const directory = new URL('../.local/archive-stats-tests/', import.meta.url);
await mkdir(directory, { recursive: true });
const outfile = new URL('stats.mjs', directory).pathname;
await build({ entryPoints: ['src/data/liveMarketMemory.ts'], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'supabase-read-boundary', setup(b) {
  b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixtures' }));
  b.onLoad({ filter: /.*/, namespace: 'fixtures' }, () => ({ contents: 'export const supabase={};' }));
} }] });
const { normalizeStats } = await import(outfile);
test('all unresolved outcomes include insufficient history, not just the empty pending queue', () => {
  assert.equal(normalizeStats({ forecast_snapshots: 150, evaluated_forecasts: 106, pending_forecasts: 0 }).pendingForecasts, 44);
  assert.equal(normalizeStats({ forecast_snapshots: 150, evaluated_forecasts: 56, pending_forecasts: 94 }).pendingForecasts, 94);
  assert.equal(normalizeStats({ forecast_snapshots: 150, evaluated_forecasts: 150, pending_forecasts: 0 }).pendingForecasts, 0);
});
