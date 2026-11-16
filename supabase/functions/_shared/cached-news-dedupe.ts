/**
 * Remove candidates whose canonical URL is already present in cached_news.
 * The caller is responsible for canonicalizing URLs consistently before this
 * function is called (the news writer's normalizeUrl and database helper do so).
 */
export function removeStoredUrlCandidates<T extends { url: string }>(
  candidates: readonly T[],
  storedUrlKeys: ReadonlySet<string>,
): { fresh: T[]; duplicates: number } {
  const fresh: T[] = [];
  let duplicates = 0;

  for (const candidate of candidates) {
    if (storedUrlKeys.has(candidate.url)) {
      duplicates += 1;
    } else {
      fresh.push(candidate);
    }
  }

  return { fresh, duplicates };
}
