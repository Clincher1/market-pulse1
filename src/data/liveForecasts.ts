import { ForecastData } from './mockData';
import { supabase } from '@/lib/supabase';

/**
 * Публичные сигналы читаются из исследовательского контура V2, а не из
 * старого кэша: там есть и основания (конкретные события), и проверяемая
 * история. Вид forecast_latest_v2 отдаёт только итог по активу на один
 * торговый день вперёд — без внутренних полей и без персональных данных.
 */

const ASSET_LABELS: Record<string, string> = {
  sp500: 'S&P 500',
  Brent: 'Brent',
  eurusd: 'EUR/USD',
  btc: 'Биткоин',
  gold: 'Золото',
};

const RU_DIRECTION: Record<string, string> = {
  up: 'вверх',
  down: 'вниз',
};

interface LatestRow {
  asset_key: string;
  display_name: string | null;
  issue_date: string;
  horizon_trading_days: number;
  direction: string;
  score_up: number | null;
  evidence_count: number | null;
  issued_at: string | null;
  calibration: string | null;
  evidence_top: Array<{ title: string | null; direction: string | null; strength: number | null }> | null;
}

export interface TrackRecordRow {
  asset_key: string;
  issued: number;
  resolved: number;
  scored: number;
  mean_brier: number | null;
  hit_rate: number | null;
  mean_return_pct: number | null;
  pending: number;
  last_evaluated_at: string | null;
  verdict: 'insufficient_data' | 'no_edge' | 'edge';
  /** Сколько прогнозов вообще имели направление. Без него Брайер посчитать нельзя. */
  directional: number;
}

const ALLOWED_CONFIDENCE: ForecastData['confidence'][] = [
  'Низкая',
  'Средняя',
  'Высокая',
];

function normalizeConfidence(value: string): ForecastData['confidence'] {
  return (ALLOWED_CONFIDENCE as string[]).includes(value)
    ? (value as ForecastData['confidence'])
    : 'Низкая';
}

function normalizeDirection(value: string): ForecastData['direction'] {
  if (value === 'up' || value === 'down' || value === 'none') return value;
  return 'none';
}

function assetLabel(row: LatestRow): string {
  const mapped = ASSET_LABELS[row.asset_key];
  if (mapped) return mapped;
  const raw = String(row.display_name ?? row.asset_key ?? '').trim();
  return raw.replace(/\s*\([^)]*\)\s*$/, '') || row.asset_key;
}

/**
 * Основание сигнала — это не пересказ модели, а список событий, которые
 * реально потянули чашу весов. Пользователь видит те же заголовки, что
 * читает в ленте, и может сам решить, верит он им или нет.
 */
function buildReason(row: LatestRow): string {
  const items = (row.evidence_top ?? []).filter((item) => item.title);
  if (items.length === 0) {
    return 'За последние 72 часа не найдено событий с измеримым влиянием на актив — направленный вывод не делается.';
  }
  const quoted = items
    .slice(0, 3)
    .map((item) => {
      const arrow = item.direction === 'up' ? '↑' : item.direction === 'down' ? '↓' : '•';
      return `${arrow} «${item.title}»`;
    })
    .join('; ');
  if (row.direction === 'up' || row.direction === 'down') {
    return `Сигнал ${RU_DIRECTION[row.direction]} сложился из событий: ${quoted}.`;
  }
  return `Противоположные сигналы уравновешивают друг друга: ${quoted}. Порог 60/40 не пройден.`;
}

/** Загружает честный счёт прогнозов: сколько выдано, сколько проверено и с каким качеством. */
export async function fetchForecastTrackRecord(assetKey = 'ALL'): Promise<TrackRecordRow | null> {
  try {
    const { data, error } = await supabase
      .from('forecast_track_record')
      .select(
        'asset_key, issued, resolved, scored, mean_brier, hit_rate, mean_return_pct, pending, last_evaluated_at, verdict, directional',
      )
      .eq('asset_key', assetKey)
      .maybeSingle();

    if (error || !data) return null;
    return data as TrackRecordRow;
  } catch (e) {
    console.error('Ошибка загрузки статистики прогнозов:', e);
    return null;
  }
}

/** Счёт сразу по всем активам: преимущество «в целом» не доказывает преимущество по каждому активу. */
async function fetchTrackRecordsByAsset(): Promise<Map<string, TrackRecordRow>> {
  try {
    const { data, error } = await supabase
      .from('forecast_track_record')
      .select(
        'asset_key, issued, resolved, scored, mean_brier, hit_rate, mean_return_pct, pending, last_evaluated_at, verdict, directional',
      );
    if (error || !data) return new Map();
    return new Map((data as TrackRecordRow[]).map((row) => [row.asset_key, row]));
  } catch {
    return new Map();
  }
}

/**
 * Загружает актуальные сигналы из forecast_latest_v2 и приводит их
 * к типу ForecastData. probability — это доля взвешенных свидетельств
 * на стороне стрелки (для «вниз» это 1 − P(рост)), а не обещание доходности.
 */
export async function fetchLiveForecasts(): Promise<ForecastData[]> {
  try {
    const { data, error } = await supabase
      .from('forecast_latest_v2')
      .select(
        'asset_key, display_name, issue_date, horizon_trading_days, direction, score_up, evidence_count, issued_at, calibration, evidence_top',
      );

    if (error || !data || data.length === 0) {
      throw new Error('Нет прогнозов в публичном контуре V2');
    }

    // «Высокая» уверенность возможна только тогда, когда накопленная история
    // действительно подтвердила преимущество над подбрасыванием монеты.
    const trackByAsset = await fetchTrackRecordsByAsset();

    return (data as LatestRow[]).map((item) => {
      const direction = normalizeDirection(item.direction);
      const score = typeof item.score_up === 'number' ? item.score_up : null;
      const shareOnArrow =
        score === null
          ? 0.5
          : direction === 'down'
            ? 1 - score
            : direction === 'up'
              ? score
              : Math.max(score, 1 - score);
      const evidence = item.evidence_count ?? 0;

      return {
        id: item.asset_key,
        asset: assetLabel(item),
        direction,
        // Округление вниз: доля 59.5 не должна показываться как 60 и спорить
        // с подписью «ниже порога 60 % сигналы считаются шумом».
        probability: Math.min(100, Math.max(0, Math.floor(shareOnArrow * 100))),
        time_window: `${item.horizon_trading_days} ${item.horizon_trading_days === 1 ? 'торговый день' : 'торговых дня'}`,
        confidence: normalizeConfidence(
          trackByAsset.get(item.asset_key)?.verdict === 'edge' ? 'Высокая' : evidence >= 8 ? 'Средняя' : 'Низкая',
        ),
        reason: buildReason(item),
        updated_at: item.issued_at ?? undefined,
      };
    });
  } catch (e) {
    console.error('Ошибка загрузки прогнозов:', e);
    return [];
  }
}
