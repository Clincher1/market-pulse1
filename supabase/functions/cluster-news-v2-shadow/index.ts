// Market Pulse Stage 2: deterministic event clustering for shadow articles.
//
// This intentionally uses direct PostgREST calls and no bundled Supabase
// client. It reads only news_articles_shadow and writes only V2 shadow
// event tables. It never updates cached_* or the public frontend contract.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const CLUSTER_METHOD = "title_token_jaccard_v1";
const COOLDOWN_MINUTES = 5;
const MAX_CLUSTER_TIME_GAP_HOURS = 18;
const JACCARD_THRESHOLD = 0.42;
const CONTAINMENT_THRESHOLD = 0.65;

type SourceRow = {
  id: string;
  name?: string | null;
  trust?: number | string | null;
  role?: string | null;
};

type ArticleRow = {
  id: string;
  source_id?: string | null;
  source_name?: string | null;
  title: string;
  description?: string | null;
  url: string;
  canonical_url?: string | null;
  published_at?: string | null;
  normalized_title?: string | null;
};

type PreparedArticle = ArticleRow & {
  tokens: Set<string>;
  numbers: Set<string>;
  publishedMs: number;
  trust: number;
};

type Cluster = {
  articles: PreparedArticle[];
  tokenUnion: Set<string>;
  earliestMs: number;
  latestMs: number;
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "after", "before", "into", "over", "under",
  "will", "would", "could", "should", "says", "said", "say", "new", "more", "than", "amid", "about",
  "what", "when", "where", "while", "their", "there", "been", "being", "have", "has", "had", "are",
  "was", "were", "its", "it", "in", "on", "at", "to", "of", "a", "an", "is", "as", "by",
  "и", "в", "на", "по", "с", "к", "у", "о", "об", "от", "до", "за", "из", "для", "при", "что",
  "как", "а", "но", "или", "не", "это", "его", "их", "она", "он", "они", "мы", "вы", "быть",
  "будет", "было", "были", "уже", "так", "также", "году", "года", "лет", "ещё", "еще",
  "первый", "первая", "второй", "вторая", "новый", "новая", "новости", "сегодня", "после",
]);

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

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 900)}`);
  }
  return text ? JSON.parse(text) as unknown : null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeTitle(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}%$.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string): { tokens: Set<string>; numbers: Set<string> } {
  const normalized = normalizeTitle(title);
  const tokens = new Set<string>();
  const numbers = new Set<string>();

  for (const token of normalized.split(" ").filter(Boolean)) {
    if (/^\d+(?:[.,]\d+)?%?$/.test(token)) {
      if (token.replace(/\D/g, "").length >= 2) numbers.add(token.replace(",", "."));
      continue;
    }
    const clean = token.replace(/[$%]/g, "");
    if (clean.length < 3 && !["us", "eu", "uk", "g7"].includes(clean)) continue;
    if (STOPWORDS.has(clean)) continue;
    tokens.add(clean);
  }

  return { tokens, numbers };
}

function similarity(a: PreparedArticle, cluster: Cluster): number {
  const outsideWindowMs = a.publishedMs < cluster.earliestMs
    ? cluster.earliestMs - a.publishedMs
    : a.publishedMs > cluster.latestMs
      ? a.publishedMs - cluster.latestMs
      : 0;
  if (outsideWindowMs > MAX_CLUSTER_TIME_GAP_HOURS * 3600000) return 0;

  let intersection = 0;
  for (const token of a.tokens) {
    if (cluster.tokenUnion.has(token)) intersection += 1;
  }
  if (intersection < 3) return 0;

  const union = new Set([...a.tokens, ...cluster.tokenUnion]).size;
  const jaccard = union ? intersection / union : 0;
  const containment = Math.min(a.tokens.size, cluster.tokenUnion.size)
    ? intersection / Math.min(a.tokens.size, cluster.tokenUnion.size)
    : 0;

  const score = Math.max(jaccard, containment * 0.9);
  if (jaccard < JACCARD_THRESHOLD && containment < CONTAINMENT_THRESHOLD) return 0;

  // Different hard numbers usually mean a different event (for example,
  // different earnings figures), unless the wording is almost identical.
  const clusterNumbers = new Set(cluster.articles.flatMap((article) => [...article.numbers]));
  if (a.numbers.size && clusterNumbers.size) {
    const sharesNumber = [...a.numbers].some((number) => clusterNumbers.has(number));
    if (!sharesNumber && jaccard < 0.72) return 0;
  }

  return clampNumber(score, 0, 1);
}

function eventIdFor(cluster: Cluster): string {
  const earliest = [...cluster.articles].sort((a, b) => a.publishedMs - b.publishedMs)[0];
  return `evt_${earliest.id}`;
}

function representativeFor(cluster: Cluster): PreparedArticle {
  return [...cluster.articles].sort((a, b) =>
    b.trust - a.trust ||
    b.title.length - a.title.length ||
    b.publishedMs - a.publishedMs
  )[0];
}

function rankScore(cluster: Cluster, sourceById: Map<string, SourceRow>, nowMs: number): number {
  const sourceIds = new Set(cluster.articles.map((article) => String(article.source_id ?? "")));
  const sourceCount = sourceIds.size;
  const maxTrust = Math.max(...cluster.articles.map((article) => article.trust), 0);
  const ageHours = Math.max(0, (nowMs - cluster.latestMs) / 3600000);
  const recency = Math.pow(0.5, ageHours / 12) * 25;
  const corroboration = Math.min(10, Math.max(0, cluster.articles.length - 1) * 2);
  const sourceBreadth = Math.min(35, 12 * Math.log2(sourceCount + 1));
  const hasOfficial = cluster.articles.some((article) => {
    const source = sourceById.get(String(article.source_id ?? ""));
    return String(source?.role ?? "") === "primary";
  });

  return Math.round(clampNumber(
    sourceBreadth + maxTrust * 25 + recency + corroboration + (hasOfficial ? 5 : 0),
    0,
    100,
  ) * 100) / 100;
}

Deno.serve(async (request) => {
  if (!isAuthorizedService(request)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  let runId: number | null = null;

  try {
    const url = new URL(request.url);
    const hours = clampNumber(Number(url.searchParams.get("hours") ?? 36), 6, 72);
    const limit = Math.round(clampNumber(Number(url.searchParams.get("limit") ?? 500), 50, 1000));

    const latestRuns = await restJson(
      "news_cluster_runs_v2?select=id,started_at,status&order=started_at.desc&limit=1",
    ) as Array<{ id: number; started_at: string; status: string }>;

    if (latestRuns[0]?.started_at) {
      const ageMs = Date.now() - new Date(latestRuns[0].started_at).getTime();
      if (ageMs < COOLDOWN_MINUTES * 60000) {
        return Response.json({
          success: true,
          skipped: true,
          reason: "cluster_cooldown",
          last_run_id: latestRuns[0].id,
          last_started_at: latestRuns[0].started_at,
          cooldown_minutes: COOLDOWN_MINUTES,
        });
      }
    }

    const startedAt = new Date().toISOString();
    const insertedRuns = await restJson("news_cluster_runs_v2", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        started_at: startedAt,
        status: "running",
        stats: { hours, limit, method: CLUSTER_METHOD },
      }),
    }) as Array<{ id: number }>;
    runId = insertedRuns[0]?.id ?? null;

    const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
    const [sourceRows, articleRows] = await Promise.all([
      restJson("news_sources_v2?select=id,name,trust,role&order=id.asc") as Promise<SourceRow[]>,
      restJson(
        `news_articles_shadow?select=id,source_id,source_name,title,description,url,canonical_url,published_at,normalized_title` +
        `&status=eq.candidate&published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=${limit}`,
      ) as Promise<ArticleRow[]>,
    ]);

    const sourceById = new Map(sourceRows.map((source) => [String(source.id), source] as const));
    const prepared: PreparedArticle[] = articleRows
      .filter((article) => article.published_at && !Number.isNaN(new Date(article.published_at).getTime()))
      .map((article) => {
        const { tokens, numbers } = titleTokens(article.title);
        const source = sourceById.get(String(article.source_id ?? ""));
        return {
          ...article,
          tokens,
          numbers,
          publishedMs: new Date(String(article.published_at)).getTime(),
          trust: clampNumber(Number(source?.trust ?? 0.5), 0, 1),
        };
      })
      .filter((article) => article.tokens.size >= 3)
      .sort((a, b) => b.publishedMs - a.publishedMs);

    const clusters: Cluster[] = [];
    const articleSimilarity = new Map<string, number>();

    for (const article of prepared) {
      let bestCluster: Cluster | null = null;
      let bestSimilarity = 0;

      for (const cluster of clusters) {
        const score = similarity(article, cluster);
        if (score > bestSimilarity) {
          bestSimilarity = score;
          bestCluster = cluster;
        }
      }

      if (bestCluster && bestSimilarity > 0) {
        bestCluster.articles.push(article);
        for (const token of article.tokens) bestCluster.tokenUnion.add(token);
        bestCluster.earliestMs = Math.min(bestCluster.earliestMs, article.publishedMs);
        bestCluster.latestMs = Math.max(bestCluster.latestMs, article.publishedMs);
        articleSimilarity.set(article.id, Math.round(bestSimilarity * 1000) / 1000);
      } else {
        clusters.push({
          articles: [article],
          tokenUnion: new Set(article.tokens),
          earliestMs: article.publishedMs,
          latestMs: article.publishedMs,
        });
        articleSimilarity.set(article.id, 1);
      }
    }

    const now = new Date().toISOString();
    const nowMs = Date.now();
    const events: Record<string, unknown>[] = [];
    const links: Record<string, unknown>[] = [];
    let multiSourceEvents = 0;

    for (const cluster of clusters) {
      const representative = representativeFor(cluster);
      const eventId = eventIdFor(cluster);
      const sourceMap = new Map<string, { id: string; name: string; trust: number }>();
      for (const article of cluster.articles) {
        const sourceId = String(article.source_id ?? "");
        if (!sourceId) continue;
        sourceMap.set(sourceId, {
          id: sourceId,
          name: String(article.source_name ?? sourceById.get(sourceId)?.name ?? sourceId),
          trust: article.trust,
        });
      }
      if (sourceMap.size > 1) multiSourceEvents += 1;

      const score = rankScore(cluster, sourceById, nowMs);
      events.push({
        id: eventId,
        representative_article_id: representative.id,
        title: representative.title,
        normalized_title: representative.normalized_title ?? normalizeTitle(representative.title),
        first_published_at: new Date(cluster.earliestMs).toISOString(),
        latest_published_at: new Date(cluster.latestMs).toISOString(),
        article_count: cluster.articles.length,
        source_count: sourceMap.size,
        sources: [...sourceMap.values()],
        max_trust: Math.max(...cluster.articles.map((article) => article.trust), 0),
        rank_score: score,
        status: "candidate",
        cluster_method: CLUSTER_METHOD,
        raw: {
          run_id: runId,
          token_count: cluster.tokenUnion.size,
          article_ids: cluster.articles.map((article) => article.id),
        },
        updated_at: now,
      });

      for (const article of cluster.articles) {
        links.push({
          article_id: article.id,
          event_id: eventId,
          similarity: articleSimilarity.get(article.id) ?? null,
          is_representative: article.id === representative.id,
          updated_at: now,
        });
      }
    }

    for (let i = 0; i < events.length; i += 100) {
      await restJson("news_events_shadow?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(events.slice(i, i + 100)),
      });
    }
    for (let i = 0; i < links.length; i += 100) {
      await restJson("news_event_articles_shadow?on_conflict=article_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(links.slice(i, i + 100)),
      });
    }

    const sortedEvents = [...events].sort((a, b) => Number(b.rank_score) - Number(a.rank_score));
    const finishedAt = new Date().toISOString();
    const stats = {
      hours,
      limit,
      method: CLUSTER_METHOD,
      articles_seen: prepared.length,
      events_upserted: events.length,
      multi_source_events: multiSourceEvents,
      singleton_events: events.filter((event) => Number(event.article_count) === 1).length,
    };

    if (runId) {
      await restJson(`news_cluster_runs_v2?id=eq.${runId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          finished_at: finishedAt,
          status: "success",
          articles_seen: prepared.length,
          events_upserted: events.length,
          multi_source_events: multiSourceEvents,
          stats,
        }),
      });
    }

    return Response.json({
      success: true,
      run_id: runId,
      ...stats,
      top_events: sortedEvents.slice(0, 30).map((event) => ({
        id: event.id,
        title: event.title,
        article_count: event.article_count,
        source_count: event.source_count,
        sources: event.sources,
        rank_score: event.rank_score,
        latest_published_at: event.latest_published_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      try {
        await restJson(`news_cluster_runs_v2?id=eq.${runId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            finished_at: new Date().toISOString(),
            status: "error",
            error: message.slice(0, 1000),
          }),
        });
      } catch {
        // Preserve the original error in the HTTP response.
      }
    }
    return Response.json({ success: false, run_id: runId, error: message }, { status: 500 });
  }
});
