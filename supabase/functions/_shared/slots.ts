/**
 * Реестр слотов: каждая величина на сайте, которая приходит из внешнего
 * источника, получает постоянный номер.
 *
 * Зачем номер. До сих пор связь «значение на экране → сайт-источник» жила
 * только в коде: чтобы узнать, откуда берётся кривая ОФЗ, нужно было открыть
 * `api/russia-insights.js`. Номер делает эту связь предметом: его можно
 * назвать в разговоре, записать в таблицу решений и проверить проверкой.
 * Номера не переиспользуются: выбывший слот остаётся выбывшим, иначе старая
 * запись «слот 14 — резервы» однажды начнёт означать другое.
 *
 * Что считается слотом. Один независимый источник данных вместе со всеми
 * колонками, которые от него зависят. Дробить дальше нельзя: цена, изменение
 * за день и линия на графике приходят одним ответом одного сервиса. Отдельный
 * «источник для изменения» — это была бы кнопка, которая ничего не меняет,
 * то есть обман. Поэтому у слота перечислены колонки, а не наоборот.
 *
 * Почему у большинства слотов один источник. Замену можно предлагать только
 * тогда, когда она отдаёт тот же инструмент. Для Brent это NYMEX BZ=F: ICE
 * Brent (другой контракт, который отдаёт CNBC) — не замена, а подмена
 * инструмента, и молчаливая подмена запрещена. Там, где замены нет, слот так
 * и говорит: `canChoose: false` и причина словами.
 *
 * Модуль без Deno и без сети: его проверяют обычные тесты.
 */

/** Откуда слот берёт значение. */
export interface SlotSource {
  /** Ключ источника. Для цен совпадает с `asset_source_state.source_id`. */
  id: string;
  /** Как источник называется для человека. */
  label: string;
  /** Чем он отличается от первого в списке — словами, без обещаний. */
  note?: string;
}

export type SlotKind =
  /** Котировка или индикатор, который обновляется писателем. */
  | 'price'
  /** Ряд истории, который запрашивается по требованию страницы. */
  | 'indicator'
  /** Новостные ленты: выбор источника у них уже свой, по каждой ленте. */
  | 'feeds'
  /** Считается внутри сайта из уже полученных данных; внешнего источника нет. */
  | 'derived';

export interface DataSlot {
  /**
   * Постоянный номер. Виден на странице состояния и в отчётах, поэтому
   * меняться не может: только добавляться в конец.
   */
  number: number;
  /** Машинный ключ. Используется в `source_preferences.slot_id`. */
  id: string;
  /** Раздел сайта, где величину видно. */
  section: string;
  /** Что это за величина. */
  title: string;
  /** Колонки, которые зависят от этого источника. */
  columns: string[];
  kind: SlotKind;
  /** Первый — по умолчанию. Порядок остальных — предлагаемый запас. */
  sources: SlotSource[];
  /** Может ли владелец выбрать источник сам. */
  canChoose: boolean;
  /** Причина выбора или причина, по которой выбора нет. */
  note: string;
}

export const SLOTS: DataSlot[] = [
  // --- I. Международные котировки -------------------------------------------
  {
    number: 1,
    id: 'price.brent',
    section: 'Ключевые активы',
    title: 'Brent, фьючерс NYMEX BZ=F',
    columns: ['цена', 'изменение за день', 'линия 30 дней', 'дата наблюдения'],
    kind: 'price',
    sources: [
      { id: 'yahoo', label: 'Yahoo Finance (BZ=F)', note: 'два хоста: query1, при отказе query2' },
      { id: 'stooq', label: 'Stooq QA.F', note: 'автоматический резервный источник того же фьючерса NYMEX; отмечается как fallback' },
    ],
    canChoose: false,
    note: 'Stooq QA.F — резерв для того же фьючерса NYMEX BZ=F, используется только при недоступности Yahoo Finance. Другие ряды Brent, включая ICE или спот EIA, не подставляются.',
  },
  {
    number: 2,
    id: 'price.sp500',
    section: 'Ключевые активы',
    title: 'S&P 500, индекс ^GSPC',
    columns: ['цена', 'изменение за день', 'линия 30 дней', 'дата наблюдения'],
    kind: 'price',
    sources: [{ id: 'yahoo', label: 'Yahoo Finance (^GSPC)', note: 'два хоста: query1, при отказе query2' }],
    canChoose: false,
    note: 'CNBC отдаёт .SPX с задержкой и другим моментом съёма — это не тот же ряд. Пока равнозначной замены нет.',
  },
  {
    number: 3,
    id: 'price.btc',
    section: 'Ключевые активы',
    title: 'BTC/USD, спот',
    columns: ['цена', 'изменение за день', 'линия 30 дней', 'дата наблюдения'],
    kind: 'price',
    sources: [
      { id: 'kraken', label: 'Kraken (XBT/USD)', note: 'по умолчанию: официальный интерфейс биржи' },
      { id: 'coinbase', label: 'Coinbase (BTC-USD)', note: 'другая биржа — цена площадки, подпись меняется' },
      { id: 'binance', label: 'Binance (BTCUSDT)', note: 'пара к USDT, а не к доллару — подпись меняется' },
    ],
    canChoose: true,
    note: 'Все три — спот BTC, но на разных площадках цена отличается на десятки долларов. Выбор площадки влияет на ряд: подпись и провайдер меняются вместе с источником.',
  },
  {
    number: 4,
    id: 'price.gold',
    section: 'Ключевые активы',
    title: 'Золото, спот XAU/USD',
    columns: ['цена', 'изменение за день', 'линия 30 дней', 'дата наблюдения'],
    kind: 'price',
    sources: [
      { id: 'gold-api', label: 'gold-api.com (XAU)', note: 'спот; история — наши последние наблюдения за завершённые UTC-сутки' },
    ],
    canChoose: false,
    note: 'Один источник цены и истории. Дневная точка — последнее полученное нами наблюдение за завершённые UTC-сутки, не официальный close. История накапливается без восстановления прошлых дней.',
  },
  {
    number: 5,
    id: 'price.usd-eur',
    section: 'Ключевые активы',
    title: 'USD/EUR, официальный курс ЕЦБ',
    columns: ['цена', 'изменение за день', 'линия 30 дней', 'дата наблюдения'],
    kind: 'price',
    sources: [
      { id: 'ecb', label: 'ЕЦБ (eurofxref)', note: 'первоисточник, публикация раз в рабочий день' },
      { id: 'frankfurter', label: 'Frankfurter', note: 'зеркало того же курса ЕЦБ: те же числа, другой адрес' },
    ],
    canChoose: true,
    note: 'Frankfurter не считает свой курс, а раздаёт справочный курс ЕЦБ. Это замена адреса, а не источника — числа совпадают до знака.',
  },

  // --- II. Блок «Россия»: индикаторы ---------------------------------------
  {
    number: 6,
    id: 'ru.usd-rub',
    section: 'Россия: бизнес',
    title: 'USD/RUB, официальный курс ЦБ',
    columns: ['значение', 'дата курса', 'источник'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России, XML_daily' }],
    canChoose: false,
    note: 'Официальный курс устанавливает только ЦБ. Любой пересчёт «по бирже» — уже другой ряд.',
  },
  {
    number: 7,
    id: 'ru.eur-rub',
    section: 'Россия: бизнес',
    title: 'EUR/RUB, официальный курс ЦБ',
    columns: ['значение', 'дата курса'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России, XML_daily' }],
    canChoose: false,
    note: 'То же, что и слот 6: официальный курс устанавливает только Банк России, и второго такого курса не существует.',
  },
  {
    number: 8,
    id: 'ru.cny-rub-cbr',
    section: 'Россия: бизнес',
    title: 'CNY/RUB, официальный курс ЦБ',
    columns: ['значение', 'дата курса'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России, XML_daily' }],
    canChoose: false,
    note: 'Единственный официальный источник: курс юаня к рублю устанавливает Банк России, второго такого курса нет.',
  },
  {
    number: 9,
    id: 'ru.imoex',
    section: 'Россия: бизнес',
    title: 'IMOEX, индекс Мосбиржи',
    columns: ['значение', 'изменение', 'время источника'],
    kind: 'indicator',
    sources: [{ id: 'moex', label: 'Мосбиржа ISS' }],
    canChoose: false,
    note: 'Индекс считает Мосбиржа. Зеркал нет; пересчёт из состава индекса был бы моделью, а не наблюдением.',
  },
  {
    number: 10,
    id: 'ru.rgbi',
    section: 'Россия: бизнес',
    title: 'RGBI, индекс гособлигаций',
    columns: ['значение', 'изменение'],
    kind: 'indicator',
    sources: [{ id: 'moex', label: 'Мосбиржа ISS' }],
    canChoose: false,
    note: 'Единственный источник: индекс считает и публикует сама биржа, другого издателя у этого числа нет.',
  },
  {
    number: 11,
    id: 'ru.cny-rub-moex',
    section: 'Россия: бизнес',
    title: 'CNY/RUB на Мосбирже (биржевой, не официальный)',
    columns: ['значение', 'время источника'],
    kind: 'indicator',
    sources: [{ id: 'moex', label: 'Мосбиржа ISS' }],
    canChoose: false,
    note: 'Единственный источник: биржевой курс отдаёт только Мосбиржа. Отличается от слота 8 — это сделка, а не курс ЦБ.',
  },
  {
    number: 12,
    id: 'ru.key-rate',
    section: 'Россия: бизнес',
    title: 'Ключевая ставка ЦБ',
    columns: ['значение', 'дата решения'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России, DailyInfo.asmx' }],
    canChoose: false,
    note: 'Ставку назначает Банк России; другого источника этого значения не существует по определению.',
  },
  {
    number: 13,
    id: 'ru.ruonia',
    section: 'Россия: бизнес',
    title: 'RUONIA',
    columns: ['значение', 'дата'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России' }],
    canChoose: false,
    note: 'Единственный официальный источник: курс юаня к рублю устанавливает Банк России, второго такого курса нет.',
  },
  {
    number: 14,
    id: 'ru.reserves',
    section: 'Россия: бизнес',
    title: 'Международные резервы',
    columns: ['значение', 'дата отсечения'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России' }],
    canChoose: false,
    note: 'Единственный официальный источник; значение выходит раз в неделю, поэтому возраст данных здесь меряется неделями.',
  },
  {
    number: 15,
    id: 'ru.ofz-10y',
    section: 'Россия: бизнес',
    title: 'Кривая доходности ОФЗ',
    columns: ['доходность на срок', 'дата'],
    kind: 'indicator',
    sources: [{ id: 'moex', label: 'Мосбиржа ISS (ZCYC)' }],
    canChoose: false,
    note: 'Единственный источник коэффициентов кривой: считать доходность самим из цен — другая модель, её здесь нет.',
  },
  {
    number: 16,
    id: 'ru.gold-moex',
    section: 'Россия: бизнес',
    title: 'Золото на Мосбирже',
    columns: ['значение', 'время источника'],
    kind: 'indicator',
    sources: [{ id: 'moex', label: 'Мосбиржа ISS' }],
    canChoose: false,
    note: 'Единственный источник: это рублёвая цена золота на Мосбирже, а не спот в долларах (слот 4).',
  },
  {
    number: 17,
    id: 'ru.inflation',
    section: 'Россия: бизнес',
    title: 'Инфляция (данные Росстата через ЦБ)',
    columns: ['значение', 'месяц'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России (публикация Росстата)' }],
    canChoose: false,
    note: 'Единственный официальный путь: Росстат машинного интерфейса не даёт, публикация идёт через Банк России.',
  },

  // --- III. История России --------------------------------------------------
  {
    number: 18,
    id: 'history.imoex',
    section: 'История России',
    title: 'IMOEX, 92 дня',
    columns: ['точки ряда', 'даты'],
    kind: 'indicator',
    sources: [{ id: 'moex', label: 'Мосбиржа ISS' }],
    canChoose: false,
    note: 'Тот же источник, что и слот 9 (Мосбиржа ISS), но запрашивается страницей отдельно и своим запросом.',
  },
  {
    number: 19,
    id: 'history.rgbi',
    section: 'История России',
    title: 'RGBI, 92 дня',
    columns: ['точки ряда', 'даты'],
    kind: 'indicator',
    sources: [{ id: 'moex', label: 'Мосбиржа ISS' }],
    canChoose: false,
    note: 'Тот же источник, что и слот 10: Мосбиржа ISS, отдельный запрос истории.',
  },
  {
    number: 20,
    id: 'history.usd-rub',
    section: 'История России',
    title: 'USD/RUB, 92 дня',
    columns: ['точки ряда', 'даты'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России' }],
    canChoose: false,
    note: 'Тот же источник, что и слот 6: официальный курс Банка России, отдельный запрос истории.',
  },
  {
    number: 21,
    id: 'history.ruonia',
    section: 'История России',
    title: 'RUONIA, 92 дня',
    columns: ['точки ряда', 'даты'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России' }],
    canChoose: false,
    note: 'Тот же источник, что и слот 13: RUONIA публикует только Банк России, история запрашивается отдельно.',
  },
  {
    number: 22,
    id: 'history.reserves',
    section: 'История России',
    title: 'Резервы, 92 дня',
    columns: ['точки ряда', 'даты'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России' }],
    canChoose: false,
    note: 'Тот же источник, что и слот 14: резервы публикует только Банк России, история запрашивается отдельно.',
  },
  {
    number: 23,
    id: 'history.key-rate',
    section: 'История России',
    title: 'Ключевая ставка, 92 дня (ступенями)',
    columns: ['ступени', 'даты вступления'],
    kind: 'indicator',
    sources: [{ id: 'cbr', label: 'Банк России' }],
    canChoose: false,
    note: 'Тот же источник, что и слот 12: ставку назначает Банк России, история — это даты решений.',
  },

  // --- IV. Новости и производные -------------------------------------------
  {
    number: 24,
    id: 'news.headlines',
    section: 'Новости',
    title: 'Заголовки и ссылки из лент',
    columns: ['заголовок', 'ссылка', 'дата', 'издание'],
    kind: 'feeds',
    sources: [{ id: 'news_sources_v2', label: '24 ленты в таблице news_sources_v2' }],
    canChoose: true,
    note: 'Выбор источника у лент уже свой и построчный: `enabled`, `poll_interval_minutes`, фильтры категорий. Менять его можно без выката, прямо в таблице.',
  },
  {
    number: 25,
    id: 'news.tension',
    section: 'Индекс напряжённости',
    title: 'Индекс напряжённости',
    columns: ['значение', 'шкала', 'история'],
    kind: 'derived',
    sources: [{ id: 'internal', label: 'Считается из новостей этого же сайта' }],
    canChoose: false,
    note: 'Внешнего источника нет: это наша арифметика над слотом 24. Выбор «источника индекса» был бы выбором другого индекса, то есть другого товара.',
  },
  {
    number: 26,
    id: 'news.events',
    section: 'Новости',
    title: 'События: кластеры материалов',
    columns: ['событие', 'число материалов', 'окно'],
    kind: 'derived',
    sources: [{ id: 'internal', label: 'Кластеризация наших новостей' }],
    canChoose: false,
    note: 'Внешнего источника нет: кластеры считаются из слотов 24 внутри сайта, без новых обращений в сеть.',
  },
  {
    number: 27,
    id: 'news.classify',
    section: 'Новости',
    title: 'Классификация событий моделью',
    columns: ['важность', 'рубрика', 'уверенность'],
    kind: 'derived',
    sources: [
      { id: 'groq', label: 'Groq' },
      { id: 'gemini', label: 'Google Gemini' },
      { id: 'mistral', label: 'Mistral' },
    ],
    canChoose: false,
    note: 'Внешний источник здесь — модель, и три модели в коде уже работают как запасные друг другу. Выбор владельцу пока не предлагается: разница моделей — вопрос качества, а не доступности; сначала нужен замер, потом кнопка.',
  },
  {
    number: 28,
    id: 'news.digest',
    section: 'Дайджест недели',
    title: 'Дайджест недели',
    columns: ['текст дайджеста', 'дата'],
    kind: 'derived',
    sources: [{ id: 'internal', label: 'Наши события + модель' }],
    canChoose: false,
    note: 'Внешний источник здесь только модель, и у неё уже есть запасная: текст собирается из слотов 24–26 внутри сайта.',
  },
  {
    number: 29,
    id: 'snapshot.morning',
    section: 'Паспорт дня',
    title: 'Утренний снимок',
    columns: ['котировки дня', 'индекс', 'число новостей'],
    kind: 'derived',
    sources: [{ id: 'internal', label: 'Слоты 1–5 и 24–25 на 04:00 UTC' }],
    canChoose: false,
    note: 'Снимок — это зафиксированные значения тех же слотов. Отдельного источника у него нет и быть не может.',
  },
  {
    number: 30,
    id: 'memory.market',
    section: 'Память рынка',
    title: 'Память рынка: аналогии и статистика',
    columns: ['аналогия', 'исход', 'статистика'],
    kind: 'derived',
    sources: [{ id: 'internal', label: 'Наша база событий и котировок' }],
    canChoose: false,
    note: 'Внешнего источника нет: считается по слотам 1–5 и 26 внутри сайта, новых обращений в сеть не делает.',
  },
  {
    number: 31,
    id: 'forecast.archive',
    section: 'Архив прогнозов',
    title: 'Архив прогнозов (выдача остановлена 31.10.2026)',
    columns: ['прогноз', 'исход', 'счёт'],
    kind: 'derived',
    sources: [{ id: 'internal', label: 'Наша база; новых прогнозов не делаем' }],
    canChoose: false,
    note: 'Слот оставлен, потому что номера не переиспользуются: по нему ещё есть записи в архиве.',
  },
  {
    number: 32,
    id: 'passport.delivery',
    section: 'Паспорт сдачи',
    title: 'Паспорт сдачи: чем доказано',
    columns: ['проверки', 'числа', 'время'],
    kind: 'derived',
    sources: [{ id: 'internal', label: 'Наши проверки и site_health' }],
    canChoose: false,
    note: 'Собирается из проверок; внешний источник — только сами проверяемые слоты.',
  },

  // --- V. Служебное ---------------------------------------------------------
  {
    number: 33,
    id: 'ops.source-state',
    section: 'Страница состояния',
    title: 'Расход и паузы по источникам',
    columns: ['запросов за сутки', 'серия отказов', 'пауза', 'последний ответ'],
    kind: 'derived',
    sources: [{ id: 'internal', label: 'Таблица asset_source_state' }],
    canChoose: false,
    note: 'Внешнего источника нет: это наша собственная дисциплина — сколько раз мы пришли к источнику. Проверка source_politeness читает ровно эту строку.',
  },
];

/** Слот по номеру — так его называют в разговоре и в отчётах. */
export function slotByNumber(number: number): DataSlot | null {
  return SLOTS.find((slot) => slot.number === number) ?? null;
}

/** Слот по машинному ключу — так он записан в `source_preferences`. */
export function slotById(id: string): DataSlot | null {
  return SLOTS.find((slot) => slot.id === id) ?? null;
}

/** Все источники, на которых держится хотя бы один слот. */
export function sourcesInUse(): string[] {
  const ids = new Set<string>();
  for (const slot of SLOTS) for (const source of slot.sources) ids.add(source.id);
  return [...ids].sort();
}

/** Слоты, которые кормит источник: пригодится, чтобы показать последствия отказа. */
export function slotsForSource(sourceId: string): DataSlot[] {
  return SLOTS.filter((slot) => slot.sources.some((source) => source.id === sourceId));
}

export interface SlotPreference {
  slot_id: string;
  source_id: string;
  priority: number;
  enabled: boolean;
}

/**
 * Действующий порядок источников слота с учётом выбора владельца.
 *
 * Правила:
 *   - выбранные и включённые источники идут первыми, в заданном порядке;
 *   - выключенный источник из списка убирается совсем, а не «в конец»:
 *     иначе пауза и отказ вернут его наверх;
 *   - источники, которых владелец не трогал, остаются запасными в прежнем
 *     порядке — чтобы выбор одного не отключал страховку;
 *   - пустой результат означает «спросить некого»: слот честно выпадет.
 */
export function effectiveSources(slot: DataSlot, preferences: SlotPreference[]): SlotSource[] {
  const rows = preferences.filter((row) => row.slot_id === slot.id);
  const allowed = new Set(slot.sources.map((source) => source.id));
  const chosen = rows
    .filter((row) => row.enabled && allowed.has(row.source_id))
    .sort((a, b) => a.priority - b.priority)
    .map((row) => slot.sources.find((source) => source.id === row.source_id)!);
  const disabled = new Set(rows.filter((row) => !row.enabled).map((row) => row.source_id));
  const rest = slot.sources.filter(
    (source) => !chosen.some((picked) => picked.id === source.id) && !disabled.has(source.id),
  );
  return [...chosen, ...rest];
}

/** Можно ли такому слоту назначить такой источник. */
export function validateChoice(slot: DataSlot, sourceId: string): { ok: boolean; reason: string } {
  if (!slot.canChoose) return { ok: false, reason: `слот ${slot.number} не выбирается: ${slot.note}` };
  if (!slot.sources.some((source) => source.id === sourceId)) {
    return {
      ok: false,
      reason: `источник ${sourceId} не описан для слота ${slot.number}; допустимые: ${slot.sources.map((s) => s.id).join(', ')}`,
    };
  }
  return { ok: true, reason: 'ok' };
}

/**
 * Проверка согласованности для selfcheck: реестр в коде, копия в базе и
 * выбор владельца не должны разойтись. Расхождение — красное, потому что
 * именно оно делает мониторинг ложным: на экране один источник, в работе
 * другой.
 */
export function registryVerdict(
  rows: Array<{ slot_id: string; number: number; can_choose: boolean }>,
  preferences: SlotPreference[],
): { ok: boolean; detail: string } {
  const byId = new Map(rows.map((row) => [row.slot_id, row]));
  const missing = SLOTS.filter((slot) => !byId.has(slot.id)).map((slot) => slot.id);
  const wrongNumber = SLOTS.filter((slot) => {
    const row = byId.get(slot.id);
    return row && (row.number !== slot.number || row.can_choose !== slot.canChoose);
  }).map((slot) => slot.id);
  const extra = rows.filter((row) => !slotById(row.slot_id)).map((row) => row.slot_id);

  const badChoices: string[] = [];
  for (const pref of preferences) {
    const slot = slotById(pref.slot_id);
    if (!slot) continue;
    const verdict = validateChoice(slot, pref.source_id);
    if (!verdict.ok) badChoices.push(`${slot.number}: ${verdict.reason}`);
  }

  const parts: string[] = [];
  if (missing.length) parts.push(`нет в базе: ${missing.join(', ')}`);
  if (extra.length) parts.push(`лишние в базе: ${extra.join(', ')}`);
  if (wrongNumber.length) parts.push(`номер или выбор разошлись: ${wrongNumber.join(', ')}`);
  if (badChoices.length) parts.push(`недопустимый выбор: ${badChoices.join('; ')}`);

  return {
    ok: parts.length === 0,
    detail: parts.length
      ? parts.join('; ')
      : `${SLOTS.length} слотов совпадают с базой, выбор владельца допустим`,
  };
}
