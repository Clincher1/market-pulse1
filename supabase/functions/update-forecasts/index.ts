// Stage 1 hardened forecast aggregation.
import { serveWithErrorReporting } from "../_shared/observability.ts";
// Keeps the cached_forecasts contract; probability remains a signal-balance
// score, not a calibrated market probability. Adds source/age/confidence
// gates and uses direct PostgREST calls instead of a bundled client.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const ASSETS = ["S&P 500", "BTC", "Brent"];
const HALF_LIFE_HOURS = 12;
const MAX_AGE_HOURS = 72;
const MIN_NEWS = 3;
const MIN_EFFECTIVE_WEIGHT = 0.5;
const MIN_IMPORTANCE = 3;
const MIN_CONFIDENCE = 0.5;
// Direction is published only when the normalized weighted balance reaches
// 60/40. Below that, article-level signals are too correlated and noisy to
// justify an up/down label; the asset is explicitly reported as no-signal.
const NO_SIGNAL_BALANCE = 0.2;
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

function createScore() {
  return {
    up: 0,
    down: 0,
    upWeight: 0,
    downWeight: 0,
    totalWeight: 0,
    weightedBalance: 0,
    newsCount: 0,
  };
}

function getConfidence(score: number, newsCount: number, totalWeight: number): string {
  if (newsCount < MIN_NEWS || totalWeight < MIN_EFFECTIVE_WEIGHT) return "Низкая";
  const strength = Math.abs(score);
  if (strength >= 0.6 && newsCount >= 5) return "Высокая";
  if (strength >= 0.3) return "Средняя";
  return "Низкая";
}

// --- Conservative duplicate guard (2026-10-22) ---
// Prevents the same republication/headline rewrite from adding weight more
// than once to an asset signal balance. This is not semantic event
// clustering: related follow-up developments remain separate.
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
const NEAR_DUPLICATE_WINDOW_MS = 36 * 60 * 60 * 1000;

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

function areNearDuplicateTitles(
  a: Set<string>,
  aTime: number,
  b: Set<string>,
  bTime: number,
): boolean {
  if (a.size < 4 || b.size < 4) return false;
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
    if (Math.abs(aTime - bTime) > NEAR_DUPLICATE_WINDOW_MS) return false;
  }
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

serveWithErrorReporting("update-forecasts", async (req) => {
  if (!isAuthorizedCron(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const nowDate = new Date();
    const cutoff = new Date(nowDate.getTime() - MAX_AGE_HOURS * 3_600_000).toISOString();
    const futureLimit = new Date(nowDate.getTime() + 15 * 60_000).toISOString();

    const params = new URLSearchParams({
      select: "sentiment,importance,impacts,published_at,confidence,source,title,url",
      order: "published_at.desc",
      limit: "100",
    });
    params.append("published_at", `gte.${cutoff}`);
    params.append("published_at", `lte.${futureLimit}`);

    const news =
      ((await restJson(`cached_news?${params.toString()}`)) as Array<Record<string, unknown>> | null) ?? [];

    const scores: Record<string, ReturnType<typeof createScore>> = {};
    for (const asset of ASSETS) scores[asset] = createScore();

    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const acceptedFingerprints: Array<{ tokens: Set<string>; publishedAt: number }> = [];

    const now = nowDate.getTime();
    for (const item of news) {
      if (BLOCKED_SOURCES.has(String(item.source ?? ""))) continue;
      if (!Array.isArray(item.impacts)) continue;

      const importance = Number(item.importance);
      const confidence = Number(item.confidence);
      if (!Number.isFinite(importance) || !Number.isFinite(confidence)) continue;

      const normalizedImportance = Math.min(10, Math.max(1, importance));
      if (normalizedImportance < MIN_IMPORTANCE || confidence < MIN_CONFIDENCE) continue;
      if (!item.published_at) continue;

      const publishedAt = new Date(String(item.published_at)).getTime();
      if (!Number.isFinite(publishedAt)) continue;

      const ageHoursRaw = (now - publishedAt) / 3_600_000;
      if (ageHoursRaw < -0.25 || ageHoursRaw > MAX_AGE_HOURS) continue;
      const ageHours = Math.max(0, ageHoursRaw);

      // Count each qualified story once, even if the public cache contains
      // a republication or a very close headline rewrite of it.
      const urlKey = canonicalNewsUrl(item.url);
      if (urlKey && seenUrls.has(urlKey)) continue;
      const titleKey = normalizedNewsTitle(item.title);
      if (titleKey && seenTitles.has(titleKey)) continue;
      const titleTokens = newsTitleTokens(titleKey);
      if (
        acceptedFingerprints.some((existing) =>
          areNearDuplicateTitles(titleTokens, publishedAt, existing.tokens, existing.publishedAt)
        )
      ) {
        continue;
      }
      if (urlKey) seenUrls.add(urlKey);
      if (titleKey) seenTitles.add(titleKey);
      acceptedFingerprints.push({ tokens: titleTokens, publishedAt });

      const freshness = Math.pow(2, -ageHours / HALF_LIFE_HOURS);
      const weight = normalizedImportance * freshness * Math.min(1, Math.max(0, confidence));

      for (const impact of item.impacts as Array<Record<string, unknown>>) {
        const asset = String(impact?.asset ?? "");
        const direction = String(impact?.direction ?? "");
        if (!scores[asset]) continue;
        if (direction !== "up" && direction !== "down") continue;

        const score = scores[asset];
        score.newsCount += 1;
        score.totalWeight += weight;

        if (direction === "up") {
          score.up += 1;
          score.upWeight += weight;
          score.weightedBalance += weight;
        } else {
          score.down += 1;
          score.downWeight += weight;
          score.weightedBalance -= weight;
        }
      }
    }

    const forecasts = [];
    for (const asset of ASSETS) {
      const score = scores[asset];
      let balance = 0;
      let probability = 50;
      let upPercent = 50;
      let downPercent = 50;
      let direction: "up" | "down" | "none" = "none";
      let confidence = "Низкая";
      let timeWindow = "—";
      let reason: string;

      if (score.newsCount === 0 || score.totalWeight <= 0) {
        reason =
          "Недостаточно квалифицированных новостных сигналов по этому активу. " +
          "Направленный вывод не делается.";
      } else {
        balance = score.weightedBalance / score.totalWeight;
        probability = Math.round(50 + Math.abs(balance) * 50);
        upPercent = Math.round((score.upWeight / score.totalWeight) * 100);
        downPercent = 100 - upPercent;

        const enoughEvidence =
          score.newsCount >= MIN_NEWS && score.totalWeight >= MIN_EFFECTIVE_WEIGHT;
        const hasSignal = enoughEvidence && Math.abs(balance) >= NO_SIGNAL_BALANCE;

        if (!enoughEvidence) {
          reason =
            `Учтено сигналов: ${score.newsCount}; суммарного эффективного веса недостаточно ` +
            `для направленного вывода. Взвешенный фон — ${upPercent}% вверх и ${downPercent}% вниз, ` +
            "поэтому статус: нет сигнала.";
        } else if (!hasSignal) {
          reason =
            `Учтено ${score.newsCount} сигналов: взвешенный баланс — ${upPercent}% вверх и ${downPercent}% вниз. ` +
            `Нормированный перевес ${Math.round(Math.abs(balance) * 100)}% ниже порога направленного сигнала ` +
            `${Math.round(NO_SIGNAL_BALANCE * 100)}% (60/40). Сигналы почти компенсируют друг друга, ` +
            "поэтому направленный вывод не делается.";
        } else {
          direction = balance >= 0 ? "up" : "down";
          confidence = getConfidence(balance, score.newsCount, score.totalWeight);
          timeWindow = "1–3 дня";
          reason =
            `Учтено ${score.newsCount} сигналов: ` +
            `взвешенный баланс — ${upPercent}% вверх и ${downPercent}% вниз. ` +
            `Нормированный перевес: ${Math.round(Math.abs(balance) * 100)}%. ` +
            `Это оценка новостного фона, а не статистически подтверждённая вероятность изменения цены.`;
        }
      }

      forecasts.push({
        id: asset.toLowerCase().replace(/\s/g, "-") + "-forecast",
        asset,
        direction,
        probability,
        time_window: timeWindow,
        confidence,
        reason,
        updated_at: new Date().toISOString(),
      });
    }

    await restJson("cached_forecasts?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(forecasts),
    });

    return Response.json({ success: true, updated: forecasts.length, forecasts });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
