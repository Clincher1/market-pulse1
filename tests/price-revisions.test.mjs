import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDailyCloseRevision } from '../supabase/functions/_shared/price-revisions.mjs';

const base = {
  instrumentId: 'brent_yahoo_bzf',
  observationDate: '2026-11-27',
  utcToday: '2026-11-28',
  originalValue: 100,
};

test('identical closed daily close is written without a revision event', () => {
  assert.deepEqual(compareDailyCloseRevision({ ...base, revisedValue: 100 }), {
    action: 'write', isRevision: false, deltaPct: 0, reason: 'unchanged',
  });
});

test('closed daily close revision at exactly two percent is accepted and logged', () => {
  assert.deepEqual(compareDailyCloseRevision({ ...base, revisedValue: 102 }), {
    action: 'accept_revision', isRevision: true, deltaPct: 2, reason: 'within_threshold',
  });
});

test('closed daily close revision above two percent is held for review', () => {
  const result = compareDailyCloseRevision({ ...base, revisedValue: 102.01 });
  assert.equal(result.action, 'pending_review');
  assert.equal(result.isRevision, true);
  assert.equal(result.reason, 'over_threshold');
  assert.ok(result.deltaPct > 2);
});

test('ordinary Kraken crypto candle updates are not treated as immutable close revisions', () => {
  const result = compareDailyCloseRevision({
    ...base,
    instrumentId: 'btc_kraken_xbtusd_daily',
    originalValue: 100000,
    revisedValue: 106000,
  });
  assert.equal(result.action, 'write');
  assert.equal(result.isRevision, false);
  assert.equal(result.reason, 'not_closed_daily_bar');
});

test('spot gold observations are not treated as immutable daily close revisions', () => {
  const result = compareDailyCloseRevision({
    ...base,
    instrumentId: 'gold_api_xau_observed_daily',
    originalValue: 4000,
    revisedValue: 4300,
  });
  assert.equal(result.action, 'write');
  assert.equal(result.isRevision, false);
  assert.equal(result.reason, 'not_closed_daily_bar');
});

test('same-day live Brent updates are not blocked as historical revisions', () => {
  const result = compareDailyCloseRevision({
    ...base,
    observationDate: '2026-11-28',
    originalValue: 100,
    revisedValue: 110,
  });
  assert.equal(result.action, 'write');
  assert.equal(result.isRevision, false);
  assert.equal(result.reason, 'not_closed_daily_bar');
});
