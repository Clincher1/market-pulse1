// Public cached_assets updater.
import { serveWithErrorReporting } from "../_shared/observability.ts";
//
// Security/provenance notes:
// - Twelve Data is read only from the TWELVE_KEY Edge Function secret.
//   There is deliberately no hardcoded fallback key.
// - The shadow slug (update-assets-v2-shadow) never writes cached_assets.
// - The production slug (update-assets) publishes all five rows only after
//   every provider response has passed validation; partial failures leave
//   the previous public cache untouched.
// - Instruments are not silently substituted or rescaled:
//   S&P 500 = FRED SP500 index points;
//   Brent = FRED/EIA Brent spot USD/barrel;
//   USD/EUR = inverse of the ECB EUR/USD reference rate;
//   BTC = Kraken XBT/USD daily candles (latest UTC candle may be partial);
//   Gold = Twelve Data XAU/USD spot.

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

const EXPECTED_NAMES: Record<string, string> = {
  "usd-eur": "USD/EUR",
  sp500: "S&P 500",
  brent: "Brent",
  gold: "Gold",
  btc: "BTC",
};

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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  return JSON.parse(await fetchText(url, headers)) as unknown;
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
  extraMeta?: AnyRecord;
}): AssetResult {
  const points = sortedPoints(input.points);
  if (points.length < 8) throw new Error(`${input.id}: only ${points.length} valid price points`);
  const latestPoint = points.at(-1)!;
  const price = input.currentPrice ?? latestPoint.value;
  const previous = input.previousPrice ?? points.at(-2)?.value;
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

  return {
    row: {
      id: input.id,
      name: input.name,
      price: input.format(price),
      change: round(change, 4),
      sparkline: points.slice(-SPARKLINE_POINTS).map((point) => round(point.value, 8)),
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
      points: Math.min(points.length, SPARKLINE_POINTS),
      ...input.extraMeta,
    },
  };
}

async function fetchFredSeries(series: string): Promise<Point[]> {
  const startDate = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}&cosd=${startDate}`;
  const text = await fetchText(url);
  return sortedPoints(text.split(/\r?\n/).slice(1).map((line) => {
    const [date, rawValue] = line.split(",");
    return { date: String(date ?? ""), value: positiveNumber(rawValue) ?? Number.NaN };
  }));
}

async function fetchSp500(updatedAt: string): Promise<AssetResult> {
  const points = await fetchFredSeries("SP500");
  return makeAsset({
    id: "sp500",
    name: EXPECTED_NAMES.sp500,
    instrument: "S&P 500 cash index (FRED SP500)",
    provider: "FRED",
    points,
    format: formatIndex,
    updatedAt,
    extraMeta: { unit: "index_points" },
  });
}

async function fetchBrent(updatedAt: string): Promise<AssetResult> {
  const points = await fetchFredSeries("DCOILBRENTEU");
  return makeAsset({
    id: "brent",
    name: EXPECTED_NAMES.brent,
    instrument: "Europe Brent spot FOB (FRED/EIA DCOILBRENTEU)",
    provider: "FRED/EIA",
    points,
    format: formatUsd2,
    updatedAt,
    extraMeta: { unit: "USD/barrel" },
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
  return makeAsset({
    id: "btc",
    name: EXPECTED_NAMES.btc,
    instrument: "Bitcoin / USD spot (Kraken XBTUSD daily candles)",
    provider: "Kraken",
    points,
    format: formatUsd0,
    updatedAt,
    extraMeta: { unit: "USD/BTC", latest_daily_candle_may_be_partial: true },
  });
}

async function fetchGold(updatedAt: string): Promise<AssetResult> {
  const key = Deno.env.get("TWELVE_KEY");
  if (!key) throw new Error("Missing TWELVE_KEY secret");
  const headers = { Authorization: `apikey ${key}` };
  const quoteUrl = "https://api.twelvedata.com/quote?symbol=XAU%2FUSD";
  const seriesUrl = "https://api.twelvedata.com/time_series?symbol=XAU%2FUSD&interval=1day&outputsize=30&order=asc&timezone=UTC";
  const [quotePayload, seriesPayload] = await Promise.all([
    fetchJson(quoteUrl, headers),
    fetchJson(seriesUrl, headers),
  ]);
  if (!isRecord(quotePayload)) throw new Error("Twelve Data quote returned a non-object response");
  if (!isRecord(seriesPayload)) throw new Error("Twelve Data time_series returned a non-object response");
  if (quotePayload.status === "error") throw new Error(`Twelve Data quote: ${String(quotePayload.message ?? "error").slice(0, 300)}`);
  if (seriesPayload.status === "error") throw new Error(`Twelve Data time_series: ${String(seriesPayload.message ?? "error").slice(0, 300)}`);

  const values = Array.isArray(seriesPayload.values) ? seriesPayload.values : [];
  const points = sortedPoints(values.map((raw) => {
    const row = isRecord(raw) ? raw : {};
    return {
      date: String(row.datetime ?? "").slice(0, 10),
      value: positiveNumber(row.close) ?? Number.NaN,
    };
  }));
  const quoteClose = positiveNumber(quotePayload.close);
  const previousClose = positiveNumber(quotePayload.previous_close);
  const quoteChange = finiteNumber(quotePayload.percent_change);
  const timestampSeconds = finiteNumber(quotePayload.timestamp);
  const quoteTimestamp = timestampSeconds ? new Date(timestampSeconds * 1000) : null;
  const quoteDate = quoteTimestamp ? quoteTimestamp.toISOString().slice(0, 10) : String(quotePayload.datetime ?? "").slice(0, 10);
  if (!quoteClose || !previousClose || !quoteDate) throw new Error("Twelve Data gold quote lacked close/previous_close/date");

  const lastDaily = points.at(-1);
  if (lastDaily && Math.abs(((quoteClose - lastDaily.value) / lastDaily.value) * 100) > 5) {
    throw new Error("Twelve Data gold quote differs from daily series by more than 5%");
  }
  if (lastDaily?.date === quoteDate) {
    lastDaily.value = quoteClose;
  } else if (!lastDaily || lastDaily.date < quoteDate) {
    points.push({ date: quoteDate, value: quoteClose });
  }

  return makeAsset({
    id: "gold",
    name: EXPECTED_NAMES.gold,
    instrument: "Gold spot / US Dollar (Twelve Data XAU/USD)",
    provider: "Twelve Data",
    points,
    currentPrice: quoteClose,
    previousPrice: previousClose,
    changePct: quoteChange,
    asOf: quoteTimestamp?.toISOString() ?? quoteDate,
    format: formatUsd1,
    updatedAt,
    extraMeta: {
      unit: "USD/troy ounce",
      quote_datetime: quotePayload.datetime ?? null,
      quote_timestamp: quoteTimestamp?.toISOString() ?? null,
      is_market_open: typeof quotePayload.is_market_open === "boolean" ? quotePayload.is_market_open : null,
    },
  });
}

// Колонка as_of появляется миграцией 20261030120000. Пока её нет, писать её в
// upsert нельзя: PostgREST отклонит всю строку, и кэш перестанет обновляться.
// Проверяем один раз за запуск и запоминаем ответ.
let asOfSupported: boolean | null = null;

async function hasAsOfColumn(): Promise<boolean> {
  if (asOfSupported !== null) return asOfSupported;
  try {
    await restJson("cached_assets?select=as_of&limit=1");
    asOfSupported = true;
  } catch {
    asOfSupported = false;
  }
  return asOfSupported;
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

    const tasks: Array<{ id: string; load: () => Promise<AssetResult> }> = [
      { id: "usd-eur", load: () => fetchUsdEur(updatedAt) },
      { id: "sp500", load: () => fetchSp500(updatedAt) },
      { id: "brent", load: () => fetchBrent(updatedAt) },
      { id: "gold", load: () => fetchGold(updatedAt) },
      { id: "btc", load: () => fetchBtc(updatedAt) },
    ];
    const settled = await Promise.allSettled(tasks.map((task) => task.load()));
    const results: AssetResult[] = [];
    const errors: AnyRecord[] = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") results.push(result.value);
      else {
        errors.push({
          id: tasks[index].id,
          error: result.reason instanceof Error ? result.reason.message.slice(0, 700) : String(result.reason).slice(0, 700),
        });
      }
    });

    if (errors.length) {
      return Response.json({
        success: false,
        publish,
        published: false,
        assets_ok: results.length,
        assets_total: tasks.length,
        assets: results.map((result) => result.meta),
        rows: results.map((result) => result.row),
        errors,
      }, { status: 502 });
    }

    const order = ["usd-eur", "sp500", "brent", "gold", "btc"];
    results.sort((a, b) => order.indexOf(a.row.id) - order.indexOf(b.row.id));
    const storeAsOf = publish ? await hasAsOfColumn() : false;
    if (publish) {
      const rows = results.map((result) => {
        if (storeAsOf) return result.row;
        const { as_of: _omitted, ...rest } = result.row;
        return rest;
      });
      await restJson("cached_assets?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
    }

    return Response.json({
      success: true,
      publish,
      published: publish,
      // Видно, попала ли дата наблюдения в кэш: без колонки она остаётся только
      // в ответе функции и до плитки не доходит.
      as_of_stored: storeAsOf,
      assets_ok: results.length,
      assets_total: tasks.length,
      assets: results.map((result) => result.meta),
      rows: results.map((result) => result.row),
    });
  } catch (error) {
    return Response.json({
      success: false,
      publish,
      published: false,
      error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
    }, { status: 500 });
  }
});
