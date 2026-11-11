// Склейка «слот → источник» на странице состояния.
//
// Проверяется именно то, что читает человек: какие источники показаны, в каком
// порядке, и что отсутствие записи не превращается в зелёное «всё хорошо».
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupSlotRows,
  pauseLabel,
  slotsWithoutSource,
  usageLabel,
  verdictLabel,
} from '../src/lib/slotsView.ts';

const row = (overrides = {}) => ({
  number: 3,
  slot_id: 'price.btc',
  section: 'Ключевые активы',
  title: 'BTC/USD, спот',
  can_choose: true,
  source_id: 'kraken',
  chosen: true,
  priority: 1,
  why: 'по умолчанию',
  ...overrides,
});

const state = (overrides = {}) => ({
  source_id: 'kraken',
  requests_today: 12,
  last_status: 200,
  last_ok_at: '2026-11-11T19:00:00Z',
  last_attempt_at: '2026-11-11T19:00:00Z',
  consecutive_failures: 0,
  paused_until: null,
  verdict: 'ok',
  ...overrides,
});

test('слоты собираются по номеру, выбранный источник идёт первым', () => {
  const slots = groupSlotRows(
    [
      row({ source_id: 'kraken', chosen: false, priority: null, why: 'выключен вручную' }),
      row({ source_id: 'coinbase', chosen: true, priority: 1, why: 'выбран вручную' }),
      row({ number: 1, slot_id: 'price.brent', title: 'Brent', can_choose: false, source_id: 'yahoo', chosen: true, why: 'по умолчанию' }),
    ],
    [state({ source_id: 'coinbase', requests_today: 3 })],
  );
  assert.deepEqual(slots.map((slot) => slot.number), [1, 3]);
  const btc = slots[1];
  assert.equal(btc.sources[0].id, 'coinbase');
  assert.equal(btc.sources[0].why, 'выбран вручную');
  assert.equal(btc.sources[0].state.requests_today, 3);
  // Источник без строки состояния — не «хорошо», а «нет записи».
  assert.equal(btc.sources[1].state, null);
});

test('расход показывается с бюджетом, а не сам по себе', () => {
  assert.equal(usageLabel(state({ requests_today: 12 }), 300), '12 из 300');
  // Бюджет неизвестен — показываем одно число, а не придуманный потолок.
  assert.equal(usageLabel(state({ requests_today: 12 }), null), '12');
  assert.equal(usageLabel(null, 300), '—');
});

test('пауза называется сроком, истёкшая пауза не показывается', () => {
  const now = new Date('2026-11-11T19:00:00Z');
  assert.equal(pauseLabel(now, state({ paused_until: '2026-11-11T19:20:00Z' })), '20 мин');
  assert.equal(pauseLabel(now, state({ paused_until: '2026-11-11T20:30:00Z' })), '1 ч 30 мин');
  assert.equal(pauseLabel(now, state({ paused_until: '2026-11-11T18:00:00Z' })), null);
  assert.equal(pauseLabel(now, state()), null);
});

test('состояния называются словами, а не цветом', () => {
  assert.equal(verdictLabel('ok'), 'отвечает');
  assert.equal(verdictLabel('paused'), 'на паузе');
  assert.equal(verdictLabel('failing'), 'отказывает');
  assert.equal(verdictLabel('idle'), 'ещё не спрашивали');
  assert.equal(verdictLabel(null), 'нет записи');
});

test('слот без единого выбранного источника назван, а не спрятан', () => {
  const slots = groupSlotRows(
    [
      row({ source_id: 'kraken', chosen: false, why: 'выключен вручную' }),
      row({ source_id: 'coinbase', chosen: false, why: 'выключен вручную' }),
      row({ number: 4, slot_id: 'price.gold', source_id: 'gold-api', chosen: true }),
    ],
    [],
  );
  assert.deepEqual(slotsWithoutSource(slots), [3]);
});
