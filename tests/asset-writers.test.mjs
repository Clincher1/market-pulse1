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
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function serveWithErrorReporting(name, handler) { globalThis.__assetWriterHandler = handler; }' }));
    } }],
  });
  return import(output.href);
}
const { makeAsset, fetchGold } = await loadWriter('update-assets');
const handler = globalThis.__assetWriterHandler;
delete globalThis.__assetWriterHandler;
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

test('handler: all gated sources are an explained no-op, not an empty 502', async (t) => {
  const { PRICE_SOURCES } = await import('../supabase/functions/_shared/price-sources.ts');
  const previousDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: (key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture-service' : undefined } };
  t.after(() => { if (previousDeno === undefined) delete globalThis.Deno; else globalThis.Deno = previousDeno; });
  const now = new Date();
  const states = PRICE_SOURCES.map((source) => ({ source_id: source.id, last_attempt_at: now.toISOString(),
    last_ok_at: now.toISOString(), last_status: 200, consecutive_failures: 0, paused_until: null,
    requests_today: 1, day: now.toISOString().slice(0, 10), last_error: null }));
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const table = new URL(url).pathname.split('/').at(-1);
    assert.ok(['cached_assets', 'asset_source_state', 'source_preferences', 'data_slot_registry'].includes(table), 'No external provider requests');
    if (init.method === 'POST') { writes.push(table); return new Response(null, { status: 204 }); }
    return Response.json(table === 'asset_source_state' ? states : []);
  });
  const response = await handler(new Request('https://example.test/functions/v1/update-assets', {
    headers: { Authorization: 'Bearer fixture-service' },
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'all_sources_gated');
  assert.equal(result.published, false);
  assert.equal(result.skipped_by_gate.length, 5);
  assert.ok(result.skipped_by_gate.every((slot) => slot.reasons.length > 0));
  assert.equal(result.slots.length, 5);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(writes, ['data_slot_registry']);
});

after(() => rm(directory, { recursive: true, force: true }));


test('new gold writer: valid live quote works with zero history, no fake percent or Twelve request', async (t) => {
  const previousDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture-service' : undefined } };
  t.after(() => { globalThis.Deno = previousDeno; });
  const calls=[];
  t.mock.method(globalThis,'fetch',async (url,init={})=> {
    calls.push([String(url),init.method || 'GET']);
    if(String(url).includes('/price/XAU')) return Response.json({symbol:'XAU',currency:'USD',price:3500,updatedAt:'2026-10-28T12:00:00Z'});
    if(String(url).includes('/rpc/')) return new Response(null,{status:204});
    return Response.json([]);
  });
  const result=await fetchGold('2026-10-28T12:00:01Z',{publish:true});
  assert.equal(result.row.change,null);
  assert.deepEqual(result.row.sparkline,[]);
  assert.deepEqual(result.row.spark_dates,[]);
  assert.equal(result.row.price,'$3,500.0');
  assert.ok(calls.some(([url,method])=>url.includes('record_gold_observation')&&method==='POST'));
  assert.ok(calls.every(([url])=>!url.includes('twelvedata')));
});
test('new gold shadow reads only; it never records observations', async (t) => {
  const previousDeno=globalThis.Deno;
  globalThis.Deno={env:{get:()=> 'fixture-service'}};
  t.after(()=>{globalThis.Deno=previousDeno;});
  t.mock.method(globalThis,'fetch',async (url,init={})=> {
    assert.notEqual(init.method,'POST');
    if(String(url).includes('/price/XAU')) return Response.json({symbol:'XAU',price:3500,updatedAt:'2026-10-28T12:00:00Z'});
    return Response.json([{instrument_id:'gold_api_xau_observed_daily',observation_date:'2026-10-27',price:3600}]);
  });
  const result=await fetchGold('2026-10-28T12:00:01Z',{publish:false});
  assert.equal(result.row.change,-2.7778);
  assert.deepEqual(result.row.spark_dates,['2026-10-27']);
});
