import test from 'node:test';
import assert from 'node:assert/strict';
import { briefDelta, lastSeriesObservation, snapshotSeriesDateLabel, orderBriefComparisons } from '../api/_shared/briefComparison.js';
import { WORLD_ASSET_UNITS } from '../src/lib/marketUnits.ts';

test('RUONIA and OFZ use percentage points, not percentages of rates', () => {
  assert.equal(briefDelta(13.96, 14, '%').label, '+0,04\u00a0п.п.');
  assert.equal(briefDelta(16.99, 17.07, '%').label, '+0,08\u00a0п.п.');
  assert.equal(briefDelta(0, -0.25, '%').label, '−0,25\u00a0п.п.');
  assert.equal(briefDelta(100, 110, '₽').label, '+10,00\u00a0%');
});
test('no invented zero from missing input or changes rounded to zero', () => {
  for (const invalid of [null, undefined, NaN, Infinity, '14']) assert.equal(briefDelta(invalid, 14, '%'), null);
  assert.equal(briefDelta(0, 100, '₽'), null);
  assert.equal(briefDelta(14, 14.00001, '%'), null);
});
test('daily point uses its paired date, invalid calendars are rejected', () => {
  const row = { sparkline: [100, 110], sparkDates: ['2026-10-26', '2026-10-27'], asOf: '2026-10-28T14:00:00Z' };
  assert.deepEqual(lastSeriesObservation(row), { value: 110, date: '2026-10-27' });
  for (const dates of [null, [], ['2026-10-27'], ['2026-10-27', '2026-10-26'], ['2026-10-27', '2026-10-27'], ['2026-02-30', '2026-10-27']]) {
    assert.equal(lastSeriesObservation({ ...row, sparkDates: dates }), null);
  }
  assert.equal(snapshotSeriesDateLabel(null), 'дата точки в снимке не сохранена');
  assert.equal(snapshotSeriesDateLabel('2026-10-27'), '27.10.2026');
});
test('rates do not compete against prices for six places', () => {
  const prices = Array.from({ length: 9 }, (_, index) => ({ kind: 'relative', magnitude: 100 - index, item: { id: `price-${index}` } }));
  const rate = { kind: 'points', magnitude: 0.04, item: { id: 'ruonia' } };
  const rows = [...prices, rate];
  assert.equal(orderBriefComparisons(rows).length, 7);
  assert.equal(orderBriefComparisons(rows).at(-1), rate);
  assert.equal(rows.length, 10);
});
test('displayed currency unit is EUR per USD, not its reciprocal', () => {
  assert.equal(WORLD_ASSET_UNITS['usd-eur'], 'EUR за 1 USD');
});

test('brief leader compares dated closes even when live quote change is different', async () => {
  const { lastSeriesMove } = await import('../api/_shared/briefComparison.js');
  const move = lastSeriesMove({ sparkline: [3723.72756, 3666.8714], sparkDates: ['2026-11-18', '2026-11-19'] });
  assert.equal(move.change.toFixed(2), '-1.53');
  assert.equal(move.previousValue, 3723.72756);
  assert.equal(move.date, '2026-11-19');
  assert.equal(lastSeriesMove({ sparkline: [1, 2], sparkDates: null }), null);
});
