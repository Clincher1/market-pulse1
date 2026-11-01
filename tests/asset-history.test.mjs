import assert from 'node:assert/strict';
import test from 'node:test';

import { closedHistory, utcDay } from '../supabase/functions/_shared/asset-history.ts';

/**
 * Фикстуры — настоящие строки кэша на 01.11.2026, 06:25 UTC:
 *   gold:  последние значения 3875.41757 / 3875.43884 / 3883.58851 / 4022.11919
 *          с датами 2026-11-01 / 2026-10-31 / 2026-10-30 / 2026-10-29,
 *          as_of = 2026-10-31T20:00:00Z (23:00 МСК);
 *   btc:   дневная свеча Kraken за текущие сутки ещё формируется.
 */

const goldPoints = [
  { date: '2026-10-29', value: 4022.11919 },
  { date: '2026-10-30', value: 3883.58851 },
  { date: '2026-10-31', value: 3875.43884 },
  { date: '2026-11-01', value: 3875.41757 },
];

test('точка позже момента наблюдения в историю не входит', () => {
  const result = closedHistory({
    points: goldPoints,
    asOf: '2026-10-31T20:00:00Z',
    fetchedAt: '2026-11-01T06:25:01.718Z',
  });
  assert.deepEqual(result.points.map((point) => point.date), ['2026-10-29', '2026-10-30', '2026-10-31']);
  assert.equal(result.points.at(-1).value, 3875.43884);
  assert.equal(result.dropped.afterAsOf, 1);
  assert.equal(result.dropped.forming, 0);
});

test('незакрытый бар текущих суток в историю не входит, цена остаётся', () => {
  const btcPoints = [
    { date: '2026-10-29', value: 76000 },
    { date: '2026-10-30', value: 77400 },
    { date: '2026-10-31', value: 77500 },
    { date: '2026-11-01', value: 77719 },
  ];
  const result = closedHistory({
    points: btcPoints,
    asOf: '2026-11-01',
    fetchedAt: '2026-11-01T06:25:01.718Z',
    formingBarDate: utcDay('2026-11-01T06:25:01.718Z'),
  });
  assert.deepEqual(result.points.map((point) => point.date), ['2026-10-29', '2026-10-30', '2026-10-31']);
  assert.equal(result.dropped.forming, 1);
  // Цена в плитке — отдельно от истории: 77 719 остаётся текущей.
  assert.equal(btcPoints.at(-1).value, 77719);
});

test('ряд без решения о закрытии не теряет точек: поведение прежнее', () => {
  const points = [
    { date: '2026-10-26', value: 128.3 },
    { date: '2026-10-27', value: 123.1 },
  ];
  const result = closedHistory({
    points,
    asOf: '2026-10-27',
    fetchedAt: '2026-11-01T06:25:01.718Z',
  });
  assert.equal(result.points.length, 2);
  assert.equal(result.dropped.afterAsOf, 0);
});

test('нет as_of — режем только формирующийся бар, остальное не трогаем', () => {
  const result = closedHistory({
    points: goldPoints,
    asOf: null,
    fetchedAt: '2026-11-01T06:25:01.718Z',
  });
  assert.equal(result.points.length, 4);

  const withForming = closedHistory({
    points: goldPoints,
    asOf: null,
    fetchedAt: '2026-11-01T06:25:01.718Z',
    formingBarDate: '2026-11-01',
  });
  assert.equal(withForming.points.length, 3);
});

test('мусор в дате и значениях выбрасывается, а не попадает в ряд', () => {
  const result = closedHistory({
    points: [
      { date: '2026-10-30', value: 3883.58851 },
      { date: '30.10.2026', value: 3800 },
      { date: '2026-10-31', value: Number.NaN },
      { date: '', value: 3900 },
      { date: '2026-10-31', value: 3875.43884 },
    ],
    asOf: '2026-10-31T20:00:00Z',
    fetchedAt: '2026-11-01T06:25:01.718Z',
  });
  assert.deepEqual(result.points.map((point) => point.date), ['2026-10-30', '2026-10-31']);
});

test('utcDay читает день из ISO-времени и не выдумывает', () => {
  assert.equal(utcDay('2026-11-01T06:25:01.718Z'), '2026-11-01');
  assert.equal(utcDay('2026-11-01'), '2026-11-01');
  assert.equal(utcDay('вчера'), null);
  assert.equal(utcDay(''), null);
});
