/**
 * Сменился ли инструмент у ряда с момента снимка дня.
 *
 * Зачем отдельно: блок «Что изменилось с утра» сравнивает текущую цену со
 * снимком по `id` ряда. Пока ряд один и тот же, это движение рынка. Но 01.11.2026
 * Brent переехал со спота EIA (123,10) на фьючерс NYMEX (113,43), и сравнение
 * по `id` напечатало «−7,86 % к снимку» — разницу двух разных инструментов
 * под видом движения цены.
 *
 * Имя ряда здесь работает как паспорт инструмента: оно меняется вместе с
 * источником и написано на плитке, поэтому его видно читателю, а не только коду.
 */
export function instrumentChanged(
  snapshot: { name?: string | null } | null | undefined,
  live: { name?: string | null } | null | undefined,
): boolean {
  const before = snapshot?.name?.trim();
  const now = live?.name?.trim();
  if (!before || !now) return false;
  return before !== now;
}

/**
 * Совпадают ли дни наблюдения у снимка и у текущей цены.
 *
 * Без этой проверки «изменение к снимку» смешивает разные даты: в снимке 01.11
 * лежало закрытие S&P 500 за 28.10, а на плитке — за 30.10, и подпись
 * «−2,12 % к снимку» читалась как движение за утро, хотя это два дня.
 */
export function sameObservationDay(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = a?.slice(0, 10);
  const right = b?.slice(0, 10);
  if (!left || !right) return false;
  return left === right;
}
