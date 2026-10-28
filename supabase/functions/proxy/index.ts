// Supabase Edge Function: proxy (hardened 2026-10-22, deployed live v20)
import { serveWithErrorReporting } from "../_shared/observability.ts";
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
serveWithErrorReporting("proxy", async (req: Request) => {
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
    // Follow redirects manually: fetch() would silently chase a redirect to
    // any host, turning the allowlist into decoration. Every hop is checked.
    const MAX_BYTES = 2_000_000;
    let current = target;
    let upstream: Response | null = null;
    for (let hop = 0; hop <= 3; hop++) {
      const hopUrl = new URL(current);
      if (hopUrl.protocol !== 'https:' || !ALLOWED_HOSTS.some((host) => hopUrl.hostname === host)) {
        return json(403, { error: 'Redirect target not allowed', host: hopUrl.hostname });
      }
      upstream = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'MarketPulse/1.0', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
      });
      if (upstream.status < 300 || upstream.status >= 400) break;
      const location = upstream.headers.get('Location');
      if (!location || hop === 3) return json(502, { error: 'Too many redirects' });
      current = new URL(location, current).toString();
    }
    if (!upstream) return json(502, { error: 'No upstream response' });
    const declared = Number(upstream.headers.get('Content-Length') ?? 0);
    if (declared > MAX_BYTES) return json(502, { error: 'Upstream response too large' });
    const bodyText = await upstream.text();
    if (bodyText.length > MAX_BYTES) return json(502, { error: 'Upstream response too large' });
    return new Response(bodyText, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, 'Content-Type': upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    return json(500, { error: String(err).slice(0, 300) });
  }
});
