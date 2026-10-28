// Token-lean news writer with a provider chain (2026-10-28).
// Same public contract (cached_news rows, {success, updated} response), plus:
// compact prompt + capped output, retries with backoff for per-minute limits,
// immediate stop on a daily token quota, noise sections skipped before the
// model, tolerant output parsing, and a recorded model marker per row.
//
// Provider chain, tried in order until one answers:
//   1. Groq openai/gpt-oss-120b   (primary, 200k tokens/day free quota)
//   2. Groq openai/gpt-oss-20b    (separate quota in the same account)
//   3. Gemini (Google AI Studio)  (only if GEMINI_API_KEY is set)
//   4. Mistral (La Plateforme)    (only if MISTRAL_API_KEY is set)
// A provider that reports a daily quota is skipped for the rest of the run,
// so the remaining articles go to the next provider instead of being lost.
// Body {"dry_run": true, "max_items": n} analyzes without inserting.
// pg_cron job 2 (update-news-every-15-min) calls this function.
const FALLBACK_URL = 'https://hekzplfftannlzwvgwwm.supabase.co';
const SOURCES = [
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home' },
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  // 2026-10-28: every WSJ feed (Markets, World, US Business, WSJD) froze in
  // January 2025 — all items are ~638 days old, and the table guard rejects
  // anything older than seven days, so the slots spent on them were pure loss.
  // MarketWatch is the closest live markets desk to replace it.
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
];
const ALLOWED_ASSETS = new Set(['S&P 500', 'Gold', 'Brent', 'USD', 'BTC']);
type AnyRecord = Record<string, unknown>;
const MAX_RETRIES = 2;
const NEWS_CHAR_LIMIT = 420;
// gpt-oss models reason before they answer, and that reasoning is billed and
// counted against the output cap. A cap that is too small truncates the JSON,
// which Groq rejects with a 400 json_validate_failed; 400 tokens of headroom
// keeps the answer complete while `low` effort keeps the bill small.
const MAX_OUTPUT_TOKENS = 700;
const CALL_SPACING_MS = 150;
// Spread the daily budget evenly instead of burning it in one burst: at four
// runs an hour this is still far above the ~160 articles the feeds produce.
const DEFAULT_MAX_ITEMS = 6;
const HARD_MAX_ITEMS = 20;
// Sections that are never about world markets: do not spend tokens on them.
const SKIP_URL_PARTS = [
  '/personal-finance/', '/life/', '/sport', '/sports/', '/culture/',
  '/lifestyle/', '/food/', '/travel/', '/horoscope', '/recipes/', '/games/',
];
type Provider = {
  id: string;
  label: string;
  url: string;
  model: string;
  key: string;
  jsonMode: boolean;
  reasoningEffort?: string;
};
let lastError = '';
const exhausted = new Set<string>();
const usedProviders: Record<string, number> = {};

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
// A daily token quota (TPD) cannot be waited out, while a per-minute request
// limit (RPM) can; providers tell them apart in the error text.
function isDailyQuotaError(text: string): boolean {
  return /tokens per day|per day \(TPD\)|\bTPD\b|quota|exhausted/i.test(text);
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
  return Math.min(12000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400);
}
function compactPrompt(news: string): string {
  return `Rate how important this news is for S&P 500, Gold, Brent, USD, BTC. Return JSON {"sentiment":-1..1,"importance":1..10,"confidence":0..1,"impacts":[{"asset":"Gold","direction":"up"}]}.
Rules: personal finance, family, sport, celebrities, games, food, travel -> importance 1, confidence 0.9, impacts []. Macro, policy, companies, sanctions, rates, inflation, technology -> judge for real. Unsure -> importance 2, confidence 0.3, impacts [].
News: "${news.replace(/"/g, '\\"').slice(0, NEWS_CHAR_LIMIT)}"`;
}
function activeProviders(): Provider[] {
  const list: Provider[] = [];
  const groq = Deno.env.get('GROQ_API_KEY') ?? '';
  if (groq) {
    list.push({ id: 'groq120', label: 'groq:openai/gpt-oss-120b', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', key: groq, jsonMode: true, reasoningEffort: 'low' });
    list.push({ id: 'groq20', label: 'groq:openai/gpt-oss-20b', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-20b', key: groq, jsonMode: true, reasoningEffort: 'low' });
  }
  const gemini = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (gemini) {
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite';
    list.push({ id: 'gemini', label: `gemini:${model}`, url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model, key: gemini, jsonMode: false });
  }
  const mistral = Deno.env.get('MISTRAL_API_KEY') ?? '';
  if (mistral) {
    const model = Deno.env.get('MISTRAL_MODEL') ?? 'ministral-8b-latest';
    list.push({ id: 'mistral', label: `mistral:${model}`, url: 'https://api.mistral.ai/v1/chat/completions', model, key: mistral, jsonMode: true });
  }
  return list;
}
async function callProvider(provider: Provider, prompt: string, loose: boolean): Promise<Response> {
  const body: AnyRecord = {
    model: provider.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  // Strict JSON mode is the first choice; if the provider rejects it, the retry
  // asks for plain text and relies on tolerant parsing instead.
  if (provider.jsonMode && !loose) body.response_format = { type: 'json_object' };
  if (provider.reasoningEffort) body.reasoning_effort = provider.reasoningEffort;
  return fetch(provider.url, {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
    body: JSON.stringify(body),
  });
}
function tryParseObject(text: string): AnyRecord | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
  } catch {
    return null;
  }
}
// Providers differ in how strictly they return JSON, so accept a fenced or a
// slightly chatty answer and pull the first JSON object out of it.
function extractObject(raw: string): AnyRecord | null {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const direct = tryParseObject(text);
  if (direct) return direct;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return tryParseObject(text.slice(start, end + 1));
  return null;
}
function contentOf(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const data = payload as AnyRecord;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as AnyRecord : {};
  const message = first.message && typeof first.message === 'object' ? first.message as AnyRecord : {};
  return typeof message.content === 'string' ? message.content : '';
}
async function analyzeWithProviders(news: string): Promise<{ analysis: AnyRecord; provider: string } | null> {
  const prompt = compactPrompt(news);
  for (const provider of activeProviders()) {
    if (exhausted.has(provider.id)) continue;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let res: Response;
      try {
        res = await callProvider(provider, prompt, attempt > 0);
      } catch (error) {
        lastError = `${provider.id}: ${error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160)}`;
        if (attempt < MAX_RETRIES) await sleep(retryAfterMs('', attempt));
        continue;
      }
      if (!res.ok) {
        const errText = await res.text();
        lastError = `${provider.id} ${res.status}: ${errText.slice(0, 160)}`;
        if (res.status === 429) {
          if (isDailyQuotaError(errText)) {
            exhausted.add(provider.id);
            break;
          }
          if (attempt < MAX_RETRIES) {
            await sleep(retryAfterMs(errText, attempt));
            continue;
          }
          break;
        }
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          await sleep(retryAfterMs(errText, attempt));
          continue;
        }
        break;
      }
      const payload = await res.json().catch(() => null);
      const parsed = extractObject(contentOf(payload));
      if (!parsed) {
        lastError = `${provider.id}: unparsable output`;
        break;
      }
      usedProviders[provider.label] = (usedProviders[provider.label] ?? 0) + 1;
      return { analysis: parsed, provider: provider.label };
    }
  }
  return null;
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
  const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}
function normalizeUrl(raw: string): string { return raw.replace(/<!\[CDATA\[|\]\]>/g, '').trim().replace(/&amp;/g, '&').split('#')[0].split('?')[0]; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function finite(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
async function fetchRss(url: string): Promise<{ text: string; via: string; note: string }> {
  const headers = { 'User-Agent': 'MarketPulseBot/0.4 (+https://market-pulse1-eta.vercel.app)', Accept: 'application/rss+xml,application/xml,text/xml,*/*' };
  let note = '';
  try {
    const direct = await fetch(url, { signal: AbortSignal.timeout(20000), headers });
    if (direct.ok) return { text: await direct.text(), via: 'direct', note: '' };
    note = `direct ${direct.status}`;
  } catch (error) { note = `direct error: ${error instanceof Error ? error.message.slice(0, 80) : String(error).slice(0, 80)}`; }
  const proxied = await fetch(`${supabaseUrl()}/functions/v1/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(25000) });
  if (!proxied.ok) throw new Error(`RSS fetch failed for ${url} (${note}, proxy ${proxied.status})`);
  return { text: await proxied.text(), via: 'proxy', note };
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
  lastError = '';
  exhausted.clear();
  for (const key of Object.keys(usedProviders)) delete usedProviders[key];
  let dryRun = false;
  let maxItems = DEFAULT_MAX_ITEMS;
  try {
    const body = await req.clone().json() as AnyRecord;
    dryRun = body?.dry_run === true;
    const m = Number(body?.max_items);
    if (Number.isFinite(m) && m > 0) maxItems = Math.min(HARD_MAX_ITEMS, Math.floor(m));
  } catch { dryRun = false; }
  try {
    const blacklistRows = await restJson('news_blacklist?select=phrase') as Array<{ phrase: string }>;
    const blacklist = blacklistRows.map((b) => String(b.phrase ?? '').toLowerCase()).filter(Boolean);
    const existingRows = await restJson('cached_news?select=url&order=published_at.desc&limit=1000') as Array<{ url: string }>;
    const seenUrls = new Set(existingRows.map((r) => String(r.url ?? '')));
    const results: AnyRecord[] = [];
    const perSource: AnyRecord = {};
    let analyzed = 0;
    let seq = 0;

    // Collect candidates from every feed first, before spending provider calls.
    // Draining one source at a time (the previous behaviour) meant the first
    // feeds in the list consumed the whole item budget: over the last week WSJ
    // contributed 0 articles and 68% of the flow came from Bloomberg, which
    // quietly turned the tension index into one newsroom's mood.
    type Candidate = { title: string; desc: string; url: string; dateRaw: string };
    type Queue = { source: { name: string; url: string }; stats: AnyRecord; items: Candidate[] };
    const queues: Queue[] = [];
    for (const source of SOURCES) {
      const stats: AnyRecord = { added: 0, items: 0, fresh: 0, dup: 0, filtered: 0, via: 'unknown', first_url: '' };
      const items: Candidate[] = [];
      try {
        const feed = await fetchRss(source.url);
        const xmlText = feed.text;
        stats.items = xmlText.split('<item>').slice(1, 6).length;
        stats.via = feed.via;
        if (feed.note) stats.note = feed.note;
        for (const item of xmlText.split('<item>').slice(1, 6)) {
          const title = decodeHtml(matchTag(item, 'title'));
          const rawDesc = decodeHtml(matchTag(item, 'description'));
          const desc = rawDesc ? (rawDesc.length > 200 ? rawDesc.slice(0, 200) + '...' : rawDesc) : '';
          const url = normalizeUrl(matchTag(item, 'link'));
          const dateRaw = matchTag(item, 'pubDate');
          if (!stats.first_url && url) stats.first_url = url.slice(0, 120);
          if (!title || !url) { stats.filtered = (stats.filtered as number) + 1; continue; }
          if (SKIP_URL_PARTS.some((part) => url.includes(part))) { stats.filtered = (stats.filtered as number) + 1; continue; }
          if (title.length < 15 && desc.length < 30) { stats.filtered = (stats.filtered as number) + 1; continue; }
          if (seenUrls.has(url)) { stats.dup = (stats.dup as number) + 1; continue; }
          // The table guard silently drops rows older than seven days or dated
          // more than a day ahead. Analyzing them would burn provider tokens on
          // articles that can never be stored, so skip them before the model
          // gets involved and leave the slot to a usable item.
          const parsedTs = Date.parse(dateRaw);
          if (Number.isFinite(parsedTs)) {
            const ageDays = (Date.now() - parsedTs) / 86_400_000;
            if (ageDays > 7 || ageDays < -1) { stats.filtered = (stats.filtered as number) + 1; continue; }
          }
          const haystack = `${title} ${desc}`.toLowerCase();
          if (blacklist.some((phrase) => haystack.includes(phrase))) { stats.filtered = (stats.filtered as number) + 1; continue; }
          seenUrls.add(url);
          stats.fresh = (stats.fresh as number) + 1;
          items.push({ title, desc, url, dateRaw });
        }
      } catch (error) {
        perSource[source.name] = { error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) };
        continue;
      }
      perSource[source.name] = stats;
      queues.push({ source, stats, items });
    }

    // Round-robin: one candidate per source per pass, and the starting source
    // rotates every 15-minute slot so no feed is permanently last in line.
    const rotation = Math.floor(Date.now() / (15 * 60 * 1000)) % Math.max(1, queues.length);
    const rotated = rotation === 0 ? queues : [...queues.slice(rotation), ...queues.slice(0, rotation)];
    while (analyzed < maxItems) {
      let pickedInPass = false;
      for (const queue of rotated) {
        if (analyzed >= maxItems) break;
        const candidate = queue.items.shift();
        if (!candidate) continue;
        pickedInPass = true;
        const outcome = await analyzeWithProviders(`${candidate.title}. ${candidate.desc}`);
        analyzed++;
        await sleep(CALL_SPACING_MS);
        if (!outcome) continue;
        const analysis = outcome.analysis;
        const parsedDate = candidate.dateRaw ? new Date(candidate.dateRaw) : new Date();
        results.push({ id: Date.now() * 1000 + (++seq), source: queue.source.name, time: 'Недавно', title: candidate.title, summary: candidate.desc, url: candidate.url, published_at: Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString(), impacts: cleanImpacts(analysis.impacts), sentiment: clamp(finite(analysis.sentiment, 0), -1, 1), importance: clamp(Math.round(finite(analysis.importance, 5)), 1, 10), confidence: clamp(finite(analysis.confidence, 0.5), 0, 1), topic: 'Экономика', model: outcome.provider, updated_at: new Date().toISOString() });
        queue.stats.added = (queue.stats.added as number) + 1;
      }
      if (!pickedInPass) break;
    }
    if (!dryRun && results.length) await restJson('cached_news', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(results) });
    return Response.json({ success: true, updated: dryRun ? 0 : results.length, dry_run: dryRun, candidates: results.length, analyzed, max_items: maxItems, last_error: lastError || null, groq_error: lastError || null, groq_daily_limit: exhausted.has('groq120'), providers: usedProviders, sources: perSource, sample: results.slice(0, 5).map((r) => ({ source: r.source, title: r.title, importance: r.importance, sentiment: r.sentiment, impacts: r.impacts, model: r.model })) });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message.slice(0, 700) : String(error).slice(0, 700), groq_error: lastError || null }, { status: 500 });
  }
});
