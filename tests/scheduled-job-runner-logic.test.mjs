import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  applyObservationFreshness,
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

test('missing Brent updated_at and invalid/far-future timestamps are not considered fresh', () => {
  assert.equal(evaluateAsset('brent', { price: 70, updated_at: null }, now).status, 'no_data');
  assert.throws(() => evaluateAsset('brent', { price: 70, updated_at: 'not-a-date' }, now), /Invalid brent updated_at timestamp/);
  assert.throws(() => evaluateAsset('brent', { price: 70, updated_at: '2026-11-26T00:00:00Z' }, now), /Future brent updated_at timestamp/);
});

test('timestamps up to ten minutes ahead tolerate clock skew; farther future values name asset and field', () => {
  const brent = evaluateAsset('brent', {
    price: 70,
    updated_at: '2026-11-25T18:10:00.000Z',
  }, now);
  const gold = evaluateAsset('gold', {
    price: 4000,
    updated_at: '2026-11-25T18:00:00.000Z',
    as_of: '2026-11-25T18:10:00.000Z',
  }, now);
  assert.equal(brent.status, 'ok');
  assert.equal(gold.status, 'ok');
  assert.throws(
    () => evaluateAsset('brent', { price: 70, updated_at: '2026-11-25T18:10:01.000Z' }, now),
    /Future brent updated_at timestamp/,
  );
  assert.throws(
    () => evaluateAsset('gold', {
      price: 4000,
      updated_at: '2026-11-25T18:00:00.000Z',
      as_of: '2026-11-25T18:10:01.000Z',
    }, now),
    /Future gold as_of date/,
  );
  assert.throws(
    () => evaluateAsset('gold', {
      price: 4000,
      updated_at: '2026-11-25T23:55:00.000Z',
      as_of: '2026-11-26',
    }, new Date('2026-11-25T23:55:00.000Z')),
    /Future gold as_of date/,
    'date-only observations do not get timestamp clock-skew tolerance',
  );
  const intradaySp500 = evaluateAsset('sp500', {
    price: 6800,
    updated_at: '2026-11-25T18:00:00.000Z',
    as_of: '2026-11-25T18:05:00.000Z',
  }, now);
  assert.equal(intradaySp500.status, 'ok', 'today’s NY session date is valid while the session is in progress');
  assert.throws(
    () => evaluateAsset('sp500', {
      price: 6800,
      updated_at: '2026-11-25T18:00:00.000Z',
      as_of: '2026-11-26',
    }, now),
    /Invalid sp500 as_of: 2026-11-26 is later than the current NY date 2026-11-25/,
    'dates strictly after the current NY calendar date remain invalid',
  );
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

test('Thanksgiving and the 2026 post-holiday early close select only real S&P sessions', () => {
  const beforeEarlyClose = new Date('2026-11-27T06:28:00.000Z'); // 01:28 EST; Thanksgiving was closed
  assert.equal(latestCompletedNySessionDate(beforeEarlyClose), '2026-11-25');
  const thanksgivingData = evaluateAsset('sp500', {
    price: 6800,
    as_of: '2026-11-25',
    updated_at: '2026-11-27T06:00:00.000Z',
  }, beforeEarlyClose);
  assert.equal(thanksgivingData.status, 'ok');
  assert.equal(thanksgivingData.expectedSessionDate, '2026-11-25');

  assert.equal(latestCompletedNySessionDate(new Date('2026-11-27T17:59:00.000Z')), '2026-11-25',
    'the shortened Friday session is still in progress before 13:00 EST');
  assert.equal(latestCompletedNySessionDate(new Date('2026-11-27T18:01:00.000Z')), '2026-11-27',
    'the shortened Friday session is complete after 13:00 EST');
});

test('Moscow hour helper returns the hour for the digest timezone', () => {
  assert.equal(moscowHourKey(new Date('2026-11-26T06:12:00.000Z')), 9);
  assert.equal(moscowHourKey(new Date('2026-11-25T21:12:00.000Z')), 0);
});

test('a recent cache write cannot mask a stale shared observation in the digest', () => {
  const recentlyWritten = evaluateAsset('brent', {
    price: 70,
    updated_at: '2026-11-25T17:59:00.000Z',
    as_of: '2026-11-20',
  }, now);
  const sharedFreshness = {
    ok: false,
    ageMinutes: 7 * 24 * 60,
    allowedMinutes: 3 * 24 * 60,
    note: 'brent: 7 суток, допустимо 3',
  };
  const combined = applyObservationFreshness(recentlyWritten, sharedFreshness);
  assert.equal(recentlyWritten.status, 'ok');
  assert.equal(combined.status, 'stale');
  assert.match(combined.reason, /brent: 7 суток/);
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

test('selfcheck counter counts cron health results separately from runner cron-job outcomes', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261127070000_monitor_selfcheck_counts.sql', import.meta.url), 'utf8');
  assert.match(migration, /from public\.site_health h/);
  assert.match(migration, /h\.trigger = 'cron'/);
  assert.match(migration, /h\.checked_at >= p_since/);
  assert.match(migration, /where h\.ok is true/);
  assert.match(migration, /where h\.ok is false/);
  assert.match(migration, /grant execute on function public\.monitor_selfcheck_counts\(timestamptz\) to service_role/);
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
  const digestAttempts = [];
  const telegramMessages = [];
  const healthcheckPings = [];
  let healthcheckUrl = 'https://hc.example/fixture-id';
  let failCachedAssets = false;
  let cachedAssetRowsOverride = null;
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
      HEALTHCHECK_PING_URL: healthcheckUrl,
    })[key] },
    serve: (handler) => { globalThis.__scheduledJobRunnerHandler = handler; },
  };
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.telegram.org') {
      telegramMessages.push(JSON.parse(init.body).text);
      return Response.json({ ok: true });
    }
    if (url.hostname === 'hc.example') {
      healthcheckPings.push(url.pathname);
      return new Response(null, { status: 200 });
    }
    if (url.hostname !== 'db.example.test') throw new Error(`Unexpected fetch host: ${url.hostname}`);
    if (url.pathname.endsWith('/cached_assets')) {
      if (failCachedAssets) return Response.json({ error: 'unavailable' }, { status: 503 });
      if (cachedAssetRowsOverride) return Response.json(cachedAssetRowsOverride);
      const updatedAt = new NativeDate(nowMs - 30 * 60 * 1000).toISOString();
      return Response.json([
        { id: 'brent', price: '70.25', updated_at: updatedAt, as_of: '2026-11-25' },
        { id: 'gold', price: '4000', updated_at: updatedAt, as_of: '2026-11-25T18:30:00.000Z' },
        { id: 'sp500', price: '6800', updated_at: updatedAt, as_of: '2026-11-25' },
      ]);
    }
    if (url.pathname.endsWith('/monitor_digest_attempts')) {
      assert.equal(init.method, 'POST');
      digestAttempts.push(JSON.parse(init.body));
      return new Response(null, { status: 204 });
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
    if (url.pathname.endsWith('/rpc/monitor_selfcheck_counts')) {
      return Response.json([{ succeeded: 14, failed: 2 }]);
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
    assert.deepEqual(healthcheckPings, ['/fixture-id'], 'every successful scheduled invocation pings, even before digest hour');
    assert.deepEqual(digestAttempts[0], {
      attempted_at: '2026-11-25T21:12:00.000Z',
      outcome: 'skipped',
      reason: 'digest_window_not_open',
    });
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
    const digestAssets = historyUpdates[0].payload.assets;
    assert.equal(digestAssets.brent.as_of, '2026-11-25');
    assert.equal(digestAssets.gold.as_of, '2026-11-25T18:30:00.000Z', 'digest preserves the original observation timestamp');
    assert.equal(digestAssets.brent.freshness_verdict.ok, true);
    assert.equal(digestAssets.brent.freshness_verdict.allowed_minutes, 3 * 24 * 60);
    assert.equal(historyUpdates[0].payload.freshness.brent, 'ok');
    assert.equal(digestAttempts[1].outcome, 'sent', 'successful Telegram delivery is recorded');
    assert.equal(digestAttempts[1].reason, null);
    assert.deepEqual(healthcheckPings, ['/fixture-id', '/fixture-id'], 'successful digest delivery adds its run ping');
    assert.match(telegramMessages[0], /Самопроверка: 14 успешных запусков, 2 с ошибками за 24ч/,
      'the digest separately counts red selfcheck runs rather than only scheduled-job-runner errors');

    historyStatus = 'pending';
    nowMs = NativeDate.parse('2026-11-26T07:12:00.000Z'); // 10:12 MSK; next hourly retry
    const retryResponse = await handler(request());
    assert.equal(retryResponse.status, 200);
    assert.deepEqual(await retryResponse.json(), { status: 'digest_sent', overall_status: 'ok' });
    assert.equal(telegramMessages.length, 2, 'a pending row is retried on the next hourly run that same MSK day');
    assert.equal(digestAttempts[2].outcome, 'sent', 'a successful retry is recorded as sent');
    assert.deepEqual(healthcheckPings, ['/fixture-id', '/fixture-id', '/fixture-id']);

    nowMs = NativeDate.parse('2026-11-26T08:12:00.000Z'); // 11:12 MSK
    const sentResponse = await handler(request());
    assert.equal(sentResponse.status, 200);
    assert.deepEqual(await sentResponse.json(), { status: 'digest_sent', overall_status: 'ok' });
    assert.equal(telegramMessages.length, 2, 'sent history must not be delivered twice');
    assert.equal(countCalls, 2, 'sent history returns before another previous-digest read/count');
    assert.deepEqual(healthcheckPings, ['/fixture-id', '/fixture-id', '/fixture-id', '/fixture-id'],
      'an already-sent digest does not suppress the successful runner heartbeat');
    assert.deepEqual(
      [digestAttempts[3].outcome, digestAttempts[3].reason],
      ['skipped', 'daily_digest_already_sent'],
    );

    cachedAssetRowsOverride = [
      { id: 'brent', price: '70.25', updated_at: new NativeDate(nowMs - 30 * 60 * 1000).toISOString(), as_of: '2026-11-26' },
      { id: 'gold', price: '4000', updated_at: new NativeDate(nowMs - 30 * 60 * 1000).toISOString(), as_of: '2026-11-26' },
      { id: 'sp500', price: '6800', updated_at: new NativeDate(nowMs - 30 * 60 * 1000).toISOString(), as_of: '2026-11-27' },
    ];
    const invalidTimestampResponse = await handler(request());
    assert.equal(invalidTimestampResponse.status, 503);
    assert.match((await invalidTimestampResponse.json()).error, /Invalid sp500 as_of/);
    assert.equal(telegramMessages.length, 2, 'timestamp validation failure must not send an alert or digest');
    assert.equal(digestAttempts[4].outcome, 'skipped', 'asset validation failures count as skipped digest attempts');
    assert.match(digestAttempts[4].reason, /http_503: Invalid sp500 as_of/);
    assert.equal(healthcheckPings.length, 4, 'invalid source data returns 503 and does not add a success or /fail ping');

    failCachedAssets = true;
    const databaseFailure = await handler(request());
    assert.equal(databaseFailure.status, 500);
    assert.equal(healthcheckPings.at(-1), '/fixture-id/fail', 'database failures call the optional failure endpoint');
    healthcheckUrl = '';
    const databaseFailureWithoutMonitor = await handler(request());
    assert.equal(databaseFailureWithoutMonitor.status, 500);
    assert.equal(healthcheckPings.length, 5, 'an unset optional URL is silently skipped');
  } finally {
    delete globalThis.__scheduledJobRunnerHandler;
    if (previousDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = previousDeno;
    globalThis.Date = NativeDate;
    await rm(directory, { recursive: true, force: true });
  }
});
