import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChangeNotes,
  buildWeekComparisons,
  datedPoints,
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

test('неделя к неделе сравнивает два окна одинаковой длины', () => {
  // 15 значений: первые 7 — спокойный рост, последние 7 — резкий.
  const values = [100, 100.2, 100.4, 100.3, 100.5, 100.6, 100.7, 101, 101.6, 102.2, 102.9, 103.5, 104.1, 104.8, 105.4];
  const [row] = buildWeekComparisons([
    series({ id: 'imoex', name: 'IMOEX', unit: 'пункта', digits: 2, points: points(values, 1) }),
  ]);
  assert.ok(row, 'сравнение должно построиться');
  assert.equal(row.days, 7);
  // предыдущее окно: 100 → 101 = +1,00 %
  assert.equal(plain(row.previousLabel), '+1,00 %');
  // последнее окно: 101 → 105,4 = +4,36 %
  assert.equal(plain(row.recentLabel), '+4,36 %');
  // 4,36 − 1,00 = 3,36 п.п. разницы между окнами
  assert.ok(Math.abs(row.deltaPct - 3.362) < 0.02);
  assert.equal(row.windowLabel, '7 торговых дней');
});

test('неделя к неделе молчит, когда истории мало', () => {
  const short = points([100, 101, 102, 103, 104, 105, 106, 107], 1);
  assert.deepEqual(buildWeekComparisons([series({ points: short })]), []);
});

test('неделя к неделе сортирует по размеру изменения окон', () => {
  const strong = points(
    [100, 100.1, 100.2, 100.1, 100.3, 100.2, 100.4, 102, 103.5, 105, 106.5, 108, 109.5, 111, 112.5],
    1,
  );
  const calm = points(
    [100, 100.1, 100.05, 100.2, 100.1, 100.3, 100.2, 100.4, 100.35, 100.5, 100.45, 100.6, 100.55, 100.7, 100.65],
    1,
  );
  const rows = buildWeekComparisons([
    series({ id: 'calm', name: 'Calm', digits: 2, points: calm }),
    series({ id: 'strong', name: 'Strong', digits: 2, points: strong }),
  ]);
  assert.equal(rows[0]?.id, 'strong');
});

test('для ставок изменение считается в п.п., а не процентом от процента', () => {
  // RUONIA: 14,04 → 14,09 — это +0,05 п.п., а не «+0,36 %».
  const rate = series({
    id: 'ruonia',
    name: 'RUONIA',
    unit: '%',
    digits: 2,
    points: points([14.04, 14.05, 14.06, 14.07, 14.09]),
  });
  const notes = buildChangeNotes([rate]);
  assert.equal(notes[0]?.kind, 'streak');
  assert.equal(plain(notes[0]?.headline), 'растёт 4-й день подряд');
  assert.match(plain(notes[0]?.detail), /\+0,05 п\.п\. за 4 дня$/);
});

test('узкий диапазон ставки подписан в п.п., а не в процентах', () => {
  const rate = series({
    id: 'ruonia',
    name: 'RUONIA',
    unit: '%',
    digits: 2,
    points: points([14.04, 14.05, 14.06, 14.07, 14.09]),
  });
  // Серия длиной 5 не даёт диапазон: он требует ровно 5 значений, но серия
  // одновременно даёт «растёт», поэтому проверяем отдельным рядом без серии.
  const flat = series({
    id: 'ruonia-flat',
    name: 'RUONIA',
    unit: '%',
    digits: 2,
    points: points([14.04, 14.06, 14.05, 14.07, 14.05]),
  });
  const [note] = buildChangeNotes([flat]).filter((item) => item.kind === 'range');
  assert.ok(note, 'диапазон должен быть найден');
  assert.match(plain(note.headline), /^узкий диапазон: 0,03 п\.п\.$/);
  void rate;
});

test('неделя к неделе для ставки считает разницу в п.п.', () => {
  const values = [14.0, 14.02, 14.04, 14.03, 14.05, 14.06, 14.07, 14.08, 14.1, 14.12, 14.14, 14.16, 14.18, 14.2, 14.22];
  const [row] = buildWeekComparisons([
    series({ id: 'ruonia', name: 'RUONIA', unit: '%', digits: 2, points: points(values, 1) }),
  ]);
  assert.ok(row);
  // Последние 7: 14,08 → 14,22 = +0,14 п.п.; предыдущие 7: 14,00 → 14,08 = +0,08 п.п.
  assert.match(plain(row.recentLabel), /^\+0,14 п\.п\.$/);
  assert.match(plain(row.previousLabel), /^\+0,08 п\.п\.$/);
  assert.ok(Math.abs(row.deltaPct - 0.06) < 1e-9);
});

test('даты из кэша соединяются со значениями, и ряд становится дневным', () => {
  const values = [3875.34, 3901.2, 3944.1, 3990.6];
  const dates = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];
  const dated = datedPoints(values, dates);
  assert.equal(dated.dateKind, 'day');
  assert.deepEqual(dated.points.map((point) => point.date), dates);
  assert.deepEqual(dated.points.map((point) => point.value), values);

  // С датами ряд получает серию дней — то, что бездатый ряд сказать не может.
  const notes = buildChangeNotes([
    {
      id: 'world-gold',
      name: 'Gold',
      unit: '',
      unitLabel: '$ за тройскую унцию',
      provider: 'кэш мировых котировок',
      dateKind: dated.dateKind,
      digits: 2,
      points: dated.points,
    },
  ]);
  assert.equal(notes[0]?.kind, 'streak');
  assert.equal(plain(notes[0]?.headline), 'растёт 3-й день подряд');
  assert.equal(
    plain(notes[0]?.detail),
    '3 875,34 (27.10) → 3 990,60 (30.10) · +2,97 % за 3 дня',
  );
  assert.equal(notes[0]?.unitLabel, '$ за тройскую унцию');
});

test('даты короче значений — ряд бездатый, а не с чужими датами', () => {
  // Три даты на четыре значения: подставить последнюю дату к последнему
  // значению значило бы приписать числу чужой день.
  const dated = datedPoints([3875.34, 3901.2, 3944.1, 3990.6], ['2026-10-27', '2026-10-28', '2026-10-29']);
  assert.equal(dated.dateKind, 'sample');
  assert.deepEqual(dated.points.map((point) => point.date), ['', '', '', '']);
});

test('неразбираемая или непорядковая дата обнуляет даты всего ряда', () => {
  const broken = datedPoints([100, 101, 102], ['2026-10-27', '', '2026-10-29']);
  assert.equal(broken.dateKind, 'sample');
  const shuffled = datedPoints([100, 101, 102], ['2026-10-29', '2026-10-27', '2026-10-30']);
  assert.equal(shuffled.dateKind, 'sample');
  const duplicate = datedPoints([100, 101, 102], ['2026-10-29', '2026-10-29', '2026-10-30']);
  assert.equal(duplicate.dateKind, 'sample');
});

test('без сохранённых дат ряд остаётся бездатым, значения не теряются', () => {
  const dated = datedPoints([3875.34, 3901.2], null);
  assert.equal(dated.dateKind, 'sample');
  assert.deepEqual(dated.points, [
    { date: '', value: 3875.34 },
    { date: '', value: 3901.2 },
  ]);
});
