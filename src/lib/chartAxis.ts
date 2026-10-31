/**
 * Ось графика: круглые отметки и подписи к ним.
 *
 * Раньше подписи вертикальной оси брались из краёв рисунка — минимума и
 * максимума, раздвинутых на запас, — то есть из чисел, которых в данных нет.
 * На графике IMOEX это давало «2017» и «2578» при реальных 2 071,20 и
 * 2 524,06: «2017» рядом с датой читалось как год. Отметки должны быть
 * круглыми числами-ориентирами, а не выдуманными значениями ряда.
 */

/** Приводит отметку к точности шага, чтобы 0.30000000000000004 не попало на ось. */
function roundToStep(value: number, step: number): number {
  const decimals = Math.min(8, Math.max(0, -Math.floor(Math.log10(step)) + 1));
  return Number(value.toFixed(decimals));
}

/**
 * Круглые отметки внутри [min, max]: шаг 1, 2 или 5 на нужном порядке.
 * Возвращаются только значения из диапазона данных — ничего за его краями,
 * иначе подпись снова начнёт обещать то, чего на графике нет.
 */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  if (max === min) return [min];

  const span = max - min;
  const rough = span / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;

  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  // Допуск на погрешность сложения: 0.1 + 0.2 не должно терять последнюю отметку.
  for (let value = first; value <= max + step * 1e-9; value += step) {
    ticks.push(roundToStep(value, step));
  }
  return ticks;
}

/**
 * Сколько знаков после запятой нужно самому шагу.
 *
 * Считать по степеням десяти нельзя: шаг 0,25 требует двух знаков, а
 * формальная формула даёт один и подписывает разные отметки одинаково.
 */
function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  for (let decimals = 0; decimals <= 8; decimals += 1) {
    const scaled = step * 10 ** decimals;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return decimals;
  }
  return 8;
}

/**
 * Подпись отметки. Знаки после запятой зависят от шага, а не от единицы:
 * на шаге 100 «2 500» читается, а «2 500,00» обещает лишнюю точность; на шаге
 * 0,05 два знака обязательны, иначе соседние отметки выглядят одинаково.
 */
export function formatTick(value: number, step: number): string {
  const decimals = Math.min(8, decimalsOf(step));
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Шаг между соседними отметками — нужен там, где ось подписывается вручную. */
export function tickStep(ticks: number[]): number {
  if (ticks.length < 2) return 0;
  const step = Math.abs(ticks[1] - ticks[0]);
  // 14,1 − 14,0 в двоичной дроби даёт 0,09999999999999964; без округления
  // подпись решала, что шаг требует двух знаков, и печатала «14,00».
  return Number.isFinite(step) ? Number(step.toPrecision(12)) : 0;
}

/**
 * Название шкалы в именительном падеже: «пункты», «проценты», «рубли».
 * «значения: пункта» на графике читалось как ошибка склонения.
 */
export function axisUnitLabel(unit: string): string {
  switch (unit) {
    case 'пункта':
      return 'пункты';
    case '%':
      return 'проценты';
    case '₽':
      return 'рубли';
    case '₽/г':
      return 'рубли за грамм';
    case 'млрд $':
      return 'млрд $';
    default:
      return unit;
  }
}

/**
 * Индекс ближайшей точки по положению курсора: 0 — левый край, 1 — правый.
 * Позиции передаются уже в координатах графика, поэтому високосные месяцы и
 * пропущенные торговые дни не сдвигают выбор: берётся та точка, что ближе.
 */
export function nearestIndexByFraction(positions: number[], fraction: number): number | null {
  if (positions.length === 0) return null;
  const left = positions[0];
  const right = positions[positions.length - 1];
  const span = right - left;
  const point = span > 0 ? left + Math.min(1, Math.max(0, fraction)) * span : left;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  positions.forEach((position, index) => {
    const distance = Math.abs(position - point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}
