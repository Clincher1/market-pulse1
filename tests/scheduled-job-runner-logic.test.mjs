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
  moscowHourKey,
  overallVerdict,
  percentChange,
  shouldWarnForStagnation,
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

test('Moscow hour helper returns the hour for the digest timezone', () => {
  assert.equal(moscowHourKey(new Date('2026-11-26T06:12:00.000Z')), 9);
  assert.equal(moscowHourKey(new Date('2026-11-25T21:12:00.000Z')), 0);
});

test('overall verdict selects the worst asset and percent change is relative to yesterday', () => {
  assert.equal(overallVerdict({ a: { status: 'ok' }, b: { status: 'stale' } }), 'stale');
  assert.equal(overallVerdict({ a: { status: 'stale' }, b: { status: 'no_data' } }), 'no_data');
  assert.equal(percentChange(101, 100), 1);
});

test('gold uses the 2-hour limit while open and latest-session freshness while shut', () => {
  const freshOpen = evaluateAsset('gold', {
    price: 4000, updated_at: '2026-11-25T18:45:00.000Z',
  }, new Date('2026-11-25T20:30:00.000Z')); // 23:30 MSK, session still open
  const staleOpen = evaluateAsset('gold', {
    price: 4000, updated_at: '2026-11-25T18:20:00.000Z',
  }, new Date('2026-11-25T20:30:00.000Z'));
  const freshPreopen = evaluateAsset('gold', {
    price: 4000, updated_at: '2026-11-25T20:45:00.000Z',
  }, new Date('2026-11-26T05:30:00.000Z')); // 08:30 MSK, before open
  const staleBeforeLastOpen = evaluateAsset('gold', {
    price: 4000, updated_at: '2026-11-25T05:50:00.000Z',
  }, new Date('2026-11-26T05:30:00.000Z'));
  assert.equal(freshOpen.status, 'ok');
  assert.equal(staleOpen.status, 'stale');
  assert.equal(freshPreopen.status, 'ok');
  assert.equal(staleBeforeLastOpen.status, 'stale');
});

test('Brent uses the 2-hour limit while open and the last weekly session when closed', () => {
  const staleOpen = evaluateAsset('brent', {
    price: 70, updated_at: '2026-11-20T20:00:00.000Z',
  }, new Date('2026-11-20T22:30:00.000Z')); // Friday 17:30 ET
  const freshAfterClose = evaluateAsset('brent', {
    price: 70, updated_at: '2026-11-20T22:30:00.000Z',
  }, new Date('2026-11-21T00:30:00.000Z')); // Friday 19:30 ET
  const freshSundayPreopen = evaluateAsset('brent', {
    price: 70, updated_at: '2026-11-20T22:30:00.000Z',
  }, new Date('2026-11-23T00:00:00.000Z')); // Sunday 19:00 ET
  const freshAfterOpen = evaluateAsset('brent', {
    price: 70, updated_at: '2026-11-23T01:00:00.000Z',
  }, new Date('2026-11-23T01:30:00.000Z')); // Sunday 20:30 ET
  assert.equal(staleOpen.status, 'stale');
  assert.equal(freshAfterClose.status, 'ok');
  assert.equal(freshSundayPreopen.status, 'ok');
  assert.equal(freshAfterOpen.status, 'ok');
});

test('weekend gold and Brent updates remain fresh if they occurred after the last session opened', () => {
  const gold = evaluateAsset('gold', {
    price: 4000, updated_at: '2026-11-27T08:00:00.000Z',
  }, new Date('2026-11-28T09:00:00.000Z')); // Saturday 12:00 MSK
  const goldOld = evaluateAsset('gold', {
    price: 4000, updated_at: '2026-11-26T20:00:00.000Z',
  }, new Date('2026-11-28T09:00:00.000Z'));
  const brent = evaluateAsset('brent', {
    price: 70, updated_at: '2026-11-20T22:30:00.000Z',
  }, new Date('2026-11-21T17:00:00.000Z')); // Saturday 12:00 ET
  const brentOld = evaluateAsset('brent', {
    price: 70, updated_at: '2026-11-16T00:30:00.000Z',
  }, new Date('2026-11-21T17:00:00.000Z'));
  assert.equal(gold.status, 'ok');
  assert.equal(goldOld.status, 'stale');
  assert.equal(brent.status, 'ok');
  assert.equal(brentOld.status, 'stale');
});

test('gold holiday approximation shifts weekend holidays and skips them as sessions', () => {
  const gold = evaluateAsset('gold', {
    price: 4000, updated_at: '2026-03-06T07:00:00.000Z',
  }, new Date('2026-03-09T07:00:00.000Z')); // Monday 10:00 MSK, observed March 8 holiday
  assert.equal(gold.status, 'ok');
});

test('Sunday digest suppresses the stagnation warning for unchanged prices', () => {
  assert.equal(shouldWarnForStagnation('2026-11-29', 0, 0), false);
  assert.equal(shouldWarnForStagnation('2026-11-30', 0, 0), true);
});

test('NYSE early-close sessions are complete from 13:00 local time', () => {
  assert.equal(latestCompletedNySessionDate(new Date('2026-11-27T17:59:00.000Z')), '2026-11-25');
  assert.equal(latestCompletedNySessionDate(new Date('2026-11-27T18:01:00.000Z')), '2026-11-27');
  assert.equal(latestCompletedNySessionDate(new Date('2025-07-03T17:01:00.000Z')), '2025-07-03');
  assert.equal(latestCompletedNySessionDate(new Date('2025-12-24T18:01:00.000Z')), '2025-12-24');
});

test('digest gate uses Moscow time and date, retries pending same-day rows, and skips sent rows', async (t) => {
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
  let nowMs = NativeDate.parse('2026-11-25T21:12:00.000Z'); // 00:12 MSK on Nov 26
  globalThis.Date = class FrozenDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  };
  const previousDeno = globalThis.Deno;
  const historyUpdates = [];
  const historyReadDates = [];
  const telegramMessages = [];
  let historyStatus = 'pending';
  let countCalls = 0;
  globalThis.Deno = {
    env: { get: (key) => ({
      SUPABASE_URL: 'https://db.example.test',
      SERVICE_KEY: 'fixture-service-key',
      CRON_SECRET: 'fixture-cron-secret',
      DIGEST_HOUR_MSK: '09',
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
      const updatedAt = new NativeDate(nowMs - 30 * 60 * 1000).toISOString();
      return Response.json([
        { id: 'brent', price: '70.25', updated_at: updatedAt, as_of: '2026-11-25' },
        { id: 'gold', price: '4000', updated_at: updatedAt, as_of: '2026-11-25' },
        { id: 'sp500', price: '6800', updated_at: updatedAt, as_of: '2026-11-25' },
      ]);
    }
    if (url.pathname.endsWith('/monitor_history')) {
      if (init.method === 'PATCH') {
        const update = JSON.parse(init.body);
        historyUpdates.push(update);
        historyStatus = update.delivery_status;
        return new Response(null, { status: 204 });
      }
      if ((!init.method || init.method === 'GET') && url.searchParams.get('select') === 'id,delivery_status') {
        const digestDate = url.searchParams.get('digest_date')?.replace(/^eq\./, '');
        historyReadDates.push(digestDate);
        if (digestDate === '2026-11-26') {
          return Response.json([{ id: 17, delivery_status: historyStatus }]);
        }
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
    await import(`${pathToFileURL(bundle).href}?moscow-digest-test`);
    const handler = globalThis.__scheduledJobRunnerHandler;
    const request = () => new Request('https://edge.example.test/functions/v1/scheduled-job-runner', {
      method: 'POST',
      headers: { 'x-cron-secret': 'fixture-cron-secret' },
    });

    const beforeDigestHour = await handler(request());
    assert.equal(beforeDigestHour.status, 200);
    assert.deepEqual(await beforeDigestHour.json(), { status: 'fresh' });
    assert.equal(telegramMessages.length, 0, '00:12 MSK must not send or retry a new-date digest');
    assert.deepEqual(historyReadDates, [], 'the daily row is not read before the MSK digest hour');

    nowMs = NativeDate.parse('2026-11-26T06:12:00.000Z'); // 09:12 MSK
    const scheduledResponse = await handler(request());
    assert.equal(scheduledResponse.status, 200);
    assert.deepEqual(await scheduledResponse.json(), { status: 'digest_sent', overall_status: 'ok' });
    assert.deepEqual(historyReadDates, ['2026-11-26'], '09:12 MSK uses the current Moscow date');
    assert.equal(telegramMessages.length, 1, 'the digest is sent at 09:12 MSK');
    assert.match(telegramMessages[0], /Market Pulse — 26\.11/);
    assert.match(telegramMessages[0], /первый отчёт — сравнение за 24ч появится завтра/);
    assert.deepEqual(historyUpdates.map((update) => update.delivery_status), ['pending', 'sent']);

    historyStatus = 'pending';
    nowMs = NativeDate.parse('2026-11-26T07:12:00.000Z'); // 10:12 MSK; next hourly retry
    const retryResponse = await handler(request());
    assert.equal(retryResponse.status, 200);
    assert.deepEqual(await retryResponse.json(), { status: 'digest_sent', overall_status: 'ok' });
    assert.equal(telegramMessages.length, 2, 'a pending row is retried on the next hourly run that same MSK day');

    nowMs = NativeDate.parse('2026-11-26T08:12:00.000Z'); // 11:12 MSK
    const sentResponse = await handler(request());
    assert.equal(sentResponse.status, 200);
    assert.deepEqual(await sentResponse.json(), { status: 'digest_sent', overall_status: 'ok' });
    assert.equal(telegramMessages.length, 2, 'sent history must not be delivered twice');
    assert.equal(countCalls, 2, 'sent history returns before another previous-digest read/count');
  } finally {
    delete globalThis.__scheduledJobRunnerHandler;
    if (previousDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = previousDeno;
    globalThis.Date = NativeDate;
    await rm(directory, { recursive: true, force: true });
  }
});
