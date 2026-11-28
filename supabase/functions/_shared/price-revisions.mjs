export const PRICE_REVISION_THRESHOLD_PCT = 2;

// Only fully closed index/futures daily bars are immutable history. Crypto
// candles can still be forming, while XAU rows are spot observations, not closes.
const CLOSED_DAILY_INSTRUMENTS = new Set([
  'brent_yahoo_bzf',
  'sp500_yahoo_gspc',
]);

function decimal10(value) {
  return Math.round(Number(value) * 1e10) / 1e10;
}

/**
 * Compare a newly fetched point with the accepted value for the same instrument
 * and session date. The caller supplies utcToday from its runner (Edge/Actions),
 * never from a local development or sandbox clock.
 */
export function compareDailyCloseRevision({
  instrumentId,
  observationDate,
  utcToday,
  originalValue,
  revisedValue,
  thresholdPct = PRICE_REVISION_THRESHOLD_PCT,
}) {
  const original = decimal10(originalValue);
  const revised = decimal10(revisedValue);
  if (!Number.isFinite(original) || original <= 0 || !Number.isFinite(revised) || revised <= 0) {
    throw new TypeError('Daily close values must be finite positive numbers');
  }

  if (!CLOSED_DAILY_INSTRUMENTS.has(instrumentId) || observationDate >= utcToday) {
    return { action: 'write', isRevision: false, deltaPct: null, reason: 'not_closed_daily_bar' };
  }

  if (original === revised) {
    return { action: 'write', isRevision: false, deltaPct: 0, reason: 'unchanged' };
  }

  const deltaPct = Math.round((((revised / original) - 1) * 100) * 1e8) / 1e8;
  if (Math.abs(deltaPct) > thresholdPct) {
    return { action: 'pending_review', isRevision: true, deltaPct, reason: 'over_threshold' };
  }

  return { action: 'accept_revision', isRevision: true, deltaPct, reason: 'within_threshold' };
}
