// Stage 1 hardened tension calculation.
import { serveWithErrorReporting } from "../_shared/observability.ts";
// Preserves the cached_tension contract; excludes GDELT/stale/low-confidence
// rows and upserts one tension_history row per date.
// Uses direct PostgREST calls instead of a bundled client dependency.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const WINDOW_HOURS = 24;
const MIN_NEWS = 3;
const MIN_IMPORTANCE = 3;
const MIN_CONFIDENCE = 0.5;
const BLOCKED_SOURCES = new Set(["GDELT (Global)", "GDELT"]);

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// --- Conservative duplicate guard (2026-10-22) ---
// Prevents the same republication/headline rewrite from being counted more
// than once in the tension sample. This is not semantic event clustering:
// related follow-up developments remain separate.
const DEDUPE_TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source",
  "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term",
]);
const DEDUPE_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "as",
  "at", "by", "from", "after", "over", "amid", "says", "said", "say", "new",
  "update", "updated", "breaking", "exclusive", "analysis", "opinion",
  "и", "в", "на", "по", "к", "с", "у", "о", "об", "за", "для", "от", "до",
  "из", "при", "что", "как", "это", "новые", "новый", "новая",
]);

function canonicalNewsUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    const params = new URLSearchParams();
    for (const [key, paramValue] of [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (!DEDUPE_TRACKING_PARAMS.has(key.toLowerCase())) params.append(key, paramValue);
    }
    url.search = params.toString() ? `?${params.toString()}` : "";
    return url.toString();
  } catch {
    return raw.toLowerCase();
  }
}

function normalizedNewsTitle(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .toLowerCase()
    .replace(/\s+[-|–—]\s*(cnbc|bloomberg|financial times|reuters|wsj|marketwatch)\s*$/i, "")
    .replace(/^(breaking|update|exclusive|analysis|opinion)\s*[:\-–—]\s*/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function newsTitleTokens(normalizedTitle: string): Set<string> {
  return new Set(
    (normalizedTitle.match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => {
      if (DEDUPE_STOP_WORDS.has(token)) return false;
      if (/^\d+$/.test(token)) return token.length >= 2;
      return token.length >= 3;
    }),
  );
}

function areNearDuplicateTitles(a: Set<string>, b: Set<string>): boolean {
  if (a.size < 4 || b.size < 4) return false;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  if (common < 3) return false;
  const jaccard = common / (a.size + b.size - common);
  const containment = common / Math.min(a.size, b.size);
  return jaccard >= 0.78 || containment >= 0.9;
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
    const cutoff = new Date(now.getTime() - WINDOW_HOURS * 3_600_000).toISOString();
    const futureLimit = new Date(now.getTime() + 15 * 60_000).toISOString();

    const params = new URLSearchParams({
      select: "sentiment,importance,confidence,source,published_at,title,url",
      order: "published_at.desc",
      limit: "400",
    });
    params.append("published_at", `gte.${cutoff}`);
    params.append("published_at", `lte.${futureLimit}`);

    const rawNews = (await restJson(`cached_news?${params.toString()}`)) as Array<Record<string, unknown>>;
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const acceptedTitleTokens: Array<Set<string>> = [];
    const news = rawNews
      .filter((item) => {
        if (BLOCKED_SOURCES.has(String(item.source ?? ""))) return false;
        const sentiment = Number(item.sentiment);
        const importance = Number(item.importance);
        const confidence = Number(item.confidence);
        return (
          Number.isFinite(sentiment) && sentiment >= -1 && sentiment <= 1 &&
          Number.isFinite(importance) && importance >= MIN_IMPORTANCE &&
          Number.isFinite(confidence) && confidence >= MIN_CONFIDENCE
        );
      })
      .filter((item) => {
        const urlKey = canonicalNewsUrl(item.url);
        if (urlKey && seenUrls.has(urlKey)) return false;

        const titleKey = normalizedNewsTitle(item.title);
        if (titleKey && seenTitles.has(titleKey)) return false;

        const tokens = newsTitleTokens(titleKey);
        if (acceptedTitleTokens.some((existing) => areNearDuplicateTitles(tokens, existing))) {
          return false;
        }

        if (urlKey) seenUrls.add(urlKey);
        if (titleKey) seenTitles.add(titleKey);
        acceptedTitleTokens.push(tokens);
        return true;
      })
      // Every qualified article of the last 24 hours is counted. The former
      // cap of 20 silently turned the window into the last three or four hours
      // on busy days, so values depended on the time of day and could not be
      // compared between days.
      .slice(0, 300);

    if (news.length < MIN_NEWS) {
      return Response.json({
        success: true,
        skipped: true,
        reason: "insufficient_qualified_news",
        qualified: news.length,
      });
    }

    // The index is the share of the flow's total significance that is negative.
    // The previous version divided the average per-article score by the
    // theoretical maximum of 10 points; real days scored 0.4-1.6 points, so the
    // scale read 4-16 out of 100 and the "warm/hot" thresholds were unreachable
    // - the chart looked like a permanent slide into cold. A share is unit-free
    // and keeps its meaning if the model's absolute importance scale drifts.
    let negativeWeight = 0;
    let totalWeight = 0;
    let newestPublished: number | null = null;
    for (const item of news) {
      const publishedAt = Date.parse(String(item.published_at));
      if (Number.isFinite(publishedAt) && (newestPublished === null || publishedAt > newestPublished)) {
        newestPublished = publishedAt;
      }
      const sentiment = clamp(Number(item.sentiment), -1, 1);
      const importance = clamp(Number(item.importance), 1, 10);
      const confidence = clamp(Number(item.confidence), 0, 1);
      const weight = importance * confidence;
      totalWeight += weight;
      negativeWeight += Math.max(0, -sentiment) * weight;
    }

    const index = totalWeight > 0
      ? clamp(Math.round((negativeWeight / totalWeight) * 100), 0, 100)
      : 0;
    // When the news flow stops, the 24-hour window silently keeps the old
    // articles while `updated_at` keeps ticking every 15 minutes. The age of
    // the newest article in the sample is what actually tells whether the
    // metric is measuring live news or a frozen snapshot.
    const sampleNewest = newestPublished === null ? null : new Date(newestPublished).toISOString();
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

    const formattedHistory = [...history].reverse().map((row) => {
      const date = new Date(String(row.date));
      return {
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
