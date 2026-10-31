import assert from 'node:assert/strict';
import test from 'node:test';

import { mapAssetCacheRow } from '../src/data/assetCacheRow.ts';

/**
 * Форма строки повторяет настоящий ответ `cached_assets` от 31.10.2026:
 * колонки в snake_case, значения — числа, даты — ISO-строки.
 */

function row(overrides = {}) {
  return {
    id: 'gold',
    name: 'Gold',
    price: '$3,875.4',
    change: -0.2098,
    sparkline: [3944.1, 3990.6, 3875.44],
    updated_at: '2026-10-31T19:10:01.13+00:00',
    as_of: '2026-10-30T20:00:00+00:00',
    spark_dates: ['2026-10-28', '2026-10-29', '2026-10-30'],
    ...overrides,
  };
}

test('даты из snake_case доходят до приложения и совпадают со значениями', () => {
  const asset = mapAssetCacheRow(row());
  assert.deepEqual(asset.sparkDates, ['2026-10-28', '2026-10-29', '2026-10-30']);
  assert.equal(asset.asOf, '2026-10-30T20:00:00+00:00');
  assert.equal(asset.updatedAt, '2026-10-31T19:10:01.13+00:00');
});

test('дат меньше, чем значений, — ряд бездатый целиком', () => {
  // Половина календаря хуже, чем его отсутствие: значения нельзя подписать
  // частично, иначе последнее число получит чужой день.
  const asset = mapAssetCacheRow(row({ spark_dates: ['2026-10-28', '2026-10-29'] }));
  assert.equal(asset.sparkDates, null);
  assert.equal(asset.sparkline.length, 3);
});

test('нет колонки — null, а не пустой массив', () => {
  const asset = mapAssetCacheRow(row({ spark_dates: undefined }));
  assert.equal(asset.sparkDates, null);
  const empty = mapAssetCacheRow(row({ spark_dates: [] }));
  assert.equal(empty.sparkDates, null);
});

test('пустые значения не превращаются в NaN и не ломают плитку', () => {
  const asset = mapAssetCacheRow(row({ sparkline: undefined, change: undefined, as_of: undefined }));
  assert.deepEqual(asset.sparkline, []);
  assert.equal(asset.change, 0);
  assert.equal(asset.asOf, null);
  assert.equal(asset.sparkDates, null);
});
