import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('digest retries after its configured hour until sent, then suppresses duplicates', () => {
  const source = readFileSync(new URL('../supabase/functions/scheduled-job-runner/index.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(now\.getUTCHours\(\) >= configuredDigestHour\)/);

  const digestFlow = source.slice(source.indexOf('async function runDailyDigest('), source.indexOf('\nDeno.serve('));
  const sentGuard = 'if (existing[0]?.delivery_status === "sent") return;';
  assert.ok(digestFlow.includes(sentGuard), 'sent history must short-circuit');
  const afterSentGuard = digestFlow.slice(digestFlow.indexOf(sentGuard) + sentGuard.length);
  assert.match(afterSentGuard, /let historyId = existing\[0\]\?\.id;/);
  assert.match(afterSentGuard, /if \(historyId\) \{[\s\S]*?delivery_status: "pending"[\s\S]*?\} else \{[\s\S]*?monitor_history\?select=id[\s\S]*?\}/);
  assert.match(afterSentGuard, /await sendTelegram\(digest\.text\);/);
  assert.match(source, /return json\(\{ status: "digest_sent", overall_status: overallVerdict\(verdicts\) \}\);/);
});
