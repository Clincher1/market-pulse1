// Stage 4 morning baseline snapshot (2026-10-27).
import { serveWithErrorReporting } from "../_shared/observability.ts";
//
// Runs once a day at 04:00 UTC (07:00 MSK) via pg_cron. Captures the
// public cached state (tension and global assets) plus the Russia
// indicators from the production /api/russia-insights endpoint into
// public.daily_snapshots. Legacy forecasts remain in past rows but are
// not copied into new snapshots. The first write of a Moscow date wins:
// retries never overwrite the morning baseline. The frontend compares
// live values against this row for the "changed since morning" block.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const RUSSIA_URL = "https://market-pulse1-eta.vercel.app/api/russia-insights";

type AnyRecord = Record<string, unknown>;

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

// Same guard pattern as the other public writers: the service-role bearer
// token or the shared x-cron-secret header. Anything else gets 401 before
// any read or write happens.
function isAuthorizedCron(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const keys = [
    Deno.env.get("SERVICE_KEY") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ].filter(Boolean);
  if (keys.some((key) => auth === `Bearer ${key}`)) return true;
  return timingSafeEqual(
    req.headers.get("x-cron-secret") ?? "",
    Deno.env.get("CRON_SECRET") ?? "",
  );
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
  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) as unknown : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function moscowDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the primary key shape.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Keep the last value paired with its own date; never use the quote timestamp. */
export function snapshotLastObservation(sparkline: unknown, sparkDates: unknown): { last: number | null; last_date: string | null } {
  const values = Array.isArray(sparkline) ? sparkline : [];
  const last = values.at(-1);
  const validValue = typeof last === "number" && Number.isFinite(last) && last > 0;
  const dates = Array.isArray(sparkDates) ? sparkDates : [];
  const validDates = dates.length === values.length && dates.length > 0 && dates.every((date, index) =>
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date &&
    (index === 0 || date > dates[index - 1]));
  return { last: validValue ? last : null, last_date: validValue && validDates ? dates.at(-1) : null };
}

export function snapshotPriceLabels(
  id: string,
  asOf: unknown,
  updatedAt: unknown,
  sourceLabel: unknown,
): { price_label: string; last_label: string } {
  const source = typeof sourceLabel === "string" && sourceLabel.trim() ? sourceLabel.trim() : "Источник не указан";
  const asOfTime = typeof asOf === "string" ? Date.parse(asOf) : Number.NaN;
  const updatedTime = typeof updatedAt === "string" ? Date.parse(updatedAt) : Number.NaN;
  const liveQuote = Number.isFinite(asOfTime) && Number.isFinite(updatedTime)
    && Math.abs(updatedTime - asOfTime) <= 120_000;
  const priceLabel = id === "btc"
    ? liveQuote
      ? `Live-котировка ${source} на момент снимка`
      : `Последняя дневная точка ${source}; live-котировка не подтверждена`
    : id === "usd-eur"
      ? `Официальный курс ${source}, сохранённый в кэше на момент снимка`
      : `Цена ${source}, сохранённая в кэше на момент снимка`;
  return {
    price_label: priceLabel,
    last_label: "Последняя датированная точка дневного ряда",
  };
}

async function fetchRussia(): Promise<AnyRecord | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(RUSSIA_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MarketPulse-Snapshot/1.0 (+https://market-pulse1-eta.vercel.app/)",
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as AnyRecord;
    const markets = Array.isArray(payload.markets) ? payload.markets : [];
    return {
      generated_at: typeof payload.generatedAt === "string" ? payload.generatedAt : null,
      markets: markets.map((market) => {
        const row = market as AnyRecord;
        return {
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          label: String(row.label ?? ""),
          value: finiteNumber(row.value),
          unit: String(row.unit ?? ""),
          changePct: finiteNumber(row.changePct),
          asOf: typeof row.asOf === "string" ? row.asOf : null,
          asOfLabel: typeof row.asOfLabel === "string" ? row.asOfLabel : null,
          provider: String(row.provider ?? ""),
        };
      }),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

serveWithErrorReporting("snapshot-morning", async (req) => {
  if (!isAuthorizedCron(req)) {
    return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const now = new Date();
    const date = moscowDate(now);

    const [tensionRows, assetRows, russia] = await Promise.all([
      restJson(
        "cached_tension?select=value,label,news_count,updated_at&id=eq.1&limit=1",
      ) as Promise<AnyRecord[]>,
      restJson(
        "cached_assets?select=id,name,price,change,sparkline,spark_dates,updated_at,as_of,source_label&limit=20",
      ) as Promise<AnyRecord[]>,
      fetchRussia(),
    ]);

    const tensionRow = tensionRows[0] ?? null;
    const tension = tensionRow
      ? {
          value: finiteNumber(tensionRow.value),
          label: String(tensionRow.label ?? ""),
          news_count: finiteNumber(tensionRow.news_count),
          updated_at: typeof tensionRow.updated_at === "string" ? tensionRow.updated_at : null,
        }
      : null;

    // as_of — дата наблюдения, которую назвал источник, updated_at — время
    // записи в кэш. Снимок хранит оба: иначе паспорт дня приписывает пятничному
    // закрытию субботнюю дату, потому что субботний писатель ничего нового не
    // получил, а «сильнейшее движение» осталось прежним.
    const assets = assetRows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      price: String(row.price ?? ""),
      change: finiteNumber(row.change),
      ...snapshotLastObservation(row.sparkline, row.spark_dates),
      updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
      as_of: typeof row.as_of === "string" ? row.as_of : null,
      source_label: typeof row.source_label === "string" ? row.source_label : null,
      ...snapshotPriceLabels(typeof row.id === "string" ? row.id : "", row.as_of, row.updated_at, row.source_label),
    }));

    // A first insertion is immutable: never freeze a partial/undated cache.
    for (const id of ["usd-eur", "sp500", "brent", "gold", "btc"]) {
      const matches = assets.filter((asset) => asset.id === id);
      const asset = matches[0];
      if (matches.length !== 1 || !asset.last || !asset.last_date || !asset.price ||
          !asset.price_label || !asset.last_label || !asset.as_of || !Number.isFinite(Date.parse(asset.as_of))) {
        throw new Error(`Snapshot rejected: ${id} has no unique dated observation`);
      }
    }

    const inserted = (await restJson("daily_snapshots?on_conflict=date", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        date,
        captured_at: now.toISOString(),
        tension,
        assets,
        russia,
      }),
    })) as AnyRecord[] | null;

    return Response.json({
      success: true,
      date,
      captured_at: now.toISOString(),
      inserted: Array.isArray(inserted) && inserted.length > 0,
      assets: assets.length,
      // The legacy forecast cache is intentionally not copied into new snapshots.
      forecasts: 0,
      russia_markets: Array.isArray(russia?.markets) ? russia.markets.length : 0,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
