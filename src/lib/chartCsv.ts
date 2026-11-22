import type { AssetPriceHistory, AssetHistoryPoint } from '@/data/assetPriceHistory';
import { WORLD_ASSET_UNITS } from './marketUnits';
import { validDate } from './marketDesk';

export interface ChartCsvInput {
  assetId: string;
  assetName: string;
  sourceUrl: string;
  history: AssetPriceHistory;
  points: AssetHistoryPoint[];
}
// Separate, fail-closed export boundary: a fetched row alone does not grant
// permission to export another provider or an internal/restricted archive.
const PUBLIC_SERIES: Record<string, string> = {
  'usd-eur': 'eurusd_ecb_daily', sp500: 'sp500_yahoo_gspc',
  brent: 'brent_yahoo_bzf', btc: 'btc_kraken_xbtusd_daily',
  gold: 'gold_api_xau_observed_daily',
};
export function canExportChart(input: ChartCsvInput): boolean {
  const { history, points, assetId } = input;
  if (!PUBLIC_SERIES[assetId] || history.assetId !== assetId || history.instrumentId !== PUBLIC_SERIES[assetId] || !history.provider.trim() || !input.assetName.trim() || points.length < 2) return false;
  try {
    const url = new URL(input.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
  } catch { return false; }
  const original = new Map(history.points.map(point => [point.date, point.value]));
  if (original.size !== history.points.length) return false;
  return points.every((point, index) => validDate(point.date) && Number.isFinite(point.value) && point.value > 0
    && original.get(point.date) === point.value && (index === 0 || points[index - 1].date < point.date));
}
function cell(value: string): string {
  // Quoting alone does not prevent spreadsheet formula injection.
  const safe = /^\s*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
/** The line's actual visible observations only; never a quote, fill or estimate. */
export function buildChartCsv(input: ChartCsvInput): { text: string; filename: string } | null {
  if (!canExportChart(input)) return null;
  const { history, points, assetId } = input;
  const rows = [
    ['Дата наблюдения', 'Значение', 'Единица', 'Инструмент', 'Идентификатор ряда', 'Источник', 'Обозначение источника', 'Ссылка источника', 'Частота'],
    ...points.map(point => [point.date, String(point.value).replace('.', ','), WORLD_ASSET_UNITS[assetId], input.assetName,
      history.instrumentId, history.provider, history.providerSymbol, input.sourceUrl,
      assetId === 'gold' ? 'Наши наблюдения завершённых UTC-суток; не официальный close; без заполнения пропусков' : 'Дневные наблюдения; без заполнения пропусков']),
  ];
  return {
    text: '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n',
    filename: `market-pulse-${assetId}-${points[0].date}-${points[points.length - 1].date}.csv`,
  };
}
