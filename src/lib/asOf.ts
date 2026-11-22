/**
 * Подпись к цене: на какой момент она верна.
 *
 * В кэше активов два разных времени, и путать их нельзя:
 *   as_of      — что сказал источник: дата закрытия у дневных рядов
 *                или момент котировки у внутридневных;
 *   updated_at — когда писатель цен сходил за данными.
 *
 * У Brent, S&P 500 и золота источник отдаёт дневное закрытие, поэтому в 08:45
 * МСК в кэше лежит закрытие вчерашнего дня. Подпись «на 15:44 МСК» приписала бы
 * этому закрытию минутную точность, которой у него нет, — поэтому для даты и
 * для момента котировки здесь два разных вида.
 */

// Locale/time-zone options are fixed. Reuse the native ICU formatters across
// ticker, tiles and favorites instead of rebuilding them on every render.
let clockFormatter: Intl.DateTimeFormat | undefined;
let observationDayFormatter: Intl.DateTimeFormat | undefined;
let moscowDayFormatter: Intl.DateTimeFormat | undefined;

/** Время по Москве: «12:02». Пустая строка, если времени нет. */
export function moscowClock(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return (clockFormatter ??= new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  })).format(date);
}

/**
 * «за 29 окт.» для даты наблюдения, «на 08:45 МСК» для момента котировки.
 * Пустая строка — если сказать нечего (тогда плитка покажет только время
 * записи в кэш и не будет утверждать ничего о дате цены).
 *
 * Полночь в UTC считается датой, а не временем: Postgres хранит «2026-10-29»
 * в timestamptz как 2026-10-29T00:00:00+00, и без этого правила закрытие
 * показывалось бы как котировка в 03:00 по Москве.
 */
export function observationLabel(asOf?: string | null): string {
  if (!asOf) return '';
  const iso = asOf.trim();
  if (!iso) return '';
  const dateOnly =
    /^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    /^\d{4}-\d{2}-\d{2}[T ]00:00(:00(\.0+)?)?(Z|[+-]00(:?00)?)$/.test(iso);
  if (dateOnly) {
    const day = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) return '';
    return `за ${(observationDayFormatter ??= new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Moscow',
    })).format(day)}`;
  }
  const clock = moscowClock(iso);
  return clock ? `на ${clock} МСК` : '';
}

const DAY_MS = 86_400_000;

function moscowDateKey(value: Date): string | null {
  if (Number.isNaN(value.getTime())) return null;
  const parts = (moscowDayFormatter ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return /^\d{4}$/.test(year) && /^\d{2}$/.test(month) && /^\d{2}$/.test(day)
    ? `${year}-${month}-${day}`
    : null;
}

/** Calendar-date lag in Moscow time; this does not claim a trading-session delay. */
export function observationLagDays(asOf?: string | null, now = new Date()): number | null {
  if (!asOf?.trim()) return null;
  const observation = new Date(asOf.trim());
  const observationKey = moscowDateKey(observation);
  const todayKey = moscowDateKey(now);
  if (!observationKey || !todayKey) return null;
  const observationMs = Date.parse(`${observationKey}T00:00:00Z`);
  const todayMs = Date.parse(`${todayKey}T00:00:00Z`);
  if (!Number.isFinite(observationMs) || !Number.isFinite(todayMs)) return null;
  return Math.max(0, Math.round((todayMs - observationMs) / DAY_MS));
}

function calendarDaysWord(days: number): string {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return 'календарный день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'календарных дня';
  return 'календарных дней';
}

/** Explicit calendar lag for daily series; an unknown date stays unlabelled. */
export function observationLagLabel(asOf?: string | null, now = new Date()): string {
  const days = observationLagDays(asOf, now);
  if (days === null) return '';
  if (days === 0) return 'сегодня по календарю источника';
  return `отстаёт от сегодняшней даты на ${days} ${calendarDaysWord(days)}`;
}
