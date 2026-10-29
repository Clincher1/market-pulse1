// ВРЕМЕННЫЙ пробник: читает контракт SOAP-сервиса ЦБ (WSDL) и показывает, как
// называется операция по международным резервам и какие у неё параметры.
// Удаляется в том же коммите, что и рабочая реализация.
const WSDL_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx?WSDL';

export default async function handler(_req, res) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  let wsdl = '';
  let status = null;
  try {
    const response = await fetch(WSDL_URL, {
      headers: { 'user-agent': 'MarketPulse/1.0' },
      signal: controller.signal,
    });
    status = response.status;
    wsdl = await response.text();
  } catch (error) {
    res.status(200).json({ error: String(error) });
    return;
  } finally {
    clearTimeout(timer);
  }

  const names = [];
  for (const match of wsdl.matchAll(/<(?:wsdl:)?operation\b[^>]*name="([^"]+)"/g)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  const reservIndex = wsdl.search(/[Rr]eserv|[Mm]rrf/);
  res.status(200).json({
    status,
    length: wsdl.length,
    operations: names,
    reservSnippet:
      reservIndex >= 0 ? wsdl.slice(Math.max(0, reservIndex - 1200), reservIndex + 2200) : null,
  });
}
