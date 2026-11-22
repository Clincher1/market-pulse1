// Read-only permission probe. Uses the public site key, never a privileged credential.
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
const key = source.match(/'(sb_publishable_[^']+)'/)?.[1];
if (!key) throw new Error('Public site key not found; update the access probe');
const base = 'https://hekzplfftannlzwvgwwm.supabase.co/rest/v1/';
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, headers: { apikey: key, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Non-JSON API response'); }
  return { response, data };
}
async function denied(label, path, method, body) {
  const { response, data } = await request(path, method, body);
  if (![401, 403].includes(response.status) || data?.code !== '42501') {
    throw new Error(`${label}: expected permission denial, received HTTP ${response.status}`);
  }
  console.log(`PASS ${label}: permission denied`);
}
const { response, data } = await request('rpc/export_static_snapshot_v1', 'POST', {});
if (!response.ok || data?.rows?.length !== 3
  || data.rows.map(row => row.symbol).sort().join(',') !== 'BZ=F,XAU,^GSPC'
  || !data.rows.every(row => typeof row.value === 'string' && row.sourceUrl)) {
  throw new Error(`Public RPC failed: HTTP ${response.status}`);
}
console.log('PASS public-key RPC: three exact instruments with numeric strings and provenance');
for (const table of ['asset_instruments_v2', 'asset_price_snapshots_v2']) {
  await denied(`${table} SELECT`, `${table}?select=id&limit=1`);
  // Empty inserts and impossible IDs: these probes cannot create/alter real rows,
  // even if a permission unexpectedly regresses. Catalog checks cover all grants.
  const id = table === 'asset_instruments_v2' ? '__snapshot_permission_probe__' : '-1';
  await denied(`${table} INSERT`, table, 'POST', []);
  await denied(`${table} UPDATE`, `${table}?id=eq.${id}`, 'PATCH',
    table === 'asset_instruments_v2' ? { enabled: false } : { price: '1' });
  await denied(`${table} DELETE`, `${table}?id=eq.${id}`, 'DELETE');
}
await denied('History provenance remains closed', 'asset_price_history_v1?select=source_url&limit=1');
for (const path of [
  'asset_price_history_v1?select=frontend_asset_id,instrument_id,provider,provider_symbol,observation_date,price,close,updated_at&limit=1',
  'cached_assets?select=id,name,price,change,sparkline,updated_at,as_of,spark_dates,source_label&limit=1',
]) {
  const result = await request(path);
  if (!result.response.ok || !Array.isArray(result.data) || !result.data.length) {
    throw new Error(`Existing public website read failed: HTTP ${result.response.status}`);
  }
}
console.log('PASS existing public website reads');
