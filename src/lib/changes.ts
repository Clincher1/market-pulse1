/**
 * «Что меняется» — наблюдения по фактическим рядам, без прогнозов.
 *
 * Здесь нет вероятностей, ожиданий и рекомендаций. Каждая строка — утверждение
 * о том, что уже произошло в данных: сколько дней подряд ряд движется в одну
 * сторону, где последнее значение относительно всего окна, насколько узок
 * диапазон последних дней. Всё считается из самих значений, поэтому любую
 * строку можно проверить по графику в том же разделе.
 *
 * Формулировки проверяются тестами (`tests/changes.test.mjs`), включая
 * склонение числительных: «3-й день», «за 3 дня», «за 66 дней».
 */

export interface SeriesPoint {
  date: string;
  value: number;
}

/**
 * Вход для расчёта.
 *
 * `dateKind: 'day'` — точки это торговые дни с датами (ряды Мосбиржи и ЦБ),
 * поэтому можно говорить «3-й день подряд».
 * `dateKind: 'sample'` — точки идут по порядку, а дат наблюдений нет: они не
 * сохранились или не совпали по длине со значениями (см. `datedPoints`). Дни
 * в таком ряду не считаются: можно говорить только о позиции значения в окне.
 * С 31.10.2026 даты мировых котировок хранятся в `cached_assets.spark_dates`,
 * поэтому обычный случай — `day`.
 */
export interface ChangeInput {
  id: string;
  name: string;
  unit: string;
  /**
   * Подпись единицы для читателя: «$ за баррель», «$ за унцию». Нужна там, где
   * одно слово значит разные величины: золото на Мосбирже — рубли за грамм,
   * а в мировом ряду — доллары за унцию. Без подписи два числа под одним
   * названием выглядят как противоречие.
   */
  unitLabel?: string;
  provider: string;
  dateKind: 'day' | 'sample';
  /** Знаков после запятой; 2 по умолчанию. У курсов ЦБ их четыре, у резервов один. */
  digits?: number;
  points: SeriesPoint[];
}

export type ChangeDirection = 'up' | 'down' | 'flat';
export type ChangeKind = 'streak' | 'reversal' | 'record' | 'range';

export interface ChangeNote {
  id: string;
  name: string;
  unit: string;
  unitLabel?: string;
  provider: string;
  kind: ChangeKind;
  direction: ChangeDirection;
  /** Сколько дней (или значений) участвует в наблюдении. */
  days: number;
  headline: string;
  detail: string;
  /** Дата последней точки; пустая строка, если дат нет. */
  lastDate: string;
  /** Чем больше, тем выше строка в списке. */
  weight: number;
}

const STREAK_MIN = 3;
const RANGE_WINDOW = 5;
const RANGE_TIGHT_PCT = 0.6;
const RECORD_MIN_POINTS = 20;
const DEFAULT_LIMIT = 6;

/** Пробел перед «%» неразрывный — как в `src/lib/percent.ts`. */
const NBSP = '\u00A0';

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = Math.abs(count) % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function dayWord(days: number): string {
  return plural(days, 'день', 'дня', 'дней');
}

/**
 * «после 3 дней снижения»: после предлога «после» всегда родительный падеж,
 * поэтому «3 дня» здесь неверно — только «3 дней», «1 дня».
 */
function afterDayWord(days: number): string {
  const mod100 = Math.abs(days) % 100;
  const mod10 = Math.abs(days) % 10;
  if (mod10 === 1 && mod100 !== 11) return 'дня';
  return 'дней';
}

function sampleWord(count: number): string {
  return plural(count, 'значение', 'значения', 'значений');
}

function tradingDayWord(count: number): string {
  return plural(count, 'торговый день', 'торговых дня', 'торговых дней');
}

function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '';
  return `${match[3]}.${match[2]}`;
}

/** Значение в единицах ряда: 2 509,26 / 10 149,50 / 80,5573. */
export function formatSeriesValue(value: number, digits = 2): string {
  return new Intl.NumberFormat('ru-RU', {
    // Нижняя граница — два знака (как на плитках), верхняя — точность источника.
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Ставки и доходности живут в процентах, поэтому их изменение — это разница в
 * процентных пунктах, а не «процент от процента». Для остальных рядов —
 * обычное относительное изменение.
 */
export function formatSeriesDelta(from: number, to: number, unit: string): string {
  if (unit === '%') {
    const diff = to - from;
    const sign = diff > 0 ? '+' : diff < 0 ? '\u2212' : '';
    return `${sign}${Math.abs(diff).toFixed(2).replace('.', ',')}${NBSP}п.п.`;
  }
  return formatSeriesChange(from, to);
}

/** Изменение в процентах: +0,39 % / −1,02 %. */
export function formatSeriesChange(from: number, to: number): string {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return '—';
  const pct = ((to - from) / Math.abs(from)) * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(pct).toFixed(2).replace('.', ',')}${NBSP}%`;
}

function sign(value: number): 1 | -1 | 0 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/**
 * Сколько последних изменений подряд одного знака.
 *
 * Нулевое изменение обрывает серию: «не изменился» — это не «вырос».
 */
export function trailingRun(values: number[]): { direction: 1 | -1 | 0; days: number } {
  let direction: 1 | -1 | 0 = 0;
  let days = 0;
  for (let index = values.length - 1; index > 0; index -= 1) {
    const step = sign((values[index] as number) - (values[index - 1] as number));
    if (step === 0) break;
    if (direction === 0) {
      direction = step;
      days = 1;
      continue;
    }
    if (step !== direction) break;
    days += 1;
  }
  return { direction, days };
}

/** Ширина диапазона последних `size` значений в процентах от их среднего. */
export function windowRangePct(values: number[], size = RANGE_WINDOW): number | null {
  if (values.length < size || size < 2) return null;
  const window = values.slice(-size);
  const max = Math.max(...window);
  const min = Math.min(...window);
  const mean = window.reduce((sum, item) => sum + item, 0) / window.length;
  if (!Number.isFinite(mean) || mean === 0) return null;
  return ((max - min) / Math.abs(mean)) * 100;
}

interface CleanSeries {
  input: ChangeInput;
  values: number[];
  points: SeriesPoint[];
}

function cleanSeries(input: ChangeInput): CleanSeries | null {
  const points = input.points.filter((point) => Number.isFinite(point.value));
  if (points.length < 2) return null;
  return { input, values: points.map((point) => point.value), points };
}

function valueWithDate(value: number, date: string, digits?: number): string {
  const label = shortDate(date);
  return `${formatSeriesValue(value, digits)}${label ? ` (${label})` : ''}`;
}

function describeStep(series: CleanSeries, days: number): string {
  const { points, values, input } = series;
  const fromPoint = points[points.length - 1 - days];
  const lastPoint = points[points.length - 1];
  if (!fromPoint || !lastPoint) return '';
  const change = formatSeriesDelta(fromPoint.value, lastPoint.value, input.unit);
  if (input.dateKind === 'day') {
    return `${valueWithDate(fromPoint.value, fromPoint.date, input.digits)} → ${valueWithDate(lastPoint.value, lastPoint.date, input.digits)} · ${change} за ${days} ${dayWord(days)}`;
  }
  if (values.length < days + 1) return '';
  return `${formatSeriesValue(fromPoint.value, input.digits)} → ${formatSeriesValue(lastPoint.value, input.digits)} · ${change} за ${days} ${sampleWord(days)}`;
}

function windowLabel(series: CleanSeries): string {
  const { points, values, input } = series;
  if (input.dateKind === 'day') {
    const from = shortDate(points[0]?.date ?? '');
    return `окно ${values.length} ${tradingDayWord(values.length)}${from ? ` с ${from}` : ''}`;
  }
  return `окно ${values.length} ${sampleWord(values.length)}`;
}

function streakNote(series: CleanSeries): ChangeNote | null {
  if (series.input.dateKind !== 'day') return null;
  const run = trailingRun(series.values);
  if (run.days < STREAK_MIN || run.direction === 0) return null;
  const up = run.direction > 0;
  return {
    id: `${series.input.id}:streak`,
    name: series.input.name,
    unit: series.input.unit,
    unitLabel: series.input.unitLabel,
    provider: series.input.provider,
    kind: 'streak',
    direction: up ? 'up' : 'down',
    days: run.days,
    headline: `${up ? 'растёт' : 'снижается'} ${run.days}-й день подряд`,
    detail: describeStep(series, run.days),
    lastDate: series.points[series.points.length - 1]?.date ?? '',
    weight: 100 + run.days * 5,
  };
}

function reversalNote(series: CleanSeries): ChangeNote | null {
  if (series.input.dateKind !== 'day') return null;
  const run = trailingRun(series.values);
  if (run.days !== 1 || run.direction === 0) return null;
  const before = trailingRun(series.values.slice(0, -1));
  if (before.days < STREAK_MIN || before.direction === 0) return null;
  if (before.direction === run.direction) return null;
  const up = run.direction > 0;
  return {
    id: `${series.input.id}:reversal`,
    name: series.input.name,
    unit: series.input.unit,
    unitLabel: series.input.unitLabel,
    provider: series.input.provider,
    kind: 'reversal',
    direction: up ? 'up' : 'down',
    days: before.days,
    headline: `развернулся ${up ? 'вверх' : 'вниз'} после ${before.days} ${afterDayWord(before.days)} ${up ? 'снижения' : 'роста'}`,
    detail: describeStep(series, 1),
    lastDate: series.points[series.points.length - 1]?.date ?? '',
    weight: 90 + before.days * 2,
  };
}

function recordNote(series: CleanSeries): ChangeNote | null {
  const { values, points, input } = series;
  if (values.length < RECORD_MIN_POINTS) return null;
  const last = values[values.length - 1] as number;
  const priorValues = values.slice(0, -1);
  const priorPoints = points.slice(0, -1);
  if (priorValues.length === 0) return null;

  const priorMax = Math.max(...priorValues);
  const priorMin = Math.min(...priorValues);
  const lastPoint = points[points.length - 1];
  const label = windowLabel(series);
  const isMax = last > priorMax;
  const isMin = last < priorMin;
  if (!isMax && !isMin) return null;

  const bestValue = isMax ? priorMax : priorMin;
  const bestIndex = priorValues.findIndex((value) => value === bestValue);
  const bestPoint = bestIndex >= 0 ? priorPoints[bestIndex] : undefined;
  const detail = [
    `закрытие ${valueWithDate(last, lastPoint?.date ?? '', input.digits)}`,
    `предыдущий ${isMax ? 'максимум' : 'минимум'} ${bestPoint ? valueWithDate(bestValue, bestPoint.date, input.digits) : formatSeriesValue(bestValue, input.digits)}`,
    label,
  ].join(' · ');

  const windowStart = shortDate(points[0]?.date ?? '');
  const headline =
    input.dateKind === 'day' && windowStart
      ? `${isMax ? 'максимум' : 'минимум'} с ${windowStart}`
      : `${isMax ? 'максимум' : 'минимум'} за ${values.length} ${
          input.dateKind === 'day' ? tradingDayWord(values.length) : sampleWord(values.length)
        }`;

  return {
    id: `${input.id}:${isMax ? 'max' : 'min'}`,
    name: input.name,
    unit: input.unit,
    unitLabel: input.unitLabel,
    provider: input.provider,
    kind: 'record',
    direction: isMax ? 'up' : 'down',
    days: values.length,
    headline,
    detail,
    lastDate: lastPoint?.date ?? '',
    weight: isMax ? 80 : 78,
  };
}

function rangeNote(series: CleanSeries): ChangeNote | null {
  const pct = windowRangePct(series.values);
  if (pct === null || pct > RANGE_TIGHT_PCT) return null;
  const window = series.points.slice(-RANGE_WINDOW);
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return null;
  const max = Math.max(...window.map((point) => point.value));
  const min = Math.min(...window.map((point) => point.value));
  const dates =
    series.input.dateKind === 'day' ? ` (${shortDate(first.date)} → ${shortDate(last.date)})` : '';
  const unit =
    series.input.dateKind === 'day' ? dayWord(RANGE_WINDOW) : sampleWord(RANGE_WINDOW);
  const isRate = series.input.unit === '%';
  const width = isRate ? max - min : pct;
  const widthLabel = `${width.toFixed(2).replace('.', ',')}${NBSP}${isRate ? 'п.п.' : '%'}`;
  return {
    id: `${series.input.id}:range`,
    name: series.input.name,
    unit: series.input.unit,
    unitLabel: series.input.unitLabel,
    provider: series.input.provider,
    kind: 'range',
    direction: 'flat',
    days: RANGE_WINDOW,
    headline: `узкий диапазон: ${widthLabel}`,
    detail: `${RANGE_WINDOW} ${unit}${dates}: от ${formatSeriesValue(min, series.input.digits)} до ${formatSeriesValue(max, series.input.digits)}`,
    lastDate: last.date,
    weight: 40,
  };
}

/**
 * Собирает наблюдения по всем рядам.
 *
 * На ряд берётся не больше одной строки — самая значимая. Нераспознанные
 * значения выбрасываются: лучше промолчать, чем посчитать серию по дырке.
 */
export function buildChangeNotes(inputs: ChangeInput[], limit = DEFAULT_LIMIT): ChangeNote[] {
  const notes: ChangeNote[] = [];

  for (const input of inputs) {
    const cleaned = cleanSeries(input);
    if (!cleaned) continue;
    const streak = streakNote(cleaned);
    const record = recordNote(cleaned);
    let candidate: ChangeNote | null =
      streak ?? reversalNote(cleaned) ?? record ?? rangeNote(cleaned);
    // Серия и рекорд — не альтернативы: «растёт 20-й день подряд» и «максимум
    // с 01.10» описывают одно и то же движение с двух сторон, поэтому склеиваем
    // их в одну строку, а не выбрасываем рекорд.
    if (streak && record && candidate === streak) {
      candidate = {
        ...streak,
        headline: `${streak.headline} — ${record.headline}`,
        weight: streak.weight + 5,
      };
    }
    if (candidate) notes.push(candidate);
  }

  return notes
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, 'ru'))
    .slice(0, Math.max(1, limit));
}

/**
 * Пары «значение + дата» из кэша мировых котировок.
 *
 * Источники (Yahoo Finance, ЕЦБ, Kraken, Twelve Data) даты закрытий отдают, но раньше
 * код их выбрасывал, и ряд честно назывался бездатым. Теперь даты хранятся
 * рядом со значениями. Здесь они соединяются заново — с двумя проверками:
 * длин должно быть ровно столько же, и даты обязаны идти по возрастанию.
 * Если хотя бы одна дата не разбирается или порядок нарушен, ряд объявляется
 * бездатым целиком: подписать значение чужой датой хуже, чем промолчать.
 */
export function datedPoints(
  values: number[],
  dates?: (string | null | undefined)[] | null,
): { dateKind: 'day' | 'sample'; points: SeriesPoint[] } {
  const clean: number[] = [];
  const cleanDates: (string | null | undefined)[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) continue;
    clean.push(value as number);
    cleanDates.push(dates?.[index]);
  }
  const sample = { dateKind: 'sample' as const, points: clean.map((value) => ({ date: '', value })) };
  if (clean.length < 2 || !dates || dates.length !== values.length) return sample;

  const iso: string[] = [];
  for (const date of cleanDates) {
    const text = typeof date === 'string' ? date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return sample;
    iso.push(text);
  }
  for (let index = 1; index < iso.length; index += 1) {
    if (iso[index]! <= iso[index - 1]!) return sample;
  }
  return {
    dateKind: 'day',
    points: clean.map((value, index) => ({ date: iso[index]!, value })),
  };
}

/** Сравнение двух соседних окон: что было за последние `days` и что до них. */
export interface WeekComparison {
  id: string;
  name: string;
  unit: string;
  unitLabel?: string;
  provider: string;
  dateKind: 'day' | 'sample';
  days: number;
  /** Изменение за последнее окно: проценты, а для ставок — п.п. */
  recentPct: number;
  /** Изменение за предыдущее окно такой же длины: проценты или п.п. */
  previousPct: number;
  recentLabel: string;
  previousLabel: string;
  /** Разница между окнами в процентных пунктах: recentPct − previousPct. */
  deltaPct: number;
  /**
   * Где последнее значение стоит внутри всего окна: доля значений, которые
   * строго ниже последнего, в процентах. Именно «строго», чтобы подпись
   * «выше N % окна» была правдой без скидки на само значение.
   */
  percentile: number;
  /** Последнее значение не ниже максимума окна. */
  isWindowMax: boolean;
  /** Последнее значение не выше минимума окна. */
  isWindowMin: boolean;
  /** Сколько значений в окне: у российских рядов — торговые дни, у мировых — закрытия. */
  windowSize: number;
  lastDate: string;
  windowLabel: string;
}

/**
 * «Неделя к неделе»: изменение за 7 значений против предыдущих 7.
 *
 * Это не ускорение и не замедление «в среднем» — здесь два факта рядом:
 * насколько ряд сдвинулся за последнюю неделю и насколько за неделю до неё.
 * Оценку «хорошо/плохо» сайт не выставляет: он показывает числа и даты.
 */
export function buildWeekComparisons(inputs: ChangeInput[], days = 7): WeekComparison[] {
  const result: WeekComparison[] = [];

  for (const input of inputs) {
    const cleaned = cleanSeries(input);
    if (!cleaned || cleaned.values.length < days * 2 + 1) continue;
    const { values, points } = cleaned;
    const last = values[values.length - 1] as number;
    const mid = values[values.length - 1 - days] as number;
    const start = values[values.length - 1 - days * 2] as number;
    if (!Number.isFinite(last) || !Number.isFinite(mid) || !Number.isFinite(start)) continue;
    if (mid === 0 || start === 0) continue;
    const isRate = input.unit === '%';
    const recentPct = isRate ? last - mid : (last / mid - 1) * 100;
    const previousPct = isRate ? mid - start : (mid / start - 1) * 100;
    const lastPoint = points[points.length - 1];
    const below = values.filter((value) => value < last).length;
    const percentile = Math.round((below / values.length) * 100);
    const windowLabel =
      input.dateKind === 'day'
        ? `${days} торговых дней`
        : `${days} значений`;
    result.push({
      id: input.id,
      name: input.name,
      unit: input.unit,
      unitLabel: input.unitLabel,
      provider: input.provider,
      dateKind: input.dateKind,
      days,
      recentPct,
      previousPct,
      recentLabel: formatSeriesDelta(mid, last, input.unit),
      previousLabel: formatSeriesDelta(start, mid, input.unit),
      deltaPct: recentPct - previousPct,
      percentile,
      isWindowMax: last >= Math.max(...values),
      isWindowMin: last <= Math.min(...values),
      windowSize: values.length,
      lastDate: lastPoint?.date ?? '',
      windowLabel,
    });
  }

  return result.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}
