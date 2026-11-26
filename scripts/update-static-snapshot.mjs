import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DAY = 86400000;
const PROJECT_URL = 'https://hekzplfftannlzwvgwwm.supabase.co';
const historyContracts = [
  { id: 'brent_yahoo_bzf', ticker: 'BZ=F' },
  { id: 'sp500_yahoo_gspc', ticker: '^GSPC' },
  { id: 'gold_api_xau_observed_daily', ticker: 'XAU' },
];
const contracts = [
  { id: 'brent_yahoo_bzf', symbol: 'BZ=F', provider: 'Yahoo Finance',
    instrumentType: 'commodity_future', unit: 'usd_per_barrel',
    instrument: 'Brent, фьючерс ближайшего месяца NYMEX', displayUnit: 'USD за баррель',
    basis: 'Дневное наблюдение Yahoo Finance BZ=F, дата торговой сессии без времени; текущий незакрытый день исключён. Не спотовая цена Brent.',
    sourceUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?range=1y&interval=1d' },
  { id: 'sp500_yahoo_gspc', symbol: '^GSPC', provider: 'Yahoo Finance',
    instrumentType: 'cash_index', unit: 'index_points',
    instrument: 'Индекс S&P 500', displayUnit: 'пункты индекса',
    sourceUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1y&interval=1d' },
  { id: 'gold_api_xau_observed_daily', symbol: 'XAU', provider: 'gold-api.com',
    instrumentType: 'commodity_spot', unit: 'usd_per_troy_ounce',
    instrument: 'Золото, спот XAU/USD', displayUnit: 'USD за тройскую унцию',
    sourceUrl: 'https://api.gold-api.com/price/XAU' },
];

function calendar(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function timestamp(value) {
  return typeof value === 'string' && calendar(value.slice(0, 10))
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}
function requireThat(condition, reason) {
  if (!condition) throw new Error(reason);
}

// Pure validation: no writes and no fallback to an older/convenient observation.
// Ages are UTC calendar-day differences, inclusive of day 7, for EACH row.
export function buildSnapshot(payload, previous, now = new Date()) {
  requireThat(timestamp(payload?.exportedAt), 'Invalid database export timestamp');
  const exportedTime = Date.parse(payload.exportedAt);
  requireThat(Number.isFinite(now.getTime()) && Math.abs(exportedTime - now.getTime()) <= 300000,
    'Database export timestamp differs from runner clock by over five minutes');
  requireThat(previous?.schemaVersion === 1 && Array.isArray(previous.items)
    && previous.items.length === 3, 'Existing snapshot contract is invalid');
  requireThat(timestamp(previous.exportedAt) && Date.parse(previous.exportedAt) <= exportedTime,
    'Export would move the snapshot backwards');
  requireThat(Array.isArray(payload.rows) && payload.rows.length === 3
    && new Set(payload.rows.map(row => row?.id)).size === 3,
  'Export must contain exactly three unique instruments');
  const exportDay = payload.exportedAt.slice(0, 10);
  const items = contracts.map(contract => {
    const row = payload.rows.find(row => row?.id === contract.id);
    const label = contract.symbol;
    requireThat(row && ['symbol', 'provider', 'instrumentType', 'unit', 'sourceUrl']
      .every(field => row[field] === contract[field])
      && row.currency === 'USD' && row.frequency === 'daily', `${label}: instrument metadata mismatch`);
    requireThat(typeof row.value === 'string' && /^\d+(?:\.\d+)?$/.test(row.value)
      && Number.isFinite(Number(row.value)) && Number(row.value) > 0,
    `${label}: missing or invalid numeric string`);
    requireThat(calendar(row.observationDate), `${label}: invalid observation calendar date`);
    const age = (Date.parse(exportDay) - Date.parse(row.observationDate)) / DAY;
    requireThat(age >= 0 && age <= 7, `${label}: observation is future-dated or older than seven UTC calendar days`);
    if (contract.id === 'brent_yahoo_bzf' || contract.id === 'sp500_yahoo_gspc') {
      requireThat(row.observationDate < exportDay,
        `${label}: current daily bar is incomplete and must not enter the static snapshot`);
    }
    if (row.priceTimestamp !== null) {
      requireThat(timestamp(row.priceTimestamp)
        && row.priceTimestamp.slice(0, 10) === row.observationDate
        && Date.parse(row.priceTimestamp) <= exportedTime,
      `${label}: invalid or future price timestamp`);
    }
    requireThat(label !== 'XAU' || timestamp(row.priceTimestamp), `${label}: exact observation time is required`);
    const old = previous.items.find(item => item.ticker === label);
    requireThat(old?.instrument === contract.instrument && old.unit === contract.displayUnit
      && old.source?.name === contract.provider && old.source.url === contract.sourceUrl
      && typeof old.basis === 'string' && old.basis.trim(), `${label}: existing display contract changed`);
    return {
      ticker: label, instrument: old.instrument, value: row.value, unit: old.unit,
      observedAt: label === 'XAU' ? row.priceTimestamp : row.observationDate,
      basis: contract.basis ?? old.basis, source: { name: contract.provider, url: row.sourceUrl },
    };
  });
  return { schemaVersion: 1, exportedAt: payload.exportedAt, items };
}

function buildHistory(rows, item, exportDay) {
  requireThat(Array.isArray(rows) && rows.length <= 7, `${item.ticker}: history response must contain at most seven rows`);
  const windowStart = new Date(Date.parse(`${exportDay}T00:00:00Z`) - 6 * DAY).toISOString().slice(0, 10);
  const byDate = new Map();
  for (const row of rows) {
    requireThat(row && typeof row === 'object' && calendar(row.observation_date)
      && row.observation_date <= item.observedAt.slice(0, 10)
      && row.observation_date <= exportDay,
    `${item.ticker}: invalid or future history date`);
    const value = typeof row.price === 'string' ? row.price : String(row.price);
    requireThat(/^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0,
      `${item.ticker}: invalid history price`);
    requireThat(!byDate.has(row.observation_date), `${item.ticker}: duplicate history date`);
    byDate.set(row.observation_date, { observedAt: row.observation_date, value });
  }
  // The validated current snapshot row is the final observation. It also supplies
  // today's XAU quote because the public historical view intentionally omits the
  // still-open UTC day. Same-date history is replaced, never duplicated.
  byDate.set(item.observedAt.slice(0, 10), {
    observedAt: item.observedAt.slice(0, 10),
    value: item.value,
  });
  return [...byDate.values()]
    .filter(point => point.observedAt >= windowStart && point.observedAt <= exportDay)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

async function readJsonResponse(response, label) {
  requireThat(response.ok, `${label} failed: HTTP ${response.status}`);
  let raw;
  try { raw = await response.text(); } catch { throw new Error(`${label} response read failed`); }
  requireThat(raw.length <= 65536, `${label} response is too large`);
  try { return JSON.parse(raw); } catch { throw new Error(`${label} returned invalid JSON`); }
}

export async function fetchSnapshotHistory({ url, key, fetchImpl, snapshot }) {
  const exportDay = snapshot.exportedAt.slice(0, 10);
  const series = {};
  for (const contract of historyContracts) {
    const item = snapshot.items.find(candidate => candidate.ticker === contract.ticker);
    requireThat(item, `${contract.ticker}: current snapshot row is missing`);
    const query = new URLSearchParams({
      select: 'instrument_id,observation_date,price',
      instrument_id: `eq.${contract.id}`,
      observation_date: `lte.${item.observedAt.slice(0, 10)}`,
      order: 'observation_date.desc',
      limit: '7',
    });
    let response;
    try {
      response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/asset_price_history_v1?${query}`, {
        method: 'GET', headers: { apikey: key, Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(`${contract.ticker}: history request failed or timed out; original file unchanged`);
    }
    const rows = await readJsonResponse(response, `${contract.ticker} history query`);
    requireThat(Array.isArray(rows) && rows.every(row => row?.instrument_id === contract.id),
      `${contract.ticker}: history response contains an unexpected instrument`);
    series[contract.ticker] = buildHistory(rows, item, exportDay);
  }
  return series;
}

export async function updateSnapshot({
  file = new URL('../data/snapshot.json', import.meta.url),
  url = process.env.SUPABASE_URL, key = process.env.SNAPSHOT_SUPABASE_READ_KEY,
  fetchImpl = fetch, now = () => new Date(),
} = {}) {
  requireThat(typeof url === 'string' && url.replace(/\/$/, '') === PROJECT_URL,
    'Set SUPABASE_URL to the Market Pulse project URL');
  requireThat(typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key),
    'Set SNAPSHOT_SUPABASE_READ_KEY to the existing publishable key (not service_role/secret)');
  const previous = JSON.parse(await readFile(file, 'utf8'));
  let response;
  try {
    response = await fetchImpl(`${PROJECT_URL}/rest/v1/rpc/export_static_snapshot_v2`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}',
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('Snapshot RPC request failed or timed out; original file unchanged');
  }
  requireThat(response.ok, `Snapshot RPC failed: HTTP ${response.status}`);
  // Database response is deliberately small. Bound parsing as well as the request timeout.
  let raw;
  try { raw = await response.text(); } catch { throw new Error('Snapshot RPC response read failed'); }
  requireThat(raw.length <= 65536, 'Snapshot RPC response is too large');
  let payload;
  try { payload = JSON.parse(raw); } catch { throw new Error('Snapshot RPC returned invalid JSON'); }
  const latest = buildSnapshot(payload, previous, now());
  const series = await fetchSnapshotHistory({ url: PROJECT_URL, key, fetchImpl, snapshot: latest });
  const snapshot = { ...latest, series };
  const temp = new URL(`.snapshot-${randomUUID()}.tmp`, pathToFileURL(
    typeof file === 'string' ? file : file.pathname,
  ));
  try {
    await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await updateSnapshot();
    console.log(`Snapshot refreshed: ${result.items.length} validated observations; exportedAt=${result.exportedAt}`);
  } catch (error) {
    // Never print request objects, headers, credentials or API response bodies.
    console.error(`Snapshot refresh stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
