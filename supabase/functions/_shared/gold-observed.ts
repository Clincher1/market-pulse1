/** Gold API quotes, never a futures fallback or Twelve Data close. */
export const GOLD_OBSERVED_INSTRUMENT = 'gold_api_xau_observed_daily';
export const GOLD_OBSERVED_LABEL = 'gold-api.com · последние наблюдения UTC, не официальный close';
export function goldQuote(payload: unknown, fetchedAt: string): { price: number; at: string } {
  const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const price = typeof row.price === 'number' ? row.price : NaN;
  const time = typeof row.updatedAt === 'string' ? Date.parse(row.updatedAt) : NaN;
  const now = Date.parse(fetchedAt);
  if (row.symbol !== 'XAU' || (row.currency != null && row.currency !== 'USD') ||
      !Number.isFinite(price) || price < 100 || price > 50000 || !Number.isFinite(time) ||
      !Number.isFinite(now) || time > now + 120_000 || time < now - 3 * 86400_000) {
    throw new Error('gold: invalid instrument, price or observation timestamp');
  }
  return { price, at: new Date(time).toISOString() };
}
export function goldHistory(rows: unknown, asOf: string, fetchedAt: string) {
  const cutoff = [asOf.slice(0, 10), fetchedAt.slice(0, 10)].sort()[0];
  const dates = new Map<string, number>();
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const date = String(row.observation_date ?? '');
    const value = Number(row.price);
    if (row.instrument_id !== GOLD_OBSERVED_INSTRUMENT || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date ||
        date >= cutoff || !Number.isFinite(value) || value <= 0) continue;
    dates.set(date, value);
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([date, value]) => ({date, value}));
}

/** Limited bootstrap state, not an indefinite exemption for missing history. */
export function goldAccumulating(row: Record<string, unknown>, createdAt: string, now: string): boolean {
  const age = Date.parse(now) - Date.parse(createdAt);
  const quoteAge = Date.parse(now) - Date.parse(String(row.as_of ?? ''));
  return row.id === 'gold' && row.source_label === GOLD_OBSERVED_LABEL && row.change === null &&
    Array.isArray(row.sparkline) && row.sparkline.length === 0 &&
    Array.isArray(row.spark_dates) && row.spark_dates.length === 0 &&
    Number.isFinite(age) && age >= 0 && age <= 3 * 86400_000 &&
    Number.isFinite(quoteAge) && quoteAge >= -120_000 && quoteAge <= 3 * 86400_000;
}
