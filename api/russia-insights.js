import { fetchRuoniaRecords } from './_shared/cbrRuonia.js';

const TIMEOUT_MS = 6500;
const USER_AGENT = 'MarketPulse/1.0 (+https://market-pulse1-eta.vercel.app/)';

const CBR_CURRENCIES = [
  { id: 'usd-rub', code: 'R01235', name: 'USD/RUB', label: 'Доллар США' },
  { id: 'eur-rub', code: 'R01239', name: 'EUR/RUB', label: 'Евро' },
  { id: 'cny-rub-cbr', code: 'R01375', name: 'CNY/RUB', label: 'Китайский юань' },
];

const RSS_SOURCES = [
  {
    id: 'kommersant-economics',
    name: 'Коммерсантъ',
    section: 'Экономика',
    url: 'https://www.kommersant.ru/rss/section-economics.xml',
    limit: 8,
  },
  {
    id: 'kommersant-business',
    name: 'Коммерсантъ',
    section: 'Бизнес',
    url: 'https://www.kommersant.ru/rss/section-business.xml',
    limit: 8,
  },
  {
    id: 'vedomosti-economics',
    name: 'Ведомости',
    section: 'Экономика',
    url: 'https://www.vedomosti.ru/rss/rubric/economics',
    limit: 8,
  },
  {
    id: 'vedomosti-finance',
    name: 'Ведомости',
    section: 'Финансы',
    url: 'https://www.vedomosti.ru/rss/rubric/finance',
    limit: 8,
  },
  {
    id: 'frank-media',
    name: 'Frank Media',
    section: 'Финансы',
    url: 'https://frankmedia.ru/feed',
    limit: 6,
  },
];

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function decodeBuffer(buffer, contentType = '') {
  const prefix = new TextDecoder('windows-1252').decode(buffer.slice(0, 512));
  const declared = prefix.match(/encoding=["']([^"']+)["']/i)?.[1];
  const fromHeader = contentType.match(/charset=([^;]+)/i)?.[1]?.trim();
  const encoding = (declared || fromHeader || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function fetchWithTimeout(url, parseResponse) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.5',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await parseResponse(response);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  return fetchWithTimeout(url, async (response) => {
    const buffer = await response.arrayBuffer();
    return decodeBuffer(buffer, response.headers.get('content-type') || '');
  });
}

async function fetchJson(url) {
  return fetchWithTimeout(url, (response) => response.json());
}

/**
 * POST для SOAP-сервиса ЦБ. Курсы отдаются обычным XML по GET, а ключевая
 * ставка — только через DailyInfo.asmx, поэтому нужен отдельный вызов.
 */
async function fetchTextPost(url, body, soapAction) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        'content-type': 'text/xml; charset=utf-8',
        soapaction: soapAction,
        accept: 'text/xml, application/xml;q=0.9, */*;q=0.5',
      },
      body,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    return decodeBuffer(buffer, response.headers.get('content-type') || '');
  } finally {
    clearTimeout(timer);
  }
}

function formatCbrDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

function cbrDateToIso(value) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function parseCbrRecords(xml) {
  const records = [];
  const pattern = /<Record\b[^>]*Date="([^"]+)"[^>]*>([\s\S]*?)<\/Record>/gi;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const body = match[2];
    const nominal = Number(body.match(/<Nominal>([^<]+)<\/Nominal>/i)?.[1]?.replace(',', '.'));
    const value = Number(body.match(/<Value>([^<]+)<\/Value>/i)?.[1]?.replace(',', '.'));
    const unit = Number(body.match(/<VunitRate>([^<]+)<\/VunitRate>/i)?.[1]?.replace(',', '.'));
    const rate = Number.isFinite(unit) && unit > 0 ? unit : value / nominal;
    if (Number.isFinite(rate) && rate > 0) {
      records.push({ date: cbrDateToIso(match[1]), rate });
    }
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchCbrIndicator(currency) {
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const url =
    'https://www.cbr.ru/scripts/XML_dynamic.asp' +
    `?date_req1=${formatCbrDate(start)}&date_req2=${formatCbrDate(end)}&VAL_NM_RQ=${currency.code}`;
  const records = parseCbrRecords(await fetchText(url));
  if (records.length < 2) throw new Error('Недостаточно записей ЦБ');

  const latest = records[records.length - 1];
  const previous = records[records.length - 2];
  return {
    id: currency.id,
    name: currency.name,
    label: currency.label,
    value: round(latest.rate, 4),
    unit: '₽',
    changePct: round(((latest.rate - previous.rate) / previous.rate) * 100, 3),
    asOf: latest.date,
    previousDate: previous.date,
    provider: 'Банк России',
    basis: 'Официальный курс',
    sourceUrl: 'https://www.cbr.ru/currency_base/daily/',
  };
}

const KEY_RATE_SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function ruDate(iso) {
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(iso);
}

/**
 * Ключевая ставка Банка России.
 *
 * Источник — публичный SOAP-сервис ЦБ DailyInfo, метод KeyRateXML: он отдаёт
 * историю ставки с датами вступления в силу. Берём последнюю запись и
 * предыдущее отличающееся значение, чтобы подпись «действует с» была фактом,
 * а не догадкой.
 */
export function parseKeyRateXml(xml) {
  const records = [];
  const pattern = /<KR\b[^>]*>([\s\S]*?)<\/KR>/gi;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const rate = Number(
      match[1].match(/<Rate>\s*([-\d.,]+)\s*<\/Rate>/i)?.[1]?.replace(',', '.'),
    );
    const dt = match[1].match(/<DT>\s*([^<]+?)\s*<\/DT>/i)?.[1] ?? '';
    if (!Number.isFinite(rate) || !dt) continue;
    records.push({ date: dt.slice(0, 10), rate });
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Точка кривой доходности на 10 лет.
 *
 * ISS отдаёт её в блоке `yearyields`: tradedate, tradetime, period, value,
 * где period — срок в ГОДАХ (0,25 … 20). Проверено на живом ответе
 * /iss/engines/stock/zcyc.json, а не на предположении о формате.
 */
/**
 * Строгое число из ISS. `Number(null)` и `Number('')` дают 0, а ноль в кривой —
 * это не «нулевая доходность», а отсутствие значения. Пустые ячейки
 * отбрасываются, а не превращаются в 0 %.
 */
function strictNumber(value) {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === 'string' && value.trim() === '') return Number.NaN;
  return Number(value);
}

export function pickOfz10y(payload) {
  const rows = rowsToObjects(payload?.yearyields);
  const withPeriod = rows
    .map((row) => ({ row, period: strictNumber(row.period), value: strictNumber(row.value) }))
    .filter((item) => Number.isFinite(item.period) && Number.isFinite(item.value));
  if (withPeriod.length === 0) throw new Error('В кривой доходности нет периодов');
  const target = 10;
  // При повторе срока (ISS иногда отдаёт строку дважды) берём последнюю —
  // ту же, что попадает в кривую, иначе плитка и график разойдутся в сотых.
  const best = withPeriod.reduce((acc, item) => {
    if (acc.period === target && item.period === target) return item;
    return Math.abs(item.period - target) < Math.abs(acc.period - target) ? item : acc;
  });
  return { ...best, exact: best.period === target };
}

/**
 * Вся кривая, а не одна точка: ISS отдаёт 20 сроков (0,25 … 20 лет).
 * Точки сортируются по сроку; при повторе срока остаётся последнее значение.
 * Ничего не достраивается: если сроков два — в ответе будет два.
 */
export function extractCurve(payload) {
  const rows = rowsToObjects(payload?.yearyields);
  const byPeriod = new Map();
  for (const row of rows) {
    const period = strictNumber(row.period);
    const value = strictNumber(row.value);
    if (!Number.isFinite(period) || !Number.isFinite(value) || period <= 0) continue;
    byPeriod.set(period, value);
  }
  return [...byPeriod.entries()]
    .map(([period, value]) => ({ period, value: round(value, 2) }))
    .sort((a, b) => a.period - b.period);
}

async function fetchCbrKeyRate() {
  const to = new Date();
  const from = new Date(to.getTime() - 400 * 24 * 60 * 60 * 1000);
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><KeyRateXML xmlns="http://web.cbr.ru/">' +
    `<fromDate>${isoDate(from)}</fromDate><ToDate>${isoDate(to)}</ToDate>` +
    '</KeyRateXML></soap:Body></soap:Envelope>';

  const xml = await fetchTextPost(KEY_RATE_SOAP_URL, body, 'http://web.cbr.ru/KeyRateXML');
  const records = parseKeyRateXml(xml);
  if (records.length === 0) throw new Error('ЦБ не отдал ключевую ставку');

  const latest = records[records.length - 1];
  // Дата вступления в силу — не «последняя запись», а первый день, с которого
  // действует текущее значение. Сервис ЦБ может отдавать как точки изменения,
  // так и подневный ряд; при подневном ряде «действует с» = дата последней
  // записи было бы неправдой (сегодняшним числом каждый день).
  let changeIndex = -1;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].rate !== latest.rate) {
      changeIndex = index;
      break;
    }
  }
  const effective = changeIndex >= 0 ? records[changeIndex + 1] : null;
  const previous = changeIndex >= 0 ? records[changeIndex] : null;
  const formatRate = (rate) => rate.toFixed(2).replace('.', ',');

  return {
    id: 'key-rate',
    name: 'Ключевая ставка',
    label: 'Ставка Банка России',
    value: round(latest.rate, 2),
    unit: '%',
    changePct: null,
    asOf: effective?.date ?? latest.date,
    previousDate: previous?.date ?? null,
    provider: 'Банк России',
    basis: effective
      ? `Действует с ${ruDate(effective.date)}; до этого — ${formatRate(previous.rate)} % с ${ruDate(previous.date)}`
      : `Текущее значение ${formatRate(latest.rate)} %; даты вступления в силу в доступном окне нет`,
    sourceUrl: 'https://www.cbr.ru/hd_base/KeyRate/',
  };
}

/**
 * RUONIA — эталонная ставка однодневных межбанковских кредитов.
 *
 * На неё ссылаются плавающие ставки в кредитных договорах, поэтому для бизнеса
 * это не «ещё один процент», а та ставка, которую видно в договоре. ЦБ
 * публикует значение за дату на следующий день — это подписано в базисе,
 * чтобы «вчера» не выглядело задержкой загрузки.
 */
async function fetchRuonia() {
  const to = new Date();
  const from = new Date(to.getTime() - 20 * 24 * 60 * 60 * 1000);
  const records = await fetchRuoniaRecords(isoDate(from), isoDate(to));
  if (records.length === 0) throw new Error('ЦБ не отдал RUONIA');
  const latest = records[records.length - 1];
  const previous = records[records.length - 2] ?? null;
  const volume = latest.volume === null ? null : latest.volume.toFixed(2).replace('.', ',');

  return {
    id: 'ruonia',
    name: 'RUONIA',
    label: 'Ставка однодневных кредитов',
    value: round(latest.rate, 2),
    unit: '%',
    changePct: null,
    asOf: latest.date,
    previousDate: previous?.date ?? null,
    provider: 'Банк России',
    basis: volume
      ? `Ставка за ${ruDate(latest.date)}; объём сделок ${volume} млрд ₽. ЦБ публикует значение за дату на следующий день`
      : `Ставка за ${ruDate(latest.date)}; ЦБ публикует значение за дату на следующий день`,
    sourceUrl: 'https://www.cbr.ru/hd_base/ruonia/',
  };
}

/**
 * Доходность ОФЗ из кривой бескупонной доходности Мосбиржи (ZCYC).
 *
 * Это тот же публичный ISS, что и у IMOEX, поэтому источник и время рядом
 * с числом те же. Берём точку на 10 лет; если её нет — ближайшую к 10 годам
 * и говорим об этом в подписи.
 */
async function fetchMoexOfz10y() {
  const payload = await fetchJson('https://iss.moex.com/iss/engines/stock/zcyc.json?iss.meta=off');
  const { exact, ...best } = pickOfz10y(payload);
  const curve = extractCurve(payload);

  return {
    id: 'ofz-10y',
    name: 'ОФЗ 10 лет',
    label: 'Доходность гособлигаций',
    value: round(best.value, 2),
    unit: '%',
    changePct: null,
    asOf: `${best.row.tradedate ?? ''} ${best.row.tradetime ?? ''}`.trim(),
    previousDate: null,
    provider: 'Мосбиржа ISS',
    basis: exact
      ? 'Точка кривой бескупонной доходности на 10 лет; публичный поток может быть задержан'
      : `Точки на 10 лет в кривой нет: показана ближайшая — ${best.period} г.`,
    sourceUrl: 'https://www.moex.com/ru/marketdata/indices/state/gcurve/',
    // Для рисунка кривой: точки, которые реально пришли, без сглаживания.
    curve: curve.length >= 2 ? curve : null,
    curveAsOf: `${best.row.tradedate ?? ''} ${best.row.tradetime ?? ''}`.trim(),
  };
}

function rowsToObjects(block) {
  if (!block?.columns || !Array.isArray(block.data)) return [];
  return block.data.map((row) =>
    Object.fromEntries(block.columns.map((column, index) => [column, row[index]])),
  );
}

async function fetchMoexIndex(id, name, label) {
  const url = `https://iss.moex.com/iss/engines/stock/markets/index/securities/${id}.json?iss.meta=off`;
  const payload = await fetchJson(url);
  const row = rowsToObjects(payload.marketdata).find((item) => item.SECID === id);
  if (!row) throw new Error(`Нет marketdata для ${id}`);
  const value = Number(row.CURRENTVALUE ?? row.LASTVALUE);
  const previous = Number(row.LASTVALUE);
  if (!Number.isFinite(value) || !Number.isFinite(previous) || previous <= 0) {
    throw new Error(`Некорректное значение ${id}`);
  }
  return {
    id: id.toLowerCase(),
    name,
    label,
    value: round(value, 2),
    unit: 'пункта',
    changePct: round(((value - previous) / previous) * 100, 3),
    asOf: row.SYSTIME || `${row.TRADEDATE || ''} ${row.UPDATETIME || ''}`.trim(),
    previousDate: null,
    provider: 'Мосбиржа ISS',
    basis: 'Текущее значение индекса; публичный поток может быть задержан',
    sourceUrl: `https://www.moex.com/ru/index/${id}/`,
  };
}

async function fetchMoexCny() {
  const url =
    'https://iss.moex.com/iss/engines/currency/markets/selt/securities/CNYRUB_TOM.json?iss.meta=off';
  const payload = await fetchJson(url);
  const security = rowsToObjects(payload.securities).find(
    (item) => item.SECID === 'CNYRUB_TOM' && item.BOARDID === 'CETS',
  );
  const market = rowsToObjects(payload.marketdata).find(
    (item) => item.SECID === 'CNYRUB_TOM' && item.BOARDID === 'CETS',
  );
  if (!security || !market) throw new Error('Нет CETS для CNYRUB_TOM');
  const previous = Number(security.PREVPRICE);
  // До первой сделки дня ISS отдаёт LAST = 0/null. Берём первое положительное
  // значение; если сделок ещё не было — показываем предыдущее закрытие и
  // честно помечаем это (changePct = null), а не рисуем «0,00%».
  const traded = [market.LAST, market.MARKETPRICETODAY, market.CLOSEPRICE]
    .map(Number)
    .find((candidate) => Number.isFinite(candidate) && candidate > 0);
  const hasTradeToday = traded !== undefined;
  const value = traded ?? previous;
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(previous) || previous <= 0) {
    throw new Error('Некорректное значение CNYRUB_TOM');
  }
  return {
    id: 'cny-rub-moex',
    name: 'CNY/RUB',
    label: 'Юань на Мосбирже',
    value: round(value, 4),
    unit: '₽',
    changePct: hasTradeToday ? round(((value - previous) / previous) * 100, 3) : null,
    asOf: hasTradeToday
      ? market.SYSTIME || market.UPDATETIME || ''
      : security.PREVDATE || market.SYSTIME || '',
    previousDate: security.PREVDATE || null,
    provider: 'Мосбиржа ISS',
    basis: hasTradeToday
      ? 'CNYRUB_TOM, последняя сделка; публичный поток может быть задержан'
      : 'CNYRUB_TOM: сделок сегодня в публичном потоке пока нет — показано предыдущее закрытие',
    sourceUrl: 'https://www.moex.com/ru/issue/CNYRUB_TOM/CETS',
  };
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return decodeEntities(match?.[1] || '');
}

function extractCategories(xml) {
  return [...xml.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
    .map((match) => decodeEntities(match[1]))
    .filter(Boolean)
    .slice(0, 5);
}

function parseRss(xml, source) {
  const now = Date.now();
  const maxAgeMs = 72 * 60 * 60 * 1000;
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const parsed = [];

  for (const item of items) {
    const title = extractTag(item, 'title');
    const url = extractTag(item, 'link');
    const publishedRaw = extractTag(item, 'pubDate') || extractTag(item, 'dc:date');
    const publishedAt = new Date(publishedRaw);
    const categories = extractCategories(item);
    if (!title || !/^https?:\/\//i.test(url) || Number.isNaN(publishedAt.getTime())) continue;
    if (now - publishedAt.getTime() > maxAgeMs || publishedAt.getTime() - now > 24 * 60 * 60 * 1000) continue;
    if (source.linkIncludes && !url.includes(source.linkIncludes)) continue;
    if (source.categories && !categories.some((category) => source.categories.includes(category))) continue;

    parsed.push({
      id: `${source.id}:${url}`,
      source: source.name,
      section: source.section,
      title,
      url,
      publishedAt: publishedAt.toISOString(),
      categories,
    });
    if (parsed.length >= source.limit) break;
  }

  return parsed;
}

async function fetchRss(source) {
  return parseRss(await fetchText(source.url), source);
}

function settledValues(results, labels, errors) {
  const values = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') values.push(...result.value);
    else errors.push(`${labels[index]}: ${result.reason?.message || 'недоступно'}`);
  });
  return values;
}

export default async function handler(req, res) {
  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const errors = [];
  const marketTasks = [
    ...CBR_CURRENCIES.map((currency) => fetchCbrIndicator(currency)),
    fetchMoexIndex('IMOEX', 'IMOEX', 'Индекс МосБиржи'),
    fetchMoexIndex('RGBI', 'RGBI', 'Индекс гособлигаций'),
    fetchMoexCny(),
    fetchCbrKeyRate(),
    fetchRuonia(),
    fetchMoexOfz10y(),
  ];
  const marketLabels = [
    ...CBR_CURRENCIES.map((currency) => currency.name),
    'IMOEX',
    'RGBI',
    'CNY MOEX',
    'Ключевая ставка ЦБ',
    'RUONIA',
    'Кривая доходности ОФЗ',
  ];
  const rssLabels = RSS_SOURCES.map((source) => source.name);

  const [marketResults, rssResults] = await Promise.all([
    Promise.allSettled(marketTasks),
    Promise.allSettled(RSS_SOURCES.map((source) => fetchRss(source))),
  ]);

  const markets = [];
  marketResults.forEach((result, index) => {
    if (result.status === 'fulfilled') markets.push(result.value);
    else errors.push(`${marketLabels[index]}: ${result.reason?.message || 'недоступно'}`);
  });

  const headlinesRaw = settledValues(
    rssResults.map((result) =>
      result.status === 'fulfilled' ? { status: 'fulfilled', value: result.value } : result,
    ),
    rssLabels,
    errors,
  );

  const seen = new Set();
  const headlines = headlinesRaw
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .filter((item) => {
      const key = item.title.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim().slice(0, 110);
      if (seen.has(key) || seen.has(item.url)) return false;
      seen.add(key);
      seen.add(item.url);
      return true;
    })
    .slice(0, 18);

  // Неполный снимок не кэшируем надолго: если один источник не ответил,
  // плитка исчезает честно, но восстанавливаться должна за минуту-две, а не
  // висеть без значения четверть часа уже после того, как источник ожил.
  res.setHeader(
    'Cache-Control',
    errors.length > 0
      ? 'public, s-maxage=60, stale-while-revalidate=120'
      : 'public, s-maxage=300, stale-while-revalidate=900',
  );
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    generatedAt: new Date().toISOString(),
    markets,
    headlines,
    errors,
    notes: [
      'Курсы ЦБ являются официальными дневными значениями, а не биржевыми котировками в реальном времени.',
      'Значения Мосбиржи получены из публичного ISS и могут быть задержаны; рядом с индикатором показано время источника.',
      'Заголовки российских СМИ показаны со ссылками на первоисточники и не являются ИИ-оценкой Market Pulse.',
    ],
  });
}
