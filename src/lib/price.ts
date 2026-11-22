/**
 * Единственный формат цены на сайте.
 *
 * Цена приходит из кэша готовой строкой в формате источника: «$123.10»,
 * «0.8985», «$105,432». Точка как десятичный разделитель и запятая как
 * разделитель тысяч на одной странице с «12,0565 ₽» читаются как два разных
 * числа: «$105,432» по-русски означает сто пять с дробью, а не сто тысяч.
 *
 * Функция переводит число в русскую локаль (запятая, неразрывный пробел между
 * разрядами), сохраняя префикс валюты и ту точность, которую дал источник:
 * «$123.10» — это цена до цента, и «$123,1» показывала бы меньше, чем есть.
 *
 * Если строка не разбирается (прочерк, текст), она возвращается как есть:
 * подставлять сюда выдуманное число нельзя.
 */
const NBSP = '\u00A0';
// Precision is bounded to 0..4, so at most five native formatters are retained.
const priceFormatters = new Map<number, Intl.NumberFormat>();

export function formatPriceText(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const text = String(raw);
  const match = text.match(/^([^\d\-−]*)(\d[\d,]*(?:\.\d+)?)$/);
  if (!match) return text;
  const numeric = match[2].replace(/,/g, '');
  const value = Number(numeric);
  if (!Number.isFinite(value)) return text;
  const digits = Math.min(numeric.split('.')[1]?.length ?? 0, 4);
  let formatter = priceFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    priceFormatters.set(digits, formatter);
  }
  const formatted = formatter.format(value)
    // ru-RU разделяет разряды узким неразрывным пробелом в части движков;
    // приводим к обычному неразрывному, чтобы формат не зависел от ICU.
    .replace(/\s/g, NBSP);
  return `${match[1]}${formatted}`;
}
