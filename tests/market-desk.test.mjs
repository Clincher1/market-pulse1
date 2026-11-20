import assert from 'node:assert/strict';
import test from 'node:test';
import { assetObservations, compareAssets, dateLabel, latestMove, parseFavorites, percentBetween, validDate } from '../src/lib/marketDesk.ts';

function asset(id, dates = ['2026-10-23', '2026-10-26', '2026-10-27'], values = [100, 110, 120]) {
  return { id, name: id, price: '$120', change: 999, sourceLabel: 'Test source', sparkDates: dates, sparkline: values };
}

test('favorites validate untrusted browser storage, deduplicate and preserve selection order', () => {
  for (const raw of [null, '', '{', '{}', 'null', '42', '"btc"']) assert.deepEqual(parseFavorites(raw), []);
  assert.deepEqual(parseFavorites('["btc",null,12,"unknown","btc","brent","__proto__"]'), ['btc', 'brent']);
});

test('strict dates reject impossible calendar dates', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-10-23T00:00:00Z'), false);
  assert.equal(dateLabel('2026-10-23'), '23.10.2026');
  assert.equal(dateLabel('garbage'), 'дата неизвестна');
});

test('missing, mismatched, duplicate, invalid dates or nonpositive values are not fabricated', () => {
  const base = asset('btc');
  for (const override of [
    { sparkDates: null }, { sparkDates: [] }, { sparkDates: ['2026-10-23'] },
    { sparkDates: ['2026-10-23', '2026-10-23', '2026-10-27'] },
    { sparkDates: ['2026-02-30', '2026-10-26', '2026-10-27'] },
    { sparkline: [100, 0, 120] }, { sparkline: [100, NaN, 120] },
    { sparkline: [100, Infinity, 120] }, { sparkline: [-1, 110, 120] },
    { asOf: '2026-10-26' },
  ]) assert.deepEqual(assetObservations({ ...base, ...override }), []);
});

test('observations are sorted without mutating the source; returns derive from values, not cached change', () => {
  const a = asset('btc', ['2026-10-27', '2026-10-23', '2026-10-26'], [120, 100, 110]);
  const snapshot = JSON.stringify(a);
  const move = latestMove(a);
  assert.equal(move.from, '2026-10-26');
  assert.equal(move.till, '2026-10-27');
  assert.equal(move.first, 110);
  assert.equal(move.last, 120);
  assert.ok(Math.abs(move.change - 9.09090909) < 0.00001);
  assert.equal(JSON.stringify(a), snapshot);
});

test('percent arithmetic rejects invalid bases and handles flat/negative returns', () => {
  assert.equal(percentBetween(100, 100), 0);
  assert.ok(Math.abs(percentBetween(100, 90) + 10) < 1e-10);
  for (const pair of [[0, 10], [-1, 1], [10, NaN], [Infinity, 20], [Number.MIN_VALUE, Number.MAX_VALUE]]) {
    assert.equal(percentBetween(...pair), null);
  }
});

test('comparison intersects calendars, uses a shared baseline, and retains verifiable original values', () => {
  const a = asset('sp500', ['2026-10-23', '2026-10-26', '2026-10-27'], [100, 110, 121]);
  const b = asset('btc', ['2026-10-22', '2026-10-26', '2026-10-27'], [30, 50, 40]);
  const result = compareAssets([a, b], 10);
  assert.deepEqual(result.dates, ['2026-10-26', '2026-10-27']);
  assert.deepEqual(result.lines[0].rawValues, [110, 121]);
  assert.equal(result.lines[0].values[0], 0);
  assert.ok(Math.abs(result.lines[0].values[1] - 10) < 1e-10);
  assert.ok(Math.abs(result.lines[1].values[1] + 20) < 1e-10);
  assert.equal(result.lines[0].source, 'Test source');
});

test('window selection rebases every series at the same later point', () => {
  const a = asset('sp500');
  const b = asset('gold', undefined, [20, 40, 60]);
  const result = compareAssets([a, b], 2);
  assert.deepEqual(result.dates, ['2026-10-26', '2026-10-27']);
  assert.equal(result.lines[0].values[0], 0);
  assert.equal(result.lines[1].values[0], 0);
  assert.equal(result.lines[1].values[1], 50);
});

test('no silent omission of unavailable selection, date interpolation, or single-series comparison', () => {
  const a = asset('sp500');
  for (const list of [[], [a], [a, a], [a, { ...asset('gold'), sparkDates: null }],
    [a, asset('gold', ['2026-10-20', '2026-10-21'], [10, 20])],
    [a, asset('gold', ['2026-10-21', '2026-10-27'], [10, 20])],
  ]) assert.equal(compareAssets(list, 10), null);
});
