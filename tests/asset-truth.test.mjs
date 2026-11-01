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
