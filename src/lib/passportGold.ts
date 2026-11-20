// Read-only presentation audit. Never update an immutable daily_snapshots row.
export interface GoldClose { date: string; value: number }
export interface GoldAudit {
  change: number | null;
  baseDate: string | null;
  baseValue: number | null;
}
function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : null;
}
export function auditPassportGold(asset: Record<string, unknown>, history: GoldClose[]): GoldAudit {
  const unknown: GoldAudit = { change: null, baseDate: null, baseValue: null };
  const quoteDate = dateOnly(asset.as_of);
  const last = typeof asset.last === 'number' ? asset.last : NaN;
  const price = typeof asset.price === 'string' && /^\$?[\d,]+(?:\.\d+)?$/.test(asset.price)
    ? Number(asset.price.replace(/[$,]/g, '')) : NaN;
  if (!quoteDate || !(last > 0) || !(price > 0) || !Number.isFinite(price)) return unknown;
  const closes = history.filter((p) => dateOnly(p.date) === p.date && p.value > 0 && Number.isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  // Ambiguous historical evidence must not choose a convenient value.
  if (new Set(closes.map((p) => p.date)).size !== closes.length) return unknown;
  const sameDay = closes.find((p) => p.date === quoteDate);
  const earlier = closes.filter((p) => p.date < quoteDate);
  const prior = earlier[earlier.length - 1];
  if (!prior || Date.parse(quoteDate) - Date.parse(prior.date) > 7 * 86400000) return unknown;
  const matches = (a: number, b: number) => Math.abs(a - b) < 0.00001;
  // A later quote's stored last must match the latest earlier XAU/USD close.
  // A dated daily close may instead match the same-day history observation.
  const isQuote = matches(last, prior.value);
  const isClose = sameDay && matches(last, sameDay.value) && Math.abs(price - sameDay.value) <= 0.051;
  if (!isQuote && !isClose) return unknown;
  if (asset.last_date != null && asset.last_date !== (isQuote ? prior.date : quoteDate)) return unknown;
  return { change: (price / prior.value - 1) * 100, baseDate: prior.date, baseValue: prior.value };
}
