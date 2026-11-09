/**
 * Когда у архивного прогноза должен был наступить исход.
 *
 * Зачем это здесь. Выдача прогнозов остановлена 31.10.2026, и вместе с ней
 * остановилась оценка исходов: в архиве осталось 89 записей со статусом
 * `pending`. Карточка писала на них «ждёт горизонт и цены» — и это было
 * неправдой: у большинства горизонт в 1–3 торговых дня наступил ещё в начале
 * ноября, цены на сайте есть. Ждать там нечего, исход просто не посчитан.
 *
 * Поэтому дата считается здесь арифметикой, а не берётся из базы: срок
 * известен из `issue_date` и `horizon_trading_days`, и его можно назвать
 * словами даже когда оценщик молчит.
 *
 * Торговые дни считаются грубо — по будням, без праздников и без биржевых
 * календарей разных стран. Это осознанно: цель — не сказать «исход обязан
 * быть ровно 05.11», а отличить «срок ещё не пришёл» от «срок прошёл, а
 * исхода нет». Разница в один праздничный день на этот вывод не влияет, а
 * точную дату наблюдения пишет сам оценщик, когда он работает.
 */

export type HorizonState = 'evaluated' | 'waiting' | 'overdue';

export interface HorizonOutlook {
  state: HorizonState;
  /** Дата, после которой исход должен быть наблюдаем (ISO `YYYY-MM-DD`). */
  expectedDate?: string;
  /** Насколько срок в прошлом (дни); для `waiting` — сколько осталось. */
  days: number;
}

/** `2026-11-09` или ISO-момент → дата без времени (UTC). */
function toDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Пятница + 1 торговый день = понедельник; суббота и воскресенье пропускаются. */
export function addTradingDays(from: string, days: number): string | null {
  const start = toDate(from);
  if (!start || !Number.isFinite(days) || days < 0) return null;
  const cursor = new Date(start.getTime());
  let left = Math.floor(days);
  while (left > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return isoDate(cursor);
}

/** Сколько целых суток между двумя датами (положительное — `to` позже `from`). */
export function daysBetween(from: string, to: string): number | null {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Состояние исхода прогноза на текущий момент.
 *
 * `evaluated` — исход посчитан, дата не нужна.
 * `waiting`   — срок ещё не наступил, называем дату.
 * `overdue`   — срок прошёл, исхода нет: так и говорим, без «ждёт».
 */
export function horizonOutlook(
  forecast: { issueDate?: string; horizonTradingDays?: number; outcomeStatus?: string },
  today: string = isoDate(new Date()),
): HorizonOutlook {
  if (forecast.outcomeStatus === 'evaluated') return { state: 'evaluated', days: 0 };
  const horizon = Number(forecast.horizonTradingDays);
  const expectedDate = forecast.issueDate ? addTradingDays(forecast.issueDate, horizon) : null;
  if (!expectedDate) return { state: 'waiting', days: 0 };
  const elapsed = daysBetween(expectedDate, today);
  if (elapsed === null) return { state: 'waiting', days: 0 };
  return elapsed > 0
    ? { state: 'overdue', expectedDate, days: elapsed }
    : { state: 'waiting', expectedDate, days: Math.abs(elapsed) };
}

/** Подпись словами: без числа там, где число ничего не добавляет. */
export function horizonLabel(outlook: HorizonOutlook, formatDate: (iso: string) => string): string {
  if (outlook.state === 'evaluated') return 'исход посчитан';
  if (outlook.state === 'waiting') {
    return outlook.expectedDate
      ? `ждёт горизонта до ${formatDate(outlook.expectedDate)}`
      : 'ждёт горизонта';
  }
  const days = outlook.days;
  const word = days % 10 === 1 && days % 100 !== 11 ? 'день' : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20) ? 'дня' : 'дней';
  return `срок прошёл ${days} ${word} назад, исход не посчитан`;
}
