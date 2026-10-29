import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractCurve, parseKeyRateXml, pickOfz10y } from '../api/russia-insights.js';
import {
  buildKeyRateSteps,
  parseCbrDynamicXml,
  parseIssHistory,
} from '../api/russia-history.js';
import { parseRuoniaXml } from '../api/_shared/cbrRuonia.js';

/**
 * Разборщики первоисточников — единственное место, где сайт может молча
 * начать врать: если формат ответа поменяется, числа не станут «примерно
 * такими же», они станут другими. Три реальные ошибки уже были пойманы
 * именно здесь (блок ZCYC, срок в годах, пустая ячейка как 0), поэтому
 * проверки живут в репозитории, а не в чьей-то памяти.
 */

test('ISS history: колонки по имени, мусор отбрасывается', () => {
  const payload = {
    history: {
      columns: ['BOARDID', 'SECID', 'TRADEDATE', 'CLOSE', 'OPEN'],
      data: [
        ['SNDX', 'RGBI', '2026-10-28', 112.53, 112.45],
        ['SNDX', 'RGBI', '2026-10-27', 112.45, 111.98],
        ['SNDX', 'RGBI', '2026-10-26', 0, 111.88],
        ['SNDX', 'RGBI', '', 111.7, 111.7],
        ['SNDX', 'RGBI', '2026-10-23', null, 112],
      ],
    },
    'history.cursor': { columns: ['INDEX', 'TOTAL', 'PAGESIZE'], data: [[0, 7, 100]] },
  };

  const { points, total } = parseIssHistory(payload);
  assert.deepEqual(points, [
    { date: '2026-10-27', value: 112.45 },
    { date: '2026-10-28', value: 112.53 },
  ]);
  assert.equal(total, 7);
});

test('ISS history: нет блока — это ошибка, а не пустой график', () => {
  assert.throws(() => parseIssHistory({ zcyc: {} }), /блок history/);
  assert.throws(() => parseIssHistory({ history: { columns: ['TRADEDATE'], data: [] } }), /CLOSE/);
});

test('ЦБ XML_dynamic: запятые, номинал 10, пустые значения', () => {
  const xml = `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs ID="R01235">
  <Record Date="28.10.2026"><Nominal>1</Nominal><Value>80,5307</Value><VunitRate>80,5307</VunitRate></Record>
  <Record Date="29.10.2026"><Nominal>1</Nominal><Value>80,8664</Value><VunitRate>80,8664</VunitRate></Record>
  <Record Date="26.10.2026"><Nominal>1</Nominal><Value></Value><VunitRate></VunitRate></Record>
  <Record Date="01.10.2026"><Nominal>10</Nominal><Value>8,5</Value><VunitRate>0,85</VunitRate></Record>
</ValCurs>`;

  const points = parseCbrDynamicXml(xml);
  assert.deepEqual(
    points.map((point) => point.date),
    ['2026-10-01', '2026-10-28', '2026-10-29'],
  );
  assert.equal(points[0].value, 0.85);
  assert.equal(points.at(-1).value, 80.8664);
  assert.deepEqual(parseCbrDynamicXml('<ValCurs></ValCurs>'), []);
});

test('ключевая ставка: точки изменения дают ту же ступень, что подневный ряд', () => {
  const changePoints = parseKeyRateXml(
    '<KR><DT>2026-07-24T00:00:00+03:00</DT><Rate>14.25</Rate></KR>' +
      '<KR><DT>2026-07-27T00:00:00+03:00</DT><Rate>14.00</Rate></KR>',
  );
  assert.deepEqual(buildKeyRateSteps(changePoints, '2026-07-29'), [
    { date: '2026-07-29', value: 14, since: '2026-07-27' },
  ]);
  assert.deepEqual(buildKeyRateSteps(changePoints, '2026-07-24'), [
    { date: '2026-07-24', value: 14.25, since: '2026-07-24' },
    { date: '2026-07-27', value: 14, since: '2026-07-27' },
  ]);

  const daily = [
    { date: '2026-07-24', rate: 14.25 },
    { date: '2026-07-25', rate: 14.25 },
    { date: '2026-07-27', rate: 14 },
    { date: '2026-07-28', rate: 14 },
    { date: '2026-07-29', rate: 14 },
  ];
  assert.deepEqual(buildKeyRateSteps(daily, '2026-07-29'), [
    { date: '2026-07-29', value: 14, since: '2026-07-27' },
  ]);
  assert.equal(buildKeyRateSteps([], '2026-07-29').length, 0);
});

test('кривая ОФЗ: блок yearyields, срок в годах, дубли и пустые ячейки', () => {
  const payload = {
    yearyields: {
      columns: ['tradedate', 'tradetime', 'period', 'value'],
      data: [
        ['2026-10-29', '14:21:16', 0.25, 13.14],
        ['2026-10-29', '14:21:16', 10, 16.3869],
        ['2026-10-29', '14:21:16', 10, 16.44],
        ['2026-10-29', '14:21:16', 20, 16.53],
        ['2026-10-29', '14:21:16', 0, 99],
        ['2026-10-29', '14:21:16', 3, null],
      ],
    },
  };

  const curve = extractCurve(payload);
  assert.deepEqual(
    curve.map((point) => point.period),
    [0.25, 10, 20],
  );
  assert.equal(curve[1].value, 16.44);
  // Плитка и график обязаны показывать одно и то же значение на 10 лет.
  assert.equal(pickOfz10y(payload).value, 16.44);
  assert.deepEqual(extractCurve({ zcyc: {} }), []);
  assert.throws(() => pickOfz10y({ zcyc: {} }), /В кривой доходности нет периодов/);
});

test('RUONIA: форма ответа ЦБ (ro/D0/ruo/vol), мусор отбрасывается', () => {
  // Ответ снят с живого вызова RuoniaXML 29.10.2026; значения сверены
  // с публичной таблицей ЦБ: 28.10 — 14,09 % и 992,86 млрд руб.
  const xml =
    '<RuoniaXMLResult><Ruonia>' +
    '<ro><D0>2026-10-28T00:00:00+03:00</D0><ruo>14.0900</ruo><vol>992.8600</vol>' +
    '<DateUpdate>2026-10-29T14:19:26.19+03:00</DateUpdate></ro>' +
    '<ro><D0>2026-10-27T00:00:00+03:00</D0><ruo>14.0400</ruo><vol>736.0900</vol>' +
    '<DateUpdate>2026-10-28T14:24:58.8+03:00</DateUpdate></ro>' +
    '<ro><D0>2026-10-26T00:00:00+03:00</D0><ruo></ruo><vol>810.27</vol></ro>' +
    '</Ruonia></RuoniaXMLResult>';

  const records = parseRuoniaXml(xml);
  assert.deepEqual(
    records.map((record) => record.date),
    ['2026-10-27', '2026-10-28'],
  );
  assert.equal(records.at(-1).rate, 14.09);
  assert.equal(records.at(-1).volume, 992.86);
  assert.deepEqual(parseRuoniaXml('<Ruonia></Ruonia>'), []);
});
