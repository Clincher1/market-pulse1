export const TENSION_MIN_NEWS = 3;
export const TENSION_MIN_IMPORTANCE = 3;
export const TENSION_MIN_CONFIDENCE = 0.5;
export const TENSION_WINDOW_HOURS = 24;
export const TENSION_FUTURE_ALLOWANCE_MINUTES = 15;
export const TENSION_RAW_QUERY_LIMIT = 400;
export const TENSION_SAMPLE_LIMIT = 300;
export const TENSION_BLOCKED_SOURCES = Object.freeze(["GDELT (Global)", "GDELT"]);

const BLOCKED_SOURCES = new Set(TENSION_BLOCKED_SOURCES);
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function canonicalNewsUrl(value) {
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

function normalizedNewsTitle(value) {
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

function newsTitleTokens(normalizedTitle) {
  return new Set(
    (normalizedTitle.match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => {
      if (DEDUPE_STOP_WORDS.has(token)) return false;
      if (/^\d+$/.test(token)) return token.length >= 2;
      return token.length >= 3;
    }),
  );
}

function areNearDuplicateTitles(a, b) {
  if (a.size < 4 || b.size < 4) return false;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  if (common < 3) return false;
  const jaccard = common / (a.size + b.size - common);
  const containment = common / Math.min(a.size, b.size);
  return jaccard >= 0.78 || containment >= 0.9;
}

/** Shared PostgREST query window for the writer and selfcheck. */
export function tensionNewsQueryParams(now) {
  const cutoff = new Date(now.getTime() - TENSION_WINDOW_HOURS * 3_600_000).toISOString();
  const futureLimit = new Date(now.getTime() + TENSION_FUTURE_ALLOWANCE_MINUTES * 60_000).toISOString();
  const params = new URLSearchParams({
    select: "sentiment,importance,confidence,source,published_at,title,url",
    order: "published_at.desc",
    limit: String(TENSION_RAW_QUERY_LIMIT),
  });
  params.append("published_at", `gte.${cutoff}`);
  params.append("published_at", `lte.${futureLimit}`);
  return params;
}

/** Apply the writer's qualification, duplicate suppression, ordering, and sample cap. */
export function selectTensionNews(rawNews) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const acceptedTitleTokens = [];
  return rawNews
    .filter((item) => {
      if (BLOCKED_SOURCES.has(String(item.source ?? ""))) return false;
      const sentiment = Number(item.sentiment);
      const importance = Number(item.importance);
      const confidence = Number(item.confidence);
      return (
        Number.isFinite(sentiment) && sentiment >= -1 && sentiment <= 1 &&
        Number.isFinite(importance) && importance >= TENSION_MIN_IMPORTANCE &&
        Number.isFinite(confidence) && confidence >= TENSION_MIN_CONFIDENCE
      );
    })
    .filter((item) => {
      const urlKey = canonicalNewsUrl(item.url);
      if (urlKey && seenUrls.has(urlKey)) return false;

      const titleKey = normalizedNewsTitle(item.title);
      if (titleKey && seenTitles.has(titleKey)) return false;

      const tokens = newsTitleTokens(titleKey);
      if (acceptedTitleTokens.some((existing) => areNearDuplicateTitles(tokens, existing))) return false;

      if (urlKey) seenUrls.add(urlKey);
      if (titleKey) seenTitles.add(titleKey);
      acceptedTitleTokens.push(tokens);
      return true;
    })
    // Preserve the writer's 300-record cap after qualification and deduplication.
    .slice(0, TENSION_SAMPLE_LIMIT);
}

/** Shared weighted negative-share calculation used by both writer and selfcheck. */
export function calculateTensionIndex(news) {
  let negativeWeight = 0;
  let totalWeight = 0;
  let newestPublished = null;
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
  const rawIndex = totalWeight > 0 ? (negativeWeight / totalWeight) * 100 : 0;
  const index = totalWeight > 0 ? clamp(Math.round(rawIndex), 0, 100) : 0;
  return {
    index,
    rawIndex,
    newsCount: news.length,
    sampleNewest: newestPublished === null ? null : new Date(newestPublished).toISOString(),
  };
}
