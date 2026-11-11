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
  labelMatchesContract,
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

test('свежесть: у каждого ряда свой порог, а не общий на всех', () => {
  const now = new Date('2026-11-11T07:00:00Z');
  // Золото на момент котировки: одиннадцать часов — это дефект для
  // пятиминутной каденции, но не выход за календарный порог 48 часов.
  const gold = freshnessVerdict({ id: 'gold', as_of: '2026-11-10T20:00:00Z' }, now);
  assert.equal(gold.ok, true);
  assert.equal(gold.ageMinutes, 11 * 60);
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
