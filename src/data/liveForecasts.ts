import { ForecastData } from './mockData';
import { supabase } from '@/lib/supabase';

interface ForecastRow {
  id: string;
  asset: string;
  direction: string;
  probability: number;
  time_window: string;
  confidence: string;
  reason: string;
  updated_at?: string;
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

/**
 * Загружает прогнозы из cached_forecasts и приводит строки базы
 * к типу ForecastData (поле в базе и в типе называется одинаково:
 * time_window). При ошибке возвращает пустой массив — компонент
 * Forecasts показывает в этом случае предупреждение.
 */
export async function fetchLiveForecasts(): Promise<ForecastData[]> {
  try {
    const { data, error } = await supabase
      .from('cached_forecasts')
      .select('id, asset, direction, probability, time_window, confidence, reason, updated_at');

    if (error || !data || data.length === 0) {
      throw new Error('Нет прогнозов в кэше');
    }

    return (data as ForecastRow[]).map((item) => ({
      id: item.id,
      asset: item.asset,
      direction: normalizeDirection(item.direction),
      probability: Math.min(100, Math.max(0, item.probability ?? 0)),
      time_window: item.time_window,
      confidence: normalizeConfidence(item.confidence),
      reason: item.reason,
      updated_at: item.updated_at,
    }));
  } catch (e) {
    console.error('Ошибка загрузки прогнозов:', e);
    return [];
  }
}
