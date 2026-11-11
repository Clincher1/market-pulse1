// Реестр слотов: нумерация, допустимость выбора, действующий порядок.
//
// Тесты держат три вещи, без которых реестр превращается в документ «для
// вида»: номера уникальны и не переиспользуются, выбирать можно только там,
// где выбор настоящий, и выбор владельца не отключает страховку молча.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SLOTS,
  effectiveSources,
  registryVerdict,
  slotById,
  slotByNumber,
  slotsForSource,
  sourcesInUse,
  validateChoice,
} from '../supabase/functions/_shared/slots.ts';

test('номера слотов идут подряд от 1 и не повторяются', () => {
  const numbers = SLOTS.map((slot) => slot.number).sort((a, b) => a - b);
  assert.equal(new Set(numbers).size, numbers.length, 'номера повторяются');
  numbers.forEach((number, index) => assert.equal(number, index + 1, `пропуск: ${number} на месте ${index + 1}`));
});

test('у слота есть раздел, колонки и объяснение — без пустых полей', () => {
  for (const slot of SLOTS) {
    assert.ok(slot.id.trim().length > 2, `слот ${slot.number}: пустой id`);
    assert.ok(slot.title.trim().length > 2, `слот ${slot.number}: пустой заголовок`);
    assert.ok(slot.section.trim().length > 2, `слот ${slot.number}: пустой раздел`);
    assert.ok(slot.columns.length > 0, `слот ${slot.number}: не сказано, какие колонки зависят`);
    assert.ok(slot.note.trim().length > 10, `слот ${slot.number}: не объяснено, почему так`);
    assert.ok(slot.sources.length > 0, `слот ${slot.number}: нет источника`);
  }
});

test('id слотов уникальны и находятся по номеру и по ключу', () => {
  const ids = SLOTS.map((slot) => slot.id);
  assert.equal(new Set(ids).size, ids.length, 'id повторяются');
  for (const slot of SLOTS) {
    assert.equal(slotByNumber(slot.number)?.id, slot.id);
    assert.equal(slotById(slot.id)?.number, slot.number);
  }
});

test('выбор предлагается только там, где источник описан и это настоящая замена', () => {
  const choosable = SLOTS.filter((slot) => slot.canChoose);
  // Не «сколько получилось», а конкретный список: если слот потеряет выбор
  // или получит его без причины, тест скажет об этом.
  assert.deepEqual(
    choosable.map((slot) => slot.number),
    [3, 4, 5, 24],
    'набор слотов с выбором источника изменился',
  );
  for (const slot of choosable) {
    // У лент выбор не в реестре, а построчно в news_sources_v2: там 24 строки
    // со своими enabled и интервалами. Требовать «двух источников в слоте»
    // значило бы продублировать этот выбор в двух местах.
    if (slot.kind === 'feeds') continue;
    assert.ok(slot.sources.length > 1, `слот ${slot.number}: выбор есть, а альтернативы нет`);
  }
  // У слотов без выбора причина названа словами, а не пустым местом. Длины
  // мало для смысла, поэтому проверяем ещё и то, что причина начинается с
  // объяснения, а не с обещания выбора.
  for (const slot of SLOTS.filter((item) => !item.canChoose)) {
    assert.ok(slot.note.length >= 60, `слот ${slot.number}: причина короче объяснения (${slot.note.length})`);
    assert.doesNotMatch(slot.note, /можно выбрать|выберите источник/i, `слот ${slot.number}: обещает выбор`);
  }
});

test('нельзя назначить слоту источник, которого у него нет', () => {
  const brent = slotById('price.brent');
  assert.equal(validateChoice(brent, 'kraken').ok, false);
  assert.match(validateChoice(brent, 'kraken').reason, /не выбирается/);

  const btc = slotById('price.btc');
  assert.equal(validateChoice(btc, 'kraken').ok, true);
  const wrong = validateChoice(btc, 'ecb');
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /допустимые: kraken, coinbase, binance/);
});

test('выбор владельца встаёт первым, а страховка остаётся запасной', () => {
  const btc = slotById('price.btc');
  const chosen = effectiveSources(btc, [
    { slot_id: 'price.btc', source_id: 'coinbase', priority: 1, enabled: true },
  ]);
  assert.deepEqual(chosen.map((source) => source.id), ['coinbase', 'kraken', 'binance']);

  // Без выбора действует порядок по умолчанию.
  assert.deepEqual(effectiveSources(btc, []).map((source) => source.id), ['kraken', 'coinbase', 'binance']);
});

test('выключенный источник убирается совсем, а не уезжает в конец', () => {
  const btc = slotById('price.btc');
  const sources = effectiveSources(btc, [
    { slot_id: 'price.btc', source_id: 'kraken', priority: 1, enabled: false },
  ]);
  assert.deepEqual(sources.map((source) => source.id), ['coinbase', 'binance']);

  // Выключили всё — спрашивать некого, и это видно, а не подменяется молча.
  const none = effectiveSources(btc, [
    { slot_id: 'price.btc', source_id: 'kraken', priority: 1, enabled: false },
    { slot_id: 'price.btc', source_id: 'coinbase', priority: 2, enabled: false },
    { slot_id: 'price.btc', source_id: 'binance', priority: 3, enabled: false },
  ]);
  assert.deepEqual(none, []);
});

test('чужой источник в предпочтениях не ломает порядок слота', () => {
  const usdEur = slotById('price.usd-eur');
  const sources = effectiveSources(usdEur, [
    { slot_id: 'price.usd-eur', source_id: 'kraken', priority: 1, enabled: true },
  ]);
  assert.deepEqual(sources.map((source) => source.id), ['ecb', 'frankfurter']);
});

test('источник знает, какие слоты от него зависят', () => {
  // Отказ Мосбиржи роняет и плитки, и историю — это должно быть видно одним
  // вызовом, а не выясняться по одному слоту.
  assert.deepEqual(
    slotsForSource('moex').map((slot) => slot.number),
    [9, 10, 11, 15, 16, 18, 19],
  );
  assert.deepEqual(slotsForSource('yahoo').map((slot) => slot.number), [1, 2]);
  assert.ok(sourcesInUse().includes('cbr'));
});

test('согласованность реестра с базой: расхождение называется, а не скрывается', () => {
  const rows = SLOTS.map((slot) => ({
    slot_id: slot.id,
    number: slot.number,
    can_choose: slot.canChoose,
  }));
  assert.equal(registryVerdict(rows, []).ok, true);

  const missing = registryVerdict(rows.slice(1), []);
  assert.equal(missing.ok, false);
  assert.match(missing.detail, /нет в базе/);

  const wrong = registryVerdict(
    rows.map((row) => (row.slot_id === 'price.btc' ? { ...row, number: 99 } : row)),
    [],
  );
  assert.equal(wrong.ok, false);
  assert.match(wrong.detail, /номер или выбор разошлись: price\.btc/);

  const badChoice = registryVerdict(rows, [
    { slot_id: 'price.brent', source_id: 'kraken', priority: 1, enabled: true },
  ]);
  assert.equal(badChoice.ok, false);
  assert.match(badChoice.detail, /недопустимый выбор/);
});
