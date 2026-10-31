// Stage 2 shadow news ingestion (deterministic part only).
import { serveWithErrorReporting } from "../_shared/observability.ts";
import { failureStreak, isPaused, pauseMessage, type FailureStreak, type HealthHistoryRow } from "../_shared/source-backoff.ts";
//
// Reads enabled sources from news_sources_v2, fetches RSS/Atom directly,
// parses XML, validates dates/URLs/categories/blacklist, and stores auditable
// candidates/rejections in news_articles_shadow. It never writes cached_news.
// LLM classification and event clustering are separate later steps.

const SUPABASE_URL = "https://hekzplfftannlzwvgwwm.supabase.co";
const USER_AGENT = "MarketPulseBot/0.3 (+https://market-pulse1-eta.vercel.app; shadow RSS ingestion)";
const FEED_TIMEOUT_MS = 12_000;
const MAX_FEED_CHARS = 5_000_000;
const MAX_ITEMS_PER_SOURCE = 60;
const MAX_CANDIDATES_PER_SOURCE = 20;
const COOLDOWN_MINUTES = 10;
// Google News answers its RSS search endpoint with 503 on most runs. Asking every
// 30 minutes regardless produced 128 failed requests in three days. After three
// failures in a row the source is left alone for an hour: the loop is visible in
// the health log as "пауза", not hidden and not retried blindly.
const SKIP_AFTER_FAILURES = 3;
const SKIP_MINUTES = 60;
const HEALTH_LOOKBACK_MINUTES = 180;
const GATE_VERSION = "token_prefix_v2";

type SourceHealth = {
  source_id: string;
  ok: boolean;
  http_status: number | null;
  duration_ms: number | null;
  items_seen: number;
  items_candidate: number;
  items_rejected: number;
  latest_published_at: string | null;
  final_url: string;
  error: string | null;
};

type Source = {
  id: string;
  name: string;
  url: string;
  role: string;
  language: string;
  trust: number;
  enabled: boolean;
  max_age_hours: number;
  requires_market_terms: boolean;
  include_categories: unknown;
  exclude_categories: unknown;
  include_url_patterns: unknown;
  exclude_url_patterns: unknown;
};

type XmlNode = {
  tag: string;
  local: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
};

// Token-based market vocabulary. Prefixes are matched only at the start of a
// token, so a stem such as "ставк" no longer matches inside "выставка".
// Categories alone never satisfy this gate.
const MARKET_PHRASES = [
  "interest rate",
  "central bank",
  "federal reserve",
  "ключевая ставка",
  "денежно кредитная политика",
];

const MARKET_EXACT_TOKENS = new Set([
  "fed", "ecb", "btc", "opec", "gdp", "dow", "Brent", "oil",
  "цб", "ввп",
]);

const MARKET_TOKEN_PREFIXES = [
  "market", "stock", "share", "bond", "treasur", "yield", "inflat", "crude", "gold",
  "bitcoin", "crypto", "dollar", "euro", "ruble", "sanction", "tariff", "earning",
  "revenue", "profit", "bank", "econom", "unemploy", "recession", "nasdaq",
  "индекс", "акци", "облигац", "инфляц", "ставк", "центробанк", "нефт", "золот",
  "биткоин", "доллар", "рубл", "санкци", "тариф", "бюджет", "банк", "рынк",
  "бирж", "фьючерс", "дивиденд", "прибыл", "выручк", "экономик",
];

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "yclid", "mc_cid", "mc_eid", "cmpid", "icid", "ref", "referrer",
  "source", "output", "mod", "_ga", "_gl",
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 700)}`);
  return text ? JSON.parse(text) : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(value: string): string {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localName(tag: string): string {
  return tag.split(":").pop()?.toLowerCase() ?? tag.toLowerCase();
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  let first = true;
  while ((match = pattern.exec(raw)) !== null) {
    if (first) {
      first = false;
      continue;
    }
    const name = localName(match[1]);
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: "#root", local: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  const tokenPattern = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/[^>]+>|<[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(xml)) !== null) {
    const token = match[0];
    const current = stack[stack.length - 1];
    if (match[1] !== undefined) {
      current.text += match[1];
      continue;
    }
    if (token.startsWith("<!--") || token.startsWith("<?") || token.startsWith("<!")) continue;

    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim().split(/\s+/)[0];
      const local = localName(name);
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === name || stack[i].local === local) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    if (token.startsWith("<")) {
      const selfClosing = /\/\s*>$/.test(token);
      const inside = token.slice(1, token.endsWith(">") ? -1 : undefined).replace(/\/\s*$/, "").trim();
      const tag = inside.split(/\s+/)[0];
      if (!tag) continue;
      const node: XmlNode = {
        tag,
        local: localName(tag),
        attrs: parseAttributes(inside),
        children: [],
        text: "",
      };
      current.children.push(node);
      if (!selfClosing) stack.push(node);
      continue;
    }

    current.text += decodeEntities(token);
  }
  return root;
}

function textOf(node: XmlNode): string {
  const parts = [node.text, ...node.children.map((child) => textOf(child))];
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function findAll(node: XmlNode, locals: Set<string>, out: XmlNode[] = []): XmlNode[] {
  if (locals.has(node.local)) out.push(node);
  for (const child of node.children) findAll(child, locals, out);
  return out;
}

function childByLocal(node: XmlNode, locals: string[]): XmlNode | undefined {
  const wanted = new Set(locals);
  return node.children.find((child) => wanted.has(child.local));
}

function childText(node: XmlNode, locals: string[]): string {
  const child = childByLocal(node, locals);
  return child ? cleanText(textOf(child)) : "";
}

function extractCategories(item: XmlNode): string[] {
  const categories = new Set<string>();
  for (const child of item.children) {
    if (!["category", "subject"].includes(child.local)) continue;
    const value = cleanText(child.attrs.term || child.attrs.label || textOf(child));
    if (value) categories.add(value.slice(0, 140));
  }
  return [...categories].slice(0, 12);
}

function extractLink(item: XmlNode): string {
  const links = item.children.filter((child) => child.local === "link");
  for (const link of links) {
    const href = link.attrs.href?.trim();
    const rel = (link.attrs.rel || "alternate").toLowerCase();
    if (href && (rel === "alternate" || rel === "")) return href;
  }
  for (const link of links) {
    if (link.attrs.href?.trim()) return link.attrs.href.trim();
    const text = cleanText(textOf(link));
    if (text) return text;
  }
  const guid = childByLocal(item, ["guid", "id"]);
  if (guid && (guid.attrs.ispermalink || "").toLowerCase() !== "false") {
    const text = cleanText(textOf(guid));
    if (/^https?:\/\//i.test(text)) return text;
  }
  return "";
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  let value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value)) value = `${value.replace(" ", "T")}Z`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function canonicalizeUrl(raw: string, base: string): string {
  try {
    const url = new URL(raw, base);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    const params = [...url.searchParams.entries()]
      .filter(([key]) => {
        const lower = key.toLowerCase();
        return !lower.startsWith("utm_") && !TRACKING_PARAMS.has(lower);
      })
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, value] of params) url.searchParams.append(key, value);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function matchAny(normalizedHaystack: string, needles: string[]): boolean {
  return needles.some((needle) => {
    const normalizedNeedle = normalizeText(needle);
    return normalizedNeedle && normalizedHaystack.includes(normalizedNeedle);
  });
}

function hasMarketTerm(normalized: string): boolean {
  if (!normalized) return false;
  if (MARKET_PHRASES.some((phrase) => normalized.includes(normalizeText(phrase)))) {
    return true;
  }
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.some(
    (token) =>
      MARKET_EXACT_TOKENS.has(token) ||
      MARKET_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix)),
  );
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

function skippedHealth(source: Source, streak: FailureStreak): SourceHealth {
  return {
    source_id: source.id,
    ok: false,
    http_status: null,
    duration_ms: 0,
    items_seen: 0,
    items_candidate: 0,
    items_rejected: 0,
    latest_published_at: null,
    final_url: source.url,
    error: pauseMessage(streak, SKIP_MINUTES * 60_000),
  };
}

async function processSource(source: Source, blacklist: string[], now: Date) {
  const started = Date.now();
  const health: SourceHealth = {
    source_id: source.id,
    ok: false,
    http_status: null,
    duration_ms: null,
    items_seen: 0,
    items_candidate: 0,
    items_rejected: 0,
    latest_published_at: null,
    final_url: source.url,
    error: null,
  };
  const articles: Record<string, unknown>[] = [];
  const rejectReasons: Record<string, number> = {};

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    let response: Response;
    let text = "";
    try {
      response = await fetch(source.url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      health.http_status = response.status;
      health.final_url = response.url;
      text = await response.text();
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (text.length > MAX_FEED_CHARS) throw new Error(`Feed too large: ${text.length} chars`);

    const document = parseXml(text);
    const feedRoots = findAll(document, new Set(["rss", "feed", "RDF", "channel"]));
    const items = findAll(document, new Set(["item", "entry"]));
    if (feedRoots.length === 0 || items.length === 0) {
      throw new Error("Response is not a parseable RSS/Atom feed with items");
    }

    health.ok = true;
    health.items_seen = Math.min(items.length, MAX_ITEMS_PER_SOURCE);
    const includeCategories = stringArray(source.include_categories);
    const excludeCategories = stringArray(source.exclude_categories);
    const includeUrls = stringArray(source.include_url_patterns).map((value) => value.toLowerCase());
    const excludeUrls = stringArray(source.exclude_url_patterns).map((value) => value.toLowerCase());

    let latest: Date | null = null;
    let candidateCount = 0;
    for (const item of items.slice(0, MAX_ITEMS_PER_SOURCE)) {
      const title = childText(item, ["title"]);
      const rawLink = extractLink(item);
      const canonicalUrl = rawLink ? canonicalizeUrl(rawLink, String(health.final_url)) : "";
      const guid = childText(item, ["guid", "id"]) || null;
      const description = childText(item, ["description", "summary", "content", "encoded"]).slice(0, 1200) || null;
      const categories = extractCategories(item);
      const dateRaw = childText(item, ["pubdate", "published", "updated", "date", "created"]);
      const published = parseDate(dateRaw);
      if (published && (!latest || published > latest)) latest = published;

      if (!canonicalUrl || title.length < 12) {
        const reason = !canonicalUrl ? "invalid_url" : "title_too_short";
        rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
        health.items_rejected = Number(health.items_rejected) + 1;
        continue;
      }

      let status = "candidate";
      let rejectReason: string | null = null;
      const normalizedTitle = normalizeText(title);
      const normalizedText = normalizeText(`${title} ${description ?? ""}`);
      const normalizedAll = normalizeText(`${title} ${description ?? ""} ${categories.join(" ")}`);
      const normalizedCategories = normalizeText(categories.join(" "));

      if (!published) {
        status = "quarantine";
        rejectReason = "missing_or_invalid_date";
      } else if (published.getTime() > now.getTime() + 15 * 60_000) {
        status = "quarantine";
        rejectReason = "future_date";
      } else if ((now.getTime() - published.getTime()) / 3_600_000 > Number(source.max_age_hours)) {
        status = "rejected";
        rejectReason = "stale";
      } else if (excludeCategories.length && matchAny(normalizedCategories, excludeCategories)) {
        status = "rejected";
        rejectReason = "category_excluded";
      } else if (includeCategories.length && !matchAny(normalizedCategories, includeCategories)) {
        status = "rejected";
        rejectReason = "category_not_included";
      } else if (excludeUrls.some((pattern) => canonicalUrl.toLowerCase().includes(pattern))) {
        status = "rejected";
        rejectReason = "url_excluded";
      } else if (includeUrls.length && !includeUrls.some((pattern) => canonicalUrl.toLowerCase().includes(pattern))) {
        status = "rejected";
        rejectReason = "url_not_included";
      } else if (matchAny(normalizedAll, blacklist)) {
        status = "rejected";
        rejectReason = "blacklist_match";
      } else if (source.requires_market_terms && !hasMarketTerm(normalizedText)) {
        status = "rejected";
        rejectReason = "no_market_terms";
      }

      if (status === "candidate" && candidateCount >= MAX_CANDIDATES_PER_SOURCE) {
        status = "rejected";
        rejectReason = "source_cap";
      }

      if (status === "candidate") {
        candidateCount += 1;
        health.items_candidate = Number(health.items_candidate) + 1;
      }
      else {
        health.items_rejected = Number(health.items_rejected) + 1;
        if (rejectReason) rejectReasons[rejectReason] = (rejectReasons[rejectReason] ?? 0) + 1;
      }

      articles.push({
        id: `a_${await sha256Hex(canonicalUrl)}`,
        source_id: source.id,
        source_name: source.name,
        guid,
        url: rawLink,
        canonical_url: canonicalUrl,
        title: title.slice(0, 500),
        normalized_title: normalizedTitle,
        description,
        categories,
        published_at: published?.toISOString() ?? null,
        fetched_at: now.toISOString(),
        status,
        reject_reason: rejectReason,
        language: source.language,
        raw: {
          feed_url: source.url,
          final_url: health.final_url,
          date_raw: dateRaw || null,
          role: source.role,
          trust: source.trust,
          gate_version: GATE_VERSION,
        },
        updated_at: now.toISOString(),
      });
    }
    health.latest_published_at = latest?.toISOString() ?? null;
  } catch (error) {
    health.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  } finally {
    health.duration_ms = Date.now() - started;
  }

  return { health, articles, rejectReasons };
}

serveWithErrorReporting("ingest-news-v2-shadow", async (request) => {
  if (!isAuthorizedService(request)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  const requestUrl = new URL(request.url);
  const only = new Set((requestUrl.searchParams.get("only") ?? "").split(",").map((v) => v.trim()).filter(Boolean));

  try {
    {
      const latestRuns = (await restJson(
        "news_ingest_runs_v2?select=id,started_at,status&order=started_at.desc&limit=1",
      )) as Array<Record<string, unknown>>;
      const latest = latestRuns[0];
      if (latest?.started_at) {
        const ageMinutes = (Date.now() - new Date(String(latest.started_at)).getTime()) / 60_000;
        if (ageMinutes >= 0 && ageMinutes < COOLDOWN_MINUTES) {
          return Response.json({ success: true, skipped: true, reason: "cooldown", latest_run: latest });
        }
      }
    }

    const sourcesAll = (await restJson(
      "news_sources_v2?select=*&enabled=eq.true&order=id.asc",
    )) as Source[];
    const sources = only.size ? sourcesAll.filter((source) => only.has(source.id)) : sourcesAll;
    if (sources.length === 0) throw new Error("No enabled sources selected");

    const blacklistRows = (await restJson("news_blacklist?select=phrase&order=id.asc")) as Array<Record<string, unknown>>;
    const blacklist = blacklistRows.map((row) => String(row.phrase ?? "")).filter(Boolean);

    const runRows = (await restJson("news_ingest_runs_v2", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "running", sources_total: sources.length }),
    })) as Array<Record<string, unknown>>;
    const runId = runRows[0]?.id;

    const now = new Date();
    let history: HealthHistoryRow[] = [];
    try {
      history = (await restJson(
        `news_source_health_v2?select=source_id,ok,http_status,created_at&created_at=gt.${encodeURIComponent(
          new Date(now.getTime() - HEALTH_LOOKBACK_MINUTES * 60_000).toISOString(),
        )}&order=created_at.desc&limit=600`,
      )) as HealthHistoryRow[];
    } catch {
      // Without history every source is attempted: a missing log must not stop
      // the ingestion.
      history = [];
    }
    const streaks = failureStreak(history);
    const skipped = new Set<string>();
    const results = await mapPool(sources, 4, async (source) => {
      const streak = streaks.get(source.id);
      if (isPaused(streak, Date.now(), SKIP_AFTER_FAILURES, SKIP_MINUTES * 60_000)) {
        skipped.add(source.id);
        return { health: skippedHealth(source, streak!), articles: [], rejectReasons: {} };
      }
      return await processSource(source, blacklist, now);
    });

    const healthRows = results.map((result) => ({ ...result.health, run_id: runId }));
    if (healthRows.length) {
      await restJson("news_source_health_v2", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(healthRows),
      });
    }

    const byCanonical = new Map<string, Record<string, unknown>>();
    for (const result of results) {
      for (const article of result.articles) {
        const key = String(article.canonical_url);
        const existing = byCanonical.get(key);
        if (!existing || (existing.status !== "candidate" && article.status === "candidate")) {
          byCanonical.set(key, article);
        }
      }
    }
    const uniqueArticles = [...byCanonical.values()];
    for (let i = 0; i < uniqueArticles.length; i += 100) {
      const chunk = uniqueArticles.slice(i, i + 100);
      await restJson("news_articles_shadow?on_conflict=canonical_url", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(chunk),
      });
    }

    const attempted = healthRows.filter((row) => !skipped.has(row.source_id));
    const totals = {
      sources_total: sources.length,
      sources_skipped: skipped.size,
      sources_ok: attempted.filter((row) => row.ok).length,
      items_seen: healthRows.reduce((sum, row) => sum + Number(row.items_seen ?? 0), 0),
      items_candidate: healthRows.reduce((sum, row) => sum + Number(row.items_candidate ?? 0), 0),
      items_rejected: healthRows.reduce((sum, row) => sum + Number(row.items_rejected ?? 0), 0),
      items_upserted: uniqueArticles.length,
    };
    const rejectReasons: Record<string, number> = {};
    for (const result of results) {
      for (const [reason, count] of Object.entries(result.rejectReasons)) {
        rejectReasons[reason] = (rejectReasons[reason] ?? 0) + count;
      }
    }
    // A paused source is a decision, not a failure: the run is judged on the
    // sources it actually asked.
    const status = attempted.length > 0 && totals.sources_ok === attempted.length
      ? "success"
      : totals.sources_ok > 0
        ? "partial"
        : "error";

    if (runId !== undefined) {
      await restJson(`news_ingest_runs_v2?id=eq.${encodeURIComponent(String(runId))}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          finished_at: new Date().toISOString(),
          status,
          ...totals,
          stats: {
            gate_version: GATE_VERSION,
            reject_reasons: rejectReasons,
            sources: healthRows.map((row) => ({
              source_id: row.source_id,
              ok: row.ok,
              http_status: row.http_status,
              items_seen: row.items_seen,
              items_candidate: row.items_candidate,
              items_rejected: row.items_rejected,
              latest_published_at: row.latest_published_at,
              duration_ms: row.duration_ms,
              error: row.error,
            })),
          },
        }),
      });
    }

    const sampleCandidates = uniqueArticles
      .filter((article) => article.status === "candidate")
      .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
      .slice(0, 25)
      .map((article) => ({
        source: article.source_name,
        title: article.title,
        published_at: article.published_at,
        url: article.canonical_url,
      }));

    return Response.json({
      success: true,
      run_id: runId,
      status,
      gate_version: GATE_VERSION,
      ...totals,
      reject_reasons: rejectReasons,
      sample_candidates: sampleCandidates,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
});
