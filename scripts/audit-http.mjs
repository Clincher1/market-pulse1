// Read-only supplementary production audit. No Edge Functions or writer calls.
import fs from 'node:fs/promises';
const origin = 'https://market-pulse1-eta.vercel.app';
const sb = 'https://hekzplfftannlzwvgwwm.supabase.co';
const source = await fs.readFile('src/lib/supabase.ts', 'utf8');
const apikey = source.match(/'(sb_publishable_[^']+)'/)[1];
const report = { started: new Date().toISOString(), endpoints: [], publicApi: [], findings: [] };
const output = 'docs/audit-evidence/full-audit/http.json';
async function probe(base, path, api = false) {
  const start = performance.now();
  try {
    const r = await fetch(base + path, { headers: api ? { apikey } : {}, signal: AbortSignal.timeout(60000) });
    const bytes = Buffer.from(await r.arrayBuffer());
    const entry = { path, status: r.status, url: r.url, ms: Math.round(performance.now() - start), bytes: bytes.length,
      headers: Object.fromEntries(['content-type', 'content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cache-control', 'x-vercel-cache'].map(k => [k, r.headers.get(k)])) };
    if (r.headers.get('content-type')?.includes('json')) { try { entry.json = JSON.parse(bytes.toString()); } catch { entry.invalidJson = true; } }
    if (path === '/api/brief-image' && r.ok) entry.png = { validSignature: bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), width: bytes.length > 24 ? bytes.readUInt32BE(16) : null, height: bytes.length > 24 ? bytes.readUInt32BE(20) : null };
    (api ? report.publicApi : report.endpoints).push(entry);
    return entry;
  } catch (e) { const entry = { path, error: e.message }; (api ? report.publicApi : report.endpoints).push(entry); return entry; }
}
for (const path of ['/', '/world', '/status', '/memory/', '/robots.txt', '/sitemap.xml', '/favicon.svg', '/icon-192.png', '/apple-touch-icon.png', '/api/russia-insights', '/api/russia-history', '/api/brief-image']) {
  const result = await probe(origin, path);
  if (result.json && path === '/api/russia-insights') {
    result.summary = { generatedAt: result.json.generatedAt, elapsed_ms: result.json.elapsed_ms, markets: result.json.markets?.map(m => ({ id: m.id, value: m.value, asOf: m.asOf, previousDate: m.previousDate, changePct: m.changePct })), headlines: result.json.headlines?.length, errors: result.json.errors };
    delete result.json;
  }
  if (result.json && path === '/api/russia-history') {
    result.summary = { generatedAt: result.json.generatedAt, errors: result.json.errors, series: result.json.series?.map(s => ({ id: s.id, points: s.points?.length, first: s.points?.at(0), last: s.points?.at(-1), truncated: s.truncated })) };
    delete result.json;
  }
}
// A readable retired forecast projection is distinct from inaccessible raw tables.
await probe(sb, '/rest/v1/market_memory_forecasts_v1?select=forecast_id,asset_key,issued_at,outcome_status,return_pct,direction_hit&limit=2', true);
await probe(sb, '/rest/v1/forecast_outcomes_v2?select=forecast_id&limit=1', true);
await probe(sb, '/rest/v1/source_preferences?select=*&limit=1', true);
await probe(sb, '/rest/v1/site_health?select=checked_at,ok,trigger&order=checked_at.desc&limit=2', true);
report.finished = new Date().toISOString();
await fs.mkdir('docs/audit-evidence/full-audit', { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ endpoints: report.endpoints.map(e => ({ path: e.path, status: e.status, error: e.error, ms: e.ms })), api: report.publicApi.map(e => ({ path: e.path.split('?')[0], status: e.status, rows: Array.isArray(e.json) ? e.json.length : null })) }, null, 2));
