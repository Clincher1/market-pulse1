import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot, updateSnapshot } from '../scripts/update-static-snapshot.mjs';

const previous = JSON.parse(await readFile(new URL('../data/snapshot.json', import.meta.url), 'utf8'));
// Fixed fixture clocks, not a live-data/freshness assertion about the checked-in file.
previous.exportedAt = '2026-11-22T06:25:25.816306Z';
const exportedAt = '2026-11-22T07:15:49.790667Z';
const now = new Date('2026-11-22T07:15:50Z');
function payload() {
  return { exportedAt, rows: [
    { id: 'brent_yahoo_bzf', symbol: 'BZ=F', provider: 'Yahoo Finance',
      instrumentType: 'commodity_future', unit: 'usd_per_barrel', currency: 'USD', frequency: 'daily',
      value: '89.9499969482', observationDate: '2026-11-20', priceTimestamp: null,
      sourceUrl: previous.items[0].source.url },
    { id: 'sp500_yahoo_gspc', symbol: '^GSPC', provider: 'Yahoo Finance',
      instrumentType: 'cash_index', unit: 'index_points', currency: 'USD', frequency: 'daily',
      value: '6910.3901367188', observationDate: '2026-11-20', priceTimestamp: null,
      sourceUrl: previous.items[1].source.url },
    { id: 'gold_api_xau_observed_daily', symbol: 'XAU', provider: 'gold-api.com',
      instrumentType: 'commodity_spot', unit: 'usd_per_troy_ounce', currency: 'USD', frequency: 'daily',
      value: '3539.0000000000', observationDate: '2026-11-22', priceTimestamp: '2026-11-22T07:09:39.000000Z',
      sourceUrl: previous.items[2].source.url },
  ] };
}
const build = data => buildSnapshot(data, structuredClone(previous), now);

test('exports exact numeric strings, date-only Yahoo sessions, gold time and unchanged display metadata', () => {
  const data = payload();
  data.rows.reverse();
  const result = build(data);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.exportedAt, exportedAt);
  assert.deepEqual(result.items.map(row => row.value), ['89.9499969482', '6910.3901367188', '3539.0000000000']);
  assert.deepEqual(result.items.map(row => row.observedAt), ['2026-11-20', '2026-11-20', '2026-11-22T07:09:39.000000Z']);
  result.items.forEach((row, index) => {
    for (const field of ['ticker', 'instrument', 'unit', 'source']) {
      assert.deepEqual(row[field], previous.items[index][field]);
    }
    if (row.ticker === 'BZ=F') {
      assert.match(row.basis, /текущий незакрытый день исключён/);
    } else {
      assert.equal(row.basis, previous.items[index].basis);
    }
  });
});

const invalidCases = [
  ['missing row', d => d.rows.pop()],
  ['extra row', d => d.rows.push({ ...d.rows[0], id: 'other' })],
  ['duplicate ID', d => d.rows[1] = { ...d.rows[0] }],
  ['unknown instrument', d => d.rows[0].id = 'brent_spot'],
  ['null row', d => d.rows[1] = null],
  ['no rows', d => delete d.rows],
  ['invalid export calendar', d => d.exportedAt = '2026-02-30T07:15:49Z'],
  ['date-only export', d => d.exportedAt = '2026-11-22'],
  ['future export clock', d => d.exportedAt = '2026-11-22T08:15:49Z'],
  ['old export clock', d => d.exportedAt = '2026-11-22T06:15:49Z'],
  ['forming Brent day', d => d.rows.find(row => row.id === 'brent_yahoo_bzf').observationDate = '2026-11-22'],
  ['forming S&P day', d => d.rows.find(row => row.id === 'sp500_yahoo_gspc').observationDate = '2026-11-22'],
];
for (const field of ['symbol', 'provider', 'instrumentType', 'unit', 'currency', 'frequency', 'sourceUrl']) {
  invalidCases.push([`wrong ${field}`, d => d.rows[0][field] = 'incorrect']);
}
for (const value of [null, 89.9, '', '0', '-1', 'NaN', 'Infinity', '1e3', ' 3 ', '1,23', '9'.repeat(400)]) {
  invalidCases.push([`bad numeric ${String(value).slice(0, 15)}`, d => d.rows[0].value = value]);
}
for (const date of ['2026-02-30', '2026-11-31', '2026-1-01', null, '2026-11-23', '2026-11-14']) {
  invalidCases.push([`bad Yahoo date ${date}`, d => d.rows[0].observationDate = date]);
}
for (const time of [null, '', '2026-11-22', '2026-02-30T07:09:39Z', '2026-11-22T24:00:00Z',
  '2026-11-22T07:09:60Z', '2026-11-22T07:16:00Z', '2026-11-21T07:09:39Z']) {
  invalidCases.push([`bad gold timestamp ${time}`, d => d.rows[2].priceTimestamp = time]);
}
invalidCases.push(['stale gold, not just stale Yahoo', d => {
  d.rows[2].observationDate = '2026-11-14';
  d.rows[2].priceTimestamp = '2026-11-14T07:09:39Z';
}]);
invalidCases.push(['future Yahoo auxiliary timestamp', d => d.rows[0].priceTimestamp = '2026-11-23T00:00:00Z']);
for (const [name, mutate] of invalidCases) {
  test(`rejects ${name}`, () => {
    const data = payload();
    mutate(data);
    assert.throws(() => build(data));
  });
}

test('seven UTC calendar days inclusive for each instrument; eighth day rejected', () => {
  const data = payload();
  for (const row of data.rows) row.observationDate = '2026-11-15';
  data.rows[2].priceTimestamp = '2026-11-15T00:00:00.000000Z';
  assert.equal(build(data).items.length, 3);
  data.rows[1].observationDate = '2026-11-14';
  assert.throws(() => build(data), /seven UTC calendar days/);
});

test('valid leap calendar date is accepted', () => {
  const data = payload();
  data.exportedAt = '2028-03-01T00:00:00Z';
  for (const row of data.rows) row.observationDate = '2028-02-29';
  data.rows[2].priceTimestamp = '2028-02-29T23:59:59Z';
  assert.equal(buildSnapshot(data, previous, new Date(data.exportedAt)).items[0].observedAt, '2028-02-29');
});

test('rejects previous metadata changes and backwards export', () => {
  const altered = structuredClone(previous);
  altered.items[0].instrument = 'Brent spot';
  assert.throws(() => buildSnapshot(payload(), altered, now), /contract changed/);
  altered.items[0] = previous.items[0];
  altered.exportedAt = '2026-11-22T07:15:51Z';
  assert.throws(() => buildSnapshot(payload(), altered, now), /backwards/);
});

async function withFile(callback) {
  const dir = await mkdtemp(join(tmpdir(), 'static-snapshot-'));
  const file = join(dir, 'snapshot.json');
  const bytes = `${JSON.stringify(previous, null, 2)}\n`;
  await writeFile(file, bytes);
  try { await callback({ dir, file, bytes }); } finally { await rm(dir, { recursive: true, force: true }); }
}
const config = { url: 'https://hekzplfftannlzwvgwwm.supabase.co', key: 'sb_publishable_test_only', now: () => now };
const jsonResponse = data => new Response(JSON.stringify(data), { status: 200 });
const historyFixtures = {
  brent_yahoo_bzf: [
    { instrument_id: 'brent_yahoo_bzf', observation_date: '2026-11-20', price: '89.9499969482' },
    { instrument_id: 'brent_yahoo_bzf', observation_date: '2026-11-19', price: '91.9800033569' },
    { instrument_id: 'brent_yahoo_bzf', observation_date: '2026-11-18', price: '91.9499969482' },
  ],
  sp500_yahoo_gspc: [
    { instrument_id: 'sp500_yahoo_gspc', observation_date: '2026-11-20', price: '6910.3901367188' },
    { instrument_id: 'sp500_yahoo_gspc', observation_date: '2026-11-19', price: '7175.8300781250' },
    { instrument_id: 'sp500_yahoo_gspc', observation_date: '2026-11-18', price: '7323.6298828125' },
  ],
  gold_api_xau_observed_daily: [
    { instrument_id: 'gold_api_xau_observed_daily', observation_date: '2026-11-22', price: '3539.0000000000' },
    { instrument_id: 'gold_api_xau_observed_daily', observation_date: '2026-11-21', price: '3529.0000000000' },
    { instrument_id: 'gold_api_xau_observed_daily', observation_date: '2026-11-20', price: '3510.0000000000' },
  ],
};
const fetchAll = async (url, options) => {
  if (url === `${config.url}/rest/v1/rpc/export_static_snapshot_v2`) return jsonResponse(payload());
  assert.equal(options.method, 'GET');
  assert.equal(options.headers.apikey, config.key);
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  const query = new URL(url).searchParams;
  const id = query.get('instrument_id')?.slice(3);
  assert.ok(historyFixtures[id], `unexpected history instrument ${id}`);
  assert.equal(query.get('limit'), '7');
  assert.equal(query.get('select'), 'instrument_id,observation_date,price');
  return jsonResponse(historyFixtures[id]);
};

test('atomic success fetches the validated snapshot and 7-row histories with publishable apikey only', async () => {
  await withFile(async ({ dir, file }) => {
    const result = await updateSnapshot({ ...config, file, fetchImpl: fetchAll });
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(saved, result);
    assert.deepEqual(saved.items, build(payload()).items);
    assert.deepEqual(Object.keys(saved.series), ['BZ=F', '^GSPC', 'XAU']);
    assert.deepEqual(saved.series['BZ=F'].map(point => point.observedAt), ['2026-11-18', '2026-11-19', '2026-11-20']);
    assert.equal(saved.series['BZ=F'].at(-1).value, '89.9499969482');
    assert.equal(saved.series.XAU.at(-1).value, '3539.0000000000');
    assert.deepEqual(await readdir(dir), ['snapshot.json']);
  });
});

for (const [name, mutate] of invalidCases) {
  test(`all-or-nothing file preservation: ${name}`, async () => {
    await withFile(async ({ dir, file, bytes }) => {
      const data = payload(); mutate(data);
      await assert.rejects(updateSnapshot({ ...config, file, fetchImpl: async () => jsonResponse(data) }));
      assert.equal(await readFile(file, 'utf8'), bytes);
      assert.deepEqual(await readdir(dir), ['snapshot.json']);
    });
  });
}
for (const [name, fetchImpl] of [
  ['network timeout', async () => { throw new Error('sensitive request details'); }],
  ['unauthorized', async () => new Response('sensitive response', { status: 401 })],
  ['rate limited', async () => new Response('', { status: 429 })],
  ['invalid JSON', async () => new Response('sensitive response')],
  ['oversize', async () => new Response('x'.repeat(65537))],
  ['response stream failure', async () => ({ ok: true, text: async () => { throw new Error('sensitive'); } })],
]) {
  test(`preserves file and hides response/request details: ${name}`, async () => withFile(async ({ file, bytes }) => {
    await assert.rejects(updateSnapshot({ ...config, file, fetchImpl }), error => !error.message.includes('sensitive'));
    assert.equal(await readFile(file, 'utf8'), bytes);
  }));
}

test('history failure or malformed rows preserve the previous complete snapshot', async () => {
  await withFile(async ({ file, bytes }) => {
    let calls = 0;
    await assert.rejects(updateSnapshot({ ...config, file, fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(payload());
      return new Response('sensitive details', { status: 503 });
    } }), /history query failed: HTTP 503/);
    assert.equal(await readFile(file, 'utf8'), bytes);
  });
  await withFile(async ({ file, bytes }) => {
    let calls = 0;
    await assert.rejects(updateSnapshot({ ...config, file, fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(payload());
      return jsonResponse([{ ...historyFixtures.brent_yahoo_bzf[0], observation_date: '2026-11-21' }]);
    } }), /invalid or future history date/);
    assert.equal(await readFile(file, 'utf8'), bytes);
  });
});

test('missing history is not filled with invented points; current quote remains one actual observation', async () => {
  const { fetchSnapshotHistory } = await import('../scripts/update-static-snapshot.mjs');
  const latest = build(payload());
  const series = await fetchSnapshotHistory({ url: config.url, key: config.key,
    snapshot: latest, fetchImpl: async () => jsonResponse([]) });
  assert.deepEqual(series['BZ=F'], [{ observedAt: '2026-11-20', value: '89.9499969482' }]);
  assert.deepEqual(series.XAU, [{ observedAt: '2026-11-22', value: '3539.0000000000' }]);
});

test('rejects wrong project and privileged/missing keys before any HTTP request', async () => {
  for (const override of [{ url: 'https://other.supabase.co' }, { url: '' }, { key: '' },
    { key: 'sb_secret_rejected' }, { key: 'eyJ.service_role.rejected' }]) {
    await withFile(async ({ file, bytes }) => {
      await assert.rejects(updateSnapshot({ ...config, ...override, file,
        fetchImpl: async () => assert.fail('must not make a request') }));
      assert.equal(await readFile(file, 'utf8'), bytes);
    });
  }
});

test('database static export excludes the current Yahoo daily bar but retains current XAU quotes', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261123170000_static_snapshot_closed_yahoo_bars.sql', import.meta.url), 'utf8');
  assert.match(migration, /i\.id not in \('brent_yahoo_bzf', 'sp500_yahoo_gspc'\)/);
  assert.match(migration, /p\.observation_date < \(pg_catalog\.statement_timestamp\(\) at time zone 'UTC'\)::date/);
  assert.match(migration, /timestamped live observation and is intentionally allowed on the current day/);
});

test('tracked v2 RPC reproduces the live definition, grants, and comment without changing ownership', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20261125181705_track_static_snapshot_v2_rpc.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /create or replace function public\.export_static_snapshot_v2\(\)/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /set row_security = on/);
  assert.match(migration, /p\.observation_date < \(pg_catalog\.statement_timestamp\(\) at time zone 'UTC'\)::date/);
  assert.match(migration, /'value', s\.price::text/);
  assert.match(migration, /'priceTimestamp'/);
  assert.match(migration, /to anon, authenticated, service_role/);
  assert.match(migration, /comment on function public\.export_static_snapshot_v2\(\)/);
  assert.match(migration, /create temporary table _static_snapshot_v2_definition_before/);
  assert.match(migration, /before_definition is distinct from after_definition/);
  assert.match(migration, /owner changed from postgres/);
  assert.match(migration, /Ownership and the postgres -> static_snapshot_reader membership are intentionally/);
  assert.match(migration, /clean full-history replay could not be verified/);
  assert.match(migration, /42c033e53b941349f8126766c4048a53/);
  assert.match(migration, /excluding pg_temp_\* and pg_toast_temp_\*/);
  assert.match(migration, /filtered digest cannot be reconstructed/);
  assert.match(migration, /changes grants only on this target function/);
  assert.match(migration, /After merge, recompute/);
  assert.match(migration, /filtered ACL digest once/);
  assert.match(migration, /confirm it equals the baseline above/);
  assert.doesNotMatch(migration, /alter function public\.export_static_snapshot_v2\(\) owner to/);
  assert.doesNotMatch(migration, /revoke static_snapshot_reader from postgres/);
  assert.doesNotMatch(migration, /static_snapshot_v2_precheck/);
});

test('workflow gates main commits on candidate checks, permits only snapshot, never force pushes', async () => {
  const workflow = await readFile(new URL('../.github/workflows/update-static-snapshot.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '10 6 \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main'/);
  for (const command of ['npm ci', 'npm test', 'npm run typecheck', 'npm run lint', 'npm run build', 'deno@2 check']) {
    assert.ok(workflow.indexOf(command) < workflow.indexOf('git commit -m'));
  }
  assert.match(workflow, /public\/snapshot-charts\/brent\.svg\|public\/snapshot-charts\/sp500\.svg\|public\/snapshot-charts\/gold\.svg/);
  assert.match(workflow, /git add -A -- data\/snapshot\.json public\/snapshot-charts\/brent\.svg/);
  assert.match(workflow, /node scripts\/build-static-market-charts\.mjs/);
  assert.match(workflow, /git rev-parse FETCH_HEAD/);
  assert.match(workflow, /git push origin HEAD:main/);
  assert.doesNotMatch(workflow, /git push[^\n]*(?:--force|-f\b)|gh pr merge|pull_request_target/);
  assert.match(workflow, /secrets.SNAPSHOT_SUPABASE_READ_KEY/);
  assert.match(workflow, /vars.SUPABASE_URL/);
});
