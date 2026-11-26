import type { AssetData } from '@/data/marketTypes';
import { WORLD_ASSET_UNITS } from './marketUnits';
import { formatPriceText } from './price';
import { validDate } from './marketDesk';
import { formatObservationTimestamp } from './dateDisplay.mjs';

/** Copy an observation, never the cache refresh time or a fabricated fallback. */
export function quoteCopyText(asset: AssetData, sourceUrl: string, unavailable = false): string | null {
  const unit = WORLD_ASSET_UNITS[asset.id];
  const price = asset.price.match(/^([^\d\-−]*)(\d[\d,]*(?:\.\d+)?)$/);
  const value = price ? Number(price[2].replace(/,/g, '')) : NaN;
  const asOf = asset.asOf?.trim();
  if (unavailable || !unit || !Number.isFinite(value) || value <= 0 || !asset.sourceLabel?.trim() || !asOf) return null;
  if (!validDate(asOf.slice(0, 10)) || (asOf.length !== 10 && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(asOf) || !Number.isFinite(Date.parse(asOf))))) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
  } catch { return null; }
  const displayedAsOf = formatObservationTimestamp(asOf);
  if (!displayedAsOf) return null;
  return [
    asset.name,
    `Значение: ${formatPriceText(asset.price)}`,
    `Единица: ${unit}`,
    `Дата наблюдения${asOf.length === 10 ? '' : ' и время (UTC)'}: ${displayedAsOf}`,
    `Источник: ${asset.sourceLabel}`,
    `Ссылка источника: ${sourceUrl}`,
    'Market Pulse · сохранённое наблюдение, не обещание цены прямо сейчас.',
  ].join('\n');
}
