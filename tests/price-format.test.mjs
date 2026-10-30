import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatPriceText } from '../src/lib/price.ts';

/**
 * Один формат цены на весь сайт.
 *
 * Повод: на одной странице стояли «$123.10» рядом с «12,0565 ₽» и «0.8985»
 * рядом с «80,6761 ₽». Для читателя это два разных числа: точка и запятая
 * означают разное, а «$105,432» по-русски вообще читается как сто пять
 * с дробью. Промах не косметический — это другое число на экране.
 *
 * NBSP — неразрывный пробел: разряды в русской локали не должны разрываться
 * переносом строки.
 */
const NBSP = '\u00A0';

test('точка источника становится запятой, точность сохраняется', () => {
  assert.equal(formatPriceText('$123.10'), '$123,10');
  assert.equal(formatPriceText('$123.1'), '$123,1');
  assert.equal(formatPriceText('0.8985'), '0,8985');
  assert.equal(formatPriceText('12.0844'), '12,0844');
});

test('запятая источника — разделитель тысяч, а не дробь', () => {
  assert.equal(formatPriceText('$105,432'), `$105${NBSP}432`);
  assert.equal(formatPriceText('$1,234.56'), `$1${NBSP}234,56`);
});

test('префикс валюты и единицы сохраняются как есть', () => {
  assert.equal(formatPriceText('₽ 80.6761'), `₽ 80,6761`);
  assert.equal(formatPriceText('$ 0.5'), '$ 0,5');
});

test('неразбираемая строка возвращается без выдумки', () => {
  assert.equal(formatPriceText('—'), '—');
  assert.equal(formatPriceText(''), '');
  assert.equal(formatPriceText(null), '');
  assert.equal(formatPriceText(undefined), '');
  assert.equal(formatPriceText('нет свежей цены'), 'нет свежей цены');
  assert.equal(formatPriceText('$NaN'), '$NaN');
});
