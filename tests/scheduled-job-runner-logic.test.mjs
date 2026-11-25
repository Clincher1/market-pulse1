import test from 'node:test';
import assert from 'node:assert/strict';
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
