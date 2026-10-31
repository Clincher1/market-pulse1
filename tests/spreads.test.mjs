import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMoneySpreads } from '../src/lib/spreads.ts';

/**
 * Числа — настоящие, с сайта 31.10.2026: ключевая 14,00 % (с 27.07.2026),
 * инфляция 6,35 % за сентябрь, ОФЗ 10 лет 16,56 %, кривая 3 мес 13,28 %.
 * Никаких «примерно 10», иначе тест проверяет не то, что видит читатель.
 */

function plain(text) {
  return String(text ?? '').replace(/\u00A0/g, ' ');
}

const realInput = () => ({
  keyRate: { value: 14, asOf: 'с 27.07.2026' },
  inflation: { value: 6.35, asOf: 'за сентябрь 2026' },
  ofz10y: { value: 16.56, asOf: '30.10.2026' },
  curve: [
    { period: 0.25, value: 13.28 },
    { period: 0.5, value: 13.56 },
    { period: 10, value: 16.56 },
  ],
  curveAsOf: '30.10.2026',
});

test('реальная ставка — это разность в п.п., а не процент от процента', () => {
  const [row] = buildMoneySpreads({ keyRate: realInput().keyRate, inflation: realInput().inflation });
  assert.equal(row.id, 'real-rate');
  assert.equal(plain(row.value), '+7,65 п.п.');
  assert.equal(plain(row.formula), '14,00 % − 6,35 %');
  assert.match(plain(row.basis), /ключевая с 27\.07\.2026, инфляция за сентябрь 2026/);
});

test('премия за срок: ОФЗ 10 лет минус ключевая', () => {
  const rows = buildMoneySpreads(realInput());
  const row = rows.find((item) => item.id === 'ofz-premium');
  assert.ok(row);
  assert.equal(plain(row.value), '+2,56 п.п.');
  assert.equal(plain(row.formula), '16,56 % − 14,00 %');
});

test('наклон кривой берёт 10 лет и 3 месяца, а не ближайшие точки', () => {
  const rows = buildMoneySpreads(realInput());
  const row = rows.find((item) => item.id === 'curve-slope');
  assert.ok(row);
  assert.equal(plain(row.value), '+3,28 п.п.');
  assert.equal(plain(row.formula), '16,56 % − 13,28 %');
  assert.match(plain(row.basis), /10 лет и 3 месяца, кривая 30\.10\.2026/);
});

test('без слагаемого строка не считается: половина разности — не результат', () => {
  const onlyRate = buildMoneySpreads({ keyRate: { value: 14, asOf: 'с 27.07.2026' } });
  assert.deepEqual(onlyRate, []);
  const noShortEnd = buildMoneySpreads({
    curve: [{ period: 0.5, value: 13.56 }, { period: 10, value: 16.56 }],
  });
  assert.deepEqual(noShortEnd, []);
});

test('отрицательная разность подписана знаком минус, ноль — без знака', () => {
  const [negative] = buildMoneySpreads({
    keyRate: { value: 6, asOf: 'с 01.01.2026' },
    inflation: { value: 8, asOf: 'за август 2026' },
  });
  assert.equal(plain(negative.value), '−2,00 п.п.');
  const [zero] = buildMoneySpreads({
    keyRate: { value: 7, asOf: 'с 01.01.2026' },
    inflation: { value: 7, asOf: 'за август 2026' },
  });
  assert.equal(plain(zero.value), '0,00 п.п.');
});
