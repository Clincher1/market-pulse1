// Supabase Edge Function: proxy (hardened 2026-10-22, deployed live v20)
// Purpose: GET-only RSS fetch helper/fallback for update-news-v2.
// The former POST branch injected the server GROQ_API_KEY into caller-supplied
// requests and was publicly callable; it has been removed. No secrets are used here.
// Do NOT delete this slug while update-news-v2 keeps its proxy fallback.
const ALLOWED_HOSTS = [
  'www.cnbc.com',
  'www.ft.com',
  'feeds.bloomberg.com',
  'feeds.a.dj.com',
];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get('url');
    if (!target) return json(400, { error: 'Missing ?url= parameter' });
    const targetUrlObj = new URL(target);
    if (targetUrlObj.protocol !== 'https:') return json(403, { error: 'Only https targets are allowed' });
    const isAllowed = ALLOWED_HOSTS.some((host) => targetUrlObj.hostname === host);
    if (!isAllowed) return json(403, { error: 'Host not allowed', host: targetUrlObj.hostname });
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'MarketPulse/1.0', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
    });
    const bodyText = await upstream.text();
    return new Response(bodyText, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, 'Content-Type': upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    return json(500, { error: String(err).slice(0, 300) });
  }
});
