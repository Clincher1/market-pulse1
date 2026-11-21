// Stage 3 shadow price snapshots.
import { serveWithErrorReporting } from "../_shared/observability.ts";
import { parseYahooDaily } from "../_shared/yahoo-chart.ts";
//
// Writes numeric, provider-labelled observations to asset_price_snapshots_v2.
// It does not touch cached_assets and does not publish forecasts/outcomes.
// EURUSD is stored in market convention: USD per 1 EUR.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const USER_AGENT = "MarketPulseBot/0.3 (+https://market-pulse1-eta.vercel.app; shadow price snapshots)";
const COOLDOWN_MINUTES = 10;
const DEFAULT_LOOKBACK_DAYS = 60;
const DEFAULT_MAX_ROWS_PER_INSTRUMENT = 20;
// Stage 6: the public dated panel needs a rolling 180-calendar-day window.
// ECB, Kraken and Twelve gold therefore refresh a deeper daily tail on every
// scheduled run; these are still separate provider series, never spliced.
const HISTORY_BACKFILL_ROWS = 250;

// Set per request in Deno.serve. A one-off backfill can request, for example,
// ?lookback_days=220&max_rows=150 while ordinary runs stay small.
let activeLookbackDays = DEFAULT_LOOKBACK_DAYS;
let activeMaxRowsPerInstrument = DEFAULT_MAX_ROWS_PER_INSTRUMENT;

type AnyRecord = Record<string, unknown>;

// S&P 500 и Brent с 01.11.2026 берутся из публичного чарта Yahoo: у FRED
// программный доступ требует зарегистрированного ключа, и его CSV отвечал 404
// всплесками (07:00-07:05 UTC, «Error - St. Louis Fed»). Ряды помечены новыми
// instrument_id, потому что провайдер и инструмент другие: спот EIA и фьючерс
// NYMEX — не одно и то же число.
const YAHOO_INSTRUMENTS = [
  { instrumentId: "sp500_yahoo_gspc", assetKey: "sp500", symbol: "^GSPC" },
  { instrumentId: "brent_yahoo_bzf", assetKey: "Brent", symbol: "BZ=F" },
] as const;

const FRED_INSTRUMENTS = [
  { instrumentId: "eurusd_fred_dexuseu", assetKey: "eurusd", series: "DEXUSEU" },
  { instrumentId: "btc_fred_coinbase", assetKey: "btc", series: "CBBTCUSD" },
  { instrumentId: "gold_fred_nasdaq_index", assetKey: "gold", series: "NASDAQQGLDI" },
] as const;

function serviceKey(): string {
  const key = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY secret");
  return key;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Gateway verify_jwt alone is not enough: a public publishable key can pass
// JWT verification. Shadow writers therefore require the actual service-role
// bearer token (sent by the guarded dispatcher) or the shared cron secret.
function isAuthorizedService(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const keys = [
    Deno.env.get("SERVICE_KEY") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ].filter(Boolean);
  if (keys.some((key) => auth === `Bearer ${key}`)) return true;
  return timingSafeEqual(req.headers.get("x-cron-secret") ?? "", Deno.env.get("CRON_SECRET") ?? "");
}


async function restJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = serviceKey();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
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

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function snapshotKey(instrumentId: string, date: string | null, timestamp: string | null): string {
  return `${instrumentId}|${date ?? ""}|${timestamp ?? ""}`;
}

function dailyRows(
  instrumentId: string,
  assetKey: string,
  observations: Array<{
    date: string;
    value: number;
    open?: number | null;
    high?: number | null;
    low?: number | null;
  }>,
  sourceUrl: string,
  rawBase: AnyRecord,
  maxRows = activeMaxRowsPerInstrument,
) {
  const sortedRaw = [...observations]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Some daily providers can emit more than one bar that slices to the same
  // calendar date (notably Twelve Data around session boundaries). A dated
  // snapshot has one deterministic key per instrument/date, so keep the last
  // observation for a date before calculating previous-close changes.
  const byDate = new Map<string, (typeof sortedRaw)[number]>();
  for (const row of sortedRaw) byDate.set(row.date, row);
  const sorted = [...byDate.values()];
  const start = Math.max(0, sorted.length - maxRows);
  const rows: AnyRecord[] = [];
  for (let index = start; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = index > 0 ? sorted[index - 1] : null;
    const changeAbs = previous ? current.value - previous.value : null;
    const changePct = previous && previous.value !== 0 ? (changeAbs! / previous.value) * 100 : null;
    rows.push({
      instrument_id: instrumentId,
      asset_key: assetKey,
      observation_date: current.date,
      price_timestamp: null,
      snapshot_key: snapshotKey(instrumentId, current.date, null),
      price: current.value,
      open: current.open ?? null,
      high: current.high ?? null,
      low: current.low ?? null,
      close: current.value,
      previous_price: previous?.value ?? null,
      change_abs: changeAbs,
      change_pct: changePct,
      is_market_open: null,
      source_url: sourceUrl,
      raw: { ...rawBase, observation_date: current.date, value: current.value },
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

async function fetchFred(instrumentId: string, assetKey: string, series: string) {
  const startDate = new Date(Date.now() - activeLookbackDays * 86400000).toISOString().slice(0, 10);
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}&cosd=${startDate}`;
  const text = await fetchText(url);
  const observations = text.split(/\r?\n/).slice(1).map((line) => {
    const [date, rawValue] = line.split(",");
    const valueText = String(rawValue ?? "").trim();
    // FRED uses an empty field (and sometimes ".") for holidays/missing data.
    // Number("") is 0 in JavaScript, so missing values must be rejected here.
    const value = valueText && valueText !== "." ? Number(valueText) : Number.NaN;
    return { date: String(date ?? ""), value };
  }).filter((row) => row.date && Number.isFinite(row.value) && row.value > 0);
  if (!observations.length) throw new Error("FRED returned no valid observations");
  return dailyRows(instrumentId, assetKey, observations, url, { provider: "FRED", series });
}

/**
 * Дневные закрытия из публичного чарта Yahoo. Ключа нет, даты источник отдаёт
 * вместе со значениями; год глубины нужен, чтобы публичная панель не теряла
 * 180-дневный диапазон.
 */
async function fetchYahoo(instrumentId: string, assetKey: string, symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const series = parseYahooDaily(JSON.parse(await fetchText(url)) as unknown);
  return dailyRows(
    instrumentId,
    assetKey,
    series.points.map((point) => ({ date: point.date, value: point.value })),
    url,
    {
      provider: "Yahoo Finance",
      symbol,
      exchange: series.exchange,
      instrument_type: series.instrumentType,
      quote_time: series.quoteTime,
    },
    HISTORY_BACKFILL_ROWS,
  );
}

async function fetchEcb() {
  // The 90-day ECB file cannot support the Stage 6 180-day panel range.
  // The full official history uses the same Cube structure; dailyRows keeps
  // only the newest HISTORY_BACKFILL_ROWS observations. If the large file is
  // temporarily unavailable, fall back to the smaller 90-day file rather
  // than losing the ECB update altogether.
  const fullHistoryUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
  const fallbackUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
  let url = fullHistoryUrl;
  let text: string;
  try {
    text = await fetchText(fullHistoryUrl);
  } catch {
    url = fallbackUrl;
    text = await fetchText(fallbackUrl);
  }
  const observations: Array<{ date: string; value: number }> = [];
  const blockPattern = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']>([\s\S]*?)<\/Cube>/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(text)) !== null) {
    const usd = match[2].match(/currency=["']USD["']\s+rate=["']([0-9]+(?:\.[0-9]+)?)["']/);
    if (usd) observations.push({ date: match[1], value: Number(usd[1]) });
  }
  if (!observations.length) throw new Error("ECB XML contained no USD reference rates");
  return dailyRows("eurusd_ecb_daily", "eurusd", observations, url, {
    provider: "ECB",
    symbol: "USD",
    convention: "USD per 1 EUR",
  }, HISTORY_BACKFILL_ROWS);
}

async function fetchKrakenDaily() {
  const url = "https://api.Kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440";
  const payload = JSON.parse(await fetchText(url)) as unknown;
  if (!isRecord(payload) || !isRecord(payload.result)) throw new Error("Kraken returned no result object");
  const pairKey = Object.keys(payload.result).find((key) => key !== "last");
  const candles = pairKey && Array.isArray(payload.result[pairKey]) ? payload.result[pairKey] as unknown[] : [];
  if (!candles.length) throw new Error("Kraken returned no OHLC candles");

  const parsed = candles.map((raw) => {
    const candle = Array.isArray(raw) ? raw : [];
    const epochSeconds = finiteNumber(candle[0]);
    const timestamp = epochSeconds ? new Date(epochSeconds * 1000) : null;
    return {
      date: timestamp ? timestamp.toISOString().slice(0, 10) : "",
      timestamp: timestamp?.toISOString() ?? null,
      open: finiteNumber(candle[1]),
      high: finiteNumber(candle[2]),
      low: finiteNumber(candle[3]),
      close: finiteNumber(candle[4]),
      vwap: finiteNumber(candle[5]),
      volume: finiteNumber(candle[6]),
      count: finiteNumber(candle[7]),
    };
  }).filter((row) => row.date && row.close !== null && row.close > 0);

  const start = Math.max(
    0,
    parsed.length - Math.max(activeMaxRowsPerInstrument, HISTORY_BACKFILL_ROWS),
  );
  const rows: AnyRecord[] = [];
  for (let index = start; index < parsed.length; index += 1) {
    const current = parsed[index];
    const previous = index > 0 ? parsed[index - 1] : null;
    const changeAbs = previous?.close != null && current.close != null ? current.close - previous.close : null;
    const changePct = changeAbs != null && previous?.close ? (changeAbs / previous.close) * 100 : null;
    rows.push({
      instrument_id: "btc_kraken_xbtusd_daily",
      asset_key: "btc",
      observation_date: current.date,
      price_timestamp: current.timestamp,
      snapshot_key: snapshotKey("btc_kraken_xbtusd_daily", current.date, current.timestamp),
      price: current.close,
      open: current.open,
      high: current.high,
      low: current.low,
      close: current.close,
      previous_price: previous?.close ?? null,
      change_abs: changeAbs,
      change_pct: changePct,
      is_market_open: true,
      source_url: url,
      raw: { provider: "Kraken", pair: pairKey, candle: current, latest_candle_may_be_partial: index === parsed.length - 1 },
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}


function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

serveWithErrorReporting("update-prices-v2-shadow", async (request) => {
  if (!isAuthorizedService(request)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  let runId: number | null = null;
  try {
    const requestUrl = new URL(request.url);
    activeLookbackDays = clampInteger(
      Number(requestUrl.searchParams.get("lookback_days") ?? DEFAULT_LOOKBACK_DAYS),
      30,
      365,
      DEFAULT_LOOKBACK_DAYS,
    );
    activeMaxRowsPerInstrument = clampInteger(
      Number(requestUrl.searchParams.get("max_rows") ?? DEFAULT_MAX_ROWS_PER_INSTRUMENT),
      20,
      250,
      DEFAULT_MAX_ROWS_PER_INSTRUMENT,
    );
    const latest = await restJson(
      "asset_price_runs_v2?select=id,started_at,status&order=started_at.desc&limit=1",
    ) as Array<{ id: number; started_at: string; status: string }>;
    if (latest[0]?.started_at) {
      const ageMs = Date.now() - new Date(latest[0].started_at).getTime();
      if (ageMs < COOLDOWN_MINUTES * 60000) {
        return Response.json({
          success: true,
          skipped: true,
          reason: "price_snapshot_cooldown",
          last_started_at: latest[0].started_at,
          cooldown_minutes: COOLDOWN_MINUTES,
        });
      }
    }

    const created = await restJson("asset_price_runs_v2", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "running" }),
    }) as Array<{ id: number }>;
    runId = created[0]?.id ?? null;

    const tasks: Array<{ instrumentId: string; load: () => Promise<AnyRecord[]> }> = [
      ...YAHOO_INSTRUMENTS.map((item) => ({
        instrumentId: item.instrumentId,
        load: () => fetchYahoo(item.instrumentId, item.assetKey, item.symbol),
      })),
      ...FRED_INSTRUMENTS.map((item) => ({
        instrumentId: item.instrumentId,
        load: () => fetchFred(item.instrumentId, item.assetKey, item.series),
      })),
      { instrumentId: "eurusd_ecb_daily", load: fetchEcb },
      { instrumentId: "btc_kraken_xbtusd_daily", load: fetchKrakenDaily },
    ];

    const allRows: AnyRecord[] = [];
    const instrumentResults: AnyRecord[] = [];
    for (const task of tasks) {
      try {
        const rows = await task.load();
        allRows.push(...rows);
        instrumentResults.push({
          instrument_id: task.instrumentId,
          ok: true,
          rows: rows.length,
          latest_date: rows.at(-1)?.observation_date ?? null,
          latest_timestamp: rows.at(-1)?.price_timestamp ?? null,
          latest_price: rows.at(-1)?.price ?? null,
        });
      } catch (error) {
        instrumentResults.push({
          instrument_id: task.instrumentId,
          ok: false,
          rows: 0,
          error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
      }
    }

    // PostgreSQL cannot update the same conflict target twice in one
    // INSERT ... ON CONFLICT statement. Keep one row per deterministic
    // snapshot key (last provider observation wins) before the bulk upsert.
    const upsertRows = [...new Map(
      allRows.map((row) => [String(row.snapshot_key ?? ""), row]),
    ).values()].filter((row) => String(row.snapshot_key ?? ""));

    if (upsertRows.length) {
      await restJson("asset_price_snapshots_v2?on_conflict=snapshot_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(upsertRows),
      });
    }

    const instrumentsOk = instrumentResults.filter((row) => row.ok).length;
    const status = instrumentsOk === tasks.length ? "success" : instrumentsOk > 0 ? "partial" : "error";
    if (runId !== null) {
      await restJson(`asset_price_runs_v2?id=eq.${runId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          finished_at: new Date().toISOString(),
          status,
          instruments_total: tasks.length,
          instruments_ok: instrumentsOk,
          snapshots_upserted: upsertRows.length,
          stats: { instruments: instrumentResults, lookback_days: activeLookbackDays, max_rows_per_instrument: activeMaxRowsPerInstrument },
        }),
      });
    }

    return Response.json({
      success: instrumentsOk > 0,
      run_id: runId,
      status,
      instruments_total: tasks.length,
      instruments_ok: instrumentsOk,
      snapshots_upserted: upsertRows.length,
      lookback_days: activeLookbackDays,
      max_rows_per_instrument: activeMaxRowsPerInstrument,
      instruments: instrumentResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId !== null) {
      try {
        await restJson(`asset_price_runs_v2?id=eq.${runId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            finished_at: new Date().toISOString(),
            status: "error",
            stats: { error: message.slice(0, 1000) },
          }),
        });
      } catch (_) {
        // Preserve the original error below.
      }
    }
    return Response.json({ success: false, run_id: runId, error: message }, { status: 500 });
  }
});
