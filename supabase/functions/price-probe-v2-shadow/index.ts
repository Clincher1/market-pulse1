// Temporary Stage 3 price-source probe. Read-only network checks from
// Supabase egress. It writes nothing and returns sanitized summaries only.

const TWELVE_BASE = "https://api.twelvedata.com";

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function fetchText(url: string, init: RequestInit = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: "application/json,text/csv,text/xml,*/*",
      "User-Agent": "MarketPulseBot/0.3 (+https://market-pulse1-eta.vercel.app; price source probe)",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, durationMs: Date.now() - started, text };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function twelveError(payload: unknown): string | null {
  if (!isRecord(payload)) return "non-object response";
  if (payload.status === "error") {
    return String(payload.message ?? payload.code ?? "Twelve Data error").slice(0, 300);
  }
  return null;
}

async function twelve(path: string, params: Record<string, string>) {
  const key = Deno.env.get("TWELVE_KEY") ?? Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("Twelve API_KEY");
  if (!key) return { ok: false, error: "TWELVE_KEY secret not found" };
  const query = new URLSearchParams(params);
  const result = await fetchText(`${TWELVE_BASE}${path}?${query.toString()}`, {
    headers: { Authorization: `apikey ${key}` },
  });
  const payload = parseJson(result.text);
  return {
    ok: result.ok && !twelveError(payload),
    httpStatus: result.status,
    durationMs: result.durationMs,
    error: twelveError(payload) ?? (result.ok ? null : result.text.slice(0, 300)),
    payload,
  };
}

function summarizeQuote(payload: unknown) {
  if (!isRecord(payload)) return null;
  const keys = [
    "symbol", "name", "exchange", "mic_code", "currency", "datetime", "timestamp",
    "open", "high", "low", "close", "volume", "previous_close", "change",
    "percent_change", "is_market_open",
  ];
  const out: AnyRecord = {};
  for (const key of keys) if (key in payload) out[key] = payload[key];
  return out;
}

function summarizeSeries(payload: unknown) {
  if (!isRecord(payload)) return null;
  const values = Array.isArray(payload.values) ? payload.values.slice(0, 5) : [];
  return { meta: payload.meta ?? null, values, status: payload.status ?? null };
}

async function probeFred(seriesId: string) {
  const result = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`);
  const lines = result.text.split(/\r?\n/).filter(Boolean);
  const observations = lines.slice(1)
    .map((line) => {
      const [date, value] = line.split(",");
      return { date, value: Number(value) };
    })
    .filter((row) => row.date && Number.isFinite(row.value));
  return {
    ok: result.ok && observations.length > 0,
    httpStatus: result.status,
    durationMs: result.durationMs,
    bytes: result.text.length,
    observations: observations.length,
    last: observations.slice(-3),
    error: result.ok ? null : result.text.slice(0, 200),
  };
}

async function probeKraken() {
  const result = await fetchText("https://api.Kraken.com/0/public/Ticker?pair=XBTUSD");
  const payload = parseJson(result.text);
  const root = isRecord(payload) && isRecord(payload.result) ? payload.result : {};
  const firstKey = Object.keys(root)[0];
  const ticker = firstKey && isRecord(root[firstKey]) ? root[firstKey] : null;
  return {
    ok: result.ok && Boolean(ticker),
    httpStatus: result.status,
    durationMs: result.durationMs,
    pair: firstKey ?? null,
    last: Array.isArray(ticker?.c) ? ticker.c[0] : null,
    open24: ticker?.o ?? null,
    error: isRecord(payload) && Array.isArray(payload.error) && payload.error.length ? payload.error : null,
  };
}

async function probeFrankfurter() {
  const result = await fetchText("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR");
  return {
    ok: result.ok,
    httpStatus: result.status,
    durationMs: result.durationMs,
    payload: parseJson(result.text),
  };
}

async function probeEcb() {
  const result = await fetchText("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
  const timeMatch = result.text.match(/Cube\s+time='([^']+)'/);
  const usdMatch = result.text.match(/Cube\s+currency='USD'\s+rate='([^']+)'/);
  return {
    ok: result.ok && Boolean(usdMatch),
    httpStatus: result.status,
    durationMs: result.durationMs,
    referenceDate: timeMatch?.[1] ?? null,
    eurUsd: usdMatch ? Number(usdMatch[1]) : null,
  };
}

Deno.serve(async () => {
  try {
    const quoteSymbols = ["SPX", "SPY", "XBR/USD", "XAU/USD", "EUR/USD", "USD/EUR", "BTC/USD"];
    const seriesSymbols = ["SPX", "SPY", "XBR/USD", "XAU/USD", "EUR/USD", "BTC/USD"];

    const twelveQuotes: AnyRecord = {};
    for (const symbol of quoteSymbols) {
      const result = await twelve("/quote", { symbol });
      twelveQuotes[symbol] = {
        ok: result.ok,
        httpStatus: result.httpStatus ?? null,
        durationMs: result.durationMs ?? null,
        error: result.error ?? null,
        quote: summarizeQuote(result.payload),
      };
    }

    const twelveSeries: AnyRecord = {};
    for (const symbol of seriesSymbols) {
      const result = await twelve("/time_series", {
        symbol,
        interval: "1day",
        outputsize: "5",
        format: "JSON",
      });
      twelveSeries[symbol] = {
        ok: result.ok,
        httpStatus: result.httpStatus ?? null,
        durationMs: result.durationMs ?? null,
        error: result.error ?? null,
        series: summarizeSeries(result.payload),
      };
    }

    const fredIds = ["SP500", "DCOILBRENTEU", "DEXUSEU", "NASDAQQGLDI", "CBBTCUSD"];
    const fred: AnyRecord = {};
    for (const id of fredIds) fred[id] = await probeFred(id);

    return Response.json({
      success: true,
      probed_at: new Date().toISOString(),
      twelve_quotes: twelveQuotes,
      twelve_daily_series: twelveSeries,
      fred,
      Kraken_btcusd: await probeKraken(),
      frankfurter_usd_eur: await probeFrankfurter(),
      ecb_daily: await probeEcb(),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
