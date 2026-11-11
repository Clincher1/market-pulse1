/**
 * Контракт данных: одно место, где сказано, что означает каждое число.
 *
 * Зачем этот файл появился. Каждый аудит находил новый дефект, и почти все они
 * были одного рода: одно и то же поле понималось по-разному в трёх местах —
 * у писателя, у проверки и на экране.
 *
 *   • `change` считался от предпоследнего закрытия, а на плитке печатался как
 *     изменение от последнего — и проверка честно красила верное число;
 *   • `as_of` означает то момент котировки, то дату закрытия, то дату
 *     официального курса, а проверка сравнивала все три с одним порогом;
 *   • `spark_dates` запрашивался, но не передавался в сверку — и та уходила в
 *     ветку «два последних закрытия», где верных ответов не бывает.
 *
 * Лечение по одному месту каждый раз давало новый раунд. Поэтому здесь
 * собраны в одну таблицу свойства каждого опубликованного ряда: откуда он,
 * официальный ли это интерфейс, что именно означает `as_of`, как часто
 * писатель обязан его обновлять и через сколько отсутствие обновления — уже
 * дефект, а не расписание источника. Писатель, проверка и подписи на экране
 * обязаны брать эти свойства отсюда, а не повторять своими словами.
 *
 * Модуль намеренно без Deno и без сети: его проверяют обычные тесты.
 */

/**
 * Что означает `as_of` у ряда. Одно и то же поле в базе, четыре разных смысла:
 *
 *   quote        — момент, на который источник назвал цену (внутридневная кавычка);
 *   close-date   — дата торгового дня, за который взято закрытие;
 *   candle-open  — начало суточной свечи: цена внутри неё ещё меняется;
 *   official-rate — дата, на которую центробанк установил официальный курс.
 *
 * Смысл задаётся источником, а не нашим желанием: ECB публикует курс на дату,
 * Kraken отдаёт свечу с началом в 00:00 UTC, Yahoo во время сессии — момент
 * котировки, а после закрытия — дату закрытия.
 */
export type AsOfKind = 'quote' | 'close-date' | 'candle-open' | 'official-rate';

/**
 * Насколько источник официальный.
 *
 *   first-party      — публикует сам держатель данных по документированному
 *                      адресу (ECB, Kraken, ЦБ, Мосбиржа, FRED);
 *   undocumented-api — публичный, но недокументированный интерфейс (Yahoo
 *                      Finance chart): работает годами, но может потребовать
 *                      ключ-«крошку» или ответить 429 без предупреждения;
 *   commercial-api   — коммерческий API с ключом и лимитом (Twelve Data).
 *
 * Полностью официальных бесплатных интерфейсов на фьючерс Brent и индекс
 * S&P 500 не существует: NYMEX и S&P лицензируют данные. Поэтому такие ряды
 * живут на `undocumented-api`, и это записано явно — чтобы не выяснять это
 * заново при следующем аудите.
 */
export type SourceTier = 'first-party' | 'undocumented-api' | 'commercial-api';

/**
 * Когда рынок ряда открыт. Нужен, чтобы отличать «источник отстал» от
 * «биржа закрыта»: без календаря любая проверка задержки красная каждые
 * выходные и потому бесполезна.
 *
 * `weekday-window` — непрерывная сессия с воскресенья по пятницу:
 * окно [openDay openHourUtc, closeDay closeHourUtc) внутри недели, дни от
 * воскресенья (0). Ежедневный час паузы им не описывается — он укладывается
 * в допуск `quoteLagMinutes`.
 */
export type TradingCalendar =
  | 'always'
  | { closeDay: number; closeHourUtc: number; openDay: number; openHourUtc: number };

export interface AssetContract {
  /** Ключ ряда в `cached_assets.id`. */
  id: string;
  /** Подпись, которую ряд обязан нести на экране: инструмент, а не сорт. */
  label: string;
  /** Что именно измеряется — словами, для отчёта и справки. */
  instrument: string;
  provider: string;
  tier: SourceTier;
  /** Адрес, по которому писатель обязан брать данные. */
  endpoint: string;
  asOfKind: AsOfKind;
  /** Как часто писатель обязан обновлять ряд, минуты. */
  cadenceMinutes: number;
  /**
   * Через сколько минут отсутствие свежего `as_of` — дефект, а не расписание.
   * Порог включает законные простои: выходные, праздники, ночную паузу.
   */
  maxAsOfAgeMinutes: number;
  /** Почему порог именно такой. Печатается в отчёте проверки. */
  rationale: string;
  /**
   * Допустимое отставание самой цены, минуты, пока рынок открыт. `null` —
   * цена не претендует на «сейчас» (закрытие дня, курс на дату), и проверка
   * задержки к такому ряду не применяется.
   *
   * Это отдельное число, а не `cadenceMinutes × k`: допуск задержки — решение
   * о качестве, и он должен быть записан явно, а не выведен из расписания.
   */
  quoteLagMinutes: number | null;
  /** Календарь рынка: отличает «источник отстал» от «биржа закрыта». */
  trading: TradingCalendar | null;
  /**
   * Независимый источник для сверки «не врёт ли основной».
   * `null` — сверки нет, и это тоже записано, а не забыто.
   */
  crossCheck: { provider: string; endpoint: string; tolerancePct: number } | null;
  /**
   * Ряд `asset_instruments_v2`, который видит человек: именно его рисует
   * панель истории, и с ним должна совпадать цена на плитке.
   *
   * Поле нужно потому, что первичный ряд в реестре и ряд на экране — разные
   * вещи, и они разошлись молча. 11.11.2026 у золота первичным числился
   * `gold_fred_nasdaq_index` — уровень индекса Nasdaq (2381–3054 пункта),
   * пока плитка показывала спот 4048 долларов за унцию. Оценки событий и
   * прогнозы считали золото по индексу, то есть в 1,6 раза меньше.
   */
  historyInstrumentId: string;
  /** Единица ряда, который видит человек: ловит подмену инструмента того же рода. */
  displayUnit: string;
}

const DAY = 24 * 60;

export const ASSET_CONTRACTS: AssetContract[] = [
  {
    id: 'brent',
    label: 'Brent (фьючерс)',
    instrument: 'Ближайший фьючерс Brent, NYMEX (BZ=F), пункты — доллары за баррель',
    provider: 'Yahoo Finance',
    tier: 'undocumented-api',
    endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=3mo&interval=1d',
    asOfKind: 'quote',
    cadenceMinutes: 5,
    // Три дня: пятничное закрытие в воскресенье ещё законно, а в понедельник
    // вечером — уже нет. Спот EIA сюда не подставляется: это другой инструмент.
    maxAsOfAgeMinutes: 3 * DAY,
    historyInstrumentId: 'brent_yahoo_bzf',
    displayUnit: 'usd_per_barrel',
    rationale: 'фьючерс без официального бесплатного интерфейса; выходные и праздники NYMEX дают до трёх суток',
    // Час паузы CME (21:00–22:00 UTC) укладывается в три часа с запасом на
    // редкий день, когда Yahoo отдаёт котировку реже обычного.
    quoteLagMinutes: 180,
    trading: { closeDay: 5, closeHourUtc: 21, openDay: 0, openHourUtc: 22 },
    crossCheck: null,
  },
  {
    id: 'sp500',
    label: 'S&P 500',
    instrument: 'Индекс S&P 500, пункты, дневное закрытие (^GSPC)',
    provider: 'Yahoo Finance',
    tier: 'undocumented-api',
    endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=3mo&interval=1d',
    asOfKind: 'close-date',
    cadenceMinutes: 5,
    maxAsOfAgeMinutes: 3 * DAY,
    historyInstrumentId: 'sp500_yahoo_gspc',
    displayUnit: 'index_points',
    rationale: 'индекс лицензирован S&P; бесплатный документированный интерфейс отсутствует, выходные — до трёх суток',
    // Плитка показывает закрытие, а не «сейчас»: задержку цены тут проверять
    // не к чему — иначе проверка красная каждую ночь по построению.
    quoteLagMinutes: null,
    trading: null,
    crossCheck: {
      provider: 'FRED (Federal Reserve Bank of St. Louis), SP500',
      endpoint: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500',
      // Сверка ловит подмену инструмента и сдвиг ряда, а не расхождение
      // округления: официальный ряд приходит с задержкой публикации.
      tolerancePct: 1,
    },
  },
  {
    id: 'usd-eur',
    label: 'USD/EUR',
    instrument: 'Доллар США в евро, обратная величина официального курса ЕЦБ EUR/USD',
    provider: 'ECB',
    tier: 'first-party',
    endpoint: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',
    asOfKind: 'official-rate',
    cadenceMinutes: 12 * 60,
    // ЕЦБ публикует курс один раз в рабочий день около 16:00 CET. Пятничный
    // курс живёт до понедельника: это не задержка, а календарь источника.
    maxAsOfAgeMinutes: 3 * DAY,
    historyInstrumentId: 'eurusd_ecb_daily',
    displayUnit: 'usd_per_eur',
    rationale: 'официальный курс ЕЦБ на дату; выходные и праздники TARGET дают до трёх суток',
    quoteLagMinutes: null,
    trading: null,
    crossCheck: null,
  },
  {
    id: 'btc',
    label: 'BTC',
    instrument: 'Биткоин к доллару, спот Kraken XBT/USD: цена — тикер (последняя сделка), история — суточные свечи',
    provider: 'Kraken',
    tier: 'first-party',
    endpoint: 'https://api.Kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440',
    // Цена на плитке — последняя сделка из тикера Kraken, поэтому as_of это
    // момент котировки. История при этом остаётся на дневных свечах.
    // До 11.11.2026 здесь стояло `candle-open`: цена бралась из начала суточной
    // свечи, и в 06:50 UTC сайт показывал семичасовое наблюдение как текущее.
    asOfKind: 'quote',
    cadenceMinutes: 5,
    // Сутки, а не час: если тикер не ответил, цена и дата честно берутся из
    // закрытия последней свечи, и это законные сутки, а не застрявший писатель.
    maxAsOfAgeMinutes: DAY,
    historyInstrumentId: 'btc_kraken_xbtusd_daily',
    displayUnit: 'usd_per_btc',
    rationale: 'круглосуточный рынок; при отказе тикера — закрытие суточной свечи, не старше суток',
    // Два часа: тикер обновляется на каждой сделке, а откат на свечу честно
    // виден как отставание, а не прячется под подписью «сейчас».
    quoteLagMinutes: 120,
    trading: 'always',
    crossCheck: {
      provider: 'Coinbase (FRED, CBBTCUSD)',
      endpoint: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CBBTCUSD',
      tolerancePct: 2,
    },
  },
  {
    id: 'gold',
    label: 'Gold',
    instrument: 'Золото, спот XAU/USD, доллары за тройскую унцию (котировка — gold-api.com, история — Twelve Data)',
    provider: 'gold-api.com (котировка), Twelve Data (закрытия)',
    tier: 'undocumented-api',
    endpoint: 'https://api.gold-api.com/price/XAU (котировка) + api.twelvedata.com/time_series (закрытия)',
    asOfKind: 'quote',
    cadenceMinutes: 5,
    // Золото торгуется почти круглосуточно, но с паузой 21:00–22:00 UTC и
    // остановкой на выходные: пятничная кавычка в воскресенье ещё законна.
    maxAsOfAgeMinutes: 3 * DAY,
    // До 11.11.2026 ряд жил на Twelve Data: на бесплатном тарифе quote по
    // XAU/USD отдавал последнюю котировку сессии, и в 06:50 UTC плитка
    // показывала цену одиннадцатичасовой давности. Допуск трое суток — это
    // выходные и пауза, а не разрешение отставать: каденция пять минут.
    historyInstrumentId: 'gold_twelve_xauusd_daily',
    displayUnit: 'usd_per_troy_ounce',
    rationale: 'тот же инструмент, что на плитке (спот XAU/USD); выходные и часовая пауза дают до трёх суток; при отказе live-котировки цена честно уходит на закрытие Twelve Data',
    quoteLagMinutes: 180,
    trading: { closeDay: 5, closeHourUtc: 21, openDay: 0, openHourUtc: 22 },
    crossCheck: null,
  },
];

/** Контракт по ключу ряда. `null` — ряд не описан, и это дефект, а не мелочь. */
export function contractFor(id: string): AssetContract | null {
  const key = String(id ?? '').trim();
  return ASSET_CONTRACTS.find((contract) => contract.id === key) ?? null;
}

/** Человеческое название смысла `as_of`: подпись под числом, а не жаргон. */
export function asOfMeaning(kind: AsOfKind): string {
  switch (kind) {
    case 'quote':
      return 'момент котировки';
    case 'close-date':
      return 'дата закрытия';
    case 'candle-open':
      return 'начало суточной свечи';
    case 'official-rate':
      return 'дата официального курса';
    default:
      return 'неизвестный смысл';
  }
}

/**
 * Возраст наблюдения в минутах. `null` — даты нет или она не разбирается:
 * «нет данных» нельзя показывать как «только что».
 */
export function asOfAgeMinutes(asOf: string | null | undefined, now: Date): number | null {
  if (!asOf) return null;
  const value = Date.parse(String(asOf));
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.round((now.getTime() - value) / 60000));
}

export interface FreshnessVerdict {
  id: string;
  /** Проверка применима: ряд описан контрактом. */
  described: boolean;
  ok: boolean;
  ageMinutes: number | null;
  allowedMinutes: number;
  /** Короткая строка для detail: «brent: 24 мин котировки, допустимо 4320». */
  note: string;
}

/**
 * Свежесть одного ряда по его собственному контракту.
 *
 * Главное отличие от прежней проверки: порог у каждого ряда свой. Раньше все
 * пять рядов сравнивались с одними сутками с хвостиком, и золото, у которого
 * as_of отставал на одиннадцать часов, проходило проверку молча — потому что
 * соседний Brent был свежим, а смотрели на самый свежий ряд из пяти.
 */
export function freshnessVerdict(
  row: { id: string; as_of?: string | null },
  now: Date,
): FreshnessVerdict {
  const contract = contractFor(row.id);
  if (!contract) {
    return {
      id: String(row.id ?? ''),
      described: false,
      ok: false,
      ageMinutes: null,
      allowedMinutes: 0,
      note: `${row.id ?? '—'}: ряд не описан контрактом`,
    };
  }
  const age = asOfAgeMinutes(row.as_of, now);
  const ok = age !== null && age <= contract.maxAsOfAgeMinutes;
  // Десятичная запятая: «0,3 ч». Точка в русской подписи читается как
  // небрежность, а текст проверки человек видит в статусе сайта.
  const ru = (value: number) => String(value).replace('.', ',');
  const hours = age === null ? null : ru(Math.round((age / 60) * 10) / 10);
  const allowedHours = ru(Math.round((contract.maxAsOfAgeMinutes / 60) * 10) / 10);
  return {
    id: contract.id,
    described: true,
    ok,
    ageMinutes: age,
    allowedMinutes: contract.maxAsOfAgeMinutes,
    note:
      age === null
        ? `${contract.id}: даты наблюдения нет, а ${asOfMeaning(contract.asOfKind)} обязателен`
        : `${contract.id}: ${hours} ч (${asOfMeaning(contract.asOfKind)}), допустимо ${allowedHours} ч`,
  };
}

/**
 * Совпадает ли подпись ряда с контрактом.
 *
 * 01.11.2026 Brent переехал с ближайшего фьючерса на другой инструмент, а
 * подпись осталась прежней: два разных числа под одним словом. Здесь подпись
 * — не украшение, а часть контракта, и проверка сверяет её с ним.
 */
export function labelMatchesContract(id: string, label: string): boolean {
  const contract = contractFor(id);
  if (!contract) return false;
  return contract.label === String(label ?? '').trim();
}

/** Открыт ли рынок ряда в этот момент. Для рядов без календаря — `false`. */
export function isTradingOpen(contract: AssetContract, at: Date): boolean {
  if (contract.trading === 'always') return true;
  if (!contract.trading) return false;
  const week = contract.trading;
  const day = at.getUTCDay();
  const minutes = day * 1440 + at.getUTCHours() * 60 + at.getUTCMinutes();
  const open = week.openDay * 1440 + week.openHourUtc * 60;
  const close = week.closeDay * 1440 + week.closeHourUtc * 60;
  // Окно непрерывной сессии внутри недели: [воскресенье 22:00, пятница 21:00).
  return minutes >= open && minutes < close;
}

export interface LagVerdict {
  id: string;
  /** Проверка применима: ряд претендует на «текущую» цену и рынок ему знаком. */
  applicable: boolean;
  /** Рынок открыт — значит, отставание уже дефект, а не календарь. */
  open: boolean;
  ok: boolean;
  ageMinutes: number | null;
  allowedMinutes: number | null;
  note: string;
}

/**
 * Не отстала ли цена, которая называет себя текущей.
 *
 * Это отдельная проверка от `freshnessVerdict`, и вот почему. Допуск свежести
 * (`maxAsOfAgeMinutes`) отвечает на вопрос «ряд ещё жив»: у золота это трое
 * суток на выходные. А здесь вопрос другой — «цена, подписанная как текущая,
 * действительно текущая»: два часа на открытом рынке. Один порог на оба
 * вопроса давал ровно тот дефект, ради которого этот файл написан: золото с
 * одиннадцатью часами отставания проходило проверку, потому что было младше
 * трёх суток.
 */
export function quoteLagVerdict(
  row: { id: string; as_of?: string | null },
  now: Date,
): LagVerdict {
  const contract = contractFor(row.id);
  if (!contract) {
    return { id: String(row.id ?? ''), applicable: false, open: false, ok: false, ageMinutes: null, allowedMinutes: null, note: `${row.id ?? '—'}: ряд не описан контрактом` };
  }
  if (contract.quoteLagMinutes === null || contract.trading === null) {
    return {
      id: contract.id,
      applicable: false,
      open: false,
      ok: true,
      ageMinutes: null,
      allowedMinutes: null,
      note: `${contract.id}: цена не претендует на текущую (${asOfMeaning(contract.asOfKind)})`,
    };
  }
  const open = isTradingOpen(contract, now);
  const age = asOfAgeMinutes(row.as_of, now);
  if (!open) {
    return {
      id: contract.id,
      applicable: true,
      open: false,
      ok: true,
      ageMinutes: age,
      allowedMinutes: contract.quoteLagMinutes,
      note: `${contract.id}: рынок закрыт, отставание ${age === null ? '—' : `${String(Math.round(age / 6) / 10).replace('.', ',')} ч`} допустимо`,
    };
  }
  const ok = age !== null && age <= contract.quoteLagMinutes;
  // Один знак после запятой: «10,8 ч», а не «11 ч» — округление до целого
  // скрывает как раз ту разницу, ради которой проверка существует.
  const hours = age === null ? null : String(Math.round(age / 6) / 10).replace('.', ',');
  return {
    id: contract.id,
    applicable: true,
    open: true,
    ok,
    ageMinutes: age,
    allowedMinutes: contract.quoteLagMinutes,
    note:
      age === null
        ? `${contract.id}: рынок открыт, а даты наблюдения нет`
        : `${contract.id}: рынок открыт, цена отстала на ${hours} ч, допустимо ${contract.quoteLagMinutes} мин`,
  };
}
