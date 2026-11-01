import assert from 'node:assert/strict';
import test from 'node:test';

import { instrumentChanged } from '../src/lib/snapshotIdentity.ts';

/**
 * Фикстуры — настоящие строки снимка дня на 01.11.2026:
 *   daily_snapshots.assets[].name = "Brent", last = 123.1 (спот EIA);
 *   cached_assets.name = "Brent (фьючерс)", price = $113,43 (BZ=F).
 * Именно эта пара давала на сайте «Brent (фьючерс): −7,86 % к снимку».
 */
test('смена инструмента видна по имени ряда', () => {
  assert.equal(instrumentChanged({ name: 'Brent' }, { name: 'Brent (фьючерс)' }), true);
});

test('тот же ряд сравнивать можно', () => {
  assert.equal(instrumentChanged({ name: 'S&P 500' }, { name: 'S&P 500' }), false);
  assert.equal(instrumentChanged({ name: ' USD/EUR ' }, { name: 'USD/EUR' }), false);
});

test('нет снимка или имени — это не смена инструмента', () => {
  assert.equal(instrumentChanged(undefined, { name: 'Brent (фьючерс)' }), false);
  assert.equal(instrumentChanged(null, { name: 'Brent' }), false);
  assert.equal(instrumentChanged({ name: '' }, { name: 'Brent' }), false);
  assert.equal(instrumentChanged({ name: 'Brent' }, { name: null }), false);
});
