/**
 * Контракт данных проверяется как код, а не как обещание в документе.
 *
 * Эти тесты — сторожевые: они падают не тогда, когда данные испортились, а
 * тогда, когда испортилось соглашение о данных. Именно так выглядели все
 * прошлые дефекты: числа были верные, а смысл поля менялся по дороге.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ASSET_CONTRACTS,
  asOfAgeMinutes,
  asOfMeaning,
  contractFor,
  freshnessVerdict,
  isTradingOpen,
  labelMatchesContract,
  quoteLagVerdict,
} from '../supabase/functions/_shared/data-contract.ts';

const DAY = 24 * 60;

test('контракт: пять опубликованных рядов, ключи уникальны', () => {
  const ids = ASSET_CONTRACTS.map((contract) => contract.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.sort(), ['brent', 'btc', 'gold', 'sp500', 'usd-eur']);
});

test('контракт: подписи различают инструменты, а не повторяют сорт', () => {
  // Brent — фьючерс NYMEX, а не спот EIA и не USO. Подпись обязана это
  // говорить: 01.11.2026 ряд уже один раз переехал на другой инструмент,
  // оставшись под прежним словом.
  assert.equal(contractFor('brent')?.label, 'Brent (фьючерс)');
  const labels = ASSET_CONTRACTS.map((contract) => contract.label);
  assert.equal(new Set(labels).size, labels.length);
});

test('контракт: у каждого ряда есть адрес, смысл даты и обоснование порога', () => {
  for (const contract of ASSET_CONTRACTS) {
    assert.match(contract.endpoint, /^https:\/\//, `${contract.id}: адрес не задан`);
    assert.ok(contract.rationale.length > 30, `${contract.id}: порог без обоснования`);
    assert.ok(contract.cadenceMinutes > 0, `${contract.id}: каденция не задана`);
    // Допустимый возраст не может быть меньше каденции: иначе проверка
    // красная по построению, между двумя законными обновлениями.
    assert.ok(
      contract.maxAsOfAgeMinutes >= contract.cadenceMinutes,
      `${contract.id}: допустимый возраст меньше каденции`,
    );
    // Смысл даты не может быть выдуман: это закрытый список из четырёх.
    assert.ok(
      ['quote', 'close-date', 'candle-open', 'official-rate'].includes(contract.asOfKind),
      `${contract.id}: неизвестный смысл as_of`,
    );
  }
});

test('контракт: официальный интерфейс назван официальным, остальное — честно', () => {
  // Полностью официальных бесплатных интерфейсов на Brent и S&P 500 нет:
  // NYMEX и S&P лицензируют данные. Если однажды кто-то «улучшит» тир,
  // тест спросит, где документированный адрес.
  assert.equal(contractFor('usd-eur')?.tier, 'first-party');
  assert.equal(contractFor('btc')?.tier, 'first-party');
  assert.equal(contractFor('brent')?.tier, 'undocumented-api');
  assert.equal(contractFor('sp500')?.tier, 'undocumented-api');
  for (const contract of ASSET_CONTRACTS) {
    if (contract.tier === 'first-party') {
      assert.ok(
        !/yahoo/i.test(contract.endpoint),
        `${contract.id}: Yahoo не может быть первичным источником`,
      );
    }
  }
});

test('контракт: у каждого смысла даты есть человеческая подпись', () => {
  assert.equal(asOfMeaning('quote'), 'момент котировки');
  assert.equal(asOfMeaning('close-date'), 'дата закрытия');
  assert.equal(asOfMeaning('candle-open'), 'начало суточной свечи');
  assert.equal(asOfMeaning('official-rate'), 'дата официального курса');
});

test('возраст наблюдения: нет даты — нет возраста, а не «ноль»', () => {
  const now = new Date('2026-11-11T07:00:00Z');
  assert.equal(asOfAgeMinutes(null, now), null);
  assert.equal(asOfAgeMinutes('', now), null);
  assert.equal(asOfAgeMinutes('не дата', now), null);
  assert.equal(asOfAgeMinutes('2026-11-11T06:00:00Z', now), 60);
  // Дата из будущего — это не отрицательная свежесть, а испорченные часы.
  assert.equal(asOfAgeMinutes('2026-11-11T09:00:00Z', now), 0);
});

test('свежесть: дата-only Yahoo/ECB считается от закрытия или публикации, а не от полуночи UTC', () => {
  const now = new Date('2026-11-16T11:37:00Z');
  // PostgREST сериализует date-only в timestamptz как полночь UTC. Для S&P
  // это не время закрытия: 13 ноября рынок закрылся в 16:00 EST = 21:00 UTC.
  const sp500 = freshnessVerdict({ id: 'sp500', as_of: '2026-11-13T00:00:00+00:00' }, now);
  assert.equal(sp500.ageMinutes, 62 * 60 + 37);
  assert.equal(sp500.allowedMinutes, 72 * 60);
  assert.equal(sp500.ok, true);

  // ECB XML несёт только дату курса; около 16:00 во Франкфурте 13 ноября
  // было 15:00 UTC. Сырая date-only строка и её DB round-trip равнозначны.
  const ecb = freshnessVerdict({ id: 'usd-eur', as_of: '2026-11-13T00:00:00+00:00' }, now);
  assert.equal(ecb.ageMinutes, 68 * 60 + 37);
  assert.equal(ecb.allowedMinutes, 72 * 60);
  assert.equal(ecb.ok, true);
  for (const asOf of [
    '2026-11-13',
    '2026-11-13T00:00:00+00',
    '2026-11-13T00:00:00+00:00',
    '2026-11-13 00:00:00+00',
  ]) {
    assert.equal(freshnessVerdict({ id: 'usd-eur', as_of: asOf }, now).ageMinutes, ecb.ageMinutes, asOf);
  }

  // Никакого общего сдвига для всех рядов: без времени в контракте дата и
  // обычные timestamp по-прежнему разбираются как раньше.
  assert.equal(asOfAgeMinutes('2026-11-13', now), 83 * 60 + 37);
  assert.equal(freshnessVerdict({ id: 'brent', as_of: '2026-11-13' }, now).ageMinutes, 83 * 60 + 37);
  assert.equal(
    freshnessVerdict({ id: 'sp500', as_of: '2026-11-13T00:01:00Z' }, now).ageMinutes,
    83 * 60 + 36,
  );
});

test('свежесть: date-only не маскирует реальную задержку после прежних 72 часов', () => {
  const sp500 = freshnessVerdict(
    { id: 'sp500', as_of: '2026-11-13T00:00:00+00:00' },
    new Date('2026-11-16T21:01:00Z'),
  );
  assert.equal(sp500.ageMinutes, 72 * 60 + 1);
  assert.equal(sp500.allowedMinutes, 72 * 60);
  assert.equal(sp500.ok, false);

  const ecb = freshnessVerdict(
    { id: 'usd-eur', as_of: '2026-11-13T00:00:00+00:00' },
    new Date('2026-11-16T15:01:00Z'),
  );
  assert.equal(ecb.ageMinutes, 72 * 60 + 1);
  assert.equal(ecb.allowedMinutes, 72 * 60);
  assert.equal(ecb.ok, false);
});

test('свежесть: осенний перевод часов даёт 73 реальных часа и остаётся за строгим лимитом 72', () => {
  // США переводят часы после пятничного закрытия: 16:00 EDT в пятницу
  // 30 октября — 16:00 EST в понедельник 2 ноября, но в UTC это 73 часа.
  const sp500 = freshnessVerdict(
    { id: 'sp500', as_of: '2026-10-30' },
    new Date('2026-11-02T21:00:00Z'),
  );
  assert.equal(sp500.ageMinutes, 73 * 60);
  assert.equal(sp500.allowedMinutes, 72 * 60);
  assert.equal(sp500.ok, false);

  // В Европе переход раньше: дата курса 23 октября 16:00 CEST →
  // понедельник 26 октября 16:00 CET также занимает 73 часа UTC.
  const ecb = freshnessVerdict(
    { id: 'usd-eur', as_of: '2026-10-23' },
    new Date('2026-10-26T15:00:00Z'),
  );
  assert.equal(ecb.ageMinutes, 73 * 60);
  assert.equal(ecb.allowedMinutes, 72 * 60);
  assert.equal(ecb.ok, false);
});

test('свежесть: весенний перевод часов сокращает пятницу–понедельник до 71 реального часа', () => {
  // США переводят часы в воскресенье: пятница 16:00 EST → понедельник 16:00 EDT.
  const sp500 = freshnessVerdict(
    { id: 'sp500', as_of: '2026-03-06' },
    new Date('2026-03-09T20:00:00Z'),
  );
  assert.equal(sp500.ageMinutes, 71 * 60);
  assert.equal(sp500.allowedMinutes, 72 * 60);
  assert.equal(sp500.ok, true);

  // В Европе переход тоже происходит в воскресенье: 16:00 CET в пятницу
  // 27 марта → 16:00 CEST в понедельник 30 марта.
  const ecb = freshnessVerdict(
    { id: 'usd-eur', as_of: '2026-03-27' },
    new Date('2026-03-30T14:00:00Z'),
  );
  assert.equal(ecb.ageMinutes, 71 * 60);
  assert.equal(ecb.allowedMinutes, 72 * 60);
  assert.equal(ecb.ok, true);
});

test('свежесть: время даты-only учитывает летнее и зимнее время источника', () => {
  assert.equal(
    freshnessVerdict({ id: 'sp500', as_of: '2026-07-03' }, new Date('2026-07-03T20:00:00Z')).ageMinutes,
    0,
  ); // Нью-Йорк: 16:00 EDT = 20:00 UTC.
  assert.equal(
    freshnessVerdict({ id: 'sp500', as_of: '2026-01-02' }, new Date('2026-01-02T21:00:00Z')).ageMinutes,
    0,
  ); // Нью-Йорк: 16:00 EST = 21:00 UTC.
  assert.equal(
    freshnessVerdict({ id: 'usd-eur', as_of: '2026-07-03' }, new Date('2026-07-03T14:00:00Z')).ageMinutes,
    0,
  ); // Франкфурт: 16:00 CEST = 14:00 UTC.
  assert.equal(
    freshnessVerdict({ id: 'usd-eur', as_of: '2026-01-02' }, new Date('2026-01-02T15:00:00Z')).ageMinutes,
    0,
  ); // Франкфурт: 16:00 CET = 15:00 UTC.
});

test('свежесть: у каждого ряда свой порог, а не общий на всех', () => {
  const now = new Date('2026-11-11T07:00:00Z');
  // Золото на момент котировки: одиннадцать часов — это дефект для
  // пятиминутной каденции, но не выход за календарный порог 72 часа.
  const gold = freshnessVerdict({ id: 'gold', as_of: '2026-11-10T20:00:00Z' }, now);
  assert.equal(gold.ok, true);
  assert.equal(gold.ageMinutes, 11 * 60);
  assert.equal(gold.allowedMinutes, 72 * 60);
  assert.match(gold.note, /момент котировки/);
  // Курс ЕЦБ: сутки — норма, порог трое суток.
  assert.equal(freshnessVerdict({ id: 'usd-eur', as_of: '2026-11-10T00:00:00Z' }, now).ok, true);
  // Пятничное закрытие в воскресенье ещё законно...
  const friday = new Date('2026-11-06T21:00:00Z');
  const sunday = new Date('2026-11-08T12:00:00Z');
  assert.equal(freshnessVerdict({ id: 'brent', as_of: friday.toISOString() }, sunday).ok, true);
  // ...а в среду то же закрытие — уже нет.
  const wednesday = new Date('2026-11-11T12:00:00Z');
  const stale = freshnessVerdict({ id: 'brent', as_of: friday.toISOString() }, wednesday);
  assert.equal(stale.ok, false);
  assert.match(stale.note, /допустимо/);
});

test('свежесть: ряд без контракта и ряд без даты — красные, а не «пропущенные»', () => {
  const now = new Date('2026-11-11T07:00:00Z');
  const unknown = freshnessVerdict({ id: 'nasdaq', as_of: now.toISOString() }, now);
  assert.equal(unknown.described, false);
  assert.equal(unknown.ok, false);
  assert.match(unknown.note, /не описан контрактом/);

  const undated = freshnessVerdict({ id: 'brent', as_of: null }, now);
  assert.equal(undated.ok, false);
  assert.equal(undated.ageMinutes, null);
  assert.match(undated.note, /даты наблюдения нет/);
});

test('свежесть: свежая дата отставшего ряда не вытягивает соседа', () => {
  // Прежняя проверка брала самый свежий ряд из пяти и по нему судила обо всех:
  // золото с одиннадцатью часами отставания проходило молча. Теперь судится
  // каждый ряд, и вердиктов ровно столько, сколько рядов.
  const now = new Date('2026-11-11T07:00:00Z');
  const rows = [
    { id: 'brent', as_of: '2026-11-11T06:55:00Z' },
    { id: 'gold', as_of: '2026-10-01T00:00:00Z' },
  ];
  const verdicts = rows.map((row) => freshnessVerdict(row, now));
  assert.equal(verdicts.length, 2);
  assert.equal(verdicts[0].ok, true);
  assert.equal(verdicts[1].ok, false);
});

test('подпись: расхождение с контрактом видно, совпадение — тоже', () => {
  assert.equal(labelMatchesContract('brent', 'Brent (фьючерс)'), true);
  assert.equal(labelMatchesContract('brent', 'Brent'), false);
  assert.equal(labelMatchesContract('brent', 'Нефть'), false);
  assert.equal(labelMatchesContract('nasdaq', 'NASDAQ'), false);
});

test('сторож: selfcheck судит о свежести по контракту, а не по своему порогу', async () => {
  const source = await readFile(new URL('../supabase/functions/selfcheck/index.ts', import.meta.url), 'utf8');
  // Общий порог в шесть суток был причиной, по которой отставание золота
  // не видел никто. Он не должен вернуться ни под каким именем.
  assert.equal(/MAX_ASSET_ASOF_HOURS/.test(source), false, 'общий порог свежести вернулся');
  assert.match(source, /freshnessVerdict\(/, 'selfcheck не спрашивает контракт о свежести');
  assert.match(source, /check\('asset_contract'/, 'нет проверки описания ряда контрактом');
});

test('сторож: писатель не подписывает ряд словом, которого нет в контракте', async () => {
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  // Имена рядов в писателе обязаны приходить из контракта: две копии подписи
  // расходятся ровно в тот день, когда ряд меняет инструмент.
  assert.match(source, /ASSET_CONTRACTS|contractFor/, 'писатель не сверяется с контрактом');
});

test('BTC: текущая цена из тикера, история из свечей, и это видно в журнале', async () => {
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  // Плитка «сейчас» на суточной свече — это отставание до 24 часов, которое
  // никакая проверка не отличит от свежих данных: начало свечи в полночь.
  assert.match(source, /api\.Kraken\.com\/0\/public\/Ticker\?pair=XBTUSD/, 'тикер Kraken не запрашивается');
  assert.match(source, /current_price_source/, 'источник текущей цены не пишется в журнал');
  // Свечи обязаны остаться: без них у графика нет закрытий.
  assert.match(source, /OHLC\?pair=XBTUSD&interval=1440/, 'история свечей пропала');
});

test('контракт: у BTC смысл даты — момент котировки, а не начало свечи', () => {
  assert.equal(contractFor('btc')?.asOfKind, 'quote');
  assert.equal(contractFor('btc')?.cadenceMinutes, 5);
});

// --- Задержка текущей цены (11.11.2026) ------------------------------------
//
// Отдельная проверка от свежести: «ряд жив» и «цена текущая» — разные вопросы,
// и общий порог на них скрывал одиннадцатичасовое отставание золота.

test('рынок: календарь отличает выходные от отказа источника', () => {
  const brent = contractFor('brent');
  // Пятница 20:00 UTC — торги идут.
  assert.equal(isTradingOpen(brent, new Date('2026-11-06T20:00:00Z')), true);
  // Пятница 21:30 UTC — закрыто на выходные.
  assert.equal(isTradingOpen(brent, new Date('2026-11-06T21:30:00Z')), false);
  // Суббота — закрыто.
  assert.equal(isTradingOpen(brent, new Date('2026-11-07T12:00:00Z')), false);
  // Воскресенье 23:00 UTC — снова торги.
  assert.equal(isTradingOpen(brent, new Date('2026-11-08T23:00:00Z')), true);
  // Понедельник — торги.
  assert.equal(isTradingOpen(brent, new Date('2026-11-09T09:00:00Z')), true);
  // У индекса и курса ЕЦБ календаря нет: цена не претендует на «сейчас».
  assert.equal(isTradingOpen(contractFor('sp500'), new Date('2026-11-09T09:00:00Z')), false);
});

test('задержка: на открытом рынке одиннадцать часов — дефект', () => {
  const now = new Date('2026-11-11T06:50:00Z'); // среда, торги идут
  const gold = quoteLagVerdict({ id: 'gold', as_of: '2026-11-10T20:00:00Z' }, now);
  assert.equal(gold.applicable, true);
  assert.equal(gold.open, true);
  assert.equal(gold.ok, false);
  assert.match(gold.note, /отстала на 10,8 ч/);
});

test('задержка: в выходные то же отставание — не дефект', () => {
  const sunday = new Date('2026-11-08T12:00:00Z');
  const brent = quoteLagVerdict({ id: 'brent', as_of: '2026-11-06T20:00:00Z' }, sunday);
  assert.equal(brent.ok, true);
  assert.equal(brent.open, false);
  assert.match(brent.note, /рынок закрыт/);
});

test('задержка: свежая котировка проходит, ряд без «сейчас» не проверяется', () => {
  const now = new Date('2026-11-11T06:50:00Z');
  assert.equal(quoteLagVerdict({ id: 'gold', as_of: '2026-11-11T06:40:00Z' }, now).ok, true);
  const sp500 = quoteLagVerdict({ id: 'sp500', as_of: '2026-11-10T00:00:00Z' }, now);
  assert.equal(sp500.applicable, false);
  assert.match(sp500.note, /не претендует на текущую/);
  const fx = quoteLagVerdict({ id: 'usd-eur', as_of: '2026-11-10T00:00:00Z' }, now);
  assert.equal(fx.applicable, false);
});

test('задержка: ряд без даты на открытом рынке — красный, а не пропущенный', () => {
  const now = new Date('2026-11-11T06:50:00Z');
  const verdict = quoteLagVerdict({ id: 'btc', as_of: null }, now);
  assert.equal(verdict.ok, false);
  assert.match(verdict.note, /даты наблюдения нет/);
});

test('сторож: selfcheck применяет обе проверки — свежесть ряда и задержку цены', async () => {
  const source = await readFile(new URL('../supabase/functions/selfcheck/index.ts', import.meta.url), 'utf8');
  assert.match(source, /check\('asset_quote_lag'/);
  assert.match(source, /quoteLagVerdict\(/);
});

test('gold uses only gold-api quotes and a distinct observed series', async () => {
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  assert.match(source, /api\.gold-api\.com\/price\/XAU/);
  assert.doesNotMatch(source, /api\.twelvedata\.com/);
  assert.match(source, /rpc\/record_gold_observation/);
  assert.match(source, /GOLD_OBSERVED_INSTRUMENT/);
});

test('подписи: часы печатаются с десятичной запятой', () => {
  const now = new Date('2026-11-11T07:00:00Z');
  // «0,3 ч» — по-русски; «0.3 ч» читается как небрежность, а этот текст
  // человек видит в статусе сайта.
  const verdict = freshnessVerdict({ id: 'brent', as_of: '2026-11-11T06:42:00Z' }, now);
  assert.match(verdict.note, /0,3 ч/);
  assert.equal(/0\.3 ч/.test(verdict.note), false);
});

// --- Один ряд на инструмент (11.11.2026) -----------------------------------
//
// Первичный ряд в реестре и ряд на экране — разные вещи, и они разошлись
// молча: у золота первичным был уровень индекса Nasdaq (2381–3054 пункта),
// пока плитка показывала спот 4048 долларов за унцию. По is_primary считают
// оценки событий и прогнозы, поэтому под одним словом «gold» жили две разные
// величины.

test('контракт: у каждого ряда назван ряд, который видит человек', () => {
  const expected = {
    brent: ['brent_yahoo_bzf', 'usd_per_barrel'],
    sp500: ['sp500_yahoo_gspc', 'index_points'],
    'usd-eur': ['eurusd_ecb_daily', 'usd_per_eur'],
    btc: ['btc_kraken_xbtusd_daily', 'usd_per_btc'],
    gold: ['gold_api_xau_observed_daily', 'usd_per_troy_ounce'],
  };
  for (const [id, [instrument, unit]] of Object.entries(expected)) {
    const contract = contractFor(id);
    assert.equal(contract?.historyInstrumentId, instrument, `${id}: ряд на экране`);
    assert.equal(contract?.displayUnit, unit, `${id}: единица на экране`);
  }
});

test('контракт: золото не может показывать уровень индекса как цену', () => {
  // Уровень индекса Nasdaq — 2381–3054 «пунктов», спот — 4048 долларов за
  // унцию. Одно слово «gold» на две величины: это не округление, а подмена.
  assert.equal(contractFor('gold')?.displayUnit, 'usd_per_troy_ounce');
  assert.notEqual(contractFor('gold')?.historyInstrumentId, 'gold_fred_nasdaq_index');
});

test('сторож: панель истории и контракт называют один и тот же ряд', async () => {
  const source = await readFile(new URL('../src/data/assetPriceHistory.ts', import.meta.url), 'utf8');
  for (const contract of ASSET_CONTRACTS) {
    assert.ok(
      source.includes(`'${contract.historyInstrumentId}'`),
      `${contract.id}: панель истории не знает ряд ${contract.historyInstrumentId}`,
    );
  }
});

test('сторож: selfcheck сверяет первичный ряд реестра с плиткой', async () => {
  const source = await readFile(new URL('../supabase/functions/selfcheck/index.ts', import.meta.url), 'utf8');
  assert.match(source, /check\('asset_series_identity'/);
  assert.match(source, /historyInstrumentId/);
  // Ключ реестра «eurusd» и ключ плитки «usd-eur» — не одно и то же слово.
  assert.match(source, /contract\.id === 'usd-eur' \? 'eurusd'/);
});

// --- Надёжность лент (11.11.2026) ------------------------------------------

test('сторож: у проверки надёжности лент есть окно и порог, а не «как получится»', async () => {
  const source = await readFile(new URL('../supabase/functions/selfcheck/index.ts', import.meta.url), 'utf8');
  assert.match(source, /check\('feed_reliability'/);
  // Пропуски по паузе и пейсингу — это наши пропуски, а не отказы источника.
  assert.match(source, /paused=eq\.false/);
  // Порог и минимальная выборка записаны явно: без них одна удачная попытка
  // после месяца молчания давала бы «100 % успеха».
  assert.match(source, /share < 0\.6/);
  assert.match(source, /item\.tries < 20/);
});

// --- Шлюз в писателе цен (11.11.2026) --------------------------------------

test('сторож: писатель спрашивает шлюз до запроса и запоминает отказы', async () => {
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  assert.match(source, /gateDecision\(/, 'писатель не спрашивает шлюз');
  assert.match(source, /afterAttempt\(/, 'отказы не записываются в состояние');
  assert.match(source, /asset_source_state/, 'состояние шлюза не хранится между запусками');
  // Пропуск по шлюзу обязан называть причину, иначе «не обновилось» снова
  // будет читаться как «источник сломался».
  assert.match(source, /skipped_by_gate/);
  // Падение записи состояния не должно валить публикацию цен.
  assert.match(source, /состояние шлюза не записано/);
});

test('gold history failure does not force a restricted fallback', async () => {
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  assert.match(source, /live price valid; observed history unavailable/);
  assert.doesNotMatch(source, /storedGoldHistory|fetchGoldSeries/);
});