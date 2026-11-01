/**
 * История котировки — только закрытые наблюдения.
 *
 * Зачем это отдельным модулем: правило легко нарушить молча. Ряд выглядит
 * правдоподобно, значения настоящие, даты настоящие — просто одна из них не
 * день наблюдения, а незакрытый бар или бар, которого в кавычке ещё нет.
 *
 * Так и случилось 01.11.2026: у золота в историю попал бар «2026-11-01» со
 * значением 3 875,42, хотя цена в кавычке была от 31.10, 23:00 МСК. Сайт
 * подписал пятничную цену воскресным днём, посчитал по этой точке «3-й день
 * снижения» и поставил её же в «Неделю к неделе».
 *
 * Правило здесь одно и без знания календарей:
 *   1. точка не может быть позже момента наблюдения (`as_of`): если источник
 *      отдал бар, которого в кавычке нет, это не наблюдение;
 *   2. незакрытый бар текущих суток в историю не входит — он ещё меняется;
 *      текущая цена показывается отдельно, в самой плитке.
 *
 * Ровно это сайт уже обещает по российским рядам: «Текущая сессия в историю
 * попадает только после закрытия». Мировые ряды теперь живут по тому же
 * правилу, а не по другому.
 */

export interface HistoryPoint {
  date: string;
  value: number;
}

export interface ClosedHistoryInput {
  points: HistoryPoint[];
  /** Момент наблюдения цены: ISO-дата или ISO-время. Может отсутствовать. */
  asOf?: string | null;
  /** Время получения данных (ISO): по нему определяется «сегодня» в UTC. */
  fetchedAt: string;
  /**
   * Дата бара, который у этого источника ещё формируется. Kraken отдаёт
   * дневную свечу текущих суток, и её закрытие — это последняя сделка, а не
   * закрытие дня. Для остальных источников не задаётся.
   */
  formingBarDate?: string | null;
}

export interface ClosedHistoryResult {
  points: HistoryPoint[];
  /** Сколько точек отброшено и почему — для лога запуска. */
  dropped: { afterAsOf: number; forming: number };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return ISO_DAY.test(text) ? text : null;
}

export function closedHistory(input: ClosedHistoryInput): ClosedHistoryResult {
  const asOfDay = dayOf(input.asOf);
  const forming = dayOf(input.formingBarDate);
  let afterAsOf = 0;
  let formingDropped = 0;

  const points = input.points.filter((point) => {
    const day = dayOf(point.date);
    if (!day || !Number.isFinite(point.value)) return false;
    if (asOfDay && day > asOfDay) {
      afterAsOf += 1;
      return false;
    }
    if (forming && day === forming) {
      formingDropped += 1;
      return false;
    }
    return true;
  });

  return { points, dropped: { afterAsOf, forming: formingDropped } };
}

/** День в UTC из ISO-времени получения данных: «2026-11-01T06:25:01Z» → «2026-11-01». */
export function utcDay(iso: string): string | null {
  const day = dayOf(iso);
  return day;
}
