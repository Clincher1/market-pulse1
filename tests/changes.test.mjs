import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChangeNotes,
  formatSeriesChange,
  formatSeriesValue,
  trailingRun,
  windowRangePct,
} from '../src/lib/changes.ts';

/**
 * Фикстуры повторяют форму реальных рядов: даты — торговые дни, значения —
 * те же порядки, что приходят из Мосбиржи и ЦБ. Никаких «примерно 100».
 */

/** В подписях сайта перед «%» стоит неразрывный пробел — в сравнениях его снимаем. */
function plain(text) {
  return String(text ?? '').replace(/\u00A0/g, ' ');
}

function series(overrides = {}) {
  return {
    id: 'usd-rub',
    name: 'USD/RUB',
    unit: '₽',
    provider: 'Банк России',
    dateKind: 'day',
    digits: 4,
    ...overrides,
  };
}

function points(values, startDay = 20) {
  return values.map((value, index) => ({
    date: `2026-10-${String(startDay + index).padStart(2, '0')}`,
    value,
  }));
}

test('три дня роста дают «растёт 3-й день подряд» с числами и датами', () => {
  const notes = buildChangeNotes([series({ points: points([80.1, 80.2, 80.35, 80.55], 27) })]);
  assert.equal(notes.length, 1);
  const note = notes[0];
  assert.equal(note.kind, 'streak');
  assert.equal(note.direction, 'up');
  assert.equal(note.days, 3);
  assert.equal(note.headline, 'растёт 3-й день подряд');
  assert.equal(plain(note.detail), '80,10 (27.10) → 80,55 (30.10) · +0,56 % за 3 дня');
  assert.equal(note.lastDate, '2026-10-30');
  // Перед «%» — неразрывный пробел, как на плитках.
  assert.match(note.detail, /\u00A0% за 3 дня$/);
});

test('рост на 1-2 дня не называется серией — это обычный шум', () => {
  assert.deepEqual(buildChangeNotes([series({ points: points([80.0, 80.1, 80.2]) })]), []);
});

test('нулевое изменение обрывает серию: «не изменился» — не «вырос»', () => {
  const run = trailingRun([79.8, 80.0, 80.0, 80.2]);
  assert.deepEqual(run, { direction: 1, days: 1 });
  assert.deepEqual(buildChangeNotes([series({ points: points([79.8, 80.0, 80.0, 80.2]) })]), []);
});

test('четыре дня снижения: верное окончание и верное направление', () => {
  const notes = buildChangeNotes([
    series({ id: 'imoex', name: 'IMOEX', unit: 'пункта', digits: 2, points: points([2540, 2530, 2519, 2512, 2509.26]) }),
  ]);
  assert.equal(notes[0]?.kind, 'streak');
  assert.equal(notes[0]?.headline, 'снижается 4-й день подряд');
  assert.match(notes[0]?.detail ?? '', /за 4 дня$/);
});

test('пять дней снижения — «за 5 дней», не «за 5 день»', () => {
  const notes = buildChangeNotes([
    series({ id: 'rgbi', name: 'RGBI', unit: 'пункта', digits: 2, points: points([113.4, 113.1, 112.9, 112.7, 112.6, 112.48]) }),
  ]);
  assert.equal(notes[0]?.headline, 'снижается 5-й день подряд');
  assert.match(notes[0]?.detail ?? '', /за 5 дней$/);
});

test('разворот после трёх дней снижения — отдельное наблюдение, а не «рост»', () => {
  const notes = buildChangeNotes([
    series({ id: 'imoex', name: 'IMOEX', unit: 'пункта', digits: 2, points: points([2540, 2530, 2520, 2510, 2512]) }),
  ]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.kind, 'reversal');
  assert.equal(notes[0]?.headline, 'развернулся вверх после 3 дней снижения');
  assert.match(notes[0]?.headline ?? '', /после 3 дней/);
});

test('новый максимум окна считается по предыдущим значениям, а не по самому себе', () => {
  const values = Array.from({ length: 25 }, (_, index) => 2400 + index * 4);
  values.push(2509.26);
  const notes = buildChangeNotes([
    series({ id: 'imoex', name: 'IMOEX', unit: 'пункта', digits: 2, points: points(values, 1) }),
  ]);
  // Серия и рекорд склеены в одну строку: рекорд не теряется.
  assert.equal(notes[0]?.kind, 'streak');
  assert.match(plain(notes[0]?.headline), /— максимум с 01\.10$/);
  // Последнее значение действительно выше всех предыдущих.
  assert.ok(2509.26 > Math.max(...values.slice(0, -1)));
});

test('ряд без дат не считает дни, но видит максимум и честно называет окно значениями', () => {
  const values = Array.from({ length: 30 }, (_, index) => 7600 + index * 4);
  values.push(7743.98);
  const notes = buildChangeNotes([
    series({
      id: 'sp500',
      name: 'S&P 500',
      unit: 'пункта',
      provider: 'FRED',
      dateKind: 'sample',
      digits: 2,
      points: values.map((value) => ({ date: '', value })),
    }),
  ]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.kind, 'record');
  assert.equal(notes[0]?.headline, 'максимум за 31 значение');
  assert.match(notes[0]?.detail ?? '', /окно 31 значение/);
});

test('узкий диапазон считается в процентах от среднего окна', () => {
  const pct = windowRangePct([100, 100.1, 100.2, 100.05, 100.15]);
  assert.ok(pct !== null && pct > 0.15 && pct < 0.25);

  const notes = buildChangeNotes([
    series({ id: 'usd-eur', name: 'USD/EUR', unit: 'ratio', digits: 4, points: points([0.8951, 0.8953, 0.8952, 0.8954, 0.8953]) }),
  ]);
  assert.equal(notes[0]?.kind, 'range');
  assert.equal(notes[0]?.direction, 'flat');
  assert.match(plain(notes[0]?.headline), /^узкий диапазон: 0,\d\d %$/);
});

test('короткий ряд ничего не выдумывает', () => {
  assert.deepEqual(buildChangeNotes([series({ points: points([80.1]) })]), []);
  assert.deepEqual(buildChangeNotes([]), []);
});

test('сортировка и лимит: длинная серия выше диапазона', () => {
  const quiet = series({
    id: 'usd-eur',
    name: 'USD/EUR',
    digits: 4,
    points: points([0.8951, 0.8953, 0.8952, 0.8954, 0.8953]),
  });
  const loud = series({
    id: 'btc',
    name: 'BTC',
    digits: 2,
    points: points([77000, 77200, 77400, 77500, 77600, 77700]),
  });
  const notes = buildChangeNotes([quiet, loud]);
  assert.equal(notes[0]?.id, 'btc:streak');
  assert.equal(buildChangeNotes([quiet, loud], 1).length, 1);
});

test('формат чисел и процентов совпадает с сайтом', () => {
  assert.equal(plain(formatSeriesValue(2509.26, 2)), '2 509,26');
  assert.equal(plain(formatSeriesValue(80.5573, 4)), '80,5573');
  assert.equal(plain(formatSeriesValue(80.1, 4)), '80,10');
  assert.equal(plain(formatSeriesValue(729.6, 1)), '729,6');
  assert.equal(plain(formatSeriesChange(10534, 10149.5)), '−3,65 %');
  assert.equal(plain(formatSeriesChange(80.1, 80.55)), '+0,56 %');
  assert.equal(plain(formatSeriesChange(80.5, 80.5)), '0,00 %');
});
