import { supabase } from '@/lib/supabase';
import { safeHttpUrl } from '@/lib/safeUrl';

export interface MemoryStats {
  articlesTotal: number;
  eventsTotal: number;
  classifiedEvents: number;
  rejectedEvents: number;
  quarantinedEvents: number;
  evaluatedEventOutcomes: number;
  pendingEventOutcomes: number;
  forecastSnapshots: number;
  evaluatedForecasts: number;
  pendingForecasts: number;
  priceSnapshots: number;
  latestArticleFetchAt?: string;
  latestClassificationAt?: string;
  latestPriceFetchAt?: string;
  latestForecastIssuedAt?: string;
}

export interface MemoryImpact {
  asset: string;
  direction: 'up' | 'down' | 'neutral' | 'uncertain';
  strength: number;
  horizon: string;
  rationaleRu: string;
}

export interface MemoryEvent {
  eventId: string;
  title: string;
  firstPublishedAt?: string;
  latestPublishedAt?: string;
  articleCount: number;
  sourceCount: number;
  sourceNames: string[];
  rankScore: number;
  transmissionChannel: string;
  relevance: number;
  confidence: number;
  importance: number;
  sentiment: number;
  entities: string[];
  impacts: MemoryImpact[];
  summaryRu: string;
  rationaleRu: string;
  model?: string;
  promptVersion?: string;
  classifiedAt?: string;
  representativeSource?: string;
  representativeUrl?: string;
}

export interface MemoryEventOutcome {
  eventId: string;
  assetKey: string;
  expectedDirection: string;
  expectedStrength: number;
  horizonTradingDays: number;
  status: string;
  returnPct?: number;
  abnormalReturnPct?: number;
  abnormalZ?: number;
  directionHit?: boolean;
  evaluatedAt?: string;
  outcomeObservationDate?: string;
}

export interface MemoryAnalogue {
  transmissionChannel: string;
  assetKey: string;
  expectedDirection: 'up' | 'down';
  horizonTradingDays: number;
  promptVersion?: string;
  sampleSize: number;
  hits: number;
  hitRate?: number;
  medianReturnPct?: number;
  medianAbnormalReturnPct?: number;
  avgReturnPct?: number;
  lastEvaluatedAt?: string;
}

export interface MemoryForecast {
  forecastId: string;
  assetKey: string;
  issuedAt: string;
  issueDate: string;
  horizonTradingDays: number;
  direction: 'up' | 'down' | 'none';
  scoreUp?: number;
  weightedBalance?: number;
  evidenceCount: number;
  aggregationVersion: string;
  promptVersion?: string;
  outcomeStatus: string;
  outcomeObservationDate?: string;
  returnPct?: number;
  abnormalReturnPct?: number;
  abnormalZ?: number;
  directionHit?: boolean;
  evaluatedAt?: string;
}

export interface MarketMemoryData {
  stats: MemoryStats | null;
  events: MemoryEvent[];
  outcomes: MemoryEventOutcome[];
  analogues: MemoryAnalogue[];
  forecasts: MemoryForecast[];
}

type Row = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 12);
}

function sourceNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const row = item as Row;
        return str(row.name ?? row.id);
      }
      return '';
    })
    .filter(Boolean)
    .slice(0, 8);
}

function impacts(value: unknown): MemoryImpact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Row;
    const direction = str(row.direction);
    if (!['up', 'down', 'neutral', 'uncertain'].includes(direction)) return [];
    return [{
      asset: str(row.asset),
      direction: direction as MemoryImpact['direction'],
      strength: num(row.strength),
      horizon: str(row.horizon, 'unknown'),
      rationaleRu: str(row.rationale_ru),
    }];
  }).filter((impact) => impact.asset);
}

function normalizeStats(row: Row | undefined): MemoryStats | null {
  if (!row) return null;
  return {
    articlesTotal: num(row.articles_total),
    eventsTotal: num(row.events_total),
    classifiedEvents: num(row.classified_events),
    rejectedEvents: num(row.rejected_events),
    quarantinedEvents: num(row.quarantined_events),
    evaluatedEventOutcomes: num(row.evaluated_event_outcomes),
    pendingEventOutcomes: num(row.pending_event_outcomes),
    forecastSnapshots: num(row.forecast_snapshots),
    evaluatedForecasts: num(row.evaluated_forecasts),
    pendingForecasts: num(row.pending_forecasts),
    priceSnapshots: num(row.price_snapshots),
    latestArticleFetchAt: optionalStr(row.latest_article_fetch_at),
    latestClassificationAt: optionalStr(row.latest_classification_at),
    latestPriceFetchAt: optionalStr(row.latest_price_fetch_at),
    latestForecastIssuedAt: optionalStr(row.latest_forecast_issued_at),
  };
}

function normalizeEvent(row: Row): MemoryEvent {
  return {
    eventId: str(row.event_id),
    title: str(row.title),
    firstPublishedAt: optionalStr(row.first_published_at),
    latestPublishedAt: optionalStr(row.latest_published_at),
    articleCount: num(row.article_count),
    sourceCount: num(row.source_count),
    sourceNames: sourceNames(row.sources),
    rankScore: num(row.rank_score),
    transmissionChannel: str(row.transmission_channel, 'other'),
    relevance: num(row.relevance),
    confidence: num(row.confidence),
    importance: num(row.importance),
    sentiment: num(row.sentiment),
    entities: stringArray(row.entities),
    impacts: impacts(row.impacts),
    summaryRu: str(row.summary_ru),
    rationaleRu: str(row.rationale_ru),
    model: optionalStr(row.model),
    promptVersion: optionalStr(row.prompt_version),
    classifiedAt: optionalStr(row.classified_at),
    representativeSource: optionalStr(row.representative_source),
    representativeUrl: safeHttpUrl(optionalStr(row.representative_url)),
  };
}

function normalizeOutcome(row: Row): MemoryEventOutcome {
  return {
    eventId: str(row.event_id),
    assetKey: str(row.asset_key),
    expectedDirection: str(row.expected_direction),
    expectedStrength: num(row.expected_strength),
    horizonTradingDays: num(row.horizon_trading_days),
    status: str(row.status),
    returnPct: optionalNum(row.return_pct),
    abnormalReturnPct: optionalNum(row.abnormal_return_pct),
    abnormalZ: optionalNum(row.abnormal_z),
    directionHit: typeof row.direction_hit === 'boolean' ? row.direction_hit : undefined,
    evaluatedAt: optionalStr(row.evaluated_at),
    outcomeObservationDate: optionalStr(row.outcome_observation_date),
  };
}

function normalizeAnalogue(row: Row): MemoryAnalogue {
  return {
    transmissionChannel: str(row.transmission_channel, 'other'),
    assetKey: str(row.asset_key),
    expectedDirection: str(row.expected_direction) === 'down' ? 'down' : 'up',
    horizonTradingDays: num(row.horizon_trading_days),
    promptVersion: optionalStr(row.prompt_version),
    sampleSize: num(row.sample_size),
    hits: num(row.hits),
    hitRate: optionalNum(row.hit_rate),
    medianReturnPct: optionalNum(row.median_return_pct),
    medianAbnormalReturnPct: optionalNum(row.median_abnormal_return_pct),
    avgReturnPct: optionalNum(row.avg_return_pct),
    lastEvaluatedAt: optionalStr(row.last_evaluated_at),
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
    scoreUp: optionalNum(row.score_up),
    weightedBalance: optionalNum(row.weighted_balance),
    evidenceCount: num(row.evidence_count),
    aggregationVersion: str(row.aggregation_version),
    promptVersion: optionalStr(row.prompt_version),
    outcomeStatus: str(row.outcome_status, 'pending'),
    outcomeObservationDate: optionalStr(row.outcome_observation_date),
    returnPct: optionalNum(row.return_pct),
    abnormalReturnPct: optionalNum(row.abnormal_return_pct),
    abnormalZ: optionalNum(row.abnormal_z),
    directionHit: typeof row.direction_hit === 'boolean' ? row.direction_hit : undefined,
    evaluatedAt: optionalStr(row.evaluated_at),
  };
}

export async function fetchMarketMemory(): Promise<MarketMemoryData> {
  const [statsResult, eventsResult, analoguesResult, forecastsResult] = await Promise.all([
    supabase.from('market_memory_stats_v1').select('*').limit(1),
    supabase
      .from('market_memory_events_v1')
      .select('*')
      .order('latest_published_at', { ascending: false, nullsFirst: false })
      .limit(24),
    supabase
      .from('market_memory_analogues_v1')
      .select('*')
      .order('sample_size', { ascending: false })
      .limit(60),
    supabase
      .from('market_memory_forecasts_v1')
      .select('*')
      .order('issued_at', { ascending: false })
      .order('asset_key', { ascending: true })
      .order('horizon_trading_days', { ascending: true })
      .limit(60),
  ]);

  const firstError = [statsResult.error, eventsResult.error, analoguesResult.error, forecastsResult.error]
    .find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const events = ((eventsResult.data ?? []) as Row[]).map(normalizeEvent).filter((event) => event.eventId);
  let outcomes: MemoryEventOutcome[] = [];
  if (events.length > 0) {
    const outcomesResult = await supabase
      .from('market_memory_event_outcomes_v1')
      .select('*')
      .in('event_id', events.map((event) => event.eventId))
      .order('asset_key', { ascending: true })
      .order('horizon_trading_days', { ascending: true })
      .limit(500);
    if (outcomesResult.error) throw new Error(outcomesResult.error.message);
    outcomes = ((outcomesResult.data ?? []) as Row[]).map(normalizeOutcome);
  }

  return {
    stats: normalizeStats(((statsResult.data ?? []) as Row[])[0]),
    events,
    outcomes,
    analogues: ((analoguesResult.data ?? []) as Row[]).map(normalizeAnalogue),
    forecasts: ((forecastsResult.data ?? []) as Row[]).map(normalizeForecast),
  };
}
