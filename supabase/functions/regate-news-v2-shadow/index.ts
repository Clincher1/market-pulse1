// One-off Stage 2 maintenance function: applies token_prefix_v2 market gate
// and a 20-candidate per-source cap to already stored shadow articles.
// Delete after use; the canonical logic lives in ingest-news-v2-shadow.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const GATE_VERSION = "token_prefix_v2";
const MAX_CANDIDATES_PER_SOURCE = 20;
const WINDOW_HOURS = 36;

const MARKET_PHRASES = [
  "interest rate",
  "central bank",
  "federal reserve",
  "ключевая ставка",
  "денежно кредитная политика",
];
const MARKET_EXACT_TOKENS = new Set(["fed", "ecb", "btc", "opec", "gdp", "dow", "Brent", "oil", "цб", "ввп"]);
const MARKET_TOKEN_PREFIXES = [
  "market", "stock", "share", "bond", "treasur", "yield", "inflat", "crude", "gold",
  "bitcoin", "crypto", "dollar", "euro", "ruble", "sanction", "tariff", "earning",
  "revenue", "profit", "bank", "econom", "unemploy", "recession", "nasdaq",
  "индекс", "акци", "облигац", "инфляц", "ставк", "центробанк", "нефт", "золот",
  "биткоин", "доллар", "рубл", "санкци", "тариф", "бюджет", "банк", "рынк",
  "бирж", "фьючерс", "дивиденд", "прибыл", "выручк", "экономик",
];

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
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 700)}`);
  return text ? JSON.parse(text) : null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasMarketTerm(normalized: string): boolean {
  if (!normalized) return false;
  if (MARKET_PHRASES.some((phrase) => normalized.includes(normalizeText(phrase)))) return true;
  return normalized.split(" ").filter(Boolean).some(
    (token) => MARKET_EXACT_TOKENS.has(token) || MARKET_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix)),
  );
}

Deno.serve(async () => {
  try {
    const sources = (await restJson(
      "news_sources_v2?select=id&requires_market_terms=eq.true&order=id.asc",
    )) as Array<Record<string, unknown>>;
    const sourceIds = sources.map((row) => String(row.id)).filter(Boolean);
    if (!sourceIds.length) throw new Error("No gated sources found");

    const cutoff = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
    const inList = sourceIds.map((id) => `"${id}"`).join(",");
    const articles = (await restJson(
      `news_articles_shadow?select=*&source_id=in.(${encodeURIComponent(inList)})` +
        `&status=in.(candidate,rejected)&published_at=gte.${encodeURIComponent(cutoff)}` +
        `&order=published_at.desc&limit=1000`,
    )) as Array<Record<string, unknown>>;

    const now = new Date().toISOString();
    const changed: Array<Record<string, unknown>> = [];
    const removedExamples: Array<Record<string, unknown>> = [];
    const counts: Record<string, number> = {};
    const candidatesBySource = new Map<string, number>();

    const sorted = [...articles].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
    for (const article of sorted) {
      const currentStatus = String(article.status);
      const currentReason = article.reject_reason ? String(article.reject_reason) : null;
      const normalized = normalizeText(`${String(article.title ?? "")} ${String(article.description ?? "")}`);
      const passes = hasMarketTerm(normalized);
      let nextStatus = currentStatus;
      let nextReason = currentReason;

      if (currentStatus === "candidate" && !passes) {
        nextStatus = "rejected";
        nextReason = "no_market_terms";
      } else if (currentStatus === "rejected" && currentReason === "no_market_terms" && passes) {
        nextStatus = "candidate";
        nextReason = null;
      }

      if (nextStatus === "candidate") {
        const sourceId = String(article.source_id ?? "");
        const count = candidatesBySource.get(sourceId) ?? 0;
        if (count >= MAX_CANDIDATES_PER_SOURCE) {
          nextStatus = "rejected";
          nextReason = "source_cap";
        } else {
          candidatesBySource.set(sourceId, count + 1);
        }
      }

      if (nextStatus !== currentStatus || nextReason !== currentReason) {
        const raw = (article.raw && typeof article.raw === "object") ? article.raw as Record<string, unknown> : {};
        changed.push({
          ...article,
          status: nextStatus,
          reject_reason: nextReason,
          raw: { ...raw, gate_version: GATE_VERSION, regated_at: now },
          updated_at: now,
        });
        const key = `${currentStatus}->${nextStatus}:${nextReason ?? "candidate"}`;
        counts[key] = (counts[key] ?? 0) + 1;
        if (nextStatus === "rejected" && removedExamples.length < 25) {
          removedExamples.push({
            source: article.source_name,
            title: article.title,
            published_at: article.published_at,
            reason: nextReason,
          });
        }
      }
    }

    for (let i = 0; i < changed.length; i += 100) {
      await restJson("news_articles_shadow?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(changed.slice(i, i + 100)),
      });
    }

    return Response.json({
      success: true,
      gate_version: GATE_VERSION,
      sources_checked: sourceIds.length,
      articles_checked: articles.length,
      articles_changed: changed.length,
      transitions: counts,
      removed_examples: removedExamples,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
