// ВРЕМЕННЫЙ пробник: читает живой ответ ЦБ по международным резервам (mrrfXML),
// чтобы не угадывать форму. Удаляется в том же коммите, что и рабочая версия.
const URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';

export default async function handler(req, res) {
  const till = new Date();
  const from = new Date(till.getTime() - 200 * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><mrrf7DXML xmlns="http://web.cbr.ru/">' +
    `<fromDate>${iso(from)}</fromDate><ToDate>${iso(till)}</ToDate>` +
    '</mrrf7DXML></soap:Body></soap:Envelope>';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  let status = null;
  let xml = '';
  try {
    const response = await fetch(URL, {
      method: 'POST',
      headers: {
        'content-type': 'text/xml; charset=utf-8',
        soapaction: 'http://web.cbr.ru/mrrf7DXML',
        'user-agent': 'MarketPulse/1.0',
      },
      body,
      signal: controller.signal,
    });
    status = response.status;
    xml = await response.text();
  } catch (error) {
    res.status(200).json({ error: String(error) });
    return;
  } finally {
    clearTimeout(timer);
  }

  const tags = [];
  for (const match of xml.matchAll(/<([a-zA-Z0-9:_]+)[\s>/]/g)) {
    if (!tags.includes(match[1])) tags.push(match[1]);
  }
  res.status(200).json({
    status,
    sent: { from: iso(from), till: iso(till) },
    length: xml.length,
    tags,
    head: xml.slice(0, 1200),
    tail: xml.slice(-900),
  });
}
