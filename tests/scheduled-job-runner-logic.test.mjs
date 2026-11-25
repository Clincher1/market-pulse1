import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  evaluateAsset,
  latestCompletedNySessionDate,
  overallVerdict,
  percentChange,
} from '../supabase/functions/scheduled-job-runner/logic.mjs';

const now = new Date('2026-11-25T18:00:00.000Z');

test('Brent and gold use the two-hour updated_at freshness limit', () => {
  const fresh = evaluateAsset('brent', { price: '70.25', updated_at: '2026-11-25T16:00:00.000Z' }, now);
  const stale = evaluateAsset('gold', { price: 4000, updated_at: '2026-11-25T15:59:00.000Z' }, now);
  assert.equal(fresh.status, 'ok');
  assert.equal(stale.status, 'stale');
});

test('missing Brent updated_at and invalid/future timestamps are not considered fresh', () => {
  assert.equal(evaluateAsset('brent', { price: 70, updated_at: null }, now).status, 'no_data');
  assert.throws(() => evaluateAsset('brent', { price: 70, updated_at: 'not-a-date' }, now), /Invalid/);
  assert.throws(() => evaluateAsset('brent', { price: 70, updated_at: '2026-11-26T00:00:00Z' }, now), /Future/);
});

test('S&P 500 freshness follows the latest completed New York session', () => {
  assert.equal(latestCompletedNySessionDate(new Date('2026-11-25T20:59:00Z')), '2026-11-24');
  assert.equal(latestCompletedNySessionDate(new Date('2026-11-25T21:01:00Z')), '2026-11-25');
  assert.equal(latestCompletedNySessionDate(new Date('2026-11-26T18:00:00Z')), '2026-11-25');
  const stale = evaluateAsset('sp500', {
    price: 6800,
    as_of: '2026-11-23',
    updated_at: '2026-11-25T17:00:00Z',
  }, new Date('2026-11-25T22:00:00.000Z'));
  assert.equal(stale.status, 'stale');
  assert.equal(stale.expectedSessionDate, '2026-11-25');
});

test('overall verdict selects the worst asset and percent change is relative to yesterday', () => {
  assert.equal(overallVerdict({ a: { status: 'ok' }, b: { status: 'stale' } }), 'stale');
  assert.equal(overallVerdict({ a: { status: 'stale' }, b: { status: 'no_data' } }), 'no_data');
  assert.equal(percentChange(101, 100), 1);
});

test('hourly digest retry sends a pending row after the configured hour and skips a sent row', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'scheduled-job-runner-'));
  const bundle = join(directory, 'index.mjs');
  await build({
    entryPoints: ['supabase/functions/scheduled-job-runner/index.ts'],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });

  const NativeDate = globalThis.Date;
  let nowMs = NativeDate.parse('2026-11-25T07:12:00.000Z');
  globalThis.Date = class FrozenDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  };
  const previousDeno = globalThis.Deno;
  const historyUpdates = [];
  const telegramMessages = [];
  let historyStatus = 'pending';
  let countCalls = 0;
  globalThis.Deno = {
    env: { get: (key) => ({
      SUPABASE_URL: 'https://db.example.test',
      SERVICE_KEY: 'fixture-service-key',
      CRON_SECRET: 'fixture-cron-secret',
      DIGEST_HOUR_UTC: '06',
      TELEGRAM_BOT_TOKEN: 'fixture-token',
      TELEGRAM_CHAT_ID: 'fixture-chat',
    })[key] },
    serve: (handler) => { globalThis.__scheduledJobRunnerHandler = handler; },
  };
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.telegram.org') {
      telegramMessages.push(JSON.parse(init.body).text);
      return Response.json({ ok: true });
    }
    if (url.hostname !== 'db.example.test') throw new Error(`Unexpected fetch host: ${url.hostname}`);
    if (url.pathname.endsWith('/cached_assets')) {
      return Response.json([
        { id: 'brent', price: '70.25', updated_at: '2026-11-25T07:00:00.000Z', as_of: '2026-11-25' },
        { id: 'gold', price: '4000', updated_at: '2026-11-25T07:00:00.000Z', as_of: '2026-11-25' },
        { id: 'sp500', price: '6800', updated_at: '2026-11-25T07:00:00.000Z', as_of: '2026-11-24' },
      ]);
    }
    if (url.pathname.endsWith('/monitor_history')) {
      if (init.method === 'PATCH') {
        const update = JSON.parse(init.body);
        historyUpdates.push(update);
        historyStatus = update.delivery_status;
        return new Response(null, { status: 204 });
      }
      if ((!init.method || init.method === 'GET') && url.searchParams.get('digest_date') === 'eq.2026-11-25') {
        return Response.json([{ id: 17, delivery_status: historyStatus }]);
      }
      return Response.json([]);
    }
    if (url.pathname.endsWith('/rpc/monitor_cron_counts')) {
      countCalls++;
      return Response.json([{ succeeded: 3, failed: 0 }]);
    }
    throw new Error(`Unexpected REST route: ${url.pathname}`);
  });

  try {
    await import(`${pathToFileURL(bundle).href}?retry-test`);
    const handler = globalThis.__scheduledJobRunnerHandler;
    const request = () => new Request('https://edge.example.test/functions/v1/scheduled-job-runner', {
      method: 'POST',
      headers: { 'x-cron-secret': 'fixture-cron-secret' },
    });

    const retryResponse = await handler(request());
    assert.equal(retryResponse.status, 200);
    assert.deepEqual(await retryResponse.json(), { status: 'digest_sent', overall_status: 'ok' });
    assert.equal(telegramMessages.length, 1, 'pending history retries delivery at 07:12 UTC');
    assert.match(telegramMessages[0], /первый отчёт — сравнение за 24ч появится завтра/);
    assert.deepEqual(historyUpdates.map((update) => update.delivery_status), ['pending', 'sent']);

    nowMs = NativeDate.parse('2026-11-25T08:12:00.000Z');
    const sentResponse = await handler(request());
    assert.equal(sentResponse.status, 200);
    assert.deepEqual(await sentResponse.json(), { status: 'digest_sent', overall_status: 'ok' });
    assert.equal(telegramMessages.length, 1, 'sent history must not be delivered twice');
    assert.equal(countCalls, 1, 'sent history returns before another digest read/count');
  } finally {
    delete globalThis.__scheduledJobRunnerHandler;
    if (previousDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = previousDeno;
    globalThis.Date = NativeDate;
    await rm(directory, { recursive: true, force: true });
  }
});
