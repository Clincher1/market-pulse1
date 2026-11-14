/**
 * История российских рядов за окно ~3 месяца — из тех же первоисточников,
 * что и плитки: Мосбиржа ISS (IMOEX) и Банк России (курс USD, ключевая ставка).
 *
 * Правила те же, что во всём сайте: только то, что реально пришло. Если
 * источник не ответил — ряда нет, а причина уходит в errors; дырки в торговых
 * днях не заполняются нулями, средними и «примерно такими же» значениями.
 * Ничего не достраивается: точка есть только там, где источник её отдал.
 */

import { fetchReservesRecords } from './_shared/cbrReserves.js';
import { setBrowserNoStore, setVercelCdnCache } from './_shared/responseCache.js';
import { fetchRuoniaRecords } from './_shared/cbrRuonia.js';

import { RUN_DEADLINE_MS, hostQueue, withRetry, withinDeadline } from './_shared/fetchRetry.js';

const TIMEOUT_MS = 9000;
const USER_AGENT = 'MarketPulse/1.0 (+https://market-pulse1-eta.vercel.app/)';

/** Окно истории: ~3 месяца, чтобы это был контекст, а не один день. */
export const HISTORY_DAYS = 92;

const KEY_RATE_SOAP_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Строгое число. `Number(null)` и `Number('')` дают 0, а ноль в курсе и
 * доходности — это не значение, а отсутствие значения.
 */
function strictNumber(value) {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === 'string' && value.trim() === '') return Number.NaN;
  return Number(value);
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

async function timedFetch(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      // Retry-After несём в ошибку: повтор раньше, чем просил источник, — это
      // ровно то поведение, из-за которого ставят блокировку по адресу.
      const header = response.headers.get('retry-after');
      const seconds = header ? Number(header) : Number.NaN;
      const error = new Error(`HTTP ${response.status}${header ? ` retry-after=${header}` : ''}`);
      if (Number.isFinite(seconds) && seconds > 0) error.retryAfterMs = seconds * 1000;
      throw error;
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithTimeout(url, parseResponse) {
  // Один повтор на таймаут или сетевой сбой. Ряд истории собирается из шести
  // источников сразу, и без повтора один медленный ответ выбивал целый ряд из
  // графика — а через полсекунды тот же запрос отвечал нормально.
  return withRetry(async () => {
    const response = await timedFetch(
      url,
      {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.5',
        },
      },
      TIMEOUT_MS,
    );
    return parseResponse(response);
  });
}

async function fetchJson(url) {
  return fetchWithTimeout(url, (response) => response.json());
}

async function fetchText(url) {
  return fetchWithTimeout(url, async (response) => {
    const buffer = await response.arrayBuffer();
    return decodeBuffer(buffer, response.headers.get('content-type') || '');
  });
}

/** SOAP ЦБ: ключевая ставка отдаётся только POST-запросом к DailyInfo.asmx. */
async function fetchTextPost(url, body, soapAction) {
  return withRetry(async () => {
    const response = await timedFetch(
      url,
      {
        method: 'POST',
        headers: {
          'user-agent': USER_AGENT,
          'content-type': 'text/xml; charset=utf-8',
          soapaction: soapAction,
          accept: 'text/xml, application/xml;q=0.9, */*;q=0.5',
        },
        body,
      },
      TIMEOUT_MS,
    );
    const buffer = await response.arrayBuffer();
    return decodeBuffer(buffer, response.headers.get('content-type') || '');
  });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function cbrRequestDate(date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

function cbrDateToIso(value) {
  const match = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value);
}

/**
 * Разбор XML_dynamic ЦБ. Тот же формат узла `Record`, что и у дневного
 * XML_daily, который сайт уже читает для плиток: Date, Nominal, Value,
 * VunitRate. Номинал на единицу (`VunitRate`) предпочтительнее: у некоторых
 * валют он не равен 1.
 */
export function parseCbrDynamicXml(xml) {
  const points = [];
  const pattern = /<Record\b[^>]*Date="([^"]+)"[^>]*>([\s\S]*?)<\/Record>/gi;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const body = match[2];
    const nominal = strictNumber(body.match(/<Nominal>([^<]+)<\/Nominal>/i)?.[1]?.replace(',', '.'));
    const value = strictNumber(body.match(/<Value>([^<]+)<\/Value>/i)?.[1]?.replace(',', '.'));
    const unit = strictNumber(body.match(/<VunitRate>([^<]+)<\/VunitRate>/i)?.[1]?.replace(',', '.'));
    const rate = Number.isFinite(unit) && unit > 0 ? unit : value / (Number.isFinite(nominal) && nominal > 0 ? nominal : 1);
    const date = cbrDateToIso(match[1]);
    if (Number.isFinite(rate) && rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      points.push({ date, value: round(rate, 4) });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** Разбор KeyRateXML. Формат: `<KR><DT>…</DT><Rate>…</Rate></KR>`. */
export function parseKeyRateXml(xml) {
  const records = [];
  const pattern = /<KR\b[^>]*>([\s\S]*?)<\/KR>/gi;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const body = match[1];
    const dt = body.match(/<DT>\s*([^<]+?)\s*<\/DT>/i)?.[1] ?? '';
    const rate = strictNumber(body.match(/<Rate>\s*([-\d.,]+)\s*<\/Rate>/i)?.[1]?.replace(',', '.'));
    if (!Number.isFinite(rate) || !dt) continue;
    records.push({ date: cbrDateToIso(dt.slice(0, 10)), rate });
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Ступени ключевой ставки внутри окна.
 *
 * Ставка не «ходит» каждый день, поэтому рисовать её как обычную линию —
 * врать о плавности. Первая точка — уровень, действовавший на начало окна
 * (взятый из истории ЦБ), дальше только даты вступления в силу.
 */
export function buildKeyRateSteps(records, fromISO) {
  if (records.length === 0) return [];

  // ЦБ отдаёт то точки изменения, то подневный ряд — формат меняется без
  // предупреждения. Схлопываем подневный ряд в изменения: ступень появляется
  // там, где значение впервые отличается от предыдущего.
  const changes = [];
  let previousRate = null;
  for (const record of records) {
    if (previousRate === null || record.rate !== previousRate) {
      changes.push({ date: record.date, rate: record.rate });
    }
    previousRate = record.rate;
  }
  if (changes.length === 0) return [];

  // Уровень, действовавший на начало окна: последнее изменение не позже него.
  let current = null;
  for (const change of changes) {
    if (change.date <= fromISO) current = change;
    else break;
  }

  // Дату вступления в силу не утверждаем, если она совпала с началом окна:
  // запрос всегда шире окна на 400 дней, поэтому такая запись означает, что
  // до окна данных в ответе не было, и настоящая дата изменения неизвестна.
  const sinceOf = (date) => (date === fromISO ? null : date);

  const steps = [];
  if (current) {
    // Дата ступени — начало окна, но «действует с» — настоящая дата изменения.
    steps.push({ date: fromISO, value: current.rate, since: sinceOf(current.date) });
  } else {
    const firstChange = changes.find((change) => change.date > fromISO) ?? changes[0];
    // Если самая ранняя запись совпадает с началом окна, значит ЦБ отдал ряд
    // только с этой даты (запрос всегда шире окна на 400 дней). Дату вступления
    // в силу в такой выборке не видно, и подставлять её — врать: пишем null,
    // а таблица говорит «начало окна».
    steps.push({
      date: firstChange.date,
      value: firstChange.rate,
      since: sinceOf(firstChange.date),
    });
  }

  for (const change of changes) {
    if (change.date <= fromISO) continue;
    const last = steps[steps.length - 1];
    if (change.rate === last.value) continue;
    if (change.date === last.date) {
      steps[steps.length - 1] = { date: change.date, value: change.rate, since: change.date };
      continue;
    }
    steps.push({ date: change.date, value: change.rate, since: change.date });
  }
  return steps;
}

/**
 * Разбор блока `history` из ISS — того же, что отдаёт и IMOEX, и RGBI.
 * Колонки берутся по имени, а не по индексу: порядок у Мосбиржи менялся.
 * Строки без даты, без закрытия или с нулём выбрасываются: ноль до первой
 * сделки — это не цена.
 */
export function parseIssHistory(payload) {
  const block = payload?.history;
  if (!block?.columns || !Array.isArray(block.data)) throw new Error('ISS не отдал блок history');
  const dateIndex = block.columns.indexOf('TRADEDATE');
  const closeIndex = block.columns.indexOf('CLOSE');
  if (dateIndex < 0 || closeIndex < 0) throw new Error('В блоке history нет TRADEDATE/CLOSE');
  const total = strictNumber(payload?.['history.cursor']?.data?.[0]?.[1]);
  const points = block.data
    .map((row) => ({ date: String(row[dateIndex] ?? ''), value: strictNumber(row[closeIndex]) }))
    .filter(
      (point) =>
        /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
        Number.isFinite(point.value) &&
        point.value > 0,
    )
    .map((point) => ({ date: point.date, value: round(point.value, 2) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { points, total: Number.isFinite(total) ? total : points.length };
}

async function fetchMoexIndexHistory(secid, fromISO, tillISO) {
  const url =
    `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${secid}.json` +
    `?iss.meta=off&from=${fromISO}&till=${tillISO}`;
  const payload = await fetchJson(url);
  const { points, total } = parseIssHistory(payload);
  if (points.length === 0) throw new Error(`ISS вернул пустую историю ${secid}`);
  return { points, total };
}

async function fetchCbrHistory(currencyCode, fromISO, tillISO) {
  const url =
    'https://www.cbr.ru/scripts/XML_dynamic.asp' +
    `?date_req1=${cbrRequestDate(new Date(`${fromISO}T00:00:00Z`))}` +
    `&date_req2=${cbrRequestDate(new Date(`${tillISO}T00:00:00Z`))}` +
    `&VAL_NM_RQ=${currencyCode}`;
  const xml = await fetchText(url);
  const points = parseCbrDynamicXml(xml);
  if (points.length === 0) throw new Error('ЦБ вернул пустую историю курса');
  return { points, total: points.length };
}

async function fetchKeyRateHistory(fromISO, tillISO) {
  // Окно запроса шире окна графика: иначе ЦБ не отдаст предыдущую ступень и
  // «действует с» превратится в дату начала окна — то есть в неправду.
  const soapFromDate = new Date(new Date(`${fromISO}T00:00:00Z`).getTime() - 400 * 24 * 60 * 60 * 1000);
  const soapFrom = isoDate(soapFromDate);
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><KeyRateXML xmlns="http://web.cbr.ru/">' +
    `<fromDate>${soapFrom}</fromDate><ToDate>${tillISO}</ToDate>` +
    '</KeyRateXML></soap:Body></soap:Envelope>';
  const xml = await fetchTextPost(KEY_RATE_SOAP_URL, body, 'http://web.cbr.ru/KeyRateXML');
  const records = parseKeyRateXml(xml);
  if (records.length === 0) throw new Error('ЦБ не отдал историю ключевой ставки');
  const points = buildKeyRateSteps(records, fromISO);
  if (points.length === 0) throw new Error('В окне нет ни одной ступени ставки');
  return { points, total: points.length };
}

/**
 * Очередь по хосту на весь модуль: в одном снимке три ряда Мосбиржи и два
 * ЦБ, и все они уходят разом. Один запрос в полёте на адрес — это чтение
 * чужого сайта, а не залп по нему.
 */
const runOnHost = hostQueue({ limit: 1 });

const SERIES = [
  {
    id: 'imoex',
    name: 'IMOEX',
    unit: 'пункта',
    kind: 'line',
    provider: 'Мосбиржа ISS',
    sourceUrl: 'https://www.moex.com/ru/index/IMOEX/',
    note: 'Закрытие торгового дня. Текущая сессия в историю попадает только после закрытия.',
    load: (from, till) => fetchMoexIndexHistory('IMOEX', from, till),
  },
  {
    id: 'rgbi',
    name: 'RGBI',
    unit: 'пункта',
    kind: 'line',
    provider: 'Мосбиржа ISS',
    sourceUrl: 'https://www.moex.com/ru/index/RGBI/',
    note: 'Закрытие торгового дня. RGBI считается по ценам гособлигаций, а не по доходностям: рост индекса — это рост цен ОФЗ.',
    load: (from, till) => fetchMoexIndexHistory('RGBI', from, till),
  },
  {
    id: 'usd-rub',
    name: 'USD/RUB',
    unit: '₽',
    kind: 'line',
    provider: 'Банк России',
    sourceUrl: 'https://www.cbr.ru/currency_base/daily/',
    note: 'Официальный курс ЦБ на дату. Записи идут не только по рабочим дням: если ЦБ установил курс на выходной, сайт показывает его как есть, а не прореживает ряд и не достраивает пропуски.',
    load: (from, till) => fetchCbrHistory('R01235', from, till),
  },
  {
    id: 'ruonia',
    name: 'RUONIA',
    unit: '%',
    kind: 'line',
    provider: 'Банк России',
    sourceUrl: 'https://www.cbr.ru/hd_base/ruonia/',
    note: 'Эталонная ставка однодневных межбанковских кредитов: значение за дату ЦБ публикует на следующий день, поэтому последняя точка обычно вчерашняя.',
    load: async (from, till) => {
      const records = await fetchRuoniaRecords(from, till);
      const points = records.map((record) => ({ date: record.date, value: record.rate }));
      if (points.length === 0) throw new Error('ЦБ не отдал историю RUONIA');
      return { points, total: points.length };
    },
  },
  {
    id: 'reserves',
    name: 'Международные резервы',
    unit: 'млрд $',
    kind: 'line',
    provider: 'Банк России',
    sourceUrl: 'https://www.cbr.ru/hd_base/mrrf/mrrf_7d/',
    note: 'Отчётная дата — пятница; ЦБ публикует значение на следующей неделе. Точки идут с недельным шагом: это частота публикации, а не пропущенные дни.',
    load: async (from, till) => {
      // Недельный ряд: запрашиваем шире окна, чтобы первая точка не была
      // искусственно обрезана началом графика.
      const wideFrom = isoDate(new Date(new Date(`${from}T00:00:00Z`).getTime() - 14 * 24 * 60 * 60 * 1000));
      const records = await fetchReservesRecords(wideFrom, till);
      const points = records
        .filter((record) => record.date >= from && record.date <= till)
        .map((record) => ({ date: record.date, value: record.value }));
      if (points.length === 0) throw new Error('ЦБ не отдал историю резервов');
      return { points, total: points.length };
    },
  },
  {
    id: 'key-rate',
    name: 'Ключевая ставка',
    unit: '%',
    kind: 'step',
    provider: 'Банк России',
    sourceUrl: 'https://www.cbr.ru/hd_base/KeyRate/',
    note: 'Ступени — даты вступления в силу. Первая точка показывает уровень, действовавший на начало окна.',
    load: (from, till) => fetchKeyRateHistory(from, till),
  },
];

export default async function handler(req, res) {
  // Browsers must not retain API data. The shared edge TTL below is separate.
  setBrowserNoStore(res);
  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const till = new Date();
  const from = new Date(till.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const fromISO = isoDate(from);
  const tillISO = isoDate(till);

  const errors = [];
  const deadline = Date.now() + RUN_DEADLINE_MS;
  const results = await Promise.all(
    SERIES.map(async (series) => {
      try {
        const { points, total } = await series.load(fromISO, tillISO);
        // Линии нужны минимум две точки, ступеням — одна: ставка может не
        // меняться всё окно, и тогда честная картинка — горизонтальная линия
        // на этом уровне, а не «нет данных».
        if (points.length < (series.kind === 'step' ? 1 : 2)) {
          throw new Error(
            points.length === 0
              ? 'источник не отдал ни одной точки в окне'
              : `в окне всего ${points.length} точка — рисовать нечего`,
          );
        }
        return {
          id: series.id,
          name: series.name,
          unit: series.unit,
          kind: series.kind,
          provider: series.provider,
          sourceUrl: series.sourceUrl,
          note: series.note,
          points,
          truncated: total > points.length,
        };
      } catch (error) {
        const reason = error?.name === 'AbortError' ? 'таймаут ответа' : error?.message || 'неизвестная ошибка';
        errors.push(`${series.name} (${series.provider}): ${reason}`);
        return null;
      }
    }),
  );

  setVercelCdnCache(res, 's-maxage=1800, stale-while-revalidate=900');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    generatedAt: new Date().toISOString(),
    window: { from: fromISO, till: tillISO, days: HISTORY_DAYS },
    series: results.filter(Boolean),
    errors,
    notes: [
      'Окно истории — 92 дня. Точка появляется только там, где её отдал источник: пропущенные торговые дни и выходные не заполняются.',
      'Линия между соседними точками — просто соединение двух наблюдений, а не интерполяция и не оценка пропущенных дней.',
      'Ключевая ставка показана ступенями: она меняется решением регулятора, а не каждую торговую сессию.',
      'Истории доходности ОФЗ здесь нет: Мосбиржа отдаёт по дням только коэффициенты кривой, и доходность пришлось бы считать из них заново — это модель, а не наблюдение. Текущая кривая показана выше, в блоке «Стоимость денег».',
    ],
  });
}
