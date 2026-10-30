/**
 * Подпись к цене: на какой момент она верна.
 *
 * В кэше активов два разных времени, и путать их нельзя:
 *   as_of      — что сказал источник: дата закрытия у дневных рядов
 *                (FRED, EIA) или момент котировки у внутридневных;
 *   updated_at — когда писатель цен сходил за данными.
 *
 * У Brent, S&P 500 и золота источник отдаёт дневное закрытие, поэтому в 08:45
 * МСК в кэше лежит закрытие вчерашнего дня. Подпись «на 15:44 МСК» приписала бы
 * этому закрытию минутную точность, которой у него нет, — поэтому для даты и
 * для момента котировки здесь два разных вида.
 */

/** Время по Москве: «12:02». Пустая строка, если времени нет. */
export function moscowClock(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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
    return `за ${new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Moscow',
    }).format(day)}`;
  }
  const clock = moscowClock(iso);
  return clock ? `на ${clock} МСК` : '';
}
