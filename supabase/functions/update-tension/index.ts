// Stage 1 hardened tension calculation.
import { serveWithErrorReporting } from "../_shared/observability.ts";
import {
  calculateTensionIndex,
  selectTensionNews,
  tensionNewsQueryParams,
  TENSION_MIN_NEWS,
} from "../_shared/tension-sample.mjs";
// Preserves the cached_tension contract; excludes GDELT/stale/low-confidence
// rows and upserts one tension_history row per date.
// Uses direct PostgREST calls instead of a bundled client dependency.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";

function serviceKey(): string {
  const key = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY secret");
  return key;
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
  return text ? JSON.parse(text) : null;
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

serveWithErrorReporting("update-tension", async (req) => {
  if (!isAuthorizedCron(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const now = new Date();
    const params = tensionNewsQueryParams(now);
    const rawNews = (await restJson(`cached_news?${params.toString()}`)) as Array<Record<string, unknown>>;
    const news = selectTensionNews(rawNews);

    if (news.length < TENSION_MIN_NEWS) {
      return Response.json({
        success: true,
        skipped: true,
        reason: "insufficient_qualified_news",
        qualified: news.length,
      });
    }

    const { index, sampleNewest } = calculateTensionIndex(news);
    let label = "Тепло";
    if (index < 30) label = "Холодно";
    else if (index > 70) label = "Горячо";

    const today = now.toISOString().slice(0, 10);
    await restJson("tension_history?on_conflict=date", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ value: index, date: today }),
    });

    const historyParams = new URLSearchParams({
      select: "value,date",
      order: "date.desc",
      limit: "7",
    });
    const history = (await restJson(`tension_history?${historyParams.toString()}`)) as Array<Record<string, unknown>>;

    // Historical context for the scale. Recomputed on every run so the card
    // never quotes a stale "N days out of M were quieter" line.
    const statsParams = new URLSearchParams({
      select: "value,date",
      order: "date.desc",
      limit: "60",
    });
    const statsRows = (await restJson(`tension_history?${statsParams.toString()}`)) as Array<Record<string, unknown>>;
    const statValues = statsRows
      .map((row) => Number(row.value))
      .filter((value) => Number.isFinite(value));
    const sortedValues = [...statValues].sort((a, b) => a - b);
    const middle = Math.floor(sortedValues.length / 2);
    const median = sortedValues.length === 0
      ? 0
      : sortedValues.length % 2 === 0
        ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
        : sortedValues[middle];
    const historyStats = statValues.length > 0
      ? {
          days: statValues.length,
          value: index,
          min: sortedValues[0],
          max: sortedValues[sortedValues.length - 1],
          median,
          first_date: String(statsRows[statsRows.length - 1].date),
          last_date: String(statsRows[0].date),
          above_days: statValues.filter((value) => value > index).length,
          below_days: statValues.filter((value) => value < index).length,
          equal_days: statValues.filter((value) => value === index).length,
        }
      : null;

    // `date` (ISO) отдаём вместе с подписью: по подписи «23 окт» нельзя
    // отличить семь дней подряд от семи записей за месяц, а на графике это
    // разные факты. Фронтенд ставит точки по календарю, если дата есть.
    const formattedHistory = [...history].reverse().map((row) => {
      const date = new Date(String(row.date));
      return {
        date: String(row.date),
        day: date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
        value: row.value,
      };
    });

    await restJson("cached_tension?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        id: 1,
        value: index,
        label,
        history: formattedHistory,
        history_stats: historyStats,
        news_count: news.length,
        sample_newest: sampleNewest,
        updated_at: now.toISOString(),
      }),
    });

    return Response.json({
      success: true,
      index,
      label,
      news_count: news.length,
      negative_share: index,
      sample_newest: sampleNewest,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
