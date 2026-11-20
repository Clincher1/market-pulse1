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
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function serveWithErrorReporting(name, handler) { globalThis.__snapshotHandler = handler; }' }));
    } }],
  });
  return import(output.href);
}
const { snapshotLastObservation } = await loadWriter('snapshot-morning');
const handler = globalThis.__snapshotHandler;
delete globalThis.__snapshotHandler;
test('snapshot value and date keep the original paired last index', () => {
  assert.deepEqual(snapshotLastObservation([100, 110], ['2026-11-18', '2026-11-19']), { last: 110, last_date: '2026-11-19' });
  for (const dates of [null, [], ['2026-11-19'], ['2026-11-19', '2026-11-18'], ['2026-11-18', '2026-02-30']]) {
    assert.deepEqual(snapshotLastObservation([100, 110], dates), { last: 110, last_date: null });
  }
  assert.deepEqual(snapshotLastObservation([100, null], ['2026-11-18', '2026-11-19']), { last: null, last_date: null });
});
function setupHandler(t, { duplicate = false, missingDate = false } = {}) {
  const previous = globalThis.Deno;
  globalThis.Deno = { env: { get: (key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture-service' : undefined } };
  t.after(() => { if (previous === undefined) delete globalThis.Deno; else globalThis.Deno = previous; });
  const writes = [];
  const assets = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'].map((id) => ({ id, name: id, price: '$110', change: 1,
    sparkline: [100, 110], spark_dates: missingDate && id === 'gold' ? [] : ['2026-11-18', '2026-11-19'], as_of: '2026-11-20T03:55:00Z' }));
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path === '/api/russia-insights') return Response.json({ markets: [] });
    if (path.endsWith('/cached_tension')) return Response.json([]);
    if (path.endsWith('/cached_assets')) return Response.json(assets);
    if (path.endsWith('/daily_snapshots') && init.method === 'POST') {
      assert.equal(init.headers.get('Prefer'), 'resolution=ignore-duplicates,return=representation');
      writes.push(JSON.parse(init.body));
      return Response.json(duplicate ? [] : [writes[0]]);
    }
    throw Error('Unexpected request');
  });
  return { writes, fetch, request: new Request('https://example.test/snapshot-morning', { headers: { Authorization: 'Bearer fixture-service' } }) };
}
test('full snapshot handler inserts five paired dates without forecasts', async (t) => {
  const { writes, request } = setupHandler(t);
  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).inserted, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].assets.length, 5);
  assert.ok(writes[0].assets.every((a) => a.last === 110 && a.last_date === '2026-11-19'));
  assert.equal('forecasts' in writes[0], false);
});
test('full handler never overwrites a first daily baseline on retry', async (t) => {
  const { request } = setupHandler(t, { duplicate: true });
  assert.equal((await (await handler(request)).json()).inserted, false);
});
test('full handler refuses to freeze a missing or undated world asset', async (t) => {
  const { writes, request } = setupHandler(t, { missingDate: true });
  const response = await handler(request);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /gold/);
  assert.equal(writes.length, 0);
});
test('unauthorized snapshot request has no IO', async (t) => {
  const { writes, fetch } = setupHandler(t);
  assert.equal((await handler(new Request('https://example.test/snapshot-morning'))).status, 401);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(writes.length, 0);
});
after(() => rm(directory, { recursive: true, force: true }));
