/**
 * Инфляция из таблицы Банка России.
 *
 * Страница https://www.cbr.ru/hd_base/infl/ отдаёт таблицу в самой разметке —
 * это проверено: без исполнения JavaScript в ответе видны строки
 *
 *   09.2026 | 14,00 | 6,35 | 4,00
 *
 * где первое поле — месяц, дальше ключевая ставка на конец месяца, инфляция
 * в процентах год к году и цель по инфляции. Источники на самой странице:
 * Росстат и Банк России.
 *
 * Разбор вынесен в отдельный модуль без сети и без зависимостей, чтобы его
 * можно было проверить тестом на настоящей разметке. Правила простые:
 *   - строкой данных считается только та, где первая ячейка — «ММ.ГГГГ»;
 *   - числа читаются и с запятой, и с точкой: страница печатает «6,35»,
 *     выгрузка в XLSX — «6.35», а это одно и то же число;
 *   - правдоподобным считается значение от 0 до 100 %; всё остальное
 *     отбрасывается, а не «округляется до похожего»;
 *   - строки сортируются по месяцу: страница печатает их от новых к старым,
 *     и брать первую попавшуюся значило бы показывать май вместо сентября.
 */

const MONTH_KEY = /^(\d{2})\.(\d{4})$/;

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function cellText(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\s|%/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * @param {string} html — разметка страницы Банка России (или её выгрузки)
 * @returns {Array<{ month: string, keyRate: number|null, inflation: number, target: number|null }>}
 *          месяцы по возрастанию, без повторов
 */
export function parseInflationTable(html) {
  if (typeof html !== 'string' || !html) return [];
  const byMonth = new Map();
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      cellText(cell[1]),
    );
    if (cells.length < 3) continue;
    const key = MONTH_KEY.exec(cells[0]);
    if (!key) continue;
    const inflation = toNumber(cells[2]);
    if (inflation === null || inflation < 0 || inflation > 100) continue;
    // Один и тот же месяц может встретиться дважды (таблица и её дубль в
    // разметке): последнее прочитанное значение побеждает.
    byMonth.set(`${key[2]}-${key[1]}`, {
      month: `${key[2]}-${key[1]}`,
      keyRate: toNumber(cells[1]),
      inflation,
      target: cells[3] ? toNumber(cells[3]) : null,
    });
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Последний месяц и предыдущий к нему — для изменения в пунктах. */
export function pickLatestInflation(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2] ?? null;
  return { latest, previous };
}

/** «сентябрь 2026» — подпись месяца, без которой число читается как сегодняшнее. */
export function monthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!match) return '';
  const index = Number(match[2]) - 1;
  const name = MONTH_NAMES[index];
  return name ? `${name} ${match[1]}` : '';
}

const MONTH_DATIVE = [
  'январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню',
  'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю',
];

/** «к августу» — дательный падеж: «изменение к август» читается как ошибка. */
export function monthDative(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!match) return '';
  const name = MONTH_DATIVE[Number(match[2]) - 1];
  return name ?? '';
}

/**
 * Последний день месяца как дата: страница живёт месяцами, а плитка печатает
 * дату. 2026-09 → 2026-09-30 (февраль и високосный год считаются честно).
 */
export function monthEndDate(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    return null;
  }
  const date = new Date(Date.UTC(year, monthIndex, 0));
  return date.toISOString().slice(0, 10);
}
