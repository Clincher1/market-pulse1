import type { NewsItem } from '../data/marketTypes';

/**
 * Conservative duplicate grouping for the public news cache.
 *
 * This is intentionally NOT topic/event clustering. It only collapses:
 *   1. the same canonical URL;
 *   2. the same normalized headline;
 *   3. very close headline rewrites inside a 36-hour window.
 *
 * Related follow-up stories (for example, a second Iran/oil development a
 * few hours later) therefore stay visible. Semantic event clustering belongs
 * to the V2 shadow pipeline, where articles have explicit event IDs.
 */

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
]);

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'as',
  'at', 'by', 'from', 'after', 'over', 'amid', 'says', 'said', 'say', 'new',
  'update', 'updated', 'breaking', 'exclusive', 'analysis', 'opinion',
  'и', 'в', 'на', 'по', 'к', 'с', 'у', 'о', 'об', 'за', 'для', 'от', 'до',
  'из', 'при', 'что', 'как', 'это', 'новые', 'новый', 'новая',
]);

const TITLE_TOKEN_RE = /[\p{L}\p{N}]+/gu;
const NEAR_DUPLICATE_WINDOW_MS = 36 * 60 * 60 * 1000;

export function canonicalNewsUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';

    const params = new URLSearchParams();
    for (const [key, paramValue] of [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) params.append(key, paramValue);
    }
    url.search = params.toString() ? `?${params.toString()}` : '';
    return url.toString();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .toLowerCase()
    .replace(/\s+[-|–—]\s*(cnbc|bloomberg|financial times|reuters|wsj|marketwatch)\s*$/i, '')
    .replace(/^(breaking|update|exclusive|analysis|opinion)\s*[:\-–—]\s*/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(normalizedTitle: string): Set<string> {
  const tokens = normalizedTitle.match(TITLE_TOKEN_RE) ?? [];
  return new Set(
    tokens.filter((token) => {
      if (STOP_WORDS.has(token)) return false;
      if (/^\d+$/.test(token)) return token.length >= 2;
      return token.length >= 3;
    }),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / (a.size + b.size - common);
}

function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.min(a.size, b.size);
}

function areNearDuplicateTitles(
  aTokens: Set<string>,
  bTokens: Set<string>,
  aTime: number,
  bTime: number,
): boolean {
  if (aTokens.size < 4 || bTokens.size < 4) return false;
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
    if (Math.abs(aTime - bTime) > NEAR_DUPLICATE_WINDOW_MS) return false;
  }

  let common = 0;
  for (const token of aTokens) if (bTokens.has(token)) common += 1;
  if (common < 3) return false;

  return jaccard(aTokens, bTokens) >= 0.78 || containment(aTokens, bTokens) >= 0.9;
}

function publishedTime(item: NewsItem): number {
  return item.published_at ? Date.parse(item.published_at) : Number.NaN;
}

function representativeScore(item: NewsItem): number {
  const importance = Number.isFinite(item.importance) ? item.importance : 0;
  const confidence = Number.isFinite(item.confidence) ? Number(item.confidence) : 0;
  const summaryBonus = Math.min((item.summary ?? '').length, 500) / 1000;
  return importance * 10 + confidence * 2 + summaryBonus;
}

function mergeImpacts(items: NewsItem[]): NewsItem['impacts'] {
  const seen = new Set<string>();
  const merged: NewsItem['impacts'] = [];
  for (const item of items) {
    for (const impact of item.impacts ?? []) {
      const key = `${impact.asset}\u0000${impact.direction}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(impact);
    }
  }
  return merged;
}

type NewsGroup = {
  item: NewsItem;
  canonicalUrl: string;
  normalizedTitle: string;
  tokens: Set<string>;
  latestTime: number;
  sources: Set<string>;
  count: number;
};

export function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  const groups: NewsGroup[] = [];

  for (const item of items) {
    const canonicalUrl = canonicalNewsUrl(item.url);
    const normalizedTitle = normalizeTitle(item.title);
    const tokens = titleTokens(normalizedTitle);
    const itemTime = publishedTime(item);

    const group = groups.find((existing) => {
      if (canonicalUrl && existing.canonicalUrl && canonicalUrl === existing.canonicalUrl) return true;
      if (normalizedTitle && normalizedTitle === existing.normalizedTitle) return true;
      return areNearDuplicateTitles(tokens, existing.tokens, itemTime, existing.latestTime);
    });

    if (!group) {
      groups.push({
        item: {
          ...item,
          impacts: mergeImpacts([item]),
          duplicateCount: 1,
          duplicateSources: item.source ? [item.source] : [],
        },
        canonicalUrl,
        normalizedTitle,
        tokens,
        latestTime: itemTime,
        sources: new Set(item.source ? [item.source] : []),
        count: 1,
      });
      continue;
    }

    group.count += 1;
    if (item.source) group.sources.add(item.source);
    if (Number.isFinite(itemTime)) {
      group.latestTime = Number.isFinite(group.latestTime)
        ? Math.max(group.latestTime, itemTime)
        : itemTime;
    }

    const chosen = representativeScore(item) > representativeScore(group.item) ? item : group.item;
    if (chosen === item) {
      group.canonicalUrl = canonicalUrl || group.canonicalUrl;
      group.normalizedTitle = normalizedTitle || group.normalizedTitle;
      group.tokens = tokens.size > 0 ? tokens : group.tokens;
    }

    group.item = {
      ...chosen,
      published_at: Number.isFinite(group.latestTime)
        ? new Date(group.latestTime).toISOString()
        : chosen.published_at,
      impacts: mergeImpacts([group.item, item]),
      duplicateCount: group.count,
      duplicateSources: [...group.sources],
    };
  }

  return groups.map((group) => group.item);
}
