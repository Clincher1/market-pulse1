/**
 * Единственный формат процента на сайте.
 *
 * Раньше формат зависел от компонента: в российском блоке стояло «−0,23 %»,
 * в мировой плитке — «-3.92%». Рядом на одной странице это читается как два
 * разных числа, посчитанных по-разному, хотя это одно движение Brent.
 *
 * Здесь: запятая как десятичный разделитель, типографский минус «−», знак
 * «%» через неразрывный пробел (чтобы число и знак не разрывались переносом).
 */
const NBSP = '\u00A0';

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value).toFixed(digits).replace('.', ',');
  // Знак ставится по напечатанному числу, а не по сырому: −0,0011 % — это
  // «0,00 %», а не «−0,00 %». Минус перед нулём читается как падение,
  // которого в напечатанной точности нет.
  const roundedIsZero = Number(magnitude.replace(',', '.')) === 0;
  const sign = roundedIsZero ? '' : value > 0 ? '+' : '−';
  return `${sign}${magnitude}${NBSP}%`;
}

/**
 * Шкала насыщенности плитки: «4 %» (без лишнего нуля после запятой).
 * Знак «±» остаётся в разметке — иначе после первой же правки на экране
 * появилось «шкала ±±4 %», как это и случилось на превью.
 */
export function formatCapPercent(cap: number): string {
  const digits = cap.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${digits}${NBSP}%`;
}

/** Доля без знака: «73 %». */
export function formatSharePercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${Math.round(ratio * 100)}${NBSP}%`;
}
