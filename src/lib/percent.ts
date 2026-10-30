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
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return `${sign}${Math.abs(value).toFixed(digits).replace('.', ',')}${NBSP}%`;
}

/** Шкала насыщенности плитки: «±4 %», без лишнего нуля после запятой. */
export function formatPercentCap(cap: number): string {
  const digits = cap.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `±${digits}${NBSP}%`;
}

/** Доля без знака: «73 %». */
export function formatSharePercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${Math.round(ratio * 100)}${NBSP}%`;
}
