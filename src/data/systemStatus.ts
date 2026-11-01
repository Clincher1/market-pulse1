import { supabase } from '@/lib/supabase';

/**
 * Данные самопроверки. Таблицы `site_health` и `news_source_health` читаются
 * публичным ключом — ровно тем же, что использует сам сайт, поэтому страница
 * состояния видит то же, что видит посетитель.
 *
 * Типы и группировка сбоев живут отдельно (`healthTypes.ts`, `incidents.ts`),
 * чтобы чистую логику можно было проверить без сети.
 */

export type {
  FeedRow,
  HealthCheck,
  HealthIncident,
  HealthRow,
  HealthRun,
} from './healthTypes';

export { groupIncidents } from './incidents';

import type { CheckStatRow } from '@/lib/checkStats';
import type { FeedRow, HealthCheck, HealthRow, HealthRun } from './healthTypes';

export interface CheckRunResult {
  ok: boolean;
  skipped?: boolean;
  detail?: string;
  linear?: string;
  healing?: string;
  decisions?: string;
  digest?: string;
  checks?: Record<string, HealthCheck>;
}

export { CHECK_LABELS } from '@/lib/checkLabels';

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

export async function fetchHealthHistory(limit = 24): Promise<HealthRun[]> {
  try {
    const { data, error } = await supabase
      .from('site_health')
      .select('checked_at, ok, trigger, checks')
      .order('checked_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as HealthRun[];
  } catch (e) {
    console.error('Ошибка загрузки истории проверок:', e);
    return [];
  }
}

/** Окно проверок за 7 дней: считается в базе, чтобы не тянуть всю историю. */
export async function fetchCheckStats(): Promise<CheckStatRow[]> {
  try {
    const { data, error } = await supabase
      .from('site_health_check_stats_7d')
      .select('check_name, samples, ok_samples, last_seen_at, last_fail_at');
    if (error || !data) return [];
    return data as CheckStatRow[];
  } catch (e) {
    console.error('Ошибка загрузки статистики проверок:', e);
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
