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
} from '../supabase/functions/_shared/source-backoff.ts';

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
