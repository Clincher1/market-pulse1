import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatCapPercent, formatPercent, formatSharePercent } from '../src/lib/percent.ts';

/**
 * Один формат процента на весь сайт. Проверка нужна потому, что раньше формат
 * зависел от компонента: «−0,23 %» в российском блоке и «-3.92%» в мировой
 * плитке — это одно и то же движение Brent, напечатанное по-разному.
 *
 * \u00A0 (неразрывный пробел) стоит здесь намеренно: обычный пробел позволяет
 * браузеру перенести строку между числом и знаком «%».
 */
const NBSP = '\u00A0';

test('запятая, типографский минус и неразрывный пробел перед %', () => {
  assert.equal(formatPercent(-3.92), `\u22123,92${NBSP}%`);
  assert.equal(formatPercent(0.286), `+0,29${NBSP}%`);
  // 0,285 в двоичной записи чуть меньше 0,285, и toFixed(2) честно даёт 0,28.
  // Проверка фиксирует это, чтобы никто не «поправил» округление вручную:
  // из уже округлённой строки второе округление только врёт.
  assert.equal(formatPercent(0.285), `+0,28${NBSP}%`);
  assert.equal(formatPercent(0), `0,00${NBSP}%`);
});

test('нет числа — прочерк, а не ноль', () => {
  assert.equal(formatPercent(null), '—');
  assert.equal(formatPercent(undefined), '—');
  assert.equal(formatPercent(Number.NaN), '—');
});

test('точность задаётся на месте: у одних рядов два знака, у других — четыре', () => {
  assert.equal(formatPercent(-0.2345, 4), `\u22120,2345${NBSP}%`);
  assert.equal(formatPercent(12.5, 0), `+13${NBSP}%`);
});

test('шкала насыщенности плитки: без знака ± внутри (он в разметке) и без лишнего нуля', () => {
  assert.equal(formatCapPercent(4), `4${NBSP}%`);
  assert.equal(formatCapPercent(2.5), `2,5${NBSP}%`);
});

test('доля — без знака плюс', () => {
  assert.equal(formatSharePercent(0.734), `73${NBSP}%`);
  assert.equal(formatSharePercent(1), `100${NBSP}%`);
});
