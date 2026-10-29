// ВРЕМЕННЫЙ зонд: показывает форму ответа SOAP-сервиса ЦБ, чтобы разбирать её
// по факту, а не по памяти. Удаляется до merge.
export default async function handler(req, res) {
  const method = String(req.query?.m ?? 'RuoniaXML');
  const from = String(req.query?.from ?? '2026-10-20');
  const to = String(req.query?.to ?? '2026-10-29');
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body><${method} xmlns="http://web.cbr.ru/">` +
    `<fromDate>${from}</fromDate><ToDate>${to}</ToDate>` +
    `</${method}></soap:Body></soap:Envelope>`;

  const result = { method, from, to };
  try {
    const response = await fetch('https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx', {
      method: 'POST',
      headers: {
        'content-type': 'text/xml; charset=utf-8',
        soapaction: `http://web.cbr.ru/${method}`,
        accept: 'text/xml',
      },
      body,
    });
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    result.status = response.status;
    result.length = text.length;
    result.head = text.slice(0, 900).replace(/</g, '‹').replace(/>/g, '›');
  } catch (error) {
    result.error = String(error);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(result);
}
