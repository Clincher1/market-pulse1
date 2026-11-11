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
    onFailure: 'цена золота падает на закрытие Twelve Data и подписывается им; проверка назовёт отставание',
    fallback: 'Twelve Data quote (закрытие сессии) — честная, но менее свежая цена',
  },
  {
    id: 'twelve',
    host: 'api.twelvedata.com',
    tier: 'commercial-api',
    assets: ['gold'],
    endpoint: 'time_series?symbol=XAU%2FUSD',
    // Бесплатный тариф: 8 запросов в минуту и 800 в сутки, и этот же ключ
    // используют теневые писатели. Раз в час — 24 запроса в сутки, то есть
    // 3 % лимита: запас на повтор и на ручную диагностику.
    dailyBudget: 100,
    minIntervalMinutes: 60,
    pauseAfterFailures: 3,
    pauseMinutes: 120,
    onFailure: 'история золота не обновляется; цена на плитке остаётся живой из gold-api',
    fallback: 'нет бесплатной замены дневных закрытий XAU/USD; ряд честно помечается отставшим',
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
