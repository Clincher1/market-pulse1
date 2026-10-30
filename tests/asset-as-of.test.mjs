import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moscowClock, observationLabel } from '../src/lib/asOf.ts';

/**
 * Подпись к цене — единственное место, где сайт говорит, НА КАКОЙ МОМЕНТ
 * верно число на плитке. Ошибка здесь превращает закрытие вчерашнего дня в
 * «котировку в 08:45», то есть приписывает числу точность, которой у него нет.
 *
 * Ключевой случай — полночь в UTC: Postgres хранит дату «2026-10-29» в
 * timestamptz как 2026-10-29T00:00:00+00. Если считать это моментом котировки,
 * на экране появится «на 03:00 МСК» вместо «за 29 окт.».
 */

test('дата без времени показывается как дата наблюдения', () => {
  assert.equal(observationLabel('2026-10-29'), 'за 29 окт.');
});

test('полночь UTC — это дата, а не время', () => {
  assert.equal(observationLabel('2026-10-29T00:00:00+00'), 'за 29 окт.');
  assert.equal(observationLabel('2026-10-29T00:00:00+00:00'), 'за 29 окт.');
  assert.equal(observationLabel('2026-10-29T00:00:00Z'), 'за 29 окт.');
  assert.equal(observationLabel('2026-10-29T00:00:00.000Z'), 'за 29 окт.');
});

test('настоящий момент котировки показывается по Москве', () => {
  assert.equal(observationLabel('2026-10-30T05:45:00Z'), 'на 08:45 МСК');
  // Полночь — не единственное время суток, которое можно спутать с датой:
  // 00:00:01 уже момент котировки.
  assert.equal(observationLabel('2026-10-30T00:00:01Z'), 'на 03:00 МСК');
});

test('без даты подпись пустая, а не «сегодня»', () => {
  assert.equal(observationLabel(null), '');
  assert.equal(observationLabel(undefined), '');
  assert.equal(observationLabel(''), '');
  assert.equal(observationLabel('   '), '');
  assert.equal(observationLabel('мусор'), '');
});

test('время источника по Москве переводится, а не подставляется как есть', () => {
  assert.equal(moscowClock('2026-10-30T05:45:00Z'), '08:45');
  assert.equal(moscowClock('2026-10-30T00:00:01Z'), '03:00');
  assert.equal(moscowClock(null), '');
  assert.equal(moscowClock('мусор'), '');
});
