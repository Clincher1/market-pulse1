import type { AssetData } from '../data/marketTypes.ts';

export const DESK_ASSET_IDS = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'] as const;
export const FAVORITES_KEY = 'market-pulse-favorites-v1';
export { WORLD_ASSET_UNITS as DESK_UNITS } from './marketUnits.ts';
export function deskValue(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 }).format(value);
}
export interface DatedValue { date: string; value: number }

export function parseFavorites(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === 'string' && DESK_ASSET_IDS.some((known) => known === id)))]
      : [];
  } catch { return []; }
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Reject ambiguous calendars, never invent dates or silently bridge corrupt rows. */
export function assetObservations(asset: AssetData): DatedValue[] {
  const dates = asset.sparkDates;
  if (!dates || dates.length !== asset.sparkline.length || dates.length < 2) return [];
  if (new Set(dates).size !== dates.length || dates.some((date) => !validDate(date))) return [];
  if (asset.sparkline.some((value) => !Number.isFinite(value) || value <= 0)) return [];
  const asOf = asset.asOf?.slice(0, 10);
  if (asOf && validDate(asOf) && dates.some((date) => date > asOf)) return [];
  return dates.map((date, index) => ({ date, value: asset.sparkline[index] })).sort((a, b) => a.date.localeCompare(b.date));
}

export function percentBetween(first: number, last: number): number | null {
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0 || last <= 0) return null;
  const result = (last / first - 1) * 100;
  return Number.isFinite(result) ? result : null;
}

export function latestMove(asset: AssetData) {
  const points = assetObservations(asset);
  if (points.length < 2) return null;
  const first = points[points.length - 2];
  const last = points[points.length - 1];
  const change = percentBetween(first.value, last.value);
  return change === null ? null : { asset, from: first.date, till: last.date, first: first.value, last: last.value, change };
}

/** All selected instruments, exactly the same dates, no interpolation/carry-forward. */
export function compareAssets(assets: AssetData[], limit: number) {
  if (assets.length < 2 || new Set(assets.map((asset) => asset.id)).size !== assets.length) return null;
  const series = assets.map(assetObservations);
  if (series.some((points) => points.length < 2)) return null;
  const maps = series.map((points) => new Map(points.map((point) => [point.date, point.value])));
  const shared = series[0].map((point) => point.date).filter((date) => maps.every((map) => map.has(date)));
  const dates = shared.slice(-Math.max(2, Math.floor(limit)));
  if (dates.length < 2) return null;
  const lines = assets.map((asset, index) => {
    const baseline = maps[index].get(dates[0])!;
    const rawValues = dates.map((date) => maps[index].get(date)!);
    const values = rawValues.map((value) => percentBetween(baseline, value)!);
    return { id: asset.id, name: asset.name, source: asset.sourceLabel, values, rawValues };
  });
  if (lines.some((line) => line.values.some((value) => !Number.isFinite(value)))) return null;
  return { dates, lines };
}

export function dateLabel(date: string): string {
  return validDate(date) ? date.split('-').reverse().join('.') : 'дата неизвестна';
}
