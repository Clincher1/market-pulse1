/**
 * Шлюз к источникам: квоты, интервалы и паузы проверяются как код.
 *
 * До этого файла единственной защитой был таймаут: писатель цен спрашивал
 * каждый источник каждые 15 минут независимо от того, сколько раз уже получил
 * отказ. Проверить «не заблокируют ли нас» было нечем, потому что не было ни
 * одной записанной цифры — сколько просим и сколько нам разрешено.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_SOURCES,
  afterAttempt,
  emptyState,
  gateDecision,
  MAX_ATTEMPTS,
  backoffMs,
  politenessVerdict,
  retryAfterFromError,
  shouldRetry,
  sourceSpec,
  statusFromError,
  utcDay,
} from '../supabase/functions/_shared/price-sources.ts';

const now = new Date('2026-11-11T12:00:00Z');

test('реестр: у каждого источника есть квота, интервал, пауза и план отказа', () => {
  assert.ok(PRICE_SOURCES.length >= 5);
  for (const source of PRICE_SOURCES) {
    assert.ok(source.dailyBudget > 0, `${source.id}: нет квоты`);
    assert.ok(source.minIntervalMinutes > 0, `${source.id}: нет интервала`);
    assert.ok(source.pauseAfterFailures >= 1, `${source.id}: нет порога паузы`);
    assert.ok(source.pauseMinutes > 0, `${source.id}: пауза нулевая`);
    assert.ok(source.assets.length > 0, `${source.id}: не привязан к ряду`);
    assert.ok(source.onFailure.length > 20, `${source.id}: не сказано, что будет при отказе`);
    assert.ok(source.fallback.length > 3, `${source.id}: нет запасного пути`);
    // Квота обязана быть ниже суточного лимита провайдера с запасом: иначе
    // «защита от блокировки» сама и есть блокировка.
    assert.ok(source.dailyBudget <= 300, `${source.id}: квота ${source.dailyBudget} слишком велика`);
  }
});

test('квоты: ЕЦБ не спрашивают каждые 15 минут, Twelve — раз в час', () => {
  // Курс ЕЦБ выходит раз в рабочий день; 96 запросов в сутки были не защитой,
  // а привычкой.
  assert.equal(sourceSpec('ecb').minIntervalMinutes, 120);
  assert.equal(sourceSpec('ecb').dailyBudget, 24);
  assert.equal(sourceSpec('twelve').minIntervalMinutes, 60);
  assert.equal(sourceSpec('twelve').dailyBudget, 100);
});

test('шлюз: первый запрос всегда разрешён', () => {
  for (const source of PRICE_SOURCES) {
    const decision = gateDecision(source, null, now);
    assert.equal(decision.allowed, true, `${source.id}: ${decision.note}`);
  }
});

test('шлюз: внутри интервала — не спрашиваем, после — спрашиваем', () => {
  const ecb = sourceSpec('ecb');
  const state = { ...emptyState('ecb'), last_attempt_at: '2026-11-11T11:00:00Z', day: utcDay(now), requests_today: 1 };
  const early = gateDecision(ecb, state, now);
  assert.equal(early.allowed, false);
  assert.equal(early.reason, 'not_due');
  const later = gateDecision(ecb, state, new Date('2026-11-11T13:00:00Z'));
  assert.equal(later.allowed, true);
});

test('шлюз: квота считается по календарным суткам UTC и сбрасывается', () => {
  const kraken = sourceSpec('kraken');
  const full = {
    ...emptyState('kraken'),
    day: '2026-11-11',
    requests_today: kraken.dailyBudget,
    last_attempt_at: '2026-11-11T11:50:00Z',
  };
  const blocked = gateDecision(kraken, full, now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'budget');
  assert.match(blocked.note, /исчерпана/);
  // Наступили новые сутки — счётчик начался заново.
  const nextDay = gateDecision(kraken, full, new Date('2026-11-12T00:05:00Z'));
  assert.equal(nextDay.allowed, true);
});

test('шлюз: пауза сильнее расписания — она проверяется первой', () => {
  const yahoo = sourceSpec('yahoo');
  const paused = {
    ...emptyState('yahoo'),
    last_attempt_at: '2026-11-11T11:00:00Z',
    consecutive_failures: 3,
    paused_until: '2026-11-11T12:30:00Z',
    day: utcDay(now),
    requests_today: 5,
  };
  const decision = gateDecision(yahoo, paused, now);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'paused');
  assert.match(decision.note, /пауза ещё 30 мин/);
  // Пауза истекла — источник снова спрашивают.
  assert.equal(gateDecision(yahoo, paused, new Date('2026-11-11T12:31:00Z')).allowed, true);
});

test('попытка: успех сбрасывает серию отказов и снимает паузу', () => {
  const kraken = sourceSpec('kraken');
  const failed = {
    ...emptyState('kraken'),
    consecutive_failures: 2,
    paused_until: '2026-11-11T13:00:00Z',
    day: utcDay(now),
    requests_today: 7,
  };
  const next = afterAttempt(kraken, failed, now, { ok: true, status: 200 });
  assert.equal(next.consecutive_failures, 0);
  assert.equal(next.paused_until, null);
  assert.equal(next.requests_today, 8);
  assert.equal(next.last_ok_at, now.toISOString());
});

test('попытка: третий отказ подряд включает паузу, второй — ещё нет', () => {
  const yahoo = sourceSpec('yahoo');
  const first = afterAttempt(yahoo, null, now, { ok: false, status: 429, error: 'HTTP 429: too many' });
  assert.equal(first.consecutive_failures, 1);
  assert.equal(first.paused_until, null);
  const second = afterAttempt(yahoo, first, now, { ok: false, status: 429 });
  assert.equal(second.paused_until, null);
  const third = afterAttempt(yahoo, second, now, { ok: false, status: 429 });
  assert.equal(third.consecutive_failures, 3);
  assert.ok(third.paused_until);
  const minutes = (Date.parse(third.paused_until) - now.getTime()) / 60000;
  assert.equal(minutes, yahoo.pauseMinutes);
});

test('попытка: Retry-After источника длиннее нашей паузы — уважаем источник', () => {
  const kraken = sourceSpec('kraken');
  const state = afterAttempt(kraken, { ...emptyState('kraken'), consecutive_failures: 2 }, now, {
    ok: false,
    status: 429,
    retryAfterSeconds: 3600,
  });
  const minutes = (Date.parse(state.paused_until) - now.getTime()) / 60000;
  assert.equal(minutes, 60, 'пауза должна равняться Retry-After, а не нашей минуте');
});

test('попытка: новый день начинает счётчик квоты заново', () => {
  const twelve = sourceSpec('twelve');
  const yesterday = { ...emptyState('twelve'), day: '2026-11-10', requests_today: 99, consecutive_failures: 1 };
  const next = afterAttempt(twelve, yesterday, now, { ok: true, status: 200 });
  assert.equal(next.requests_today, 1);
  assert.equal(next.consecutive_failures, 0);
});

test('код ответа вытаскивается из текста ошибки, а не угадывается', () => {
  assert.equal(statusFromError(new Error('HTTP 429: too many requests')), 429);
  assert.equal(statusFromError(new Error('HTTP 503: upstream')), 503);
  assert.equal(statusFromError(new Error('Yahoo chart: Not Found')), null);
  assert.equal(statusFromError('network down'), null);
});

test('неописанный источник не пропускается молча', () => {
  const decision = gateDecision(null, null, now);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'unknown-source');
});

test('Retry-After читается из текста ошибки, а не теряется', () => {
  // Источник сказал «подожди 3600 секунд». Если это потерять, мы вернёмся
  // через свои 15 минут и получим тот же отказ — именно так и выглядит
  // «нас заблокировали».
  assert.equal(retryAfterFromError(new Error('HTTP 429: slow down retry-after=3600')), 3600);
  assert.equal(retryAfterFromError(new Error('HTTP 503: busy retry-after=120')), 120);
  assert.equal(retryAfterFromError(new Error('HTTP 500: oops')), null);
  assert.equal(retryAfterFromError('нет сети'), null);
});

test('сторож: у Yahoo есть второй хост, и повтор не бесконечный', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  assert.match(source, /query2\.finance\.yahoo\.com/, 'резервного хоста нет');
  // Ровно два хоста в списке: третий повтор к сервису, который уже сказал
  // «нет», — это не настойчивость, а повод получить блокировку по IP.
  assert.match(source, /const hosts = \["query1\.finance\.yahoo\.com", "query2\.finance\.yahoo\.com"\]/);
  assert.match(source, /retry-after=/);
});

test('повтор только там, где виноват временный сбой', () => {
  assert.equal(shouldRetry(429, 'HTTP 429: limit'), true);
  assert.equal(shouldRetry(503, 'HTTP 503: busy'), true);
  assert.equal(shouldRetry(500, 'HTTP 500: oops'), true);
  // 404 и ошибка разбора не лечатся повтором: второй такой же ответ тратит
  // чужую квоту и наше время.
  assert.equal(shouldRetry(404, 'HTTP 404: not found'), false);
  assert.equal(shouldRetry(400, 'HTTP 400: bad request'), false);
  // Кода нет — до ответа не дошло; это таймаут или обрыв.
  assert.equal(shouldRetry(null, 'The operation was aborted'), true);
  assert.equal(shouldRetry(null, 'fetch failed'), true);
});

test('бэкофф растёт, имеет потолок и всегда с разбросом', () => {
  const mid = () => 0.5;
  assert.equal(backoffMs(1, mid), 500);
  assert.equal(backoffMs(2, mid), 1000);
  assert.ok(backoffMs(9, mid) <= 4000, 'потолок не соблюдён');
  // Разброс: у «быстрого» и «медленного» случайного числа ответ разный,
  // иначе одновременные запросы повторяются синхронным залпом.
  assert.notEqual(backoffMs(2, () => 0), backoffMs(2, () => 1));
  // Больше двух попыток не бывает.
  assert.equal(MAX_ATTEMPTS, 2);
});

test('сторож: писатель повторяет запрос, а не сдаётся после первого 429', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/update-assets/index.ts', import.meta.url), 'utf8');
  assert.match(source, /requestWithRetry/, 'нет запроса с повтором');
  assert.match(source, /shouldRetry\(status, lastError\.message\)/);
  assert.match(source, /if \(waitMs > RETRY_WAIT_BUDGET_MS\) throw lastError;/);
});

const NOW = new Date('2026-11-11T12:00:00Z');
const state = (id, extra = {}) => ({
  source_id: id,
  requests_today: 10,
  paused_until: null,
  consecutive_failures: 0,
  last_status: 200,
  last_ok_at: '2026-11-11T11:45:00Z',
  ...extra,
});

test('расход в пределах квот называется числом, а не обещанием', () => {
  const verdict = politenessVerdict(
    [state('yahoo', { requests_today: 96 }), state('twelve', { requests_today: 12 }), state('ecb', { requests_today: 6 })],
    NOW,
  );
  assert.equal(verdict.ok, true);
  assert.match(verdict.detail, /yahoo 96\/300/);
  assert.match(verdict.detail, /twelve 12\/100/);
});

test('перерасход квоты — отказ: это и есть путь в бан', () => {
  const verdict = politenessVerdict([state('twelve', { requests_today: 192 })], NOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.detail, /перерасход квоты: twelve: 192 из 100/);
});

test('источник вне реестра — отказ: у него нет ни квоты, ни паузы', () => {
  const verdict = politenessVerdict([state('yahoo'), state('frankfurter')], NOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.detail, /вне реестра: frankfurter/);
});

test('пауза после отказов — не поломка, её называют словами', () => {
  const verdict = politenessVerdict(
    [state('kraken', { consecutive_failures: 3, last_status: 429, paused_until: '2026-11-11T12:20:00Z' })],
    NOW,
  );
  assert.equal(verdict.ok, true);
  assert.match(verdict.detail, /kraken: пауза ещё 20 мин \(429\)/);
});

test('серия отказов без паузы — отказ: значит паузу не поставили', () => {
  const verdict = politenessVerdict([state('gold-api', { consecutive_failures: 5, paused_until: null })], NOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.detail, /отказы без паузы: gold-api: 5/);
});

test('истёкшая пауза не считается паузой', () => {
  const verdict = politenessVerdict(
    [state('ecb', { consecutive_failures: 0, paused_until: '2026-11-11T09:00:00Z' })],
    NOW,
  );
  assert.equal(verdict.ok, true);
  assert.doesNotMatch(verdict.detail, /пауза/);
});
