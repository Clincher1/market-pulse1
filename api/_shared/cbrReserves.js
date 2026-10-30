/**
 * Международные резервы РФ — валютные активы и монетарное золото Банка России.
 *
 * Источник — тот же публичный SOAP-сервис ЦБ (DailyInfo.asmx), метод
 * `mrrf7DXML` (недельные значения; `mrrfXML` отдаёт месячные). Формат ответа
 * проверен на живом вызове:
 *
 *   <mmrf7d><mr><D0>2026-10-23T00:00:00+03:00</D0><val>729.60</val></mr>…</mmrf7d>
 *
 * `val` — уже в млрд долларов США: сверено с публичной таблицей ЦБ
 * («Международные резервы… еже­недельные значения»): 23.10.2026 — 729,6;
 * 16.10.2026 — 723,2; 09.10.2026 — 723,5; 02.10.2026 — 733,2.
 *
 * В живом ответе встречается строка с двумя `<val>` подряд (24.07.2026).
 * Берём первое значение строки: это то же число, что в публичной таблице,
 * а не сумма двух.
 *
 * Отчётная дата — пятница; значение публикуется на следующей неделе, поэтому
 * последняя точка обычно за прошлую пятницу. Это правило источника, а не
 * задержка загрузки.
 */

import { withRetry } from './fetchRetry.js';

const SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';
const TIMEOUT_MS = 9000;
const USER_AGENT = 'MarketPulse/1.0 (+https://market-pulse1-eta.vercel.app/)';

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseReservesXml(xml) {
  const records = [];
  const blockPattern = /<mr\b[^>]*>([\s\S]*?)<\/mr>/gi;
  let block;
  while ((block = blockPattern.exec(xml)) !== null) {
    const body = block[1];
    const rawDate = body.match(/<D0>\s*([^<]+?)\s*<\/D0>/i)?.[1] ?? '';
    const rawValue = body.match(/<val>\s*([\d.,-]+)\s*<\/val>/i)?.[1]?.replace(',', '.');
    const date = rawDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const value = rawValue === undefined || rawValue === '' ? Number.NaN : Number(rawValue);
    // Ноль и отрицательный остаток резервов — не наблюдение, а мусорная строка.
    if (!Number.isFinite(value) || value <= 0) continue;
    records.push({ date, value: round(value, 2) });
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchReservesRecords(fromISO, tillISO) {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><mrrf7DXML xmlns="http://web.cbr.ru/">' +
    `<fromDate>${fromISO}</fromDate><ToDate>${tillISO}</ToDate>` +
    '</mrrf7DXML></soap:Body></soap:Envelope>';

  // Один повтор: таймаут ЦБ — это чаще задумчивость сервиса, чем отказ, а
  // стоило оно целой плитки в снимке: блок «Россия» уходил в красное, хотя
  // через полсекунды тот же запрос отвечал нормально.
  const text = await withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(SOAP_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          'content-type': 'text/xml; charset=utf-8',
          soapaction: 'http://web.cbr.ru/mrrf7DXML',
          accept: 'text/xml, application/xml;q=0.9, */*;q=0.5',
        },
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  });
  return parseReservesXml(text);
}
