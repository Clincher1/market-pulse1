// Public cached_assets updater.
import { GOLD_OBSERVED_INSTRUMENT, GOLD_OBSERVED_LABEL, goldQuote, goldHistory } from "../_shared/gold-observed.ts";
import { closedHistory, previousClosedValue } from "../_shared/asset-history.ts";
import { isFormingBar, parseYahooDaily } from "../_shared/yahoo-chart.ts";
import { fetchBrentDaily, parseStooqDaily, stooqBrentDailyUrl } from "../_shared/stooq-daily.mjs";
import { serveWithErrorReporting } from "../_shared/observability.ts";
import { ASSET_CONTRACTS, contractFor } from "../_shared/data-contract.ts";
import {
  effectiveSources,
  slotById,
  SLOTS,
  type SlotPreference,
} from "../_shared/slots.ts";
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
// - Gold uses only the keyless gold-api.com endpoint; no restricted history fallback.
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
//   Gold = gold-api.com XAU/USD spot; our last observation per completed UTC day.
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
    change: number | null;
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
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, { signal: AbortSignal.timeout(30000), ...init, headers });
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

export function makeAsset(input: {
  id: string;
  name: string;
  instrument: string;
  provider: string;
  points: Point[];
  currentPrice?: number;
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
  // Цена и процент всегда описывают один инструмент: live-котировка сравнивается
  // с последней закрытой точкой того же ряда; если цена сама является закрытием,
  // база сдвигается на закрытие перед ним.
  const previous = previousClosedValue(history.points, asOf);
  if (!previous || previous <= 0) throw new Error(`${input.id}: missing previous price`);
  const change = ((price - previous) / previous) * 100;
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
  sourceUrl: string;
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const chart = await fetchYahooChart(url);
  const sourceUrl = url.replace("query1.finance.yahoo.com", chart.host);
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
    sourceUrl,
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

async function fetchStooqBrentDaily() {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 86400000);
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const sourceUrl = stooqBrentDailyUrl(day(start), day(end));
  const csv = await fetchText(sourceUrl, { Accept: "text/csv" });
  const utcToday = new Date().toISOString().slice(0, 10);
  const points = parseStooqDaily(csv).filter((point) => point.date < utcToday);
  if (points.length < 2) throw new Error("Stooq returned fewer than two closed Brent daily bars");
  return {
    points,
    asOf: points.at(-1)?.date ?? null,
    formingBarDate: null,
    exchange: "NYMEX",
    quoteTime: null,
    sourceUrl,
  };
}

async function fetchBrent(
  updatedAt: string,
  sourceId = "yahoo",
  stooqAllowed = true,
): Promise<AssetResult> {
  const loaded = await fetchBrentDaily({
    sourceId,
    stooqAllowed,
    fetchYahoo: () => fetchYahooDaily("BZ=F"),
    fetchStooq: fetchStooqBrentDaily,
  });
  const series = loaded.series;
  return makeAsset({
    id: "brent",
    name: EXPECTED_NAMES.brent,
    instrument: loaded.sourceRole === "fallback"
      ? "Brent front-month futures (NYMEX BZ=F): Stooq QA.F fallback, last closed daily price only — не спот EIA"
      : "Brent front-month futures (NYMEX BZ=F): live quote against the last closed daily point — не спот EIA",
    provider: loaded.provider,
    points: series.points,
    asOf: series.asOf,
    formingBarDate: series.formingBarDate,
    format: formatUsd2,
    updatedAt,
    extraMeta: {
      unit: "USD/barrel",
      exchange: series.exchange,
      quote_time: series.quoteTime,
      source_url: series.sourceUrl ?? "https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?range=3mo&interval=1d",
      source_role: loaded.sourceRole,
      ...(loaded.sourceOutcomes ? { source_outcomes: loaded.sourceOutcomes } : {}),
    },
  });
}

/**
 * BTC с выбранной владельцем биржи.
 *
 * Три источника — три площадки, и это не одно и то же число: спот BTC/USD на
 * Kraken, на Coinbase и пара BTC/USDT на Binance расходятся на десятки
 * долларов. Поэтому подпись и провайдер меняются вместе с источником, иначе
 * сайт молча выдавал бы цену одной биржи за цену другой.
 *
 * Значение по умолчанию — Kraken: официальный интерфейс и уже проверенный
 * разбор. Остальные два включаются только выбором владельца.
 */
async function fetchBtcBySource(sourceId: string, updatedAt: string): Promise<AssetResult> {
  if (sourceId === "kraken") return fetchBtc(updatedAt);
  if (sourceId === "coinbase") return fetchBtcCoinbase(updatedAt);
  if (sourceId === "binance") return fetchBtcBinance(updatedAt);
  throw new Error(`BTC: источник ${sourceId} не описан`);
}

async function fetchBtcCoinbase(updatedAt: string): Promise<AssetResult> {
  const candles = await fetchJson("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400");
  if (!Array.isArray(candles)) throw new Error("Coinbase candles: не массив");
  // Coinbase отдаёт [время, low, high, open, close, volume] и самые свежие
  // первыми. Закрытие — пятый элемент.
  const points = sortedPoints(candles.map((raw) => {
    const candle = Array.isArray(raw) ? raw : [];
    const seconds = finiteNumber(candle[0]);
    return {
      date: seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : "",
      value: positiveNumber(candle[4]) ?? Number.NaN,
    };
  }));
  if (points.length < 8) throw new Error(`Coinbase candles: всего ${points.length} закрытий`);
  const spot = await fetchJson("https://api.coinbase.com/v2/prices/BTC-USD/spot");
  const amount = isRecord(spot) && isRecord(spot.data) ? positiveNumber(spot.data.amount) : null;
  return makeAsset({
    id: "btc",
    name: EXPECTED_NAMES.btc,
    instrument: "Bitcoin / USD spot (Coinbase BTC-USD; history — daily candles)",
    provider: "Coinbase",
    points,
    // Дневная свеча текущих суток ещё не закрыта: её «закрытие» — последняя
    // сделка, и в историю она не идёт.
    formingBarDate: updatedAt.slice(0, 10),
    currentPrice: amount ?? undefined,
    asOf: amount ? updatedAt : undefined,
    format: formatUsd0,
    updatedAt,
    extraMeta: {
      unit: "USD/BTC",
      exchange: "coinbase",
      latest_daily_candle_may_be_partial: true,
      current_price_source: amount ? "coinbase-spot" : "coinbase-daily-candle",
    },
  });
}

async function fetchBtcBinance(updatedAt: string): Promise<AssetResult> {
  const klines = await fetchJson("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=30");
  if (!Array.isArray(klines)) throw new Error("Binance klines: не массив");
  // [openTime, open, high, low, close, volume, closeTime, ...]; открытие — 0,
  // закрытие — 4.
  const points = sortedPoints(klines.map((raw) => {
    const row = Array.isArray(raw) ? raw : [];
    const milliseconds = finiteNumber(row[0]);
    return {
      date: milliseconds ? new Date(milliseconds).toISOString().slice(0, 10) : "",
      value: positiveNumber(row[4]) ?? Number.NaN,
    };
  }));
  if (points.length < 8) throw new Error(`Binance klines: всего ${points.length} закрытий`);
  const ticker = await fetchJson("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
  const price = isRecord(ticker) ? positiveNumber(ticker.price) : null;
  return makeAsset({
    id: "btc",
    name: EXPECTED_NAMES.btc,
    instrument: "Bitcoin / USDT spot (Binance BTCUSDT; USDT — не доллар, разница подписана)",
    provider: "Binance",
    points,
    formingBarDate: updatedAt.slice(0, 10),
    currentPrice: price ?? undefined,
    asOf: price ? updatedAt : undefined,
    format: formatUsd0,
    updatedAt,
    extraMeta: {
      unit: "USDT/BTC",
      exchange: "binance",
      quote_asset: "USDT",
      latest_daily_candle_may_be_partial: true,
      current_price_source: price ? "binance-ticker" : "binance-daily-candle",
    },
  });
}

/**
 * USD/EUR от Frankfurter — зеркала того же справочного курса ЕЦБ.
 *
 * Числа совпадают с ЕЦБ до последнего знака, отличается только адрес. Это и
 * есть замена: когда сайт ЕЦБ не отвечает, курс берётся здесь, а подпись
 * называет, откуда он пришёл.
 */
async function fetchUsdEurFrankfurter(updatedAt: string): Promise<AssetResult> {
  const till = new Date();
  const from = new Date(till.getTime() - 90 * 24 * 60 * 60 * 1000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const payload = await fetchJson(`https://api.frankfurter.app/${iso(from)}..${iso(till)}?from=EUR&to=USD`);
  if (!isRecord(payload) || !isRecord(payload.rates)) throw new Error("Frankfurter: нет rates");
  const eurUsd: Point[] = Object.entries(payload.rates)
    .map(([date, rates]) => ({
      date,
      value: isRecord(rates) ? positiveNumber(rates.USD) ?? Number.NaN : Number.NaN,
    }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0);
  if (eurUsd.length < 8) throw new Error(`Frankfurter: всего ${eurUsd.length} курсов`);
  const sorted = sortedPoints(eurUsd);
  return makeAsset({
    id: "usd-eur",
    name: EXPECTED_NAMES["usd-eur"],
    instrument: "USD/EUR derived as inverse of ECB EUR/USD reference rate (via Frankfurter)",
    provider: "Frankfurter (курс ЕЦБ)",
    points: sorted.map((point) => ({ date: point.date, value: 1 / point.value })),
    format: formatFx,
    updatedAt,
    extraMeta: {
      unit: "EUR per 1 USD",
      mirror_of: "ecb",
      ecb_eurusd_latest: sorted.at(-1)?.value ?? null,
    },
  });
}

async function fetchUsdEurBySource(sourceId: string, updatedAt: string): Promise<AssetResult> {
  if (sourceId === "ecb") return fetchUsdEur(updatedAt);
  if (sourceId === "frankfurter") return fetchUsdEurFrankfurter(updatedAt);
  throw new Error(`USD/EUR: источник ${sourceId} не описан`);
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

/** Live gold and our own observed history share one source, unit and UTC calendar. */
export async function fetchGold(updatedAt: string, options: { publish: boolean }): Promise<AssetResult> {
  // No fallback to restricted data. On failure the old *new-source* cache stays dated.
  const live = goldQuote(await fetchJson("https://api.gold-api.com/price/XAU"), updatedAt);
  let points: Point[] = [];
  let historyError: string | null = null;
  try {
    if (options.publish) {
      await restJson("rpc/record_gold_observation", {
        method: "POST", body: JSON.stringify({ p_price: live.price, p_at: live.at }),
      });
    }
    points = goldHistory(await restJson(
      `asset_price_snapshots_v2?select=instrument_id,observation_date,price&instrument_id=eq.${GOLD_OBSERVED_INSTRUMENT}&observation_date=lt.${live.at.slice(0, 10)}&order=observation_date.desc&limit=30`,
    ), live.at, updatedAt);
  } catch (error) {
    historyError = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    console.warn("gold: live price valid; observed history unavailable", historyError);
  }
  const previous = points.at(-1)?.value ?? null;
  const change = previous ? round((live.price / previous - 1) * 100, 4) : null;
  if (change !== null && Math.abs(change) > LIMITS.gold.maxAbsChangePct) {
    throw new Error("gold: observed change outside plausibility range");
  }
  return {
    row: { id: "gold", name: EXPECTED_NAMES.gold, price: formatUsd1(live.price), change,
      sparkline: points.map(p => round(p.value, 8)), spark_dates: points.map(p => p.date),
      as_of: live.at, updated_at: updatedAt },
    meta: { id: "gold", provider: GOLD_OBSERVED_LABEL, instrument: GOLD_OBSERVED_INSTRUMENT,
      latest_price: live.price, previous_price: previous, change_pct: change, as_of: live.at,
      points: points.length, history_last_date: points.at(-1)?.date ?? null,
      history_method: "last_received_quote_per_completed_utc_day", history_error: historyError,
      source_outcomes: { "gold-api": "ok" } },
  };
}

// Колонки as_of (миграция 20261030120000) и spark_dates (20261031193000)
// появляются отдельно от кода. Пока колонки нет, писать её в upsert нельзя:
// PostgREST отклонит всю строку, и кэш перестанет обновляться. Проверяем один
// раз за запуск и запоминаем ответ.
type StoredColumns = { asOf: boolean; sparkDates: boolean; sourceLabel: boolean };
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
  // Подпись источника появляется в кэше отдельной колонкой. Без неё плитка не
  // может сказать, чья цена показана, — а при выборе источника владельцем это
  // уже не мелочь.
  const sourceLabel = await supports("source_label");
  storedColumns = { asOf, sparkDates, sourceLabel };
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

/**
 * Выбор владельца: какие источники слот спрашивает первыми.
 *
 * Читается каждый запуск, поэтому смена источника не требует выката — этого и
 * хотел владелец. Ошибка чтения не валит публикацию: с пустым ответом
 * действует порядок по умолчанию, то есть поведение до выбора.
 */
async function readSlotPreferences(): Promise<SlotPreference[]> {
  try {
    const rows = (await restJson(
      "source_preferences?select=slot_id,source_id,priority,enabled",
    )) as AnyRecord[];
    return rows.map((row) => ({
      slot_id: String(row.slot_id ?? ""),
      source_id: String(row.source_id ?? ""),
      priority: Number(row.priority ?? 1),
      enabled: row.enabled !== false,
    }));
  } catch (error) {
    console.warn("слоты: предпочтения не прочитаны, действует порядок по умолчанию", error);
    return [];
  }
}

/**
 * Копия реестра слотов в базе.
 *
 * Зачем копия, если реестр есть в коде: страница состояния читает базу
 * анонимным ключом и не может импортировать код функции. Расхождение копии с
 * кодом ловит проверка slots_registry — то есть отставшая синхронизация
 * становится видимой, а не тихой.
 */
async function syncSlotRegistry(): Promise<void> {
  try {
    const rows = SLOTS.map((slot) => ({
      slot_id: slot.id,
      number: slot.number,
      section: slot.section,
      title: slot.title,
      kind: slot.kind,
      columns: slot.columns,
      can_choose: slot.canChoose,
      sources: slot.sources,
      note: slot.note,
      updated_at: new Date().toISOString(),
    }));
    await restJson("data_slot_registry?on_conflict=slot_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  } catch (error) {
    console.error("слоты: реестр не синхронизирован с базой", error);
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

    // --- Слоты и выбор владельца -----------------------------------------
    //
    // Каждый ряд на сайте — это слот из реестра со своим номером. Источник для
    // слота берётся из `source_preferences`: выбор владельца идёт первым,
    // остальные остаются запасными, выключенный убирается совсем. Если ни один
    // источник слота сейчас нельзя спрашивать (пауза, квота, расписание) —
    // слот честно выпадает, и причина называется в ответе, а не замалчивается.
    const preferences = await readSlotPreferences();
    // Копия реестра в базе обновляется здесь же: страница состояния показывает
    // номера и выбор без выката, а проверка slots_registry сверяет копию с
    // кодом. Пишем до публикации, чтобы отчёт был про актуальный реестр.
    await syncSlotRegistry();

    const plans: Array<{ slotId: string; load: (sourceId: string) => Promise<AssetResult> }> = [
      { slotId: "price.usd-eur", load: (sourceId) => fetchUsdEurBySource(sourceId, updatedAt) },
      { slotId: "price.sp500", load: () => fetchSp500(updatedAt) },
      { slotId: "price.brent", load: (sourceId) => fetchBrent(updatedAt, sourceId, decisions.get("stooq")?.allowed ?? false) },
      {
        slotId: "price.gold",
        load: () => fetchGold(updatedAt, { publish }),
      },
      { slotId: "price.btc", load: (sourceId) => fetchBtcBySource(sourceId, updatedAt) },
    ];

    const slotReport: AnyRecord[] = [];
    const due: Array<{ slotId: string; assetId: string; sourceId: string; load: () => Promise<AssetResult> }> = [];
    const skippedByGate: AnyRecord[] = [];

    for (const plan of plans) {
      const slot = slotById(plan.slotId);
      if (!slot) {
        skippedByGate.push({ slot_id: plan.slotId, reasons: ["слот не описан в реестре"] });
        continue;
      }
      // Порядок с учётом выбора владельца. Источники, которых нет в реестре
      // квот, не спрашиваются вовсе: у них нет ни квоты, ни паузы.
      const order = effectiveSources(slot, preferences).filter((source) => sourceSpec(source.id));
      // «Не пора по интервалу» — это наше расписание, а не отказ источника.
      // Запасной путь в таком случае брать нельзя: иначе BTC прыгал бы между
      // биржами через запуск, и график складывался бы из разных площадок.
      // Запасной включается только когда основной действительно недоступен:
      // пауза после отказов или исчерпанная квота.
      const primary = order[0];
      const primaryDecision = primary ? decisions.get(primary.id) : null;
      const usable = primaryDecision?.allowed
        ? primary
        : primaryDecision?.reason === 'paused' || primaryDecision?.reason === 'budget'
          ? order.find((source) => source !== primary && decisions.get(source.id)?.allowed)
          : undefined;
      const assetId = slot.sources.length ? plan.slotId.replace(/^price\./, "") : plan.slotId;
      if (!usable) {
        const reasons = order.length
          ? order.map((source) => decisions.get(source.id)?.note ?? `${source.id}: нет решения`)
          : ["все источники слота выключены владельцем"];
        skippedByGate.push({ slot_id: plan.slotId, number: slot.number, reasons });
        slotReport.push({ number: slot.number, slot_id: plan.slotId, source: null, why: "не спрашивали: " + reasons.join("; ") });
        continue;
      }
      slotReport.push({
        number: slot.number,
        slot_id: plan.slotId,
        source: usable.id,
        why: preferences.some((row) => row.slot_id === slot.id && row.source_id === usable.id && row.enabled)
          ? "выбран владельцем"
          : "по умолчанию",
      });
      due.push({ slotId: plan.slotId, assetId, sourceId: usable.id, load: () => plan.load(usable.id) });
    }

    // No request was due: this is pacing/backoff, not five failed requests.
    // Keep every cached timestamp untouched and explain each gated slot.
    if (!due.length) {
      return Response.json({
        success: true,
        skipped: true,
        reason: "all_sources_gated",
        publish,
        published: false,
        published_ids: [],
        assets_ok: 0,
        assets_total: plans.length,
        skipped_by_gate: skippedByGate,
        slots: slotReport,
        errors: [],
      });
    }

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
          recordAttempt(task.sourceId, true, 200);
        }
      } else {
        const reason = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
        errors.push({ id: task.assetId, slot_id: task.slotId, source: task.sourceId, error: reason.message.slice(0, 700) });
        const status = statusFromError(reason);
        const retryAfterSeconds = retryAfterFromError(reason);
        const sourceOutcomes = (reason as Error & { sourceOutcomes?: Record<string, string> }).sourceOutcomes;
        if (sourceOutcomes) {
          for (const [sourceId, outcome] of Object.entries(sourceOutcomes)) {
            recordAttempt(sourceId, outcome === "ok", outcome === "ok" ? 200 : status, outcome === "ok" ? null : reason.message, retryAfterSeconds);
          }
        } else {
          recordAttempt(task.sourceId, false, status, reason.message, retryAfterSeconds);
        }
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
        assets_total: plans.length,
        skipped_by_gate: skippedByGate,
        slots: slotReport,
        errors,
      }, { status: 502 });
    }

    const order = ["usd-eur", "sp500", "brent", "gold", "btc"];
    results.sort((a, b) => order.indexOf(a.row.id) - order.indexOf(b.row.id));
    const columns = publish ? await supportedColumns() : { asOf: false, sparkDates: false, sourceLabel: false };
    if (publish) {
      const rows = results.map((result) => {
        const { as_of: asOf, spark_dates: sparkDates, ...rest } = result.row;
        return {
          ...rest,
          ...(columns.asOf ? { as_of: asOf } : {}),
          ...(columns.sparkDates ? { spark_dates: sparkDates } : {}),
          // Провайдер из метаданных ряда: именно он и есть «кто ответил».
          ...(columns.sourceLabel ? { source_label: String(result.meta.provider ?? "") || null } : {}),
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
      source_label_stored: columns.sourceLabel,
      assets_ok: results.length,
      assets_total: plans.length,
      // Почему часть рядов не обновлялась: пауза, квота или интервал.
      // Пусто — значит спрашивали все пять.
      skipped_by_gate: skippedByGate,
      // Какой источник получил каждый слот в этом запуске и почему именно он.
      // Это то, что владелец видит на странице состояния: не «в коде написано»,
      // а «в последнем запуске спросили вот это».
      slots: slotReport,
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
