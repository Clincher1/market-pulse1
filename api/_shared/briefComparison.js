function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function formatDelta(value, unit) {
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2).replace('.', ',')}\u00a0${unit}`;
}

/** Rates are differences in percentage points; prices are relative changes. */
export function briefDelta(base, current, unit) {
  if (!Number.isFinite(base) || !Number.isFinite(current)) return null;
  const kind = unit === '%' ? 'points' : 'relative';
  if (kind === 'relative' && (base <= 0 || current <= 0)) return null;
  const value = kind === 'points' ? current - base : (current / base - 1) * 100;
  if (!Number.isFinite(value) || Math.round(Math.abs(value) * 100) === 0) return null;
  return {
    kind,
    magnitude: Math.abs(value),
    label: formatDelta(value, kind === 'points' ? 'п.п.' : '%'),
    formula: kind === 'points'
      ? 'текущее значение − значение в снимке, в п.п.'
      : '(текущее значение / значение в снимке − 1) × 100',
  };
}

/** Use the date paired with the value, never the live quote's as_of. */
export function lastSeriesObservation(asset) {
  const values = asset.sparkline;
  const dates = asset.sparkDates;
  if (!Array.isArray(values) || !Array.isArray(dates) || dates.length !== values.length || !values.length) return null;
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  if (dates.some((date, index) => !validDate(date) || (index > 0 && date <= dates[index - 1]))) return null;
  return { value: values[values.length - 1], date: dates[dates.length - 1] };
}

/** Old snapshots did not save the date of `last`; a quote date is not a substitute. */
export function snapshotSeriesDateLabel(date) {
  return date && validDate(date) ? date.split('-').reverse().join('.') : 'дата точки в снимке не сохранена';
}

/** Never rank percentages against percentage points. */
export function orderBriefComparisons(rows) {
  return (['relative', 'points']).flatMap((kind) => rows
    .filter((row) => row.kind === kind)
    .sort((a, b) => b.magnitude - a.magnitude || a.item.id.localeCompare(b.item.id))
    .slice(0, 6));
}
