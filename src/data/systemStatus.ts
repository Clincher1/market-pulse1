import { supabase } from '@/lib/supabase';

/**
 * Данные самопроверки. Таблицы `site_health` и `news_source_health` читаются
 * публичным ключом — ровно тем же, что использует сам сайт, поэтому страница
 * состояния видит то же, что видит посетитель.
 */

export interface HealthCheck {
  ok: boolean;
  detail: string;
}

export interface HealthRow {
  id: number;
  checked_at: string;
  ok: boolean;
  trigger: 'cron' | 'manual';
  checks: Record<string, HealthCheck>;
}

export interface FeedRow {
  source: string;
  last_seen_at: string;
  last_new_at: string | null;
  items: number;
  fresh: number;
}

export interface CheckRunResult {
  ok: boolean;
  skipped?: boolean;
  detail?: string;
  linear?: string;
  checks?: Record<string, HealthCheck>;
}

export const CHECK_LABELS: Record<string, { title: string; hint: string }> = {
  tension_matches: {
    title: 'Индекс напряжённости совпадает с пересчётом',
    hint: 'Проверка берёт сырые новости и считает индекс заново, без участия основного кода',
  },
  news_fresh: {
    title: 'Новости идут',
    hint: 'Свежему материалу не больше 6 часов',
  },
  sample_size: {
    title: 'Выборки хватает',
    hint: 'За сутки не меньше 20 материалов, которые попадают в индекс',
  },
  assets_fresh: {
    title: 'Котировки свежие',
    hint: 'Обновлялись не позже 45 минут назад',
  },
  forecasts_fresh: {
    title: 'Прогнозы пересчитываются',
    hint: 'Публичный кэш прогнозов обновлялся в последние 3 часа',
  },
  snapshot_taken: {
    title: 'Снимок дня сделан',
    hint: 'Ежедневный снимок памяти рынка за сегодня или вчера',
  },
  feeds_fresh: {
    title: 'Все ленты живы',
    hint: 'Каждая лента давала новые материалы за сутки',
  },
  forecast_bias: {
    title: 'Прогнозы не перекошены в одну сторону',
    hint: 'Допустимо не больше 85 % прогнозов в одну сторону',
  },
  forecasts_resolving: {
    title: 'Прогнозы доходят до проверки',
    hint: 'Без этого честный счёт не может расти',
  },
  no_third_party: {
    title: 'Чужих доменов нет',
    hint: 'В разметке только свои домены: ни шрифтовых CDN, ни аналитики',
  },
  site_online: {
    title: 'Сайт отвечает',
    hint: 'Главная страница возвращает HTTP 200',
  },
};

export async function fetchLatestHealth(): Promise<HealthRow | null> {
  try {
    const { data, error } = await supabase
      .from('site_health')
      .select('id, checked_at, ok, trigger, checks')
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as HealthRow;
  } catch (e) {
    console.error('Ошибка загрузки состояния:', e);
    return null;
  }
}

export async function fetchHealthHistory(limit = 24): Promise<Array<{ checked_at: string; ok: boolean; trigger: string }>> {
  try {
    const { data, error } = await supabase
      .from('site_health')
      .select('checked_at, ok, trigger')
      .order('checked_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as Array<{ checked_at: string; ok: boolean; trigger: string }>;
  } catch (e) {
    console.error('Ошибка загрузки истории проверок:', e);
    return [];
  }
}

export async function fetchFeedHealth(): Promise<FeedRow[]> {
  try {
    const { data, error } = await supabase
      .from('news_source_health')
      .select('source, last_seen_at, last_new_at, items, fresh')
      .order('last_new_at', { ascending: true });
    if (error || !data) return [];
    return data as FeedRow[];
  } catch (e) {
    console.error('Ошибка загрузки здоровья лент:', e);
    return [];
  }
}

/**
 * Запускает проверку немедленно. Функция сама откажет, если предыдущий запуск
 * был меньше пяти минут назад: кнопка не должна долбить базу.
 */
export async function runCheckNow(): Promise<CheckRunResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('selfcheck', { body: {} });
    if (error) throw error;
    return (data as CheckRunResult) ?? null;
  } catch (e) {
    console.error('Ошибка запуска проверки:', e);
    return null;
  }
}

/** Московское время = UTC + 3, перехода на летнее время нет. */
export function formatCheckedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  const utc = `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
  const msk = new Date(date.getTime() + 3 * 3600_000);
  const mskText = `${pad(msk.getUTCDate())}.${pad(msk.getUTCMonth() + 1)}, ${pad(msk.getUTCHours())}:${pad(msk.getUTCMinutes())} МСК`;
  return `${utc} · ${mskText}`;
}

export function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? (Date.now() - ts) / 3_600_000 : null;
}
