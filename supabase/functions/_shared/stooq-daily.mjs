export const STOOQ_BRENT_SYMBOL = 'qa.f';
export const STOOQ_BRENT_BASE_URL = 'https://stooq.com/q/d/l/';

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function stooqBrentDailyUrl(startDate, endDate) {
  if (!validDay(startDate) || !validDay(endDate) || startDate > endDate) {
    throw new Error('Stooq Brent date range is invalid');
  }
  const query = new URLSearchParams({
    s: STOOQ_BRENT_SYMBOL,
    i: 'd',
    d1: startDate.replaceAll('-', ''),
    d2: endDate.replaceAll('-', ''),
  });
  return `${STOOQ_BRENT_BASE_URL}?${query}`;
}

export function isStooqBrentDailyUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'stooq.com'
      && url.pathname === '/q/d/l/'
      && url.searchParams.get('s')?.toLowerCase() === STOOQ_BRENT_SYMBOL
      && url.searchParams.get('i') === 'd';
  } catch {
    return false;
  }
}

export function parseStooqDaily(csv) {
  if (typeof csv !== 'string' || csv.length > 2_000_000) throw new Error('Stooq CSV is missing or too large');
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
  const headers = (lines.shift() ?? '').split(',').map(value => value.trim().toLowerCase());
  const indices = Object.fromEntries(['date', 'open', 'high', 'low', 'close'].map(name => [name, headers.indexOf(name)]));
  if (indices.date < 0 || indices.close < 0) throw new Error('Stooq CSV has no daily date/close columns');

  const byDate = new Map();
  for (const line of lines) {
    const cells = line.split(',').map(value => value.trim());
    const date = cells[indices.date];
    const value = Number(cells[indices.close]);
    if (!validDay(date) || !Number.isFinite(value) || value <= 0) continue;
    const point = { date, value };
    for (const field of ['open', 'high', 'low']) {
      const column = indices[field];
      const fieldValue = column >= 0 ? Number(cells[column]) : Number.NaN;
      if (Number.isFinite(fieldValue) && fieldValue > 0) point[field] = fieldValue;
    }
    byDate.set(date, point);
  }
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2) throw new Error(`Stooq CSV returned only ${points.length} valid daily closes`);
  return points;
}

/**
 * Fetch Yahoo first and use the same-contract NYMEX QA.F series only after a
 * Yahoo error. `sourceId: 'stooq'` is used when the source gate selected the
 * registered fallback directly.
 */
export async function fetchBrentDaily({ sourceId = 'yahoo', stooqAllowed = true, fetchYahoo, fetchStooq }) {
  if (sourceId === 'stooq') {
    const series = await fetchStooq();
    return {
      series,
      provider: 'Stooq (fallback)',
      sourceRole: 'fallback',
      sourceOutcomes: { stooq: 'ok' },
    };
  }
  try {
    return { series: await fetchYahoo(), provider: 'Yahoo Finance', sourceRole: 'primary' };
  } catch (yahooError) {
    if (!stooqAllowed) throw yahooError;
    try {
      const series = await fetchStooq();
      return {
        series,
        provider: 'Stooq (fallback)',
        sourceRole: 'fallback',
        sourceOutcomes: { yahoo: 'error', stooq: 'ok' },
      };
    } catch (stooqError) {
      const detail = stooqError instanceof Error ? stooqError.message : String(stooqError);
      const failure = new Error(`Yahoo unavailable; Stooq fallback failed: ${detail.slice(0, 300)}`);
      failure.sourceOutcomes = { yahoo: 'error', stooq: 'error' };
      throw failure;
    }
  }
}
