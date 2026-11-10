/**
 * Геометрия тик-шкалы напряжённости: 0–100, сорок делений.
 *
 * Зачем отдельный модуль. Раньше уровень показывался только числом и цветом
 * подписи. Тик-шкала добавляет к числу положение на шкале, но именно поэтому
 * её нельзя рисовать «на глаз»: если делений сорок, то одно деление — это
 * 2,5 пункта, и округление должно быть одинаковым при каждом рендере и в
 * тестах. Вся арифметика живёт здесь, разметка только отображает.
 *
 * Шкала не изображает вероятность и не нормируется к истории: это линейное
 * положение сохранённого значения между 0 и 100. Границы 0 и 100 — края
 * шкалы напряжённости, а не «худшее» и «лучшее» состояние рынка.
 */

export type TensionState = 'calm' | 'watch' | 'hot';

/** Сколько делений на шкале. 40 делений = шаг 2,5 пункта. */
export const GAUGE_TICKS = 40;

/** Края шкалы. Значения вне диапазона обрезаются, а не растягивают шкалу. */
export const TENSION_MIN = 0;
export const TENSION_MAX = 100;

/**
 * Приводит значение к диапазону шкалы.
 *
 * `null`, `undefined` и `NaN` превращаются в 0 — «нет значения» рисует пустую
 * шкалу, а не выдуманную середину. Само отсутствие значения проговаривается
 * текстом рядом (прочерк), поэтому ноль здесь не выдаёт себя за измерение.
 */
export function clampTension(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return TENSION_MIN;
  return Math.min(TENSION_MAX, Math.max(TENSION_MIN, value));
}

/**
 * Те же пороги, что у подписи шкалы напряжённости: <30 холодно, <70 умеренно,
 * дальше горячо. Один набор порогов на карточку и на легенду — иначе цвет
 * карточки и цвет шкалы могли бы говорить разное об одном числе.
 */
export function tensionState(value: number | null | undefined): TensionState {
  const level = clampTension(value);
  if (level < 30) return 'calm';
  if (level < 70) return 'watch';
  return 'hot';
}

/**
 * Заполненность делений шкалы.
 *
 * Деления считаются округлением к ближайшему. Отдельное правило для малого
 * ненулевого значения: если сохранённый уровень больше нуля, но меньше
 * половины деления, горит первое деление. Иначе «1 пункт» и «0 пунктов»
 * выглядели бы одинаково — пустой шкалой, — хотя это разные наблюдения.
 */
export function gaugeTicks(
  value: number | null | undefined,
  count: number = GAUGE_TICKS,
): boolean[] {
  const total = Math.max(1, Math.trunc(count));
  const level = clampTension(value);
  let filled = Math.round((level / TENSION_MAX) * total);
  if (level > 0 && filled === 0) filled = 1;
  return Array.from({ length: total }, (_, index) => index < filled);
}

/** Подпись под числом: «98 из 100» не печатаем — шкала и есть эта подпись. */
export function gaugeAriaLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Уровень напряжённости в снимке не сохранён, шкала пустая';
  }
  const level = clampTension(value);
  return `Положение на шкале 0–100: ${level} из 100`;
}
