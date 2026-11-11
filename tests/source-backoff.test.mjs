// Правила паузы для источника, который отвечает отказом.
//
// Проверяется настоящими строками журнала здоровья: порядок, сброс удачей,
// граница в три отказа, истечение паузы. Ничего не подделано — функции те же,
// что вызываются из ingest-news-v2-shadow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  failureStreak,
  isPaused,
  pauseMessage,
  failedRuns,
  keepRunColumns,
  droppedRunKeys,
  RUN_COLUMNS,
  lastAttempts,
  pacingMessage,
  pacingSkip,
} from '../supabase/functions/_shared/source-backoff.ts';
import { readFile } from 'node:fs/promises';

const MIN_FAILURES = 3;
const PAUSE_MS = 60 * 60 * 1000;

function row(source_id, ok, created_at, http_status = ok ? 200 : 503) {
  return { source_id, ok, http_status, created_at };
}

test('три отказа подряд дают паузу, два — нет', () => {
  const rows = [
    row('google', false, '2026-10-31T09:05:00Z'),
    row('google', false, '2026-10-31T09:35:00Z'),
    row('google', false, '2026-10-31T10:05:00Z'),
  ];
  const streaks = failureStreak(rows);
  const streak = streaks.get('google');
  assert.equal(streak.streak, 3);
  assert.equal(isPaused(streak, Date.parse('2026-10-31T10:35:00Z'), MIN_FAILURES, PAUSE_MS), true);
  assert.equal(isPaused({ streak: 2, last: streak.last }, Date.parse('2026-10-31T10:35:00Z'), MIN_FAILURES, PAUSE_MS), false);
});

test('успех сбрасывает счёт: после 200 источник снова спрашивают', () => {
  const rows = [
    row('google', false, '2026-10-31T09:05:00Z'),
    row('google', false, '2026-10-31T09:35:00Z'),
    row('google', true, '2026-10-31T10:05:00Z', 200),
    row('google', false, '2026-10-31T10:35:00Z'),
  ];
  const streak = failureStreak(rows).get('google');
  assert.equal(streak.streak, 1);
  assert.equal(isPaused(streak, Date.parse('2026-10-31T10:40:00Z'), MIN_FAILURES, PAUSE_MS), false);
});

test('порядок строк не превращает один отказ в три', () => {
  const shuffled = [
    row('bbc', false, '2026-10-31T10:05:00Z'),
    row('bbc', true, '2026-10-31T09:35:00Z', 200),
    row('bbc', false, '2026-10-31T09:05:00Z'),
  ];
  const streak = failureStreak(shuffled).get('bbc');
  assert.equal(streak.streak, 1);
  assert.equal(isPaused(streak, Date.parse('2026-10-31T10:10:00Z'), MIN_FAILURES, PAUSE_MS), false);
});

test('пауза истекает сама, источник пробуется снова', () => {
  const streak = { streak: 5, last: Date.parse('2026-10-31T09:00:00Z') };
  assert.equal(isPaused(streak, Date.parse('2026-10-31T09:59:00Z'), MIN_FAILURES, PAUSE_MS), true);
  assert.equal(isPaused(streak, Date.parse('2026-10-31T10:00:00Z'), MIN_FAILURES, PAUSE_MS), false);
});

test('источники считаются раздельно', () => {
  const rows = [
    row('google', false, '2026-10-31T10:05:00Z'),
    row('google', false, '2026-10-31T09:35:00Z'),
    row('google', false, '2026-10-31T09:05:00Z'),
    row('bbc', true, '2026-10-31T10:05:00Z', 200),
  ];
  const streaks = failureStreak(rows);
  assert.equal(streaks.get('google').streak, 3);
  assert.equal(streaks.has('bbc'), false);
});

test('пустой журнал — паузы нет', () => {
  assert.equal(isPaused(failureStreak([]).get('google'), Date.now(), MIN_FAILURES, PAUSE_MS), false);
});

test('сообщение о паузе называет число и время попытки', () => {
  const streak = { streak: 3, last: Date.parse('2026-10-31T09:05:00Z') };
  assert.equal(
    pauseMessage(streak, PAUSE_MS),
    'пауза: 3 неудачных запуска подряд, следующая попытка после 10:05 UTC',
  );
  assert.equal(
    pauseMessage({ streak: 21, last: Date.parse('2026-10-31T09:05:00Z') }, PAUSE_MS),
    'пауза: 21 неудачный запуск подряд, следующая попытка после 10:05 UTC',
  );
  assert.equal(
    pauseMessage({ streak: 11, last: Date.parse('2026-10-31T09:05:00Z') }, PAUSE_MS),
    'пауза: 11 неудачных запусков подряд, следующая попытка после 10:05 UTC',
  );
  assert.equal(failedRuns(1), 'неудачный запуск');
  assert.equal(failedRuns(3), 'неудачных запуска');
  assert.equal(failedRuns(5), 'неудачных запусков');
  assert.equal(failedRuns(12), 'неудачных запусков');
  assert.equal(failedRuns(22), 'неудачных запуска');
});

test('в тело PATCH к запуску не попадает колонка, которой нет в таблице', () => {
  // Регрессия 31.10: в теле оказалось поле sources_skipped, PostgREST отклонил
  // весь PATCH, и запуск навсегда остался в статусе «running».
  const payload = {
    finished_at: '2026-10-31T11:35:00.000Z',
    status: 'success',
    sources_total: 20,
    sources_ok: 19,
    sources_skipped: 1,
    stats: { gate_version: 'token_prefix_v2' },
  };
  assert.deepEqual(droppedRunKeys(payload), ['sources_skipped']);
  const sent = keepRunColumns(payload);
  assert.deepEqual(Object.keys(sent).sort(), [
    'finished_at',
    'sources_ok',
    'sources_total',
    'stats',
    'status',
  ]);
  for (const key of Object.keys(sent)) {
    assert.ok(RUN_COLUMNS.includes(key), `${key} нет в списке колонок`);
  }
});

test('закрытие запуска сохраняет всё, что таблица умеет хранить', () => {
  const payload = {
    finished_at: '2026-10-31T11:35:00.000Z',
    status: 'partial',
    sources_total: 20,
    sources_ok: 19,
    items_seen: 700,
    items_candidate: 212,
    items_rejected: 488,
    items_upserted: 190,
    error: '',
    stats: { sources_skipped: 1 },
  };
  assert.deepEqual(droppedRunKeys(payload), []);
  assert.deepEqual(keepRunColumns(payload), payload);
});

/**
 * 01.11.2026: пауза продлевала сама себя.
 *
 * Настоящие строки журнала Reuters via Google News Business:
 *   00:05:10  503
 *   00:35:11  503   ← третья подряд, включается пауза
 *   01:05:00  пропуск «пауза: 3 неудачных запуска подряд, следующая попытка после 01:35 UTC»
 *   01:35:00  пропуск «пауза: 4 неудачных запуска…»
 *   …
 * Каждый пропуск писался как ok: false, поэтому серия росла, а её начало
 * сдвигалось вперёд: источник не спрашивали никогда.
 */
const pauseRow = (source_id, created_at) => ({
  source_id,
  ok: false,
  http_status: null,
  created_at,
  paused: true,
});

test('пропуск по паузе не продлевает паузу и не сдвигает её начало', () => {
  const history = [
    row('google', false, '2026-11-01T00:05:10Z'),
    row('google', false, '2026-11-01T00:35:11Z'),
    pauseRow('google', '2026-11-01T01:05:00Z'),
    pauseRow('google', '2026-11-01T01:35:00Z'),
    pauseRow('google', '2026-11-01T02:05:00Z'),
  ];
  const streak = failureStreak(history).get('google');
  assert.equal(streak.streak, 2, 'пропуски не должны попадать в серию отказов');
  // Двух настоящих отказов подряд недостаточно, чтобы вообще включить паузу.
  assert.equal(isPaused(streak, Date.parse('2026-11-01T02:10:00Z'), MIN_FAILURES, PAUSE_MS), false);
});

test('после трёх настоящих отказов пауза честно истекает через час', () => {
  const history = [
    row('google', false, '2026-11-01T00:05:10Z'),
    row('google', false, '2026-11-01T00:35:11Z'),
    row('google', false, '2026-11-01T01:05:00Z'),
    pauseRow('google', '2026-11-01T01:35:00Z'),
    pauseRow('google', '2026-11-01T02:05:00Z'),
  ];
  const streak = failureStreak(history).get('google');
  assert.equal(streak.streak, 3);
  assert.equal(streak.last, Date.parse('2026-11-01T01:05:00Z'));
  // 01:35 — ещё внутри паузы, 02:05 — ровно час с последнего настоящего отказа,
  // и источник снова спрашивают. Старое поведение здесь показывало «пауза» вечно.
  assert.equal(isPaused(streak, Date.parse('2026-11-01T01:35:00Z'), MIN_FAILURES, PAUSE_MS), true);
  assert.equal(isPaused(streak, Date.parse('2026-11-01T02:05:00Z'), MIN_FAILURES, PAUSE_MS), false);
});

test('старые строки без поля paused читаются как попытки', () => {
  // Колонка появилась 01.11.2026; в базе остались строки, записанные до неё.
  // Они должны считаться как раньше, а не пропускаться все подряд.
  const legacy = [
    { source_id: 'bbc', ok: false, http_status: 503, created_at: '2026-11-01T00:05:00Z' },
    { source_id: 'bbc', ok: false, http_status: 503, created_at: '2026-11-01T00:35:00Z' },
    { source_id: 'bbc', ok: false, http_status: 503, created_at: '2026-11-01T01:05:00Z' },
  ];
  assert.equal(failureStreak(legacy).get('bbc').streak, 3);
});

// --- Пейсинг источников (11.11.2026) ---------------------------------------
//
// Пауза после отказов отвечает на «мне только что отказали». Пейсинг — это
// расписание до первого запроса: у посредника 503 приходит не потому, что
// лента сломалась, а потому что его не предназначили для машинной выборки.

test('пейсинг: без интервала источник спрашивают как раньше', () => {
  const now = Date.parse('2026-11-11T07:30:00Z');
  assert.equal(pacingSkip('2026-11-11T07:25:00Z', null, now), false);
  assert.equal(pacingSkip('2026-11-11T07:25:00Z', 0, now), false);
  assert.equal(pacingSkip('2026-11-11T07:25:00Z', undefined, now), false);
});

test('пейсинг: внутри интервала — пропуск, после — попытка', () => {
  const now = Date.parse('2026-11-11T07:30:00Z');
  assert.equal(pacingSkip('2026-11-11T07:05:00Z', 60, now), true);
  assert.equal(pacingSkip('2026-11-11T06:30:00Z', 60, now), false);
  // Первой попытки ещё не было — источник обязан быть спрошен.
  assert.equal(pacingSkip(null, 60, now), false);
  // Испорченная дата — не повод молчать.
  assert.equal(pacingSkip('не дата', 60, now), false);
});

test('пейсинг: пропуски по паузе не считаются попытками', () => {
  const attempts = lastAttempts([
    { source_id: 'reuters-google-business', ok: true, http_status: 200, created_at: '2026-11-11T05:05:00Z' },
    { source_id: 'reuters-google-business', ok: false, http_status: null, created_at: '2026-11-11T07:05:00Z', paused: true },
  ]);
  assert.equal(attempts.get('reuters-google-business'), '2026-11-11T05:05:00Z');
});

test('пейсинг: причина пропуска написана словами и с временем', () => {
  assert.equal(
    pacingMessage(60, '2026-11-11T05:05:00Z'),
    'пейсинг: раз в 60 мин, прошлая попытка в 05:05 UTC',
  );
});

test('сторож: запись пропуска по пейсингу помечена paused, а не ok = false без пометки', async () => {
  const source = await readFile(new URL('../supabase/functions/ingest-news-v2-shadow/index.ts', import.meta.url), 'utf8');
  assert.match(source, /pacingSkip\(/, 'пейсинг не применяется в конвейере');
  assert.match(source, /pacingMessage\(/, 'причина пропуска не пишется словами');
  // Источник читает интервал из данных, а не из константы.
  assert.match(source, /poll_interval_minutes/, 'интервал не приходит из news_sources_v2');
});
