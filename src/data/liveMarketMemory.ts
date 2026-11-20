import { supabase } from '@/lib/supabase';

export interface MemoryStats {
  forecastSnapshots: number;
  evaluatedForecasts: number;
  pendingForecasts: number;
  latestPriceFetchAt?: string;
  latestForecastIssuedAt?: string;
}

export interface MemoryForecast {
  forecastId: string;
  assetKey: string;
  issuedAt: string;
  issueDate: string;
  horizonTradingDays: number;
  direction: 'up' | 'down' | 'none';
  aggregationVersion: string;
  promptVersion?: string;
  outcomeStatus: string;
  outcomeObservationDate?: string;
  returnPct?: number;
  directionHit?: boolean;
}

/** Only the forecast archive is loaded into this public view. */
export interface MarketMemoryData {
  stats: MemoryStats | null;
  forecasts: MemoryForecast[];
}

type Row = Record<string, unknown>;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNum(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function normalizeStats(row: Row | undefined): MemoryStats | null {
  if (!row) return null;
  return {
    forecastSnapshots: num(row.forecast_snapshots),
    evaluatedForecasts: num(row.evaluated_forecasts),
    // Includes terminal insufficient_price_data, not just the pending queue.
    pendingForecasts: Math.max(0, num(row.forecast_snapshots) - num(row.evaluated_forecasts)),
    latestPriceFetchAt: optionalStr(row.latest_price_fetch_at),
    latestForecastIssuedAt: optionalStr(row.latest_forecast_issued_at),
  };
}

function normalizeForecast(row: Row): MemoryForecast {
  const direction = str(row.direction);
  return {
    forecastId: str(row.forecast_id),
    assetKey: str(row.asset_key),
    issuedAt: str(row.issued_at),
    issueDate: str(row.issue_date),
    horizonTradingDays: num(row.horizon_trading_days),
    direction: direction === 'up' || direction === 'down' ? direction : 'none',
    aggregationVersion: str(row.aggregation_version),
    promptVersion: optionalStr(row.prompt_version),
    outcomeStatus: str(row.outcome_status, 'pending'),
    outcomeObservationDate: optionalStr(row.outcome_observation_date),
    returnPct: optionalNum(row.return_pct),
    directionHit: typeof row.direction_hit === 'boolean' ? row.direction_hit : undefined,
  };
}

export async function fetchMarketMemory(): Promise<MarketMemoryData> {
  const [statsResult, forecastsResult] = await Promise.all([
    supabase
      .from('market_memory_stats_v1')
      .select('forecast_snapshots, evaluated_forecasts, pending_forecasts, latest_forecast_issued_at, latest_price_fetch_at')
      .limit(1),
    supabase
      .from('market_memory_forecasts_v1')
      .select('forecast_id, asset_key, issued_at, issue_date, horizon_trading_days, direction, aggregation_version, prompt_version, outcome_status, outcome_observation_date, return_pct, direction_hit')
      .order('issued_at', { ascending: false })
      .order('asset_key', { ascending: true })
      .order('horizon_trading_days', { ascending: true })
      .limit(60),
  ]);

  const firstError = [statsResult.error, forecastsResult.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);

  return {
    stats: normalizeStats(((statsResult.data ?? []) as Row[])[0]),
    forecasts: ((forecastsResult.data ?? []) as Row[]).map(normalizeForecast),
  };
}
