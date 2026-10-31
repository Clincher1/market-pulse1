import { TensionData, TensionHistoryStats } from './marketTypes';
import { supabase } from '@/lib/supabase';

function finiteOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function countOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/**
 * Разбор cached_tension.history_stats. Любое неожиданное содержимое
 * трактуем как отсутствие статистики, а не как повод падать: шкала
 * обязана работать и без исторического контекста.
 */
function parseHistoryStats(raw: unknown): TensionHistoryStats | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const stats = raw as Record<string, unknown>;
  const days = countOrZero(stats.days);
  if (days === 0) return null;
  return {
    days,
    belowDays: countOrZero(stats.below_days),
    aboveDays: countOrZero(stats.above_days),
    equalDays: countOrZero(stats.equal_days),
    median: finiteOrNull(stats.median),
    min: finiteOrNull(stats.min),
    max: finiteOrNull(stats.max),
    firstDate: typeof stats.first_date === 'string' ? stats.first_date : undefined,
    lastDate: typeof stats.last_date === 'string' ? stats.last_date : undefined,
  };
}

/**
 * Схлопывает дублирующиеся дни в истории напряжённости.
 * Бэкенд сейчас может записать несколько одинаковых записей
 * за один и тот же день (например, 7 раз "21 окт.") — без дедупликации
 * график выглядит как "7 дней", хотя данные есть только за один день.
 * Оставляем последнее значение дня; порядок дней сохраняем.
 */
function dedupeHistory(
  history: { day: string; value: number; date?: string }[] | null | undefined
): { day: string; value: number; date?: string }[] {
  if (!history) return [];
  const byDay = new Map<string, { day: string; value: number; date?: string }>();
  for (const point of history) {
    if (!point?.day || !Number.isFinite(point.value)) continue;
    // Дата нужна графику, чтобы точки стояли по календарю, а не на равном
    // расстоянии: иначе пропуск в наблюдениях на экране не виден.
    const date = typeof point.date === 'string' ? point.date : undefined;
    byDay.set(point.day, { day: point.day, value: point.value, ...(date ? { date } : {}) });
  }
  return [...byDay.values()];
}

/**
 * Загружает индекс напряжённости из cached_tension (строка id = 1).
 * При ошибке возвращает null: компонент обязан явно показать недоступность
 * или пометить ранее полученные живые данные как устаревшие, а не молча
 * подставлять демонстрационный fallback.
 */
/**
 * Читает время самого свежего материала в выборке индекса отдельным запросом
 * и никогда не ломает основную загрузку: пока колонки нет или она недоступна,
 * возвращаем null, и карточка просто не делает заявлений о свежести потока.
 */
/**
 * Состав выборки: сколько материалов за последние 24 часа дал каждый источник.
 * Без этой строки шкала выглядит как «напряжённость мира вообще», хотя на деле
 * это тон конкретных деловых лент — и если одна из них молчит, посетитель
 * имеет право это видеть. Ошибка загрузки здесь не ломает карточку.
 */
async function fetchSourceMix(): Promise<{ name: string; count: number }[] | null> {
  try {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data, error } = await supabase
      .from('cached_news')
      .select('source, importance, confidence')
      .gte('published_at', since)
      .gte('importance', 3)
      .gte('confidence', 0.5)
      .limit(500);
    if (error || !data) return null;
    const counts = new Map<string, number>();
    for (const row of data as { source?: string | null }[]) {
      const name = String(row.source ?? '').trim();
      if (!name || name === 'GDELT' || name === 'GDELT (Global)') continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return null;
  }
}

async function fetchSampleNewest(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('cached_tension')
      .select('sample_newest')
      .eq('id', 1)
      .single();
    if (error || !data) return null;
    const raw = (data as { sample_newest?: unknown }).sample_newest;
    return typeof raw === 'string' ? raw : null;
  } catch {
    return null;
  }
}

export async function fetchLiveTension(): Promise<TensionData | null> {
  try {
    const { data, error } = await supabase
      .from('cached_tension')
      .select('value, label, history, history_stats, news_count, updated_at')
      .eq('id', 1)
      .single();

    if (error || !data) throw new Error('Нет данных о напряжённости');

    return {
      current: Math.min(100, Math.max(0, data.value ?? 0)),
      label: data.label ?? '',
      history: dedupeHistory(data.history),
      newsCount: data.news_count ?? 0,
      updatedAt: data.updated_at ?? undefined,
      historyStats: parseHistoryStats(data.history_stats),
      sampleNewest: (await fetchSampleNewest()) ?? undefined,
      sourceMix: await fetchSourceMix(),
    };
  } catch (e) {
    console.error('Ошибка загрузки напряжённости:', e);
    return null;
  }
}
