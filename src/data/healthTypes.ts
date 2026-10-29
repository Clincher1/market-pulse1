/**
 * Типы самопроверки, отделённые от клиента базы.
 *
 * Здесь нет ни одного импорта: файл можно прочитать в чистом виде и проверить
 * логику группировки сбоев, не поднимая Supabase.
 */

export interface HealthCheck {
  ok: boolean;
  detail: string;
}

/** Один прогон проверки. `checks` может отсутствовать у старых записей. */
export interface HealthRun {
  checked_at: string;
  ok: boolean;
  trigger: string;
  checks: Record<string, HealthCheck> | null;
}

/** Свежий прогон, который читает страница состояния. */
export interface HealthRow extends HealthRun {
  id: number;
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

/**
 * Один сбой подряд — это один инцидент, а не N поломок.
 *
 * Проверка идёт каждый час. Если данные встали на восемь часов, в истории
 * восемь красных точек, и страница выглядела как восемь разных аварий.
 */
export interface HealthIncident {
  start: string;
  end: string | null;
  minutes: number | null;
  open: boolean;
  /** Серия начинается на самой старой записи окна: реальное начало раньше. */
  startedBeforeWindow: boolean;
  checks: string[];
  runs: number;
}
