import assert from 'node:assert/strict';
import test from 'node:test';

import { addTradingDays, daysBetween, horizonLabel, horizonOutlook } from '../src/lib/forecastHorizon.ts';

/**
 * Фикстуры — настоящие строки market_memory_forecasts_v1 с прода 09.11.2026:
 *
 *   89 записей со статусом pending, выданных 23–31 октября, горизонт 1–10
 *   торговых дней. У горизонта 1–3 срок наступил ещё в начале ноября, но
 *   исхода нет: оценку остановили вместе с выдачей.
 */

const pendingFrom31 = { issueDate: '2026-10-31', horizonTradingDays: 1, outcomeStatus: 'pending' };
const pendingLong = { issueDate: '2026-10-31', horizonTradingDays: 10, outcomeStatus: 'pending' };
const evaluated = { issueDate: '2026-10-29', horizonTradingDays: 3, outcomeStatus: 'evaluated' };

test('торговые дни пропускают выходные', () => {
  // 30.10.2026 — пятница; +1 торговый день = понедельник 02.11.
  assert.equal(addTradingDays('2026-10-30', 1), '2026-11-02');
  assert.equal(addTradingDays('2026-10-30', 0), '2026-10-30');
  // 31.10 — суббота; отсчёт всё равно начинается с неё и уходит на 02.11.
  assert.equal(addTradingDays('2026-10-31', 2), '2026-11-03');
});

test('срок горизонта прошёл — так и говорим, а не «ждёт»', () => {
  // Запись от 31.10 с горизонтом в один торговый день: исход наблюдаем с 02.11.
  const outlook = horizonOutlook(pendingFrom31, '2026-11-09');
  assert.equal(outlook.state, 'overdue');
  assert.equal(outlook.expectedDate, '2026-11-02');
  assert.equal(outlook.days, 7);
  const label = horizonLabel(outlook, (iso) => iso);
  assert.match(label, /срок прошёл 7 дней назад, исход не посчитан/);
  assert.doesNotMatch(label, /ждёт/);
});

test('длинный горизонт ещё может ждать — и тогда называется дата', () => {
  // 31.10 + 10 торговых дней = 13.11.2026 (пятница); на 09.11 срок не наступил.
  const outlook = horizonOutlook(pendingLong, '2026-11-09');
  assert.equal(outlook.state, 'waiting');
  assert.equal(outlook.expectedDate, '2026-11-13');
  assert.equal(outlook.days, 4);
  assert.match(horizonLabel(outlook, (iso) => iso), /ждёт горизонта до 2026-11-13/);
});

test('оценённая запись не считается ни ждущей, ни просроченной', () => {
  const outlook = horizonOutlook(evaluated, '2026-11-09');
  assert.equal(outlook.state, 'evaluated');
  assert.equal(horizonLabel(outlook, (iso) => iso), 'исход посчитан');
});

test('день наступления срока — ещё не просрочка', () => {
  const outlook = horizonOutlook(pendingFrom31, '2026-11-02');
  assert.equal(outlook.state, 'waiting');
  assert.equal(outlook.days, 0);
});

test('склонение слова «день» не врёт на 1, 2, 5, 11, 21', () => {
  const label = (days) =>
    horizonLabel({ state: 'overdue', expectedDate: '2026-11-01', days }, (iso) => iso);
  assert.match(label(1), /1 день назад/);
  assert.match(label(2), /2 дня назад/);
  assert.match(label(5), /5 дней назад/);
  assert.match(label(11), /11 дней назад/);
  assert.match(label(21), /21 день назад/);
});

test('битые данные не роняют карточку', () => {
  assert.equal(addTradingDays('не дата', 3), null);
  assert.equal(daysBetween('2026-11-09', 'мусор'), null);
  const outlook = horizonOutlook({ issueDate: undefined, horizonTradingDays: 1, outcomeStatus: 'pending' });
  assert.equal(outlook.state, 'waiting');
  assert.match(horizonLabel(outlook, (iso) => iso), /ждёт горизонта$/);
});
