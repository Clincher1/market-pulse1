/**
 * Шлюз к внешним источникам: сколько, как часто и после чего молчать.
 *
 * Зачем отдельный файл. До сих пор единственной защитой был таймаут и
 * «повторим на следующем запуске крона». Этого мало по двум причинам:
 *
 *   1. **Мы сами не знаем, сколько просим.** Писатель цен ходит в сеть каждые
 *      15 минут, и в каждом запуске — по одному запросу на источник. Для
 *      Twelve Data это 192 запроса в сутки при бесплатном лимите 800, для
 *      ЕЦБ — 96 запросов к сайту, который публикует курс раз в сутки.
 *      Ни одна из этих цифр не была записана и не проверялась.
 *   2. **Отказ не запоминался.** Если источник трижды подряд ответил 429,
 *      следующий запуск всё равно шёл к нему через 15 минут: пауза была только
 *      у новостных лент.
 *
 * Здесь каждому источнику выдана квота: сколько запросов в сутки мы себе
 * разрешаем, как часто спрашиваем, после скольких отказов молчим и что
 * произойдёт, если он всё-таки откажет. Состояние (счётчик, серия отказов,
 * пауза) живёт в таблице `asset_source_state`, то есть переживает запуск:
 * функция — не процесс, и помнить между вызовами ей нечем.
 *
 * Правила намеренно простые, чтобы их можно было проверить тестом, а не
 * надеждой:
 *   - квота — на календарные сутки UTC, сбрасывается в полночь;
 *   - интервал — минимальный, а не точный: опоздание не ошибка;
 *   - успех сбрасывает серию отказов и снимает паузу;
 *   - пауза после N отказов подряд, и её можно продлить заголовком
 *     `Retry-After`, если источник сам сказал, когда ждать;
 *   - «не пытались» никогда не считается отказом источника.
 *
 * Модуль без Deno и без сети: его проверяют обычные тесты.
 */

import type { SourceTier } from './data-contract.ts';

export interface PriceSourceSpec {
  /** Ключ в `asset_source_state.source_id`. */
  id: string;
  /** Хост, к которому идут запросы (для человека, не для логики). */
  host: string;
  tier: SourceTier;
  /** Ряды, которые зависят от источника. */
  assets: string[];
  endpoint: string;
  /**
   * Сколько запросов в сутки мы себе разрешаем. Число выбрано так, чтобы даже
   * при сбое расписания остаться заметно ниже лимита провайдера.
   */
  dailyBudget: number;
  /** Минимальный интервал между запросами, минуты. */
  minIntervalMinutes: number;
  /** После скольких отказов подряд источник замолкает. */
  pauseAfterFailures: number;
  /** На сколько минут замолкает. */
  pauseMinutes: number;
  /** Что произойдёт с сайтом, если источник откажет — словами. */
  onFailure: string;
  /** Чем заменим, если не ответит. */
  fallback: string;
}

export const PRICE_SOURCES: PriceSourceSpec[] = [
  {
    id: 'yahoo',
    host: 'query1.finance.yahoo.com (резерв query2)',
    tier: 'undocumented-api',
    assets: ['brent', 'sp500'],
    endpoint: 'v8/finance/chart/{symbol}',
    // Два ряда по 4 запроса в час = 192 в сутки; 300 — потолок с запасом на
    // повтор после отказа, чтобы при сбое расписания не уйти в сотни.
    dailyBudget: 300,
    minIntervalMinutes: 10,
    pauseAfterFailures: 3,
    pauseMinutes: 45,
    onFailure: 'Brent и S&P 500 остаются с прежней ценой и честной датой наблюдения; проверка asset_quote_lag называет ряд и отставание',
    fallback: 'второй хост query2.finance.yahoo.com; независимая сверка — FRED (только при наличии ключа)',
  },
  {
    id: 'stooq',
    host: 'stooq.com',
    tier: 'undocumented-api',
    assets: ['brent'],
    endpoint: 'q/d/l/?s=qa.f&i=d',
    // Used only after Yahoo's two hosts fail. A 120-request daily cap stays
    // above the regular 15-minute schedule while containing fallback traffic.
    dailyBudget: 120,
    minIntervalMinutes: 10,
    pauseAfterFailures: 2,
    pauseMinutes: 60,
    onFailure: 'Brent keeps the last known NYMEX BZ=F price and its observation date; Stooq is a backup only',
    fallback: 'Yahoo Finance BZ=F (query1/query2); no different Brent benchmark is substituted',
  },
  {
    id: 'kraken',
    host: 'api.kraken.com',
    tier: 'first-party',
    assets: ['btc'],
    endpoint: '0/public/Ticker, 0/public/OHLC',
    // Официальный интерфейс биржи: лимит щедрый (счётчик на пару, порядка
    // запроса в секунду), но и его не выбираем. Два запроса на запуск при
    // 15-минутном расписании дают 192 в сутки; 300 — потолок с запасом.
    dailyBudget: 300,
    minIntervalMinutes: 5,
    pauseAfterFailures: 3,
    pauseMinutes: 30,
    onFailure: 'BTC не публикуется; прежняя строка остаётся с датой, которую назвал Kraken',
    fallback: 'FRED CBBTCUSD (дневные данные) — только для сверки ряда, не для плитки',
  },
  {
    id: 'gold-api',
    host: 'api.gold-api.com',
    tier: 'undocumented-api',
    assets: ['gold'],
    endpoint: 'price/XAU',
    dailyBudget: 300,
    minIntervalMinutes: 5,
    pauseAfterFailures: 3,
    pauseMinutes: 30,
    onFailure: 'прежняя котировка остаётся со своей датой; чужое закрытие не подставляется',
    fallback: 'нет: инструмент и методика не подменяются',
  },
  {
    id: 'coinbase',
    host: 'api.coinbase.com, api.exchange.coinbase.com',
    tier: 'first-party',
    assets: ['btc'],
    endpoint: 'v2/prices/BTC-USD/spot, products/BTC-USD/candles',
    // Официальный интерфейс биржи, как и Kraken. Лимит — 10 запросов в секунду,
    // но нам и двух на запуск хватает: 300 в сутки — потолок с запасом.
    dailyBudget: 300,
    minIntervalMinutes: 5,
    pauseAfterFailures: 3,
    pauseMinutes: 30,
    onFailure: 'BTC остаётся на источнике по умолчанию (Kraken); подпись называет площадку, чья цена показана',
    fallback: 'Kraken XBT/USD — тот же спот, другая биржа',
  },
  {
    id: 'binance',
    host: 'api.binance.com',
    tier: 'first-party',
    assets: ['btc'],
    endpoint: 'api/v3/ticker/price, api/v3/klines',
    // Пара BTCUSDT, а не BTC-USD: это курс к стейблкоину, и подпись обязана
    // это говорить. Квота та же — с запасом.
    dailyBudget: 300,
    minIntervalMinutes: 5,
    pauseAfterFailures: 3,
    pauseMinutes: 30,
    onFailure: 'BTC остаётся на источнике по умолчанию (Kraken); разница USDT/USD подписывается',
    fallback: 'Kraken XBT/USD или Coinbase BTC-USD',
  },
  {
    id: 'frankfurter',
    host: 'api.frankfurter.app',
    tier: 'undocumented-api',
    assets: ['usd-eur'],
    endpoint: '{start}..{end}?from=EUR&to=USD',
    // Frankfurter не считает свой курс, а раздаёт справочный курс ЕЦБ. Это
    // зеркало: те же числа, другой адрес. Квота как у ЕЦБ — публикация раз в
    // рабочий день, чаще спрашивать нечего.
    dailyBudget: 24,
    minIntervalMinutes: 120,
    pauseAfterFailures: 3,
    pauseMinutes: 180,
    onFailure: 'USD/EUR остаётся с прежним курсом и его датой; проверка assets_asof покажет возраст',
    fallback: 'ЕЦБ напрямую (eurofxref) — первоисточник',
  },
  {
    id: 'ecb',
    host: 'www.ecb.europa.eu',
    tier: 'first-party',
    assets: ['usd-eur'],
    endpoint: 'stats/eurofxref/eurofxref-hist-90d.xml',
    // Курс публикуется один раз в рабочий день около 16:00 CET. Каждые два
    // часа — 12 запросов в сутки вместо 96, и ни одна публикация не пропущена.
    dailyBudget: 24,
    minIntervalMinutes: 120,
    pauseAfterFailures: 3,
    pauseMinutes: 180,
    onFailure: 'USD/EUR остаётся с прежним курсом и его датой; проверка assets_asof покажет возраст',
    fallback: 'нет: ЕЦБ — первичный источник официального курса',
  },
];

export function sourceSpec(id: string): PriceSourceSpec | null {
  return PRICE_SOURCES.find((source) => source.id === id) ?? null;
}

/** Состояние источника в базе. Всё, что нужно, чтобы помнить отказ между запусками. */
export interface SourceState {
  source_id: string;
  last_attempt_at: string | null;
  last_ok_at: string | null;
  last_status: number | null;
  consecutive_failures: number;
  paused_until: string | null;
  requests_today: number;
  /** Календарный день UTC, к которому относится счётчик. */
  day: string | null;
  last_error?: string | null;
}

export function emptyState(sourceId: string): SourceState {
  return {
    source_id: sourceId,
    last_attempt_at: null,
    last_ok_at: null,
    last_status: null,
    consecutive_failures: 0,
    paused_until: null,
    requests_today: 0,
    day: null,
    last_error: null,
  };
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface GateDecision {
  allowed: boolean;
  /** `ok` | `not_due` | `paused` | `budget` | `unknown-source` */
  reason: 'ok' | 'not_due' | 'paused' | 'budget' | 'unknown-source';
  /** Готовая строка для отчёта запуска. */
  note: string;
}

/**
 * Можно ли идти в источник прямо сейчас.
 *
 * Порядок проверок важен: пауза и квота — это запреты, а интервал — расписание.
 * Если сначала проверять интервал, пауза после отказов никогда не наступит,
 * потому что «ещё не время» выглядит как обычный пропуск.
 */
export function gateDecision(spec: PriceSourceSpec | null, state: SourceState | null, now: Date): GateDecision {
  if (!spec) return { allowed: false, reason: 'unknown-source', note: 'источник не описан в шлюзе' };
  const current = state ?? emptyState(spec.id);
  const pausedUntil = current.paused_until ? Date.parse(current.paused_until) : null;
  if (pausedUntil !== null && Number.isFinite(pausedUntil) && pausedUntil > now.getTime()) {
    const minutes = Math.ceil((pausedUntil - now.getTime()) / 60000);
    return {
      allowed: false,
      reason: 'paused',
      note: `${spec.id}: пауза ещё ${minutes} мин после ${current.consecutive_failures} отказов подряд`,
    };
  }
  const usedToday = current.day === utcDay(now) ? current.requests_today : 0;
  if (usedToday >= spec.dailyBudget) {
    return {
      allowed: false,
      reason: 'budget',
      note: `${spec.id}: квота ${spec.dailyBudget} запросов в сутки исчерпана (${usedToday})`,
    };
  }
  if (current.last_attempt_at) {
    const last = Date.parse(current.last_attempt_at);
    if (Number.isFinite(last)) {
      const elapsed = (now.getTime() - last) / 60000;
      if (elapsed < spec.minIntervalMinutes) {
        return {
          allowed: false,
          reason: 'not_due',
          note: `${spec.id}: спрашиваем раз в ${spec.minIntervalMinutes} мин, прошло ${Math.max(0, Math.round(elapsed))}`,
        };
      }
    }
  }
  return { allowed: true, reason: 'ok', note: `${spec.id}: можно спрашивать (${usedToday + 1} из ${spec.dailyBudget} за сутки)` };
}

export interface AttemptOutcome {
  ok: boolean;
  /** Код ответа, если он был. `null` — сеть не ответила. */
  status?: number | null;
  /** Заголовок Retry-After, если источник сам сказал, когда ждать. */
  retryAfterSeconds?: number | null;
  error?: string | null;
}

/**
 * Состояние после попытки. Чистая функция: тест подаёт вход и проверяет выход,
 * а не «кажется, пауза работает».
 */
export function afterAttempt(
  spec: PriceSourceSpec,
  state: SourceState | null,
  now: Date,
  outcome: AttemptOutcome,
): SourceState {
  const current = state ?? emptyState(spec.id);
  const day = utcDay(now);
  const sameDay = current.day === day;
  const base: SourceState = {
    ...current,
    source_id: spec.id,
    last_attempt_at: now.toISOString(),
    requests_today: (sameDay ? current.requests_today : 0) + 1,
    day,
  };
  if (outcome.ok) {
    return {
      ...base,
      last_ok_at: now.toISOString(),
      last_status: outcome.status ?? 200,
      consecutive_failures: 0,
      paused_until: null,
      last_error: null,
    };
  }
  const failures = current.consecutive_failures + 1;
  const pauseMs = Math.max(
    spec.pauseMinutes,
    Number.isFinite(outcome.retryAfterSeconds ?? Number.NaN) ? Math.ceil((outcome.retryAfterSeconds as number) / 60) : 0,
  ) * 60000;
  const shouldPause = failures >= spec.pauseAfterFailures;
  return {
    ...base,
    last_status: outcome.status ?? null,
    consecutive_failures: failures,
    paused_until: shouldPause ? new Date(now.getTime() + pauseMs).toISOString() : null,
    last_error: (outcome.error ?? '').slice(0, 700) || null,
  };
}

/** Код ответа по тексту ошибки: писатель бросает `HTTP 429: ...`. */
export function statusFromError(error: unknown): number | null {
  const text = error instanceof Error ? error.message : String(error);
  const match = /HTTP\s+(\d{3})/.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * `Retry-After` из текста ошибки: писатель дописывает его в сообщение, когда
 * источник сам сказал, сколько ждать. Возвращает секунды или `null`.
 */
export function retryAfterFromError(error: unknown): number | null {
  const text = error instanceof Error ? error.message : String(error);
  const match = /retry-after=(\d+)/i.exec(text);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Повторять ли запрос после такой ошибки.
 *
 * Повторяем только то, где источник сам виноват во временном: перегрузка
 * (429), сбой на его стороне (5xx), обрыв сети и таймаут. Ответ 404 или
 * ошибка разбора не повторяются: второй такой же ответ ничего не изменит,
 * а время и чужую квоту потратит.
 */
export function shouldRetry(status: number | null, message: string): boolean {
  if (status === 429) return true;
  if (status !== null && status >= 500) return true;
  // Кода нет — значит до ответа дело не дошло: таймаут, обрыв, DNS.
  if (status === null) return true;
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|aborted|timeout/i.test(message);
}

/**
 * Сколько ждать перед повтором: экспонента, потолок и случайный разброс.
 *
 * Разброс обязателен. Без него четыре ряда, получившие 503 в одну и ту же
 * секунду, повторяют запрос тоже в одну и ту же секунду — со стороны
 * источника это выглядит как залп, и защита от ботов включается именно на
 * нём. Разброс делает повторы непохожими друг на друга.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
  return Math.round(base * (0.7 + random() * 0.6));
}

export const BASE_BACKOFF_MS = 500;
export const MAX_BACKOFF_MS = 4000;
/** Больше двух попыток не делаем: третья — это уже настойчивость. */
export const MAX_ATTEMPTS = 2;

/** Строка `asset_source_state` так, как её видит проверка. */
export interface PolitenessRow {
  source_id: string;
  requests_today: number | null;
  paused_until: string | null;
  consecutive_failures: number | null;
  last_status: number | null;
  last_ok_at: string | null;
  last_error?: string | null;
}

/**
 * Вежливость к источникам как проверка, а не как обещание.
 *
 * Вопрос проверки: «мы не приходим к источнику чаще, чем он разрешает».
 * Ответ берётся не из кода, а из того же счётчика, по которому принимает
 * решение шлюз, поэтому проверка не может разойтись с поведением.
 *
 * Молчащий источник — не приговор: пауза после трёх отказов это работающий
 * механизм, и в отчёте она называется словами. Приговор — это перерасход
 * квоты (мы сами лезем в бан) и «источник не описан в реестре» (значит у него
 * нет ни квоты, ни паузы вовсе).
 */
export function politenessVerdict(
  rows: PolitenessRow[],
  now: Date,
  sources: PriceSourceSpec[] = PRICE_SOURCES,
): { ok: boolean; detail: string } {
  const byId = new Map(rows.map((row) => [row.source_id, row]));
  const overQuota: string[] = [];
  const paused: string[] = [];
  const failing: string[] = [];
  const unknown: string[] = [];

  for (const row of rows) {
    if (!sourceSpecOf(row.source_id, sources)) unknown.push(row.source_id);
  }

  for (const source of sources) {
    const row = byId.get(source.id);
    if (!row) continue;
    const used = Math.max(0, Math.trunc(Number(row.requests_today ?? 0)));
    if (used > source.dailyBudget) overQuota.push(`${source.id}: ${used} из ${source.dailyBudget} за сутки`);

    const pausedUntil = row.paused_until ? Date.parse(row.paused_until) : Number.NaN;
    if (Number.isFinite(pausedUntil) && pausedUntil > now.getTime()) {
      const minutes = Math.ceil((pausedUntil - now.getTime()) / 60000);
      paused.push(`${source.id}: пауза ещё ${minutes} мин (${row.last_status ?? 'без кода'})`);
    } else if ((row.consecutive_failures ?? 0) >= source.pauseAfterFailures) {
      // Серия отказов уже переросла порог, а паузы нет — значит паузу не
      // поставили. Это дефект шлюза, а не свойство источника.
      failing.push(`${source.id}: ${row.consecutive_failures} отказов подряд без паузы`);
    }
  }

  const parts: string[] = [];
  if (overQuota.length) parts.push(`перерасход квоты: ${overQuota.join(', ')}`);
  if (unknown.length) parts.push(`источник вне реестра: ${unknown.join(', ')}`);
  if (failing.length) parts.push(`отказы без паузы: ${failing.join(', ')}`);
  if (paused.length) parts.push(`на паузе (это норма): ${paused.join(', ')}`);

  const described = sources
    .filter((source) => byId.has(source.id))
    .map((source) => `${source.id} ${Math.max(0, Math.trunc(Number(byId.get(source.id)?.requests_today ?? 0)))}/${source.dailyBudget}`)
    .join(', ');

  return {
    ok: overQuota.length === 0 && unknown.length === 0 && failing.length === 0,
    detail: parts.length ? parts.join('; ') : `расход в пределах квот: ${described || 'ни одного запроса за сутки'}`,
  };
}

function sourceSpecOf(id: string, sources: PriceSourceSpec[]): PriceSourceSpec | null {
  return sources.find((source) => source.id === id) ?? null;
}
