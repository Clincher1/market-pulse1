/**
 * Дневной ряд из открытого чарта Yahoo Finance.
 *
 * Зачем это отдельным модулем. 01.11.2026 FRED перестал отдавать CSV без
 * ключа: `fredgraph.csv?id=DCOILBRENTEU` и `?id=SP500` вернули 404, а тот же
 * запрос через pg_net — «Stream error in the HTTP/2 framing layer». С
 * ноября 2025 у FRED программный доступ требует зарегистрированного ключа,
 * бесплатные ключи выдаются только человеку через форму. Сайт живёт на
 * бесплатных тарифах без ручной регистрации, поэтому источник заменён на
 * публичный чарт Yahoo — и вместе с источником на табличке меняется название
 * инструмента, а не только цифра.
 *
 * Здесь только разбор ответа: превратить «timestamp + close» в точки с датами
 * и не выдать незакрытый бар за закрытие дня. Решение, что делать с баром,
 * принимает вызывающий код (см. `closedHistory`).
 */

export interface YahooPoint {
  /** День бара в UTC, `YYYY-MM-DD`. */
  date: string;
  /** Daily close; retained as value for existing consumers. */
  value: number;
  open: number | null;
  high: number | null;
  low: number | null;
}

export interface YahooDailySeries {
  /** Закрытия по возрастанию даты; пустые и нулевые значения выброшены. */
  points: YahooPoint[];
  /** Момент последней котировки (ISO), если источник его назвал. */
  quoteTime: string | null;
  /** Конец регулярной сессии дня последнего бара (ISO), если источник его назвал. */
  sessionEnd: string | null;
  symbol: string | null;
  exchange: string | null;
  exchangeName: string | null;
  instrumentType: string | null;
  regularMarketPrice: number | null;
  contractSymbol: string | null;
  expireDate: number | null;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function positive(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isoFromSeconds(value: unknown): string | null {
  const seconds = positive(value) ?? (Number(value) === 0 ? 0 : null);
  if (seconds === null) return null;
  const ms = seconds * 1000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function utcDay(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * Разбирает ответ `v8/finance/chart`. Бросает, если ответ не тот или точек
 * меньше двух: пустой ряд нельзя выдавать за котировку.
 */
export function parseYahooDaily(payload: unknown): YahooDailySeries {
  if (!isRecord(payload)) throw new Error("Yahoo chart: response is not an object");
  const chart = payload.chart;
  if (!isRecord(chart)) throw new Error("Yahoo chart: no chart object");
  if (chart.error) {
    const message = isRecord(chart.error) ? String(chart.error.description ?? chart.error.code ?? "error") : String(chart.error);
    throw new Error(`Yahoo chart: ${message.slice(0, 200)}`);
  }
  const result = asArray(chart.result)[0];
  if (!isRecord(result)) throw new Error("Yahoo chart: empty result");

  const meta = isRecord(result.meta) ? result.meta : {};
  const timestamps = asArray(result.timestamp).map((value) => (typeof value === "number" ? value : Number(value)));
  const quote = isRecord(asArray(isRecord(result.indicators) ? result.indicators.quote : [])[0])
    ? asArray((result.indicators as Json).quote as unknown[])[0] as Json
    : {};
  const closes = asArray(quote.close);
  const opens = asArray(quote.open);
  const highs = asArray(quote.high);
  const lows = asArray(quote.low);

  const byDay = new Map<string, YahooPoint>();
  for (let index = 0; index < timestamps.length; index += 1) {
    const seconds = timestamps[index];
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const value = positive(closes[index]);
    if (value === null) continue;
    const date = utcDay(seconds);
    byDay.set(date, {
      date,
      value,
      open: positive(opens[index]),
      high: positive(highs[index]),
      low: positive(lows[index]),
    });
  }

  const points = [...byDay.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (points.length < 2) throw new Error(`Yahoo chart: only ${points.length} daily closes`);

  const regular = isRecord(meta.currentTradingPeriod) && isRecord(meta.currentTradingPeriod.regular)
    ? meta.currentTradingPeriod.regular
    : {};

  return {
    points,
    quoteTime: isoFromSeconds(meta.regularMarketTime),
    sessionEnd: isoFromSeconds(regular.end),
    symbol: typeof meta.symbol === "string" ? meta.symbol : null,
    exchange: typeof meta.fullExchangeName === "string" ? meta.fullExchangeName : null,
    exchangeName: typeof meta.exchangeName === "string" ? meta.exchangeName : null,
    instrumentType: typeof meta.instrumentType === "string" ? meta.instrumentType : null,
    regularMarketPrice: positive(meta.regularMarketPrice),
    contractSymbol: typeof meta.contractSymbol === "string" ? meta.contractSymbol : null,
    expireDate: Number.isFinite(Number(meta.expireDate)) ? Number(meta.expireDate) : null,
  };
}

/**
 * Бар последнего дня ещё формируется? Так бывает на открытом рынке: Yahoo
 * отдаёт за сегодня «закрытие», которое на самом деле текущая цена. Пока
 * сессия не закончилась, такой бар в историю не идёт — иначе вечернее значение
 * будет выглядеть как дневное закрытие.
 */
export function isFormingBar(series: YahooDailySeries, now: Date): boolean {
  const last = series.points.at(-1);
  if (!last) return false;
  const today = now.toISOString().slice(0, 10);
  if (last.date !== today) return false;
  if (!series.sessionEnd) return false;
  const end = Date.parse(series.sessionEnd);
  return Number.isFinite(end) ? now.getTime() < end : false;
}
