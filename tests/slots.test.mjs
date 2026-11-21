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
    [3, 5, 24],
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

test('каждый источник слотов описан квотой: иначе у него нет ни квоты, ни паузы', async () => {
  // Это главное правило «нас не блокируют»: к источнику нельзя прийти, не
  // имея записанной квоты и паузы. Если в реестр слотов добавили источник, а в
  // реестр квот — нет, тест падает здесь, а не в проде через неделю.
  const { PRICE_SOURCES } = await import('../supabase/functions/_shared/price-sources.ts');
  const budgeted = new Set(PRICE_SOURCES.map((source) => source.id));
  // Слоты-котировки обслуживает писатель цен, и у каждого его источника
  // обязана быть записанная квота. У ЦБ и Мосбиржи (слоты-индикаторы) квота
  // живёт в другом месте — в очереди по хосту serverless-функций, которая
  // ограничивает одновременность, а не суточный расход; это записано в
  // docs/DATA-CONTRACT.md §6.
  const priceSources = SLOTS.filter((slot) => slot.kind === 'price').flatMap((slot) =>
    slot.sources.map((source) => source.id),
  );
  const missing = [...new Set(priceSources)].filter((id) => !budgeted.has(id));
  assert.deepEqual(missing, [], `источники без квоты: ${missing.join(', ')}`);
  // И наоборот: квота без слота означает, что мы считаем расход источника,
  // которого никто не спрашивает, — счётчик будет вечно нулевым и незаметно
  // сломается.
  const slots = new Set(priceSources);
  const unused = [...budgeted].filter((id) => !slots.has(id));
  assert.deepEqual(unused, [], `квота без слота: ${unused.join(', ')}`);
});

test('сторож: писатель цен берёт источник слота из выбора владельца, а не из кода', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  assert.match(source, /readSlotPreferences/, 'выбор владельца не читается');
  assert.match(source, /effectiveSources\(slot, preferences\)/, 'порядок источников не применяется');
  assert.match(source, /source_preferences\?select=/, 'таблица выбора не запрашивается');
  // Копия реестра в базе должна обновляться: на ней держится страница состояния
  // и проверка slots_registry.
  assert.match(source, /syncSlotRegistry/, 'реестр не синхронизируется с базой');
  // Отчёт о выбранном источнике — то, что видит владелец.
  assert.match(source, /slots: slotReport/);
});

test('BTC, золото и USD/EUR умеют переключаться на описанный источник', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  for (const marker of ['fetchBtcCoinbase', 'fetchBtcBinance', 'fetchUsdEurFrankfurter']) {
    assert.ok(source.includes(marker), `нет пути выбора: ${marker}`);
  }
  // Подпись обязана меняться вместе с источником: цена Coinbase — не цена Kraken.
  assert.match(source, /provider: "Coinbase"/);
  assert.match(source, /provider: "Binance"/);
  assert.match(source, /quote_asset: "USDT"/, 'пара BTCUSDT не подписана как USDT');
});

test('плитка подписывает источник: смена источника не должна менять число молча', async () => {
  const { readFile } = await import('node:fs/promises');
  const writer = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  // Провайдер из метаданных ряда пишется в кэш отдельной колонкой.
  assert.match(writer, /source_label: String\(result\.meta\.provider/);
  assert.match(writer, /supports\("source_label"\)/);

  const tile = await readFile(new URL('../src/components/MarketHeatmap.tsx', import.meta.url), 'utf8');
  // И читается на плитке рядом с ценой и датой.
  assert.match(tile, /asset\.sourceLabel/, 'подпись источника не выводится на плитку');

  const mapper = await readFile(new URL('../src/data/assetCacheRow.ts', import.meta.url), 'utf8');
  assert.match(mapper, /sourceLabel: row\.source_label/);
});

test('запасной источник включается на отказ, а не на «ещё не пора»', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  // Дефект, пойманный в проде 11.11 в 22:05: Kraken не успел выйти из
  // пятиминутного интервала, и писатель молча взял Coinbase. Числа при этом
  // прыгали между биржами через запуск, а график складывался из разных
  // площадок. Пауза и квота — другое дело: там замена и есть страховка.
  assert.match(source, /primaryDecision\?\.reason === 'paused' \|\| primaryDecision\?\.reason === 'budget'/);
  assert.match(source, /Запасной путь в таком случае брать нельзя/);
  // И порядок берётся из выбора владельца: первый — основной, остальные запас.
  assert.match(source, /const primary = order\[0\];/);
});
