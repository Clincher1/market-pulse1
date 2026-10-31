// Инфляция ЦБ и золото Мосбиржи — два новых ряда, у которых нет платного ключа.
//
// Оба места опасны по-своему. Инфляция читается из разметки страницы ЦБ:
// ошибка в разборе дала бы правдоподобное, но чужое число. У золота на
// Мосбирже на один инструмент приходится несколько площадок с разными
// закрытиями, и без фильтра базой изменения могло стать закрытие чужой сессии.
//
// Фикстуры ниже — настоящие данные: строки таблицы инфляции со страницы ЦБ
// (за сентябрь 2026 — 6,35 %) и история GLDRUB_TOM за 28–30 октября 2026 с
// площадок CETS, CNGD, LICU и SPEC.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  monthDative,
  monthEndDate,
  monthLabel,
  parseInflationTable,
  pickLatestInflation,
} from '../api/_shared/cbrInflation.js';
import { pickPreviousClose, pickQuoteBase } from '../api/russia-insights.js';

/** Строка таблицы ЦБ так, как она приходит в разметке. */
function row(month, keyRate, inflation, target) {
  return `<tr><td class="fixed">${month}</td><td>${keyRate}</td><td>${inflation}</td><td>${target}</td></tr>`;
}

const CBR_PAGE = `<!DOCTYPE html><html><body>
<div class="widget">
<table class="data">
<tr><th>Дата</th><th>Ключевая ставка, % годовых</th><th>Инфляция, % г/г</th><th>Цель по инфляции, %</th></tr>
${row('09.2026', '14,00', '6,35', '4,00')}
${row('08.2026', '14,00', '6,33', '4,00')}
${row('07.2026', '14,00', '5,98', '4,00')}
${row('06.2026', '14,25', '6,02', '4,00')}
${row('05.2026', '14,50', '5,31', '4,00')}
</table>
</div></body></html>`;

test('таблица инфляции читается из разметки страницы ЦБ', () => {
  const rows = parseInflationTable(CBR_PAGE);
  assert.deepEqual(rows.map((item) => item.month), [
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
  ]);
  const picked = pickLatestInflation(rows);
  assert.equal(picked.latest.inflation, 6.35);
  assert.equal(picked.latest.month, '2026-09');
  assert.equal(picked.latest.keyRate, 14);
  assert.equal(picked.previous.month, '2026-08');
});

test('страница печатает месяцы от новых к старым, а берётся последний по календарю', () => {
  // Обратный порядок — особенность страницы, а не повод показать май.
  const rows = parseInflationTable(CBR_PAGE);
  assert.equal(rows[0].month, '2026-05');
  assert.equal(pickLatestInflation(rows).latest.month, '2026-09');
});

test('выгрузка ЦБ с точкой вместо запятой даёт те же числа', () => {
  const exportTable = `<table><tr><td>Дата</td><td>Ключевая ставка, % годовых</td><td>Инфляция, % г/г</td><td>Цель по инфляции</td></tr>
    <tr><td>09.2026</td><td>14.00</td><td>6.35</td><td>4.00</td></tr>
    <tr><td>08.2026</td><td>14.00</td><td>6.33</td><td>4.00</td></tr></table>`;
  const rows = parseInflationTable(exportTable);
  assert.equal(rows.length, 2);
  assert.equal(pickLatestInflation(rows).latest.inflation, 6.35);
});

test('пустая и чужая разметка не превращаются в число', () => {
  assert.deepEqual(parseInflationTable(''), []);
  assert.deepEqual(parseInflationTable('<html><body>нет таблицы</body></html>'), []);
  // Календарь на той же странице: строки с днями месяца, а не с «ММ.ГГГГ».
  const calendar = `<table><tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></table>`;
  assert.deepEqual(parseInflationTable(calendar), []);
  // Значение вне правдоподобия отбрасывается, а не подгоняется.
  const wild = `<table>${row('09.2026', '14,00', '6350,00', '4,00')}</table>`;
  assert.deepEqual(parseInflationTable(wild), []);
  assert.equal(pickLatestInflation([]), null);
});

test('месяц в подписи и дата конца месяца считаются честно', () => {
  assert.equal(monthLabel('2026-09'), 'сентябрь 2026');
  assert.equal(monthLabel('2026-01'), 'январь 2026');
  assert.equal(monthLabel(''), '');
  assert.equal(monthEndDate('2026-09'), '2026-09-30');
  assert.equal(monthEndDate('2026-02'), '2026-02-28');
  assert.equal(monthEndDate('2024-02'), '2024-02-29');
  assert.equal(monthEndDate('2026-13'), null);
  assert.equal(monthDative('2026-08'), 'августу');
  assert.equal(monthDative('2026-09'), 'сентябрю');
  assert.equal(monthDative(''), '');
});

// История GLDRUB_TOM за 28–30.10.2026: площадки идут вперемешку, и закрытия у
// них разные. База — только CETS, потому что сделка, которую показывает плитка,
// тоже с CETS.
const GOLD_HISTORY = {
  history: {
    columns: ['BOARDID', 'TRADEDATE', 'CLOSE', 'WAPRICE'],
    data: [
      ['CETS', '2026-10-28', 10432.5, 10468.73],
      ['CNGD', '2026-10-28', 10178.23, null],
      ['LICU', '2026-10-28', 0, null],
      ['SPEC', '2026-10-28', 0, null],
      ['CETS', '2026-10-29', 10534, 10463.17],
      ['CNGD', '2026-10-29', 10375.5, null],
      ['CETS', '2026-10-30', 10149.5, 10335.41],
      ['CNGD', '2026-10-30', 10538.8, null],
    ],
  },
};

test('базой золота считается закрытие CETS, а не чужой площадки', () => {
  assert.deepEqual(pickPreviousClose(GOLD_HISTORY, '2026-10-31', 'CETS'), {
    date: '2026-10-30',
    close: 10149.5,
  });
  // Без фильтра взялась бы последняя строка вообще — с площадки CNGD.
  assert.deepEqual(pickPreviousClose(GOLD_HISTORY, '2026-10-31'), {
    date: '2026-10-30',
    close: 10538.8,
  });
});

test('без площадки в разметке истории баз нет, а не «примерно столько»', () => {
  const безBoardId = { history: { columns: ['TRADEDATE', 'CLOSE'], data: [['2026-10-30', 10149.5]] } };
  assert.equal(pickPreviousClose(безBoardId, '2026-10-31', 'CETS'), null);
  // Сегодняшняя сессия базой быть не может.
  assert.deepEqual(pickPreviousClose(GOLD_HISTORY, '2026-10-30', 'CETS'), {
    date: '2026-10-29',
    close: 10534,
  });
});

test('субботняя плитка золота сравнивает с предыдущей сессией, а не сама с собой', () => {
  // Что было: последняя сделка — закрытие 30.10 (10 149,5), и предыдущее
  // закрытие тоже 30.10, потому что сегодня торгов не было. На экран попадало
  // «0,00 % к 30.10», и падение пятницы исчезало.
  const base = pickQuoteBase(GOLD_HISTORY, '2026-10-31', 10149.5, 'CETS');
  assert.deepEqual(base, { date: '2026-10-29', close: 10534 });
  const changePct = ((10149.5 - base.close) / base.close) * 100;
  assert.equal(Math.round(changePct * 100) / 100, -3.65);
});

test('сделка идёт прямо сейчас: база — последнее закрытие строго раньше сегодня', () => {
  // Цена не совпала ни с одним закрытием — значит это сделка текущей сессии.
  const base = pickQuoteBase(GOLD_HISTORY, '2026-10-31', 10200, 'CETS');
  assert.deepEqual(base, { date: '2026-10-30', close: 10149.5 });
});

test('истории нет — базы нет, изменение не выдумывается', () => {
  assert.equal(pickQuoteBase({}, '2026-10-31', 10149.5, 'CETS'), null);
  assert.equal(pickQuoteBase(GOLD_HISTORY, '2026-10-28', 10149.5, 'CETS'), null);
});
