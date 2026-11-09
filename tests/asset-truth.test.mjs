import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkChangeAgainstSeries,
  checkNameMatchesInstrument,
  formatLikePrice,
  parsePriceNumber,
  priceDigits,
} from '../supabase/functions/_shared/asset-truth.ts';

/**
 * Фикстуры — настоящие строки `cached_assets` с прода 01.11.2026:
 *
 *   brent    price "$113.43"   change −1.2622   последние точки 114.88 / 113.43
 *   sp500    price "7,580"     change −1.8175   последние точки 7720.39 / 7580.07
 *   usd-eur  price "0.8951"    change −0.3759
 *   gold     price "$3,875.4"  change −0.0011   цена из кавычки Twelve Data
 *   btc      price "$77,753"   change +0.4082   цена из кавычки Kraken
 *
 * И одно сломанное состояние, которое реально стояло на сайте в 07:20:
 * у brent, sp500 и usd-eur `change` был ровно 0.
 */

const brent = {
  id: 'brent',
  name: 'Brent (фьючерс)',
  price: '$113.43',
  change: -1.2622,
  sparkline: [113.87999725341797, 115.31999969482422, 114.87999725341797, 113.43000030517578],
};

const sp500 = {
  id: 'sp500',
  name: 'S&P 500',
  price: '7,580',
  change: -1.8175,
  sparkline: [7676.77001953125, 7722.60009765625, 7743.97998046875, 7720.39013671875, 7580.06982421875],
};

test('изменение сходится с опубликованным рядом', () => {
  const brentVerdict = checkChangeAgainstSeries(brent);
  assert.equal(brentVerdict.checked, true);
  assert.equal(brentVerdict.ok, true);
  assert.equal(brentVerdict.expected.toFixed(4), '-1.2622');

  const spVerdict = checkChangeAgainstSeries(sp500);
  assert.equal(spVerdict.ok, true);
  assert.equal(spVerdict.expected.toFixed(4), '-1.8175');
});

test('сломанное состояние с прода ловится: 0 % при движении ряда', () => {
  // Ровно то, что стояло на сайте после PR #78: изменение считалось от самой
  // себя. Проверка обязана покраснеть, иначе она бесполезна.
  const broken = checkChangeAgainstSeries({ ...brent, change: 0 });
  assert.equal(broken.checked, true);
  assert.equal(broken.ok, false);
  assert.equal(broken.stored, 0);
  assert.equal(broken.expected.toFixed(2), '-1.26');

  const brokenSp = checkChangeAgainstSeries({ ...sp500, change: 0 });
  assert.equal(brokenSp.ok, false);
});

test('цена, не совпадающая с последней точкой ряда, — расхождение', () => {
  const drift = checkChangeAgainstSeries({ ...brent, price: '$115.32' });
  assert.equal(drift.ok, false);
  assert.deepEqual(drift.priceMismatch, { printed: '$115.32', fromSeries: '113.43' });
});

test('ряды с ценой из кавычки не сверяются и не выдумывают расхождение', () => {
  const gold = checkChangeAgainstSeries({
    id: 'gold',
    price: '$3,875.4',
    change: -0.0011,
    sparkline: [3883.58851, 3875.43884],
  });
  assert.equal(gold.checked, false);
  assert.equal(gold.ok, true);
  assert.match(gold.reason, /кавычк/);

  const btc = checkChangeAgainstSeries({
    id: 'btc',
    price: '$77,753',
    change: 0.4082,
    sparkline: [77400, 77719],
  });
  assert.equal(btc.checked, false);
});

test('без изменения в строке проверка краснеет, а не молчит', () => {
  const verdict = checkChangeAgainstSeries({ ...brent, change: null });
  assert.equal(verdict.checked, true);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'изменение не сохранено');
});

test('цена разбирается и печатается так же, как её собирает писатель', () => {
  assert.equal(parsePriceNumber('$113.43'), 113.43);
  assert.equal(parsePriceNumber('7,580'), 7580);
  assert.equal(parsePriceNumber('0.8951'), 0.8951);
  assert.equal(parsePriceNumber('$3,875.4'), 3875.4);
  assert.equal(parsePriceNumber('—'), null);
  assert.equal(parsePriceNumber(null), null);

  assert.equal(priceDigits('$113.43'), 2);
  assert.equal(priceDigits('7,580'), 0);
  assert.equal(priceDigits('0.8951'), 4);
  assert.equal(formatLikePrice(113.43000030517578, '$113.43'), '113.43');
  assert.equal(formatLikePrice(7580.06982421875, '7,580'), '7,580');
  assert.equal(formatLikePrice(0.89509488, '0.8951'), '0.8951');
});

test('подпись обязана называть фьючерс фьючерсом', () => {
  assert.equal(checkNameMatchesInstrument('Brent (фьючерс)', 'commodity_future').ok, true);
  // Состояние до правки: в реестре фьючерс, в кэше просто «Brent».
  assert.equal(checkNameMatchesInstrument('Brent', 'commodity_future').ok, false);
  assert.equal(checkNameMatchesInstrument('Brent', 'commodity_spot').ok, true);
  assert.equal(checkNameMatchesInstrument('Brent (фьючерс)', 'commodity_spot').ok, false);
  // Индекс и валюта ничего не обещают про фьючерс — к ним претензий нет.
  assert.equal(checkNameMatchesInstrument('S&P 500', 'cash_index').ok, true);
  assert.equal(checkNameMatchesInstrument('', 'cash_index').ok, false);
});

// --- База изменения: два закрытия или кавычка поверх последнего закрытия ----

const brentQuoteNewer = {
  id: 'brent',
  name: 'Brent (фьючерс)',
  // Настоящая строка cached_assets с прода 03.11.2026 07:40 UTC.
  price: '$106.61',
  change: 1.7562,
  sparkline: [113.87999725341797, 115.31999969482422, 114.87999725341797, 117.63999938964844, 104.76999664306641],
  spark_dates: ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02'],
  as_of: '2026-11-03 07:30:01+00',
};

test('кавычка свежее последнего закрытия: изменение считается от закрытия к цене', () => {
  // 03.11.2026 эта же строка стояла красной в отчёте самопроверки:
  // «цена $106.45 не равна последней точке ряда 104.77; изменение 1.60 против
  // −10.94 по ряду». Оба упрёка были неверны: ряд закрытий за 03.11 ещё не
  // сформирован, а 104.77 — база изменения, а не его вторая точка.
  const verdict = checkChangeAgainstSeries(brentQuoteNewer);
  assert.equal(verdict.checked, true);
  assert.equal(verdict.basis, 'quote');
  assert.equal(verdict.ok, true);
  assert.equal(verdict.expected?.toFixed(4), '1.7562');
  assert.equal(verdict.priceMismatch, null);
});

test('кавычка свежее последнего закрытия: неверное изменение по-прежнему краснеет', () => {
  // Ослаблять проверку нельзя: 0 % вместо +1,76 % — тот же дефект, что и 01.11.
  const broken = checkChangeAgainstSeries({ ...brentQuoteNewer, change: 0 });
  assert.equal(broken.basis, 'quote');
  assert.equal(broken.ok, false);
  assert.equal(broken.expected?.toFixed(2), '1.76');
});

test('цена равна последнему закрытию: сверка идёт по двум точкам ряда, как раньше', () => {
  // as_of совпадает с датой последней точки — значит цена и есть закрытие.
  const sameDay = checkChangeAgainstSeries({
    ...brentQuoteNewer,
    price: '$104.77',
    change: -10.9402,
    as_of: '2026-11-02 21:00:00+00',
  });
  assert.equal(sameDay.basis, 'series');
  assert.equal(sameDay.ok, true);
  assert.equal(sameDay.expected?.toFixed(4), '-10.9402');
});

test('отметка времени отстала от цены: проверка не выдумывает расхождение', () => {
  // 08–09.11.2026 восемь часов подряд проверка краснела на верной плитке:
  // ряд заканчивался пятницей (06.11, закрытие 98.32), цена была живой
  // кавычкой понедельника ($96.60), но as_of в тот момент стоял тоже 06.11 —
  // писатель обновил цену раньше, чем отметку времени. Дата совпала, поэтому
  // прежнее правило «кавычка новее, если её дата больше» не срабатывало, и
  // изменение −1.75 сверялось с 0.03 по двум закрытиям.
  const staleStamp = checkChangeAgainstSeries({
    id: 'brent',
    name: 'Brent (фьючерс)',
    price: '$96.60',
    change: -1.7494,
    sparkline: [95.1, 96.4, 98.29, 98.3199996948],
    spark_dates: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
    as_of: '2026-11-06 00:00:00+00',
  });
  assert.equal(staleStamp.basis, 'quote');
  assert.equal(staleStamp.ok, true);
  assert.equal(staleStamp.expected?.toFixed(2), '-1.75');
  assert.equal(staleStamp.priceMismatch, null);
});

test('цена не идёт от последней точки назад: кавычка числится новее только по дате или по цене', () => {
  // Та же строка, но изменение подменено нулём — проверка обязана краснеть.
  const broken = checkChangeAgainstSeries({
    id: 'brent',
    price: '$96.60',
    change: 0,
    sparkline: [95.1, 96.4, 98.29, 98.3199996948],
    spark_dates: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
    as_of: '2026-11-06 00:00:00+00',
  });
  assert.equal(broken.basis, 'quote');
  assert.equal(broken.ok, false);
});

test('отметка времени старше ряда: расхождение цены остаётся расхождением', () => {
  // Защита от соблазна считать любую непохожую цену «свежей кавычкой»:
  // если as_of раньше последней точки, базы для кавычки нет.
  const older = checkChangeAgainstSeries({
    id: 'brent',
    price: '$96.60',
    change: -1.7494,
    sparkline: [95.1, 96.4, 98.29, 98.3199996948],
    spark_dates: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
    as_of: '2026-11-02 12:00:00+00',
  });
  assert.equal(older.basis, 'series');
  assert.equal(older.ok, false);
});

test('без дат в ряду проверка остаётся по двум последним точкам', () => {
  // Старые строки кэша приходят без spark_dates/as_of: поведение не меняется.
  const legacy = checkChangeAgainstSeries({
    ...brentQuoteNewer,
    price: '$104.77',
    spark_dates: undefined,
    as_of: undefined,
    change: -10.9402,
  });
  assert.equal(legacy.basis, 'series');
  assert.equal(legacy.ok, true);
});
