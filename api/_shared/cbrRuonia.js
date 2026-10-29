/**
 * RUONIA — эталонная ставка по однодневным межбанковским кредитам Банка России.
 *
 * Источник — тот же публичный SOAP-сервис ЦБ (DailyInfo.asmx), метод
 * `RuoniaXML`. Формат ответа проверен на живом вызове, а не предположен:
 *
 *   <Ruonia><ro><D0>2026-10-20T00:00:00+03:00</D0><ruo>13.9700</ruo>
 *             <vol>768.5000</vol><DateUpdate>…</DateUpdate></ro>…</Ruonia>
 *
 * `ruo` — ставка в процентах годовых, `vol` — объём сделок, млрд рублей
 * (сверено с публичной таблицей ЦБ: 28.10 — 14,09 % и 992,86 млрд руб.).
 *
 * Ставка за дату публикуется на следующий день, поэтому «самая свежая»
 * запись обычно вчерашняя — это не задержка загрузки, а правило источника.
 */

const SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';
const TIMEOUT_MS = 9000;
const USER_AGENT = 'MarketPulse/1.0 (+https://market-pulse1-eta.vercel.app/)';

function strictNumber(value) {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === 'string' && value.trim() === '') return Number.NaN;
  return Number(value);
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseRuoniaXml(xml) {
  const records = [];
  const blockPattern = /<ro\b[^>]*>([\s\S]*?)<\/ro>/gi;
  let block;
  while ((block = blockPattern.exec(xml)) !== null) {
    const body = block[1];
    const rawDate = body.match(/<D0>\s*([^<]+?)\s*<\/D0>/i)?.[1] ?? '';
    const rate = strictNumber(body.match(/<ruo>\s*([\d.,-]+)\s*<\/ruo>/i)?.[1]?.replace(',', '.'));
    const volume = strictNumber(body.match(/<vol>\s*([\d.,-]+)\s*<\/vol>/i)?.[1]?.replace(',', '.'));
    const date = rawDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isFinite(rate) || rate <= 0) continue;
    records.push({
      date,
      rate: round(rate, 2),
      volume: Number.isFinite(volume) ? round(volume, 2) : null,
    });
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchRuoniaRecords(fromISO, tillISO) {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><RuoniaXML xmlns="http://web.cbr.ru/">' +
    `<fromDate>${fromISO}</fromDate><ToDate>${tillISO}</ToDate>` +
    '</RuoniaXML></soap:Body></soap:Envelope>';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(SOAP_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        'content-type': 'text/xml; charset=utf-8',
        soapaction: 'http://web.cbr.ru/RuoniaXML',
        accept: 'text/xml, application/xml;q=0.9, */*;q=0.5',
      },
      body,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return parseRuoniaXml(text);
  } finally {
    clearTimeout(timer);
  }
}
