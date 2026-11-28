import assert from 'node:assert/strict';
import test from 'node:test';

import { isFormingBar, parseYahooDaily } from '../supabase/functions/_shared/yahoo-chart.ts';

/**
 * Фикстуры — настоящие ответы Yahoo `v8/finance/chart`, снятые 01.11.2026,
 * около 07:25 UTC (запрос из той же сети, что и edge-функция):
 *
 *   ^GSPC: 26.10 7722.60 · 27.10 7743.98 · 28.10 7720.39 · 29.10 7580.07,
 *          барами 13:30 UTC, regularMarketTime = 2026-10-30T20:47:43Z,
 *          конец регулярной сессии 2026-10-30T20:00:00Z;
 *   BZ=F:  23.10 116.72 · 26.10 115.81 · 27.10 113.88 · 28.10 115.32 ·
 *          29.10 114.88 · 30.10 113.43, барами 04:00 UTC,
 *          regularMarketTime = 2026-10-30T20:59:57Z,
 *          конец сессии 2026-11-02T04:59:00Z.
 *
 * Значение 7743.98 у ^GSPC совпадает с тем, что FRED отдавал сайту как SP500
 * за 28.10 — то есть индекс тот же, сменился только поставщик.
 */

function chartPayload({ timestamps, closes, open, high, low, meta }) {
  return {
    chart: {
      result: [
        {
          meta,
          timestamp: timestamps,
          indicators: { quote: [{ close: closes, open, high, low }] },
        },
      ],
      error: null,
    },
  };
}

const gspcMeta = {
  currency: 'USD',
  symbol: '^GSPC',
  exchangeName: 'SNP',
  fullExchangeName: 'SNP',
  instrumentType: 'INDEX',
  regularMarketTime: 1793393263,
  currentTradingPeriod: { regular: { start: 1793367000, end: 1793390400 } },
};

const gspc = chartPayload({
  timestamps: [1793021400, 1793107800, 1793194200, 1793280600, 1793367000],
  closes: [7722.8798828125, 7722.60009765625, 7743.97998046875, 7720.39013671875, 7580.06982421875],
  meta: gspcMeta,
});

const brentMeta = {
  currency: 'USD',
  symbol: 'BZ=F',
  exchangeName: 'NYM',
  fullExchangeName: 'NY Mercantile',
  instrumentType: 'FUTURE',
  regularMarketTime: 1793393997,
  currentTradingPeriod: { regular: { start: 1793332800, end: 1793595540 } },
};

const brent = chartPayload({
  timestamps: [1792728000, 1792987200, 1793073600, 1793160000, 1793246400, 1793332800],
  closes: [
    116.72000122070312,
    115.80999755859375,
    113.87999725341797,
    115.31999969482422,
    114.87999725341797,
    113.43000030517578,
  ],
  meta: brentMeta,
});

test('дневные закрытия ^GSPC разбираются вместе с датами', () => {
  const series = parseYahooDaily(gspc);
  assert.deepEqual(series.points.map((point) => point.date), [
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
  ]);
  // 28.10 — то же закрытие, что сайт получал от FRED (7743.98).
  assert.equal(series.points[2].value, 7743.97998046875);
  assert.equal(series.quoteTime, '2026-10-30T20:47:43.000Z');
  assert.equal(series.sessionEnd, '2026-10-30T20:00:00.000Z');
  assert.equal(series.instrumentType, 'INDEX');
  assert.equal(series.symbol, '^GSPC');
});

test('дневные закрытия фьючерса Brent разбираются вместе с датами', () => {
  const series = parseYahooDaily(brent);
  assert.equal(series.points.length, 6);
  assert.equal(series.points.at(-1).date, '2026-10-30');
  assert.equal(series.points.at(-1).value, 113.43000030517578);
  assert.equal(series.points.at(-2).value, 114.87999725341797);
  assert.equal(series.instrumentType, 'FUTURE');
  assert.equal(series.exchange, 'NY Mercantile');
});

test('parser retains daily OHLC and available futures quote metadata for revision audit', () => {
  const series = parseYahooDaily(chartPayload({
    timestamps: [1795582800, 1795789800],
    closes: [94.6100006104, 95.4400024414],
    open: [90.9199981689, 94.5],
    high: [94.7699966431, 98],
    low: [89.5, 93.5400009155],
    meta: { ...brentMeta, exchangeName: 'NYM', regularMarketPrice: 90.84,
      contractSymbol: 'BZK27.NYM', expireDate: 1800000000 },
  }));
  assert.deepEqual(series.points.at(-1), {
    date: '2026-11-27', value: 95.4400024414, open: 94.5, high: 98, low: 93.5400009155,
  });
  assert.equal(series.exchangeName, 'NYM');
  assert.equal(series.regularMarketPrice, 90.84);
  assert.equal(series.contractSymbol, 'BZK27.NYM');
  assert.equal(series.expireDate, 1800000000);
});

test('бар сегодняшнего дня у индекса закрыт после конца сессии', () => {
  // 30.10, 19:00 UTC — сессия ещё идёт: закрытие дня не сформировано.
  assert.equal(isFormingBar(parseYahooDaily(gspc), new Date('2026-10-30T19:00:00Z')), true);
  // 30.10, 21:00 UTC — сессия закрылась в 20:00, бар стал дневным закрытием.
  assert.equal(isFormingBar(parseYahooDaily(gspc), new Date('2026-10-30T21:00:00Z')), false);
  // 01.11 — воскресенье: последний бар от 30.10, он закрыт.
  assert.equal(isFormingBar(parseYahooDaily(gspc), new Date('2026-11-01T07:25:00Z')), false);
});

test('у фьючерса бар текущих суток формируется почти круглые сутки', () => {
  // Brent торгуется почти без пауз: сессия 30.10 закончится только 02.11 04:59.
  assert.equal(isFormingBar(parseYahooDaily(brent), new Date('2026-10-30T18:00:00Z')), true);
  // В следующие сутки бар от 30.10 — уже прошлый день, а не «сегодня».
  assert.equal(isFormingBar(parseYahooDaily(brent), new Date('2026-10-31T10:00:00Z')), false);
});

test('пропуск в данных не превращается в нулевую цену', () => {
  // Пропуск (close: null) — так Yahoo отдаёт день без сделок. Вставлен в
  // настоящий ряд ^GSPC на место 27.10, чтобы проверить именно поведение кода.
  const withGap = chartPayload({
    timestamps: [1793021400, 1793107800, 1793194200, 1793280600, 1793367000],
    closes: [7722.8798828125, null, 7743.97998046875, 7720.39013671875, 7580.06982421875],
    meta: gspcMeta,
  });
  const series = parseYahooDaily(withGap);
  assert.deepEqual(series.points.map((point) => point.date), ['2026-10-26', '2026-10-28', '2026-10-29', '2026-10-30']);
  assert.ok(series.points.every((point) => point.value > 0));
});

test('ошибка источника не выдаётся за котировку', () => {
  assert.throws(
    () => parseYahooDaily({ chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } }),
    /No data found/,
  );
  assert.throws(() => parseYahooDaily({ chart: { result: [], error: null } }), /empty result/);
  assert.throws(() => parseYahooDaily('null'), /not an object/);
  // Одна точка — не ряд: по ней нельзя ни посчитать изменение, ни подписать график.
  assert.throws(
    () => parseYahooDaily(chartPayload({ timestamps: [1793367000], closes: [7580.06982421875], meta: gspcMeta })),
    /only 1 daily closes/,
  );
});
