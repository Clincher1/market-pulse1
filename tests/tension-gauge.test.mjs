import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAUGE_TICKS,
  clampTension,
  gaugeAriaLabel,
  gaugeTicks,
  tensionState,
} from '../src/lib/tensionGauge.ts';

const filled = (value) => gaugeTicks(value).filter(Boolean).length;

test('шкала не растягивается: значения вне 0–100 обрезаются краями', () => {
  assert.equal(clampTension(-40), 0);
  assert.equal(clampTension(0), 0);
  assert.equal(clampTension(100), 100);
  assert.equal(clampTension(250), 100);
  assert.equal(clampTension(21.4), 21.4);
});

test('нет значения — пустая шкала, а не середина', () => {
  assert.equal(filled(null), 0);
  assert.equal(filled(undefined), 0);
  assert.equal(filled(Number.NaN), 0);
  assert.equal(clampTension(null), 0);
});

test('границы шкалы: 0 — ни одного деления, 100 — все сорок', () => {
  assert.equal(GAUGE_TICKS, 40);
  assert.equal(filled(0), 0);
  assert.equal(filled(100), 40);
});

test('уровень 21 из 100 — 8 делений из 40 (шаг 2,5 пункта)', () => {
  assert.equal(filled(21), 8);
  assert.equal(filled(20), 8);
  assert.equal(filled(70), 28);
});

test('малое ненулевое значение горит первым делением, а не пустотой', () => {
  // 1 пункт меньше половины деления (1,25), но это не «ноль».
  assert.equal(filled(1), 1);
  assert.equal(filled(0.4), 1);
  assert.equal(filled(0), 0);
});

test('длина шкалы всегда ровно сорок делений', () => {
  for (const value of [null, 0, 1, 33, 99, 100, Number.NaN]) {
    assert.equal(gaugeTicks(value).length, 40);
  }
});

test('пороги состояний совпадают с подписью шкалы', () => {
  assert.equal(tensionState(0), 'calm');
  assert.equal(tensionState(29.9), 'calm');
  assert.equal(tensionState(30), 'watch');
  assert.equal(tensionState(69.9), 'watch');
  assert.equal(tensionState(70), 'hot');
  assert.equal(tensionState(100), 'hot');
  // Нет значения — тоже «спокойно»: пустую шкалу нельзя красить тревогой.
  assert.equal(tensionState(null), 'calm');
});

test('подпись шкалы называет число словами и не врёт про отсутствие данных', () => {
  assert.equal(gaugeAriaLabel(21), 'Положение на шкале 0–100: 21 из 100');
  assert.match(gaugeAriaLabel(null), /не сохранён/);
  assert.match(gaugeAriaLabel(Number.NaN), /не сохранён/);
});
