// Market Pulse source probe.
import { serveWithErrorReporting } from "../_shared/observability.ts";
import { isAuthorizedService, unauthorized } from "../_shared/auth.ts";
//
// Purpose: verify that candidate RSS/Atom feeds are reachable from Supabase
// Edge Function egress and return parseable feed XML. This function is
// read-only: it does not write to the database and does not accept arbitrary
// URLs from the caller. Select a subset with ?only=id1,id2.

type Feed = {
  id: string;
  name: string;
  url: string;
};

const FEEDS: Feed[] = [
  { id: "Bloomberg-markets", name: "Bloomberg Markets", url: "https://www.bloomberg.com/feeds/markets/news.rss" },
  { id: "Bloomberg-economics", name: "Bloomberg Economics", url: "https://www.bloomberg.com/feeds/economics/news.rss" },
  { id: "Bloomberg-politics", name: "Bloomberg Politics", url: "https://www.bloomberg.com/feeds/politics/news.rss" },
  { id: "ft-markets", name: "FT Markets", url: "https://www.ft.com/markets?format=rss" },
  { id: "CNBC-economy", name: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { id: "CNBC-world", name: "CNBC World", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html" },
  { id: "wsj-markets", name: "WSJ Markets", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain" },
  { id: "wsj-world", name: "WSJ World", url: "https://feeds.content.dowjones.io/public/rss/RSSWorldNews" },
  { id: "bbc-business", name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { id: "bbc-world", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  {
    id: "reuters-google-business",
    name: "Reuters via Google News Business",
    url: "https://news.google.com/rss/search?q=when:24h+site:reuters.com/business&ceid=US:en&hl=en-US&gl=US",
  },
  { id: "fed-press", name: "Federal Reserve Press", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { id: "kommersant-economics", name: "Kommersant Economics", url: "https://www.kommersant.ru/rss/section-economics.xml" },
  { id: "kommersant-business", name: "Kommersant Business", url: "https://www.kommersant.ru/rss/section-business.xml" },
  { id: "vedomosti-economics", name: "Vedomosti Economics", url: "https://www.vedomosti.ru/rss/rubric/economics" },
  { id: "vedomosti-finance", name: "Vedomosti Finance", url: "https://www.vedomosti.ru/rss/rubric/finance" },
  { id: "rbc-full", name: "RBC Full", url: "https://rssexport.rbc.ru/rbcnews/news/30/full.rss" },
  { id: "interfax", name: "Interfax", url: "https://www.interfax.ru/rss.asp" },
  { id: "TASS", name: "TASS", url: "https://tass.ru/rss/v2.xml" },
  { id: "frank-media", name: "Frank Media", url: "https://frankmedia.ru/feed" },
  { id: "oilprice", name: "OilPrice", url: "https://oilprice.com/rss/main" },
  { id: "coindesk", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { id: "dw-business", name: "DW Business", url: "https://rss.dw.com/rdf/rss-en-bus" },
  { id: "guardian-business", name: "Guardian Business", url: "https://www.theguardian.com/uk/business/rss" },
];

const USER_AGENT = "MarketPulseBot/0.2 (+https://market-pulse1-eta.vercel.app; RSS source probe)";

function stripHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function itemChunks(xml: string): string[] {
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  if (chunks.length > 0) return chunks;
  return xml.split(/<entry[\s>]/i).slice(1);
}

function sampleTitles(xml: string): string[] {
  const titles: string[] = [];
  for (const chunk of itemChunks(xml).slice(0, 8)) {
    const match = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) continue;
    const title = stripHtml(match[1]);
    if (title) titles.push(title.slice(0, 220));
    if (titles.length >= 3) break;
  }
  return titles;
}

function sampleCategories(xml: string): string[] {
  const categories = new Set<string>();
  for (const chunk of itemChunks(xml).slice(0, 12)) {
    const matches = chunk.matchAll(/<category[^>]*(?:term="([^"]+)")?[^>]*>([^<]*)<\/category>/gi);
    for (const match of matches) {
      const value = stripHtml(match[1] ?? match[2] ?? "");
      if (value) categories.add(value.slice(0, 100));
      if (categories.size >= 12) return [...categories];
    }
  }
  return [...categories];
}

function latestDate(xml: string): Date | null {
  let latest: Date | null = null;
  const matches = xml.matchAll(/<(?:pubDate|published|updated|dc:date)[^>]*>([^<]+)</gi);
  let count = 0;
  for (const match of matches) {
    count += 1;
    if (count > 300) break;
    const parsed = new Date(match[1].trim());
    if (Number.isNaN(parsed.getTime())) continue;
    if (!latest || parsed > latest) latest = parsed;
  }
  return latest;
}

async function probe(feed: Feed) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(feed.url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    const itemCount = (text.match(/<item[\s>]/gi) ?? []).length;
    const entryCount = (text.match(/<entry[\s>]/gi) ?? []).length;
    const latest = latestDate(text);
    const looksLikeFeed = /<(rss|feed|rdf:RDF|channel)[\s>]/i.test(text);
    return {
      id: feed.id,
      name: feed.name,
      url: feed.url,
      ok: response.ok && looksLikeFeed && itemCount + entryCount > 0,
      status: response.status,
      final_url: response.url,
      content_type: response.headers.get("content-type"),
      chars: text.length,
      looks_like_feed: looksLikeFeed,
      items: itemCount,
      entries: entryCount,
      latest: latest?.toISOString() ?? null,
      age_hours: latest ? Math.round(((Date.now() - latest.getTime()) / 3_600_000) * 10) / 10 : null,
      sample_titles: sampleTitles(text),
      sample_categories: sampleCategories(text),
      duration_ms: Date.now() - started,
      error: null as string | null,
    };
  } catch (error) {
    return {
      id: feed.id,
      name: feed.name,
      url: feed.url,
      ok: false,
      status: null,
      final_url: feed.url,
      content_type: null,
      chars: 0,
      looks_like_feed: false,
      items: 0,
      entries: 0,
      latest: null,
      age_hours: null,
      sample_titles: [] as string[],
      sample_categories: [] as string[],
      duration_ms: Date.now() - started,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

serveWithErrorReporting("source-probe", async (request) => {
  // The publishable key that ships in the site bundle also passes gateway JWT
  // verification, so verify_jwt alone does not make this private. This probe
  // makes the server fetch 24 external feeds; handed to the public it becomes a
  // free egress and reputation burner against hosts the news pipeline depends
  // on. Fail closed: service key or cron secret only.
  if (!isAuthorizedService(request)) return unauthorized();

  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const onlyParam = url.searchParams.get("only");
  let selected = FEEDS;
  if (onlyParam) {
    const wanted = new Set(onlyParam.split(",").map((value) => value.trim()).filter(Boolean));
    const known = new Set(FEEDS.map((feed) => feed.id));
    const unknown = [...wanted].filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return Response.json({ error: "Unknown feed id", unknown }, { status: 400 });
    }
    selected = FEEDS.filter((feed) => wanted.has(feed.id));
  }

  const results = await mapPool(selected, 6, probe);
  return Response.json({
    generated_at: new Date().toISOString(),
    user_agent: USER_AGENT,
    total: results.length,
    ok: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
});
