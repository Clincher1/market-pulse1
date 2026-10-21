import { TensionData } from './mockData';
import { supabase } from '@/lib/supabase';

/**
 * Схлопывает дублирующиеся дни в истории напряжённости.
 * Бэкенд сейчас может записать несколько одинаковых записей
 * за один и тот же день (например, 7 раз "21 окт.") — без дедупликации
 * график выглядит как "7 дней", хотя данные есть только за один день.
 * Оставляем последнее значение дня; порядок дней сохраняем.
 */
function dedupeHistory(
  history: { day: string; value: number }[] | null | undefined
): { day: string; value: number }[] {
  if (!history) return [];
  const byDay = new Map<string, { day: string; value: number }>();
  for (const point of history) {
    if (!point?.day || !Number.isFinite(point.value)) continue;
    byDay.set(point.day, { day: point.day, value: point.value });
  }
  return [...byDay.values()];
}

/**
 * Загружает индекс напряжённости из cached_tension (строка id = 1).
 * При ошибке возвращает null — компонент сохраняет fallback-данные.
 */
export async function fetchLiveTension(): Promise<TensionData | null> {
  try {
    const { data, error } = await supabase
      .from('cached_tension')
      .select('value, label, history, news_count')
      .eq('id', 1)
      .single();

    if (error || !data) throw new Error('Нет данных о напряжённости');

    return {
      current: Math.min(100, Math.max(0, data.value ?? 0)),
      label: data.label ?? '',
      history: dedupeHistory(data.history),
      newsCount: data.news_count ?? 0,
    };
  } catch (e) {
    console.error('Ошибка загрузки напряжённости:', e);
    return null;
  }
}
