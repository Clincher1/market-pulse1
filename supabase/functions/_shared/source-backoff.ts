// Backoff for a feed that keeps failing (2026-10-31).
//
// Google News answered its RSS search endpoint with 503 on 128 of 144 runs in
// three days: the ingestion asked again every 30 minutes no matter what came
// back. Retrying a source that just said "not now" does not make it answer
// sooner, and the failed requests are what make a source look blocked.
//
// The rules are deliberately plain:
//   - one failure pauses nothing;
//   - three failures in a row pause the source for an hour;
//   - the pause expires on its own, so the source is always tried again;
//   - a success anywhere in the streak resets it;
//   - the pause is written into the health log in words, not hidden.
//
// Correction of 01.11.2026: «expires on its own» was not true. The skipped runs
// were written into the same health log as `ok: false`, so each skipped run
// both prolonged the streak and moved its beginning to «now». The source was
// never contacted again: Reuters via Google News stopped being asked at 00:35
// UTC and by 10:35 the log promised «next attempt after 10:35» for the tenth
// time. A pause row is a note that we did not try, not a failure; it carries
// `paused: true` and is excluded from the streak.
//
// The module is pure on purpose: no Deno, no network, so the rules can be
// checked by node:test with real fixtures instead of being trusted.

export type HealthHistoryRow = {
  source_id: string;
  ok: boolean;
  http_status: number | null;
  created_at: string;
  /**
   * Строка означает «не пытались»: источник был на паузе. Такие строки не
   * считаются отказом — иначе пауза продлевает сама себя и не истекает никогда.
   */
  paused?: boolean | null;
};

export type FailureStreak = { streak: number; last: number };

/**
 * Consecutive failures per source, newest first. The input is sorted here, so
 * the caller may pass the rows in any order — a wrong order would otherwise
 * turn one failure into three.
 */
export function failureStreak(rows: HealthHistoryRow[]): Map<string, FailureStreak> {
  const sorted = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const bySource = new Map<string, FailureStreak>();
  const counted = new Set<string>();
  for (const row of sorted) {
    // Пропуск по паузе — не попытка: он не должен ни расти в счётчике, ни
    // сдвигать начало серии отказов вперёд.
    if (row.paused === true) continue;
    if (counted.has(row.source_id)) continue;
    if (row.ok) {
      counted.add(row.source_id);
      continue;
    }
    const current = bySource.get(row.source_id) ?? { streak: 0, last: 0 };
    current.streak += 1;
    if (!current.last) current.last = Date.parse(row.created_at);
    bySource.set(row.source_id, current);
  }
  return bySource;
}

/**
 * True while the source is still inside its pause. An unreadable date is not a
 * reason to skip: the source is attempted and its own answer decides.
 */
export function isPaused(
  streak: FailureStreak | undefined,
  now: number,
  minFailures: number,
  pauseMs: number,
): boolean {
  if (!streak || streak.streak < minFailures) return false;
  if (!Number.isFinite(streak.last)) return false;
  return now - streak.last < pauseMs;
}

/**
 * «пауза: 3 неудачных запуска подряд, следующая попытка после 11:35 UTC».
 * Склонение считается по-настоящему: «21 неудачный запуск», а не
 * «21 неудачных запуска» — кривое числительное читается как небрежность.
 */
export function pauseMessage(streak: FailureStreak, pauseMs: number): string {
  const until = new Date(streak.last + pauseMs);
  const hh = String(until.getUTCHours()).padStart(2, "0");
  const mm = String(until.getUTCMinutes()).padStart(2, "0");
  return `пауза: ${streak.streak} ${failedRuns(streak.streak)} подряд, следующая попытка после ${hh}:${mm} UTC`;
}

export function failedRuns(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "неудачный запуск";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "неудачных запуска";
  return "неудачных запусков";
}

/**
 * Колонки news_ingest_runs_v2. PostgREST отклоняет PATCH целиком, если в теле
 * есть незнакомое поле, а отклонённый PATCH оставлял запуск навсегда в статусе
 * «running». Поэтому тело перед отправкой фильтруется по этому списку.
 */
export const RUN_COLUMNS = [
  "finished_at",
  "status",
  "sources_total",
  "sources_ok",
  "items_seen",
  "items_candidate",
  "items_rejected",
  "items_upserted",
  "error",
  "stats",
] as const;

export function keepRunColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const key of RUN_COLUMNS) {
    if (key in payload) kept[key] = payload[key];
  }
  return kept;
}

/** Поля, которые пришлось выбросить: их видно в ответе функции, а не в тишине. */
export function droppedRunKeys(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).filter((key) => !(RUN_COLUMNS as readonly string[]).includes(key));
}
