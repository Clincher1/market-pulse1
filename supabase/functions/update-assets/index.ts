// Public cached_assets updater.
import { closedHistory, previousClosedValue } from "../_shared/asset-history.ts";
import { isFormingBar, parseYahooDaily } from "../_shared/yahoo-chart.ts";
import { serveWithErrorReporting } from "../_shared/observability.ts";
import { ASSET_CONTRACTS, contractFor } from "../_shared/data-contract.ts";
import {
  PRICE_SOURCES,
  afterAttempt,
  gateDecision,
  backoffMs,
  MAX_ATTEMPTS,
  retryAfterFromError,
  shouldRetry,
  sourceSpec,
  statusFromError,
  type SourceState,
} from "../_shared/price-sources.ts";
//
// Security/provenance notes:
// - Twelve Data is read only from the TWELVE_KEY Edge Function secret.
//   There is deliberately no hardcoded fallback key.
// - The shadow slug (update-assets-v2-shadow) never writes cached_assets.
// - The production slug (update-assets) publishes every row that passed
//   validation; a partial failure leaves the failed row untouched instead of
//   freezing the whole cache.
// - Instruments are not silently substituted or rescaled:
//   S&P 500 = index points, daily close (Yahoo Finance ^GSPC);
//   Brent = front-month futures, daily close (NYMEX BZ=F), подписан как
//           фьючерс: это не спот EIA, и одно слово «Brent» их не примиряет;
//   USD/EUR = inverse of the ECB EUR/USD reference rate;
//   BTC = Kraken XBT/USD daily candles (latest UTC candle may be partial);
//   Gold = Twelve Data XAU/USD spot.
// - Один упавший источник больше не замораживает остальные: строки, которые
//   прошли проверку, публикуются, упавшая остаётся прежней со своей старой
//   датой наблюдения. Раньше ответ 502 от FRED останавливал запись всего кэша,
//   и исправление в соседнем ряду не доезжало до сайта.

const FALLBACK_SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const USER_AGENT = "MarketPulseBot/0.4 (+https://market-pulse1-eta.vercel.app; public asset cache)";
const COOLDOWN_MS = 15 * 60 * 1000;
const SPARKLINE_POINTS = 30;

type AnyRecord = Record<string, unknown>;
type Point = { date: string; value: number };
type AssetResult = {
  row: {
    id: string;
    name: string;
    price: string;
    change: number;
    sparkline: number[];
    /**
     * ISO-даты наблюдений, по одной на значение sparkline. Без них ряд нельзя
     * подписать календарём: «третий день роста» и «−3,92 % к какому дню»
     * остаются недоказуемыми.
     */
    spark_dates: string[];
    updated_at: string;
    /**
     * Момент, на который верна цена (дата закрытия для дневных рядов, момент
     * котировки для внутридневных). До миграции 20261030120000 колонки в
     * cached_assets нет, и тогда поле вырезается перед записью.
     */
    as_of: string | null;
  };
  meta: AnyRecord;
};

// Подписи рядов больше не живут копией в писателе. Копия расходилась ровно в
// тот день, когда ряд менял инструмент: 01.11.2026 Brent переехал с одного
// контракта на другой, а слово «Brent» осталось прежним и примиряло два
// разных числа. Теперь единственный источник подписи — контракт данных, и
// публикация сверяет её с ним (см. assertContract в publishRow).
const EXPECTED_NAMES: Record<string, string> = Object.fromEntries(
  ASSET_CONTRACTS.map((contract) => [contract.id, contract.label]),
);

const LIMITS: Record<string, { min: number; max: number; maxAbsChangePct: number }> = {
  "usd-eur": { min: 0.2, max: 3, maxAbsChangePct: 10 },
  sp500: { min: 100, max: 50000, maxAbsChangePct: 20 },
  brent: { min: 1, max: 1000, maxAbsChangePct: 40 },
  gold: { min: 100, max: 50000, maxAbsChangePct: 20 },
  btc: { min: 100, max: 10000000, maxAbsChangePct: 50 },
};

function supabaseUrl(): string {
  return (Deno.env.get("SUPABASE_URL") ?? FALLBACK_SUPABASE_URL).replace(/\/$/, "");
}

function serviceKey(): string {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");
  return key;
}

async function restJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = serviceKey();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 900)}`);
  return text ? JSON.parse(text) as unknown : null;
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    headers: {
      Accept: "application/json,text/csv,text/xml,*/*",
      "User-Agent": USER_AGENT,
      ...headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    // Retry-After — единственное, что источник говорит нам человеческим
    // языком: «подожди столько». Терять его нельзя, иначе мы вернёмся через
    // свои 15 минут и получим тот же отказ.
    const retryAfter = response.headers.get("retry-after");
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}${retryAfter ? ` retry-after=${retryAfter}` : ""}`);
  }
  return text;
}

/**
 * Чарт Yahoo с двумя хостами.
 *
 * query1 и query2 — разные узлы одного сервиса. Раньше при отказе первого
 * второго не было вовсе: ряд просто не обновлялся до следующего запуска.
 * Теперь запрос уходит на второй хост, а исход пишется в журнал запуска.
 * Повтор — не больше одного раза: три попытки подряд к сервису, который уже
 * сказал «нет», выглядят как атака и приводят к блокировке по IP.
 */
async function fetchYahooChart(url: string): Promise<{ payload: unknown; host: string; retried: boolean }> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastError: Error | null = null;
  for (let index = 0; index < hosts.length; index += 1) {
    const host = hosts[index];
    const target = url.replace(/https:\/\/query1\.finance\.yahoo\.com/, `https://${host}`);
    try {
      return { payload: await fetchJson(target), host, retried: index > 0 };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Пауза между хостами разная для каждого запуска: одновременные запросы
      // из одного изолята не должны идти в ногу.
      if (index < hosts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 + Math.floor(Math.random() * 600)));
      }
    }
  }
  throw lastError ?? new Error("Yahoo chart: no host answered");
}

/**
 * Сколько запуск готов ждать повтора.
 *
 * Не «сколько угодно»: запуск живёт в чужих лимитах по времени. Если
 * источник просит подождать дольше, чем этот запас, повторять сейчас нельзя —
 * это и есть поведение, за которое банят. В таком случае ошибка уходит в шлюз
 * вместе с Retry-After, и пауза ставится на всё сказанное время.
 */
const RETRY_WAIT_BUDGET_MS = 6000;

function abortableSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Запрос с единственным осмысленным повтором.
 *
 * Раньше здесь была одна попытка: 429 или 503 от источника означали, что ряд
 * не обновится все следующие пятнадцать минут — при том, что сервис через
 * полсекунды отвечал нормально. Повтор только на временных ошибках (429, 5xx,
 * обрыв, таймаут), не больше двух попыток, со случайным разбросом, чтобы
 * одновременные запросы не повторялись синхронным залпом.
 */
async function requestWithRetry(url: string, headers: Record<string, string> = {}): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchText(url, headers);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = statusFromError(lastError);
      if (attempt >= MAX_ATTEMPTS || !shouldRetry(status, lastError.message)) throw lastError;
      // Источник мог назвать свою паузу — она главнее нашего бэкоффа.
      const waitMs = Math.max(backoffMs(attempt), (retryAfterFromError(lastError) ?? 0) * 1000);
      if (waitMs > RETRY_WAIT_BUDGET_MS) throw lastError;
      console.warn(
        `повтор ${attempt + 1}/${MAX_ATTEMPTS} через ${waitMs} мс: ${url} — ${lastError.message.slice(0, 160)}`,
      );
      await abortableSleep(waitMs);
    }
  }
  throw lastError ?? new Error("запрос не выполнен");
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  return JSON.parse(await requestWithRetry(url, headers)) as unknown;
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || text === ".") return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sortedPoints(points: Point[]): Point[] {
  const byDate = new Map<string, number>();
  for (const point of points) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0) {
      byDate.set(point.date, point.value);
    }
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatIndex(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatUsd0(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatUsd1(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

function formatUsd2(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatFx(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/**
 * `as_of` в строке кэша. Если источник отдал строку, которая не разбирается как
 * дата, в колонку timestamptz её писать нельзя: PostgREST отклонит весь запрос,
 * и кэш останется старым. Тогда честнее null — плитка покажет только время
 * записи, но не соврёт про дату наблюдения.
 */
function asOfValue(value?: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  const parsed = Date.parse(text.length === 10 ? `${text}T00:00:00Z` : text);
  return Number.isFinite(parsed) ? text : null;
}

function makeAsset(input: {
  id: string;
  name: string;
  instrument: string;
  provider: string;
  points: Point[];
  currentPrice?: number;
  previousPrice?: number;
  changePct?: number | null;
  asOf?: string | null;
  format: (value: number) => string;
  updatedAt: string;
  /** Дата бара, который у источника ещё формируется (дневная свеча Kraken). */
  formingBarDate?: string | null;
  extraMeta?: AnyRecord;
}): AssetResult {
  const points = sortedPoints(input.points);
  if (points.length < 8) throw new Error(`${input.id}: only ${points.length} valid price points`);
  const latestPoint = points.at(-1)!;
  const asOf = input.asOf ?? latestPoint.date;
  // История — только закрытые наблюдения (см. _shared/asset-history.ts).
  // Значение цены берётся из кавычки, поэтому отбрасывание бара истории не
  // делает плитку старее: она по-прежнему показывает текущую цену и её момент.
  const history = closedHistory({
    points,
    asOf,
    fetchedAt: input.updatedAt,
    formingBarDate: input.formingBarDate ?? null,
  });
  if (history.points.length < 2) {
    throw new Error(`${input.id}: only ${history.points.length} closed observations`);
  }
  const price = input.currentPrice ?? latestPoint.value;
  // Предыдущее закрытие зависит от того, попала ли цена в историю: если это
  // последнее закрытие — предыдущее на шаг раньше; если цена из кавычки, а бар
  // ещё формируется — предыдущее это и есть последнее закрытие.
  const previous = input.previousPrice ?? previousClosedValue(history.points, latestPoint.date);
  if (!previous || previous <= 0) throw new Error(`${input.id}: missing previous price`);
  const computedChange = ((price - previous) / previous) * 100;
  const change = input.changePct != null && Number.isFinite(input.changePct) ? input.changePct : computedChange;
  const limits = LIMITS[input.id];
  if (limits && (price < limits.min || price > limits.max)) {
    throw new Error(`${input.id}: price ${price} outside plausibility range`);
  }
  if (limits && Math.abs(change) > limits.maxAbsChangePct) {
    throw new Error(`${input.id}: change ${change}% outside plausibility range`);
  }

  // Построение строки — последний рубеж перед записью в кэш. Сверка подписи и
  // смысла даты стоит здесь, а не в тестах: тест ловит расхождение в коде, а
  // эта проверка — ещё и в данных, которые пришли из источника.
  assertContract(input.id, input.name, asOf);

  return {
    row: {
      id: input.id,
      name: input.name,
      price: input.format(price),
      change: round(change, 4),
      sparkline: history.points.slice(-SPARKLINE_POINTS).map((point) => round(point.value, 8)),
      spark_dates: history.points.slice(-SPARKLINE_POINTS).map((point) => point.date),
      updated_at: input.updatedAt,
      as_of: asOfValue(input.asOf ?? latestPoint.date),
    },
    meta: {
      id: input.id,
      instrument: input.instrument,
      provider: input.provider,
      as_of: input.asOf ?? latestPoint.date,
      latest_price: price,
      previous_price: previous,
      change_pct: round(change, 4),
      points: Math.min(history.points.length, SPARKLINE_POINTS),
      history_last_date: history.points.at(-1)?.date ?? null,
      history_dropped: history.dropped,
      ...input.extraMeta,
    },
  };
}

/**
 * Дневные закрытия из публичного чарта Yahoo. Ключа нет, даты точек источник
 * отдаёт сам — значит, подписать ряд календарём можно без догадок.
 */
async function fetchYahooDaily(symbol: string): Promise<{
  points: Point[];
  asOf: string | null;
  formingBarDate: string | null;
  exchange: string | null;
  quoteTime: string | null;
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const chart = await fetchYahooChart(url);
  const series = parseYahooDaily(chart.payload);
  if (chart.retried) console.warn(`Yahoo: ${symbol} отдан резервным хостом ${chart.host}`);
  const now = new Date();
  const forming = isFormingBar(series, now);
  return {
    points: series.points.map((point) => ({ date: point.date, value: point.value })),
    // Момент наблюдения: у незакрытого бара — время котировки, у закрытого —
    // сама дата закрытия. Пустая дата вместо дня наблюдения не подставляется.
    asOf: forming ? series.quoteTime : series.points.at(-1)?.date ?? null,
    formingBarDate: forming ? series.points.at(-1)?.date ?? null : null,
    exchange: series.exchange,
    quoteTime: series.quoteTime,
  };
}

async function fetchSp500(updatedAt: string): Promise<AssetResult> {
  const series = await fetchYahooDaily("^GSPC");
  return makeAsset({
    id: "sp500",
    name: EXPECTED_NAMES.sp500,
    instrument: "S&P 500 index, daily close (Yahoo Finance ^GSPC)",
    provider: "Yahoo Finance",
    points: series.points,
    asOf: series.asOf,
    formingBarDate: series.formingBarDate,
    format: formatIndex,
    updatedAt,
    extraMeta: {
      unit: "index_points",
      exchange: series.exchange,
      quote_time: series.quoteTime,
    },
  });
}

async function fetchBrent(updatedAt: string): Promise<AssetResult> {
  const series = await fetchYahooDaily("BZ=F");
  return makeAsset({
    id: "brent",
    name: EXPECTED_NAMES.brent,
    instrument: "Brent front-month futures, daily close (NYMEX BZ=F) — не спот EIA",
    provider: "Yahoo Finance",
    points: series.points,
    asOf: series.asOf,
    formingBarDate: series.formingBarDate,
    format: formatUsd2,
    updatedAt,
    extraMeta: {
      unit: "USD/barrel",
      exchange: series.exchange,
      quote_time: series.quoteTime,
    },
  });
}

async function fetchUsdEur(updatedAt: string): Promise<AssetResult> {
  const url = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
  const text = await fetchText(url);
  const ecbPoints: Point[] = [];
  const blockPattern = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']>([\s\S]*?)<\/Cube>/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(text)) !== null) {
    const usd = match[2].match(/currency=["']USD["']\s+rate=["']([0-9]+(?:\.[0-9]+)?)["']/);
    const eurUsd = usd ? positiveNumber(usd[1]) : null;
    if (eurUsd) ecbPoints.push({ date: match[1], value: eurUsd });
  }
  const inversePoints = sortedPoints(ecbPoints).map((point) => ({ date: point.date, value: 1 / point.value }));
  const latestEurUsd = sortedPoints(ecbPoints).at(-1)?.value ?? null;
  return makeAsset({
    id: "usd-eur",
    name: EXPECTED_NAMES["usd-eur"],
    instrument: "USD/EUR derived as inverse of ECB EUR/USD reference rate",
    provider: "ECB",
    points: inversePoints,
    format: formatFx,
    updatedAt,
    extraMeta: { unit: "EUR per 1 USD", ecb_eurusd_latest: latestEurUsd },
  });
}

/**
 * Последняя сделка по XBT/USD у Kraken. Публичный документированный интерфейс
 * биржи: тот же хост, что и OHLC, который отвечает без отказов.
 *
 * Ошибка или неожиданная форма ответа — `null`, а не исключение: отсутствие
 * тикера ухудшает подпись (цена станет закрытием свечи), но не должно
 * останавливать публикацию ряда. Что именно попало в цену, видно в
 * `current_price_source` журнала запуска.
 */
async function fetchKrakenLastTrade(): Promise<{ price: number } | null> {
  try {
    const payload = await fetchJson("https://api.Kraken.com/0/public/Ticker?pair=XBTUSD");
    if (!isRecord(payload)) return null;
    if (Array.isArray(payload.error) && payload.error.length) return null;
    if (!isRecord(payload.result)) return null;
    const pairKey = Object.keys(payload.result).find((key) => key !== "last");
    const pair = pairKey ? payload.result[pairKey] : null;
    if (!isRecord(pair) || !Array.isArray(pair.c)) return null;
    const price = positiveNumber(pair.c[0]);
    return price ? { price } : null;
  } catch {
    return null;
  }
}

async function fetchBtc(updatedAt: string): Promise<AssetResult> {
  const url = "https://api.Kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440";
  const payload = await fetchJson(url);
  if (!isRecord(payload)) throw new Error("Kraken returned a non-object response");
  if (Array.isArray(payload.error) && payload.error.length) {
    throw new Error(`Kraken error: ${payload.error.join("; ").slice(0, 300)}`);
  }
  if (!isRecord(payload.result)) throw new Error("Kraken returned no result object");
  const pairKey = Object.keys(payload.result).find((key) => key !== "last");
  const candles = pairKey && Array.isArray(payload.result[pairKey]) ? payload.result[pairKey] as unknown[] : [];
  const points = sortedPoints(candles.map((raw) => {
    const candle = Array.isArray(raw) ? raw : [];
    const epochSeconds = finiteNumber(candle[0]);
    const timestamp = epochSeconds ? new Date(epochSeconds * 1000) : null;
    return {
      date: timestamp ? timestamp.toISOString().slice(0, 10) : "",
      value: positiveNumber(candle[4]) ?? Number.NaN,
    };
  }));
  // Последняя дневная свеча Kraken — текущие сутки: её «закрытие» это последняя
  // сделка, а не закрытие дня. В историю она не идёт, текущая цена остаётся.
  const formingBarDate = updatedAt.slice(0, 10);
  // Плитка «сейчас» не может стоять на суточной свече: её начало — полночь,
  // и в 06:50 UTC сайт показывал цену, наблюдённую семь часов назад, называя
  // её текущей. Котировка берётся из тикера того же Kraken (последняя сделка),
  // история остаётся на закрытиях свечей: у неё своя задача — график.
  const tick = await fetchKrakenLastTrade();
  return makeAsset({
    id: "btc",
    name: EXPECTED_NAMES.btc,
    instrument: "Bitcoin / USD spot (Kraken XBTUSD ticker; history — daily candles)",
    provider: "Kraken",
    points,
    formingBarDate,
    currentPrice: tick?.price,
    // Момент котировки — момент запроса тикера: у Kraken в ответе нет своего
    // времени, и это единственное время, которое мы вправе утверждать.
    // Без тикера подпись остаётся датой свечи, а не выдаёт старое за новое.
    asOf: tick ? updatedAt : undefined,
    format: formatUsd0,
    updatedAt,
    extraMeta: {
      unit: "USD/BTC",
      latest_daily_candle_may_be_partial: true,
      current_price_source: tick ? "kraken-ticker" : "kraken-daily-candle",
    },
  });
}

/**
 * Живая котировка золота (спот XAU/USD) из gold-api.com.
 *
 * Зачем: Twelve Data на бесплатном тарифе отдаёт по XAU/USD последнюю
 * котировку сессии. Замер 11.11.2026 06:50 UTC: на плитке стояла цена с
 * 10.11 20:00 — одиннадцать часов отставания при кроне писателя раз в пять
 * минут. Подписать такое «на 23:00 МСК» честно, но бесполезно.
 *
 * Чем проверено, а не «кажется рабочим». Запрос сделан из самой платформы
 * (pg_net) 11.11.2026 в 07:24 UTC:
 *   `https://api.gold-api.com/price/XAU` → 200,
 *   {"symbol":"XAU","price":4064.0,"updatedAt":"2026-11-11T07:23:59Z"} —
 *   тот же инструмент, что написан на плитке (спот, доллар за унцию).
 * Там же проверен и отброшен вариант с Yahoo: `XAUUSD=X` → 404
 * «No data found, symbol may be delisted», то есть спота в чарте Yahoo нет.
 *
 * Ошибка или неожиданная форма ответа — `null`: ряд не пропадает, цена
 * остаётся из Twelve Data, и в журнале запуска видно, откуда она взялась.
 */
async function fetchGoldSpotQuote(): Promise<{ price: number; at: string } | null> {
  try {
    const payload = await fetchJson("https://api.gold-api.com/price/XAU");
    if (!isRecord(payload)) return null;
    const price = positiveNumber(payload.price);
    const at = typeof payload.updatedAt === "string" ? payload.updatedAt : null;
    if (!price || !at || !Number.isFinite(Date.parse(at))) return null;
    return { price, at: new Date(at).toISOString() };
  } catch (error) {
    console.error("gold: gold-api.com недоступен, котировка остаётся из Twelve Data", error);
    return null;
  }
}

/**
 * Дневные закрытия XAU/USD из Twelve Data.
 *
 * Только `time_series`: кавычку у этого провайдера мы больше не спрашиваем.
 * На бесплатном тарифе quote отдаёт последнюю котировку сессии (11.11 в
 * 06:50 UTC это была цена с 20:00 предыдущего дня), а живая цена теперь
 * приходит из gold-api.com. Два запроса на запуск превращались в 192 запроса
 * в сутки при лимите 800 — теперь один, и не чаще раза в час.
 */
async function fetchGoldSeries(): Promise<{ points: Point[]; lastTwelveDate: string | null }> {
  const key = Deno.env.get("TWELVE_KEY");
  if (!key) throw new Error("Missing TWELVE_KEY secret");
  const payload = await fetchJson(
    "https://api.twelvedata.com/time_series?symbol=XAU%2FUSD&interval=1day&outputsize=30&order=asc&timezone=UTC",
    { Authorization: `apikey ${key}` },
  );
  if (!isRecord(payload)) throw new Error("Twelve Data time_series returned a non-object response");
  if (payload.status === "error") throw new Error(`Twelve Data time_series: ${String(payload.message ?? "error").slice(0, 300)}`);
  const values = Array.isArray(payload.values) ? payload.values : [];
  const points = sortedPoints(values.map((raw) => {
    const row = isRecord(raw) ? raw : {};
    return {
      date: String(row.datetime ?? "").slice(0, 10),
      value: positiveNumber(row.close) ?? Number.NaN,
    };
  }));
  if (points.length < 8) throw new Error(`Twelve Data XAU/USD: only ${points.length} daily closes`);
  return { points, lastTwelveDate: points.at(-1)?.date ?? null };
}

/**
 * История, уже опубликованная на сайте, для запусков между запросами к
 * Twelve Data. Это не заглушка и не «вчерашнее число под сегодняшним»:
 * точки — те же закрытия с теми же датами, что видит человек в графике.
 * Берётся только когда источник истории ещё не «пора спрашивать» по шлюзу.
 */
async function storedGoldHistory(): Promise<Point[]> {
  const rows = (await restJson("cached_assets?select=id,sparkline,spark_dates&id=eq.gold")) as AnyRecord[];
  const row = rows[0];
  const values = Array.isArray(row?.sparkline) ? row!.sparkline as unknown[] : [];
  const dates = Array.isArray(row?.spark_dates) ? row!.spark_dates as unknown[] : [];
  const points = values
    .map((value, index) => ({ date: String(dates[index] ?? "").slice(0, 10), value: Number(value) }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0);
  if (points.length < 8) throw new Error(`золото: в кэше ${points.length} dated points, нужна история`);
  return points;
}

/**
 * Золото: живая котировка от gold-api.com, закрытия — от Twelve Data.
 *
 * Два источника у одного ряда — не роскошь, а разделение обязанностей:
 * на «сейчас» нужна котировка, на график — закрытия. Шлюз спрашивает каждого
 * по его собственному расписанию, поэтому Twelve Data не дёргают каждые
 * пятнадцать минут ради ряда, который меняется раз в сутки.
 */
async function fetchGold(updatedAt: string, options: { historyDue: boolean }): Promise<AssetResult> {
  const live = await fetchGoldSpotQuote();
  const outcomes: Record<string, "ok" | "fail"> = { "gold-api": live ? "ok" : "fail" };

  let points: Point[];
  let historySource: string;
  if (options.historyDue) {
    points = (await fetchGoldSeries()).points;
    historySource = "twelve";
  } else {
    points = await storedGoldHistory();
    historySource = "cache";
  }
  if (live) outcomes["twelve"] = historySource === "twelve" ? "ok" : "fail";
  else if (historySource === "twelve") outcomes["twelve"] = "ok";

  // Дневной бар текущих суток с живой ценой — незакрытый бар: в историю его
  // не пускаем, иначе график покажет сегодняшнюю цену как закрытие дня.
  const liveDay = live ? live.at.slice(0, 10) : null;
  const price = live ? live.price : points.at(-1)!.value;
  const asOf = live ? live.at : points.at(-1)!.date;

  return makeAsset({
    id: "gold",
    name: EXPECTED_NAMES.gold,
    instrument: live
      ? "Gold spot / US Dollar (gold-api.com XAU; история — закрытия Twelve Data)"
      : "Gold spot / US Dollar (Twelve Data XAU/USD)",
    provider: live ? "gold-api.com + Twelve Data" : "Twelve Data",
    points,
    formingBarDate: liveDay,
    currentPrice: price,
    asOf,
    format: formatUsd1,
    updatedAt,
    extraMeta: {
      unit: "USD/troy ounce",
      current_price_source: live ? "gold-api" : "twelve-close",
      history_source: historySource,
      source_outcomes: outcomes,
    },
  });
}

// Колонки as_of (миграция 20261030120000) и spark_dates (20261031193000)
// появляются отдельно от кода. Пока колонки нет, писать её в upsert нельзя:
// PostgREST отклонит всю строку, и кэш перестанет обновляться. Проверяем один
// раз за запуск и запоминаем ответ.
type StoredColumns = { asOf: boolean; sparkDates: boolean };
let storedColumns: StoredColumns | null = null;

async function supports(select: string): Promise<boolean> {
  try {
    await restJson(`cached_assets?select=${select}&limit=1`);
    return true;
  } catch {
    return false;
  }
}

async function supportedColumns(): Promise<StoredColumns> {
  if (storedColumns) return storedColumns;
  const sparkDates = await supports("as_of,spark_dates");
  const asOf = sparkDates ? true : await supports("as_of");
  storedColumns = { asOf, sparkDates };
  return storedColumns;
}

/**
 * Ряд обязан выйти под тем именем и с тем смыслом даты, которые записаны в
 * контракте. Это не формальность: подпись и `as_of` — то, что читает человек
 * и по чему судит проверка. Расхождение здесь означает, что писатель и экран
 * договорились между собой мимо контракта, и никакая проверка снаружи этого
 * не заметит.
 */
function assertContract(id: string, name: string, asOf: string | null): void {
  const contract = contractFor(id);
  if (!contract) throw new Error(`ряда ${id} нет в контракте данных: подпись и смысл as_of неизвестны`);
  if (contract.label !== name) {
    throw new Error(`подпись ряда ${id} — «${name}», по контракту «${contract.label}»`);
  }
  if (contract.asOfKind !== 'candle-open' && !asOf) {
    throw new Error(`ряд ${id} публикуется без as_of, а по контракту это ${contract.asOfKind}`);
  }
}

/**
 * Состояние шлюза из базы. Таблица появляется миграцией отдельно от кода:
 * пока её нет, шлюз работает как «всё можно», а не падает — иначе выкат
 * функции раньше миграции остановил бы публикацию цен.
 */
async function readSourceStates(): Promise<Map<string, SourceState>> {
  try {
    const rows = (await restJson(
      "asset_source_state?select=source_id,last_attempt_at,last_ok_at,last_status,consecutive_failures,paused_until,requests_today,day,last_error",
    )) as SourceState[];
    return new Map(rows.map((row) => [String(row.source_id), row]));
  } catch (error) {
    console.error("asset_source_state недоступна, шлюз работает без памяти", error);
    return new Map();
  }
}

/** Запись состояния. Отказ записи не должен валить публикацию: цены важнее учёта. */
async function writeSourceStates(states: SourceState[]): Promise<void> {
  if (!states.length) return;
  try {
    await restJson("asset_source_state?on_conflict=source_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(states.map((state) => ({ ...state, updated_at: new Date().toISOString() }))),
    });
  } catch (error) {
    console.error("asset_source_state: состояние шлюза не записано", error);
  }
}

async function isFreshNewCache(): Promise<boolean> {
  const rows = await restJson("cached_assets?select=id,name,updated_at") as Array<{ id: string; name: string; updated_at: string }>;
  const expected = Object.entries(EXPECTED_NAMES).map(([id, name]) => rows.find((row) => row.id === id && row.name === name));
  if (expected.some((row) => !row)) return false;
  const oldest = Math.min(...expected.map((row) => new Date(row!.updated_at).getTime()));
  return Number.isFinite(oldest) && Date.now() - oldest < COOLDOWN_MS;
}

// --- Cron authorization (2026-10-22 hardening) ---
// Accepts either the service-role bearer token or an `x-cron-secret` header
// equal to the CRON_SECRET function secret. Anything else gets 401, so the
// public URL alone can no longer trigger writes or provider spend.
// Deploy order matters: set CRON_SECRET and update pg_cron FIRST
// (see docs/BACKEND_HARDENING_DEPLOY.md).
function isAuthorizedCron(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_KEY") ?? "";
  if (serviceRole && auth === `Bearer ${serviceRole}`) return true;
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || !provided || provided.length !== cronSecret.length) return false;
  let diff = 0;
  for (let i = 0; i < cronSecret.length; i++) diff |= provided.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  return diff === 0;
}

serveWithErrorReporting("update-assets", async (request) => {
  if (!isAuthorizedCron(request)) {
    return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const requestUrl = new URL(request.url);
  const isShadow = requestUrl.pathname.endsWith("/update-assets-v2-shadow");
  const publish = !isShadow;
  const updatedAt = new Date().toISOString();

  try {
    if (publish && await isFreshNewCache()) {
      return Response.json({
        success: true,
        skipped: true,
        reason: "asset_cache_cooldown",
        cooldown_minutes: COOLDOWN_MS / 60000,
        publish,
      });
    }

    // --- Шлюз к источникам ------------------------------------------------
    //
    // Каждый источник получает решение ДО запроса: пауза после отказов,
    // исчерпанная квота на сутки и минимальный интервал. Раньше проверялся
    // только таймаут, и источник, трижды ответивший 429, спрашивался снова
    // через 15 минут. «Не пытались» здесь — не отказ источника, а наше
    // расписание, и в отчёте запуска оно названо своей причиной.
    const gateNow = new Date();
    const states = await readSourceStates();
    const decisions = new Map<string, ReturnType<typeof gateDecision>>();
    for (const source of PRICE_SOURCES) {
      decisions.set(source.id, gateDecision(source, states.get(source.id) ?? null, gateNow));
    }
    const nextStates = new Map<string, SourceState>();
    const recordAttempt = (sourceId: string, ok: boolean, status: number | null, error?: string | null, retryAfterSeconds?: number | null) => {
      const spec = sourceSpec(sourceId);
      if (!spec) return;
      const base = nextStates.get(sourceId) ?? states.get(sourceId) ?? null;
      nextStates.set(sourceId, afterAttempt(spec, base, gateNow, { ok, status, error: error ?? null, retryAfterSeconds: retryAfterSeconds ?? null }));
    };

    const tasks: Array<{ id: string; sources: string[]; load: () => Promise<AssetResult> }> = [
      { id: "usd-eur", sources: ["ecb"], load: () => fetchUsdEur(updatedAt) },
      { id: "sp500", sources: ["yahoo"], load: () => fetchSp500(updatedAt) },
      { id: "brent", sources: ["yahoo"], load: () => fetchBrent(updatedAt) },
      {
        id: "gold",
        sources: ["gold-api"],
        // История золота нужна раз в сутки, поэтому Twelve Data спрашивают,
        // только когда шлюз разрешил, а в промежутках берут уже опубликованные
        // закрытия. Источник истории при этом не «обязательный»: его пауза не
        // останавливает живую цену.
        load: () => fetchGold(updatedAt, { historyDue: decisions.get("twelve")?.allowed ?? false }),
      },
      { id: "btc", sources: ["kraken"], load: () => fetchBtc(updatedAt) },
    ];
    const due = tasks.filter((task) => task.sources.every((sourceId) => decisions.get(sourceId)?.allowed));
    const skippedByGate = tasks
      .filter((task) => !due.includes(task))
      .map((task) => ({
        id: task.id,
        reasons: task.sources
          .filter((sourceId) => !decisions.get(sourceId)?.allowed)
          .map((sourceId) => decisions.get(sourceId)?.note ?? `${sourceId}: нет решения`),
      }));

    const settled = await Promise.allSettled(due.map((task) => task.load()));
    const results: AssetResult[] = [];
    const errors: AnyRecord[] = [];
    settled.forEach((result, index) => {
      const task = due[index];
      if (result.status === "fulfilled") {
        results.push(result.value);
        // Ряд может сообщить, какие источники реально ответили (у золота их
        // два, и падение запасного не должно продлевать паузу основного).
        const outcomes = result.value.meta.source_outcomes as Record<string, string> | undefined;
        if (outcomes) {
          for (const [sourceId, outcome] of Object.entries(outcomes)) {
            recordAttempt(sourceId, outcome === "ok", outcome === "ok" ? 200 : null, outcome === "ok" ? null : "источник не ответил");
          }
        } else {
          for (const sourceId of task.sources) recordAttempt(sourceId, true, 200);
        }
      } else {
        const reason = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
        errors.push({ id: task.id, error: reason.message.slice(0, 700) });
        const status = statusFromError(reason);
        const retryAfterSeconds = retryAfterFromError(reason);
        for (const sourceId of task.sources) recordAttempt(sourceId, false, status, reason.message, retryAfterSeconds);
      }
    });
    await writeSourceStates([...nextStates.values()]);

    // Все источники упали — публиковать нечего, и ответ должен быть ошибкой.
    if (!results.length) {
      return Response.json({
        success: false,
        publish,
        published: false,
        published_ids: [] as string[],
        assets_ok: 0,
        assets_total: tasks.length,
        errors,
      }, { status: 502 });
    }

    const order = ["usd-eur", "sp500", "brent", "gold", "btc"];
    results.sort((a, b) => order.indexOf(a.row.id) - order.indexOf(b.row.id));
    const columns = publish ? await supportedColumns() : { asOf: false, sparkDates: false };
    if (publish) {
      const rows = results.map((result) => {
        const { as_of: asOf, spark_dates: sparkDates, ...rest } = result.row;
        return {
          ...rest,
          ...(columns.asOf ? { as_of: asOf } : {}),
          ...(columns.sparkDates ? { spark_dates: sparkDates } : {}),
        };
      });
      await restJson("cached_assets?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
    }

    return Response.json({
      // Частичный успех — не успех: `partial` остаётся видимым, а упавший ряд
      // не переписывается и сохраняет свою прежнюю дату наблюдения.
      success: errors.length === 0,
      partial: errors.length > 0,
      publish,
      published: publish,
      published_ids: publish ? results.map((result) => result.row.id) : [],
      // Видно, попала ли дата наблюдения в кэш: без колонки она остаётся только
      // в ответе функции и до плитки не доходит.
      as_of_stored: columns.asOf,
      spark_dates_stored: columns.sparkDates,
      assets_ok: results.length,
      assets_total: tasks.length,
      // Почему часть рядов не обновлялась: пауза, квота или интервал.
      // Пусто — значит спрашивали все пять.
      skipped_by_gate: skippedByGate,
      sources: PRICE_SOURCES.map((source) => ({
        id: source.id,
        decision: decisions.get(source.id)?.reason ?? "unknown-source",
        note: decisions.get(source.id)?.note ?? null,
        requests_today: (nextStates.get(source.id) ?? states.get(source.id))?.requests_today ?? 0,
        budget: source.dailyBudget,
        failures: (nextStates.get(source.id) ?? states.get(source.id))?.consecutive_failures ?? 0,
        paused_until: (nextStates.get(source.id) ?? states.get(source.id))?.paused_until ?? null,
      })),
      assets: results.map((result) => result.meta),
      rows: results.map((result) => result.row),
      errors,
    }, { status: errors.length ? 207 : 200 });
  } catch (error) {
    return Response.json({
      success: false,
      publish,
      published: false,
      error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
    }, { status: 500 });
  }
});
