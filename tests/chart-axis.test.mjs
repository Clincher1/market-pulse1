import assert from 'node:assert/strict';
import test from 'node:test';

import {
  axisUnitLabel,
  formatTick,
  nearestIndexByFraction,
  niceTicks,
  tickStep,
} from '../src/lib/chartAxis.ts';

// Реальный минимум и максимум IMOEX за окно 31.07–30.10.2026.
const IMOEX_MIN = 2071.2;
const IMOEX_MAX = 2524.06;

test('отметки оси IMOEX — круглые числа внутри данных, а не края рисунка', () => {
  const ticks = niceTicks(IMOEX_MIN, IMOEX_MAX);
  assert.deepEqual(ticks, [2100, 2200, 2300, 2400, 2500]);
  // Прежний дефект: подписи 2017 и 2578 появлялись из раздвинутого диапазона
  // и не соответствовали ни одному значению ряда.
  assert.ok(!ticks.some((tick) => tick === 2017 || tick === 2578));
});

test('каждая отметка лежит внутри данных и отличается на один шаг', () => {
  const ticks = niceTicks(IMOEX_MIN, IMOEX_MAX);
  assert.ok(ticks.every((tick) => tick >= IMOEX_MIN && tick <= IMOEX_MAX));
  const step = tickStep(ticks);
  assert.equal(step, 100);
  for (let index = 1; index < ticks.length; index += 1) {
    assert.equal(Math.round(ticks[index] - ticks[index - 1]), step);
  }
  assert.ok(ticks.length >= 3, 'две отметки — это не масштаб');
});

test('узкий диапазон доходностей даёт шаг в целый процентный пункт', () => {
  assert.deepEqual(niceTicks(13.28, 16.78), [14, 15, 16]);
  assert.equal(formatTick(14, 1), '14');
});

test('маленькие значения не слипаются: шаг уходит в тысячные', () => {
  const ticks = niceTicks(0.0012, 0.0048);
  assert.deepEqual(ticks, [0.002, 0.003, 0.004]);
  assert.equal(formatTick(0.002, 0.001), '0,002');
  assert.notEqual(formatTick(ticks[0], 0.001), formatTick(ticks[1], 0.001));
});

test('подпись отметки не рисует ложную точность', () => {
  // Шаг 100 — это сотни пунктов: «2 500,00» обещало бы точность, которой нет.
  assert.equal(formatTick(2500, 100), '2\u00A0500');
  // Шаг 0,5 — десятые доли: «13,5» рядом с «14,0», а не «13,50».
  assert.equal(formatTick(13.5, 0.5), '13,5');
  assert.equal(formatTick(14, 0.5), '14,0');
  assert.equal(formatTick(0, 100), '0');
});

test('вырожденный диапазон не выдумывает отметок', () => {
  assert.deepEqual(niceTicks(120, 120), [120]);
  assert.deepEqual(niceTicks(Number.NaN, 5), []);
  assert.deepEqual(niceTicks(10, 5), []);
});

test('название шкалы стоит в именительном падеже', () => {
  assert.equal(axisUnitLabel('пункта'), 'пункты');
  assert.equal(axisUnitLabel('%'), 'проценты');
  assert.equal(axisUnitLabel('₽'), 'рубли');
  assert.equal(axisUnitLabel('млрд $'), 'млрд $');
});

test('курсор попадает в ближайшую точку, а не в соседнюю по индексу', () => {
  const positions = [44, 120, 260, 380, 604];
  assert.equal(nearestIndexByFraction(positions, 0), 0);
  assert.equal(nearestIndexByFraction(positions, 1), 4);
  // 0,45 от края — это x = 296: ближе к 260, чем к 380.
  assert.equal(nearestIndexByFraction(positions, 0.45), 2);
  assert.equal(nearestIndexByFraction(positions, 0.75), 3);
  assert.equal(nearestIndexByFraction([], 0.5), null);
});

test('шум двоичной дроби не добавляет знаков в подписи', () => {
  assert.equal(tickStep([14, 14.1, 14.2]), 0.1);
  assert.equal(formatTick(14.1, tickStep([14, 14.1, 14.2])), '14,1');
  // Шаг 0,25 требует двух знаков: «14,3» и «14,5» иначе выглядели бы как
  // разные отметки при одинаковой подписи.
  assert.equal(formatTick(14.25, 0.25), '14,25');
});
