// Token-lean news writer with proper Groq limit handling (2026-10-28).
// Same public contract (cached_news rows, {success, updated} response), plus:
// compact prompt + capped output (about 2.5x fewer tokens per article),
// retries with backoff for per-minute limits, immediate stop on the daily
// token quota, noise sections skipped before Groq, and safe output parsing.
// Body {"dry_run": true, "max_items": n} analyzes without inserting.
// Deployed live as slug `update-news-v2` (third generation of the writer);
// the previous body is kept in the repo history for a fast rollback.
// pg_cron job 2 (update-news-every-15-min) calls this function.
const FALLBACK_URL = 'https://hekzplfftannlzwvgwwm.supabase.co';
const SOURCES = [
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home' },
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { name: 'WSJ', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
];
const ALLOWED_ASSETS = new Set(['S&P 500', 'Gold', 'Brent', 'USD', 'BTC']);
type AnyRecord = Record<string, unknown>;
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_MAX_RETRIES = 3;
const GROQ_NEWS_CHAR_LIMIT = 420;
const GROQ_MAX_OUTPUT_TOKENS = 220;
const GROQ_CALL_SPACING_MS = 150;
// Sections that are never about world markets: do not spend the daily Groq
// token budget on them.
const SKIP_URL_PARTS = [
  '/personal-finance/', '/life/', '/sport', '/sports/', '/culture/',
  '/lifestyle/', '/food/', '/travel/', '/horoscope', '/recipes/', '/games/',
];
let groqStop = false;
let groqDailyLimit = false;
let groqError = '';
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
// A daily token quota (TPD) cannot be waited out, while a per-minute request
// limit (RPM) can; Groq tells them apart in the error text.
function isDailyQuotaError(text: string): boolean {
  return /tokens per day|per day \(TPD\)|\bTPD\b/i.test(text);
}
function retryAfterMs(text: string, attempt: number): number {
  const match = text.match(/try again in\s*([\d.]+)\s*(ms|s|seconds?)/i);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      const ms = match[2].toLowerCase().startsWith('ms') ? value : value * 1000;
      return Math.min(20000, Math.max(500, ms));
    }
  }
  return Math.min(15000, 1200 * 2 ** attempt) + Math.floor(Math.random() * 400);
}
function compactPrompt(news: string): string {
  return `Rate how important this news is for S&P 500, Gold, Brent, USD, BTC. Return JSON {"sentiment":-1..1,"importance":1..10,"confidence":0..1,"impacts":[{"asset":"Gold","direction":"up"}]}.
Rules: personal finance, family, sport, celebrities, games, food, travel -> importance 1, confidence 0.9, impacts []. Macro, policy, companies, sanctions, rates, inflation, technology -> judge for real. Unsure -> importance 2, confidence 0.3, impacts [].
News: "${news.replace(/"/g, '\\"').slice(0, GROQ_NEWS_CHAR_LIMIT)}"`;
}
function supabaseUrl(): string { return (Deno.env.get('SUPABASE_URL') ?? FALLBACK_URL).replace(/\/$/, ''); }
function serviceKey(): string { const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY') ?? ''; if (!k) throw new Error('Missing service role key secret'); return k; }
function isAuthorizedCron(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY') ?? '';
  if (serviceRole && auth === `Bearer ${serviceRole}`) return true;
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!cronSecret || !provided || provided.length !== cronSecret.length) return false;
  let diff = 0;
  for (let i = 0; i < cronSecret.length; i++) diff |= provided.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  return diff === 0;
}
async function restJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = serviceKey();
  const headers = new Headers(init.headers);
  headers.set('apikey', key); headers.set('Authorization', `Bearer ${key}`); headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) as unknown : null;
}
function decodeHtml(html: string): string {
  return html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}
function matchTag(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}
function normalizeUrl(raw: string): string { return raw.replace(/<!\[CDATA\[|\]\]>/g, '').trim().replace(/&amp;/g, '&').split('#')[0].split('?')[0]; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function finite(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
async function fetchRss(url: string): Promise<string> {
  const headers = { 'User-Agent': 'MarketPulseBot/0.4 (+https://market-pulse1-eta.vercel.app)', Accept: 'application/rss+xml,application/xml,text/xml,*/*' };
  try { const direct = await fetch(url, { signal: AbortSignal.timeout(20000), headers }); if (direct.ok) return await direct.text(); } catch { /* proxy fallback */ }
  const proxied = await fetch(`${supabaseUrl()}/functions/v1/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(25000) });
  if (!proxied.ok) throw new Error(`RSS fetch failed for ${url}`);
  return await proxied.text();
}
async function groqRequest(prompt: string): Promise<Response> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('Missing GROQ_API_KEY secret');
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: GROQ_MAX_OUTPUT_TOKENS,
    }),
  });
}

async function analyzeWithGroq(news: string): Promise<AnyRecord | null> {
  const prompt = compactPrompt(news);
  for (let attempt = 0; attempt <= GROQ_MAX_RETRIES; attempt++) {
    if (groqDailyLimit) return null;
    let res: Response;
    try {
      res = await groqRequest(prompt);
    } catch (error) {
      groqError = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
      if (attempt < GROQ_MAX_RETRIES) await sleep(retryAfterMs('', attempt));
      continue;
    }
    if (!res.ok) {
      const errText = await res.text();
      groqError = `Groq ${res.status}: ${errText.slice(0, 200)}`;
      if (res.status === 429) {
        // Daily token quota: stop spending attempts, the remaining items will
        // arrive in the next runs (URL dedupe makes that safe).
        if (isDailyQuotaError(errText)) {
          groqDailyLimit = true;
          groqStop = true;
          return null;
        }
        if (attempt < GROQ_MAX_RETRIES) {
          await sleep(retryAfterMs(errText, attempt));
          continue;
        }
        groqStop = true;
        return null;
      }
      if (res.status >= 500 && attempt < GROQ_MAX_RETRIES) {
        await sleep(retryAfterMs(errText, attempt));
        continue;
      }
      return null;
    }
    try {
      const data = await res.json() as AnyRecord;
      const choices = Array.isArray(data.choices) ? data.choices : [];
      const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as AnyRecord : {};
      const message = first.message && typeof first.message === 'object' ? first.message as AnyRecord : {};
      return JSON.parse(String(message.content ?? '{}')) as AnyRecord;
    } catch (error) {
      groqError = `Groq parse: ${error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120)}`;
      return null;
    }
  }
  return null;
}

function cleanImpacts(value: unknown): Array<{ asset: string; direction: string }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Array<{ asset: string; direction: string }> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as AnyRecord;
    const asset = String(row.asset ?? '');
    const direction = String(row.direction ?? '');
    if (!ALLOWED_ASSETS.has(asset) || (direction !== 'up' && direction !== 'down')) continue;
    const key = `${asset}|${direction}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push({ asset, direction });
  }
  return out;
}
Deno.serve(async (req: Request) => {
  if (!isAuthorizedCron(req)) return Response.json({ success: false, error: 'unauthorized' }, { status: 401 });
  groqStop = false; groqDailyLimit = false; groqError = '';
  let dryRun = false;
  let maxItems = 20;
  try { const body = await req.clone().json() as AnyRecord; dryRun = body?.dry_run === true; const m = Number(body?.max_items); if (Number.isFinite(m) && m > 0) maxItems = Math.min(20, Math.floor(m)); } catch { dryRun = false; }
  try {
    const blacklistRows = await restJson('news_blacklist?select=phrase') as Array<{ phrase: string }>;
    const blacklist = blacklistRows.map((b) => String(b.phrase ?? '').toLowerCase()).filter(Boolean);
    const existingRows = await restJson('cached_news?select=url&order=published_at.desc&limit=1000') as Array<{ url: string }>;
    const seenUrls = new Set(existingRows.map((r) => String(r.url ?? '')));
    const results: AnyRecord[] = [];
    const perSource: AnyRecord = {};
    let analyzed = 0;
    let seq = 0;
    for (const source of SOURCES) {
      if (groqStop || groqDailyLimit || analyzed >= maxItems) { perSource[source.name] = { skipped: true }; continue; }
      let added = 0;
      try {
        const xmlText = await fetchRss(source.url);
        const items = xmlText.split('<item>').slice(1, 6);
        for (const item of items) {
          if (groqStop || groqDailyLimit || analyzed >= maxItems) break;
          const title = decodeHtml(matchTag(item, 'title'));
          const rawDesc = decodeHtml(matchTag(item, 'description'));
          const desc = rawDesc ? (rawDesc.length > 200 ? rawDesc.slice(0, 200) + '...' : rawDesc) : '';
          const url = normalizeUrl(matchTag(item, 'link'));
          const dateRaw = matchTag(item, 'pubDate');
          if (!title || !url) continue;
          if (SKIP_URL_PARTS.some((part) => url.includes(part))) continue;
          if (title.length < 15 && desc.length < 30) continue;
          if (seenUrls.has(url)) continue;
          const haystack = `${title} ${desc}`.toLowerCase();
          if (blacklist.some((phrase) => haystack.includes(phrase))) continue;
          seenUrls.add(url);
          const analysis = await analyzeWithGroq(`${title}. ${desc}`);
          analyzed++;
          await sleep(GROQ_CALL_SPACING_MS);
          if (!analysis) continue;
          const parsedDate = dateRaw ? new Date(dateRaw) : new Date();
          results.push({ id: Date.now() * 1000 + (++seq), source: source.name, time: 'Недавно', title, summary: desc, url, published_at: Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString(), impacts: cleanImpacts(analysis.impacts), sentiment: clamp(finite(analysis.sentiment, 0), -1, 1), importance: clamp(Math.round(finite(analysis.importance, 5)), 1, 10), confidence: clamp(finite(analysis.confidence, 0.5), 0, 1), topic: 'Экономика', updated_at: new Date().toISOString() });
          added++;
        }
      } catch (error) { perSource[source.name] = { error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) }; continue; }
      perSource[source.name] = { added };
    }
    if (!dryRun && results.length) await restJson('cached_news', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(results) });
    return Response.json({ success: true, updated: dryRun ? 0 : results.length, dry_run: dryRun, candidates: results.length, analyzed, groq_error: groqError || null, groq_daily_limit: groqDailyLimit, sources: perSource, sample: results.slice(0, 5).map((r) => ({ source: r.source, title: r.title, importance: r.importance, sentiment: r.sentiment, impacts: r.impacts })) });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message.slice(0, 700) : String(error).slice(0, 700), groq_error: groqError || null }, { status: 500 });
  }
});
