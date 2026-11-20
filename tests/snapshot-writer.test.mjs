import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
const directory = new URL('../.local/snapshot-writer-tests/', import.meta.url);
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
const { snapshotLastObservation } = await loadWriter('snapshot-morning');
test('snapshot value and date keep the original paired last index', () => {
  assert.deepEqual(snapshotLastObservation([100, 110], ['2026-11-18', '2026-11-19']), { last: 110, last_date: '2026-11-19' });
  for (const dates of [null, [], ['2026-11-19'], ['2026-11-19', '2026-11-18'], ['2026-11-18', '2026-02-30']]) {
    assert.deepEqual(snapshotLastObservation([100, 110], dates), { last: 110, last_date: null });
  }
  assert.deepEqual(snapshotLastObservation([100, null], ['2026-11-18', '2026-11-19']), { last: null, last_date: null });
});
after(() => rm(directory, { recursive: true, force: true }));
