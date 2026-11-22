import { setBrowserNoStore, setVercelCdnCache } from './_shared/responseCache.js';
import { fetchReservesRecords } from './_shared/cbrReserves.js';
import {
  monthDative,
  monthEndDate,
  monthLabel,
  parseInflationTable,
  pickLatestInflation,
} from './_shared/cbrInflation.js';
import { fetchRuoniaRecords } from './_shared/cbrRuonia.js';
import { FEED_DEADLINE_MS, RUN_DEADLINE_MS, hostQueue, withRetry, withinDeadline } from './_shared/fetchRetry.js';

const TIMEOUT_MS = 6500;
// У RSS-ленты бюджет меньше: это XML на несколько сотен килобайт, а не SOAP.
// Замер 11.11: одна лента (Frank Media, 300 КБ) не укладывалась и держала
// весь снимок до общего срока. 4 секунды на ленту — снимок отвечает, а
// медленная лента честно выпадает и возвращается на следующем запросе.
const FEED_TIMEOUT_MS = 4000;
// SOAP-сервис ЦБ отвечает медленнее обычного XML, и 6,5 секунды ему мало:
// именно на нём первом срабатывал таймаут в ночных прогонах самопроверки.
const SOAP_TIMEOUT_MS = 10000;
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

/**
 * Очереди по хосту.
 *
 * В одном снимке шесть запросов к cbr.ru и пять к iss.moex.com — раньше они
 * уходили одновременно. Со стороны источника это не «шесть индикаторов», а
 * шесть соединений за долю секунды от одного адреса, то есть картина бота.
 * Два одновременных запроса на адрес — это меньше, чем открывает обычный
 * браузер на одну страницу, и в разы меньше прежнего залпа. Один на адрес
 * оказался слишком строгим: холодный ответ страницы растягивался с 2-4 до 10
 * секунд, а он же попадает в проверку `ru_insights` с её 25 секундами.
 */
const runOnMarketHost = hostQueue({ limit: 2 });
const runOnFeedHost = hostQueue({ limit: 2 });

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

async function fetchWithTimeout(url, parseResponse, timeoutMs = TIMEOUT_MS, retryTimeouts = true) {
  // Один повтор на таймаут или сетевой сбой: источник на секунду задумался —
  // это не повод терять индикатор на весь час.
  return withRetry(async () => {
    const response = await timedFetch(
      url,
      {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.5',
        },
      },
      timeoutMs,
    );
    return parseResponse(response);
  }, { retryTimeouts });
}

async function fetchText(url, timeoutMs = TIMEOUT_MS, retryTimeouts = true) {
  return fetchWithTimeout(
    url,
    async (response) => {
      const buffer = await response.arrayBuffer();
      return decodeBuffer(buffer, response.headers.get('content-type') || '');
    },
    timeoutMs,
    retryTimeouts,
  );
}

async function fetchJson(url) {
  return fetchWithTimeout(url, (response) => response.json());
}

/**
 * POST для SOAP-сервиса ЦБ. Курсы отдаются обычным XML по GET, а ключевая
 * ставка — только через DailyInfo.asmx, поэтому нужен отдельный вызов.
 */
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
      SOAP_TIMEOUT_MS,
    );
    const buffer = await response.arrayBuffer();
    return decodeBuffer(buffer, response.headers.get('content-type') || '');
  });
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
    // Разница с предыдущим опубликованным значением в процентных пунктах:
    // процент от процента читался бы как «ставка выросла на 0,36 %», и это
    // было бы неправдой. Для RUONIA важна именно разница в п.п.
    changeAbs: previous ? round(latest.rate - previous.rate, 2) : null,
    changeAbsUnit: 'п.п.',
    provider: 'Банк России',
    basis: volume
      ? `Ставка за ${ruDate(latest.date)}; объём сделок ${volume} млрд ₽. ЦБ публикует значение за дату на следующий день`
      : `Ставка за ${ruDate(latest.date)}; ЦБ публикует значение за дату на следующий день`,
    sourceUrl: 'https://www.cbr.ru/hd_base/ruonia/',
  };
}

/**
 * Международные резервы — валютные активы и монетарное золото ЦБ.
 *
 * Это не «ещё один индекс»: резервы показывают, из какой подушки ЦБ проводит
 * операции на валютном рынке и чем отвечает по внешним обязательствам.
 * Ряд недельный, отчётная дата — пятница, значение публикуется на следующей
 * неделе. Поэтому последняя точка честно вчерашняя по отчётной дате, и это
 * подписано в базисе, чтобы «не сегодня» не выглядело поломкой загрузки.
 *
 * Изменение даётся в млрд долларов, а не в процентах: разница — то же число,
 * что и в первоисточнике, без пересчёта.
 */
async function fetchReserves() {
  const to = new Date();
  const from = new Date(to.getTime() - 60 * 24 * 60 * 60 * 1000);
  const records = await fetchReservesRecords(isoDate(from), isoDate(to));
  if (records.length === 0) throw new Error('ЦБ не отдал международные резервы');
  const latest = records[records.length - 1];
  const previous = records[records.length - 2] ?? null;

  return {
    id: 'reserves',
    name: 'Международные резервы',
    label: 'Валютные активы и монетарное золото',
    value: round(latest.value, 2),
    unit: 'млрд $',
    changePct: null,
    asOf: latest.date,
    previousDate: previous?.date ?? null,
    changeAbs: previous ? round(latest.value - previous.value, 2) : null,
    changeAbsUnit: 'млрд $',
    provider: 'Банк России',
    basis: `На конец отчётной даты ${ruDate(latest.date)}. Ряд недельный: значение публикуется на следующей неделе, поэтому последняя точка — за прошлую пятницу`,
    sourceUrl: 'https://www.cbr.ru/hd_base/mrrf/mrrf_7d/',
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
    sourceUrl: 'https://iss.moex.com/iss/engines/stock/zcyc.json?iss.meta=off',
    // Для рисунка кривой: точки, которые реально пришли, без сглаживания.
    curve: curve.length >= 2 ? curve : null,
    curveAsOf: `${best.row.tradedate ?? ''} ${best.row.tradetime ?? ''}`.trim(),
  };
}

/** «Сегодня» по Москве как YYYY-MM-DD: у Мосбиржи день начинается в МСК. */
function moscowToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** YYYY-MM-DD минус N дней. */
function shiftDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Предыдущее закрытие индекса из блока `history` ISS.
 *
 * Зачем это нужно: `LASTVALUE` в marketdata — не вчерашнее закрытие, а
 * предыдущее значение индекса. Разница `CURRENTVALUE - LASTVALUE` — это
 * тик, а не дневное движение: 30.10 на экране было «IMOEX +0,47 %», хотя
 * к закрытию 29.10 (2496,26) индекс шёл на +0,25 %. Изменение к закрытию
 * считается только по опубликованной истории, и её же видно в графике.
 *
 * Берётся последняя точка с датой строго раньше сегодняшней: строка текущей
 * сессии в истории может появиться до закрытия, и базой она быть не может.
 */
function historyCloses(payload, boardId = null) {
  const block = payload?.history;
  if (!block?.columns || !Array.isArray(block.data)) return [];
  const dateIndex = block.columns.indexOf('TRADEDATE');
  const closeIndex = block.columns.indexOf('CLOSE');
  const boardIndex = block.columns.indexOf('BOARDID');
  if (dateIndex < 0 || closeIndex < 0) return [];
  // У валютного рынка один и тот же инструмент торгуется на нескольких
  // площадках (GLDRUB_TOM: CETS, CNGD, LICU), и закрытия у них разные.
  // Без фильтра по площадке базой могло стать закрытие чужой сессии.
  if (boardId && boardIndex < 0) return [];
  return block.data
    .filter((row) => !boardId || String(row?.[boardIndex] ?? '') === boardId)
    .map((row) => ({ date: String(row?.[dateIndex] ?? ''), close: Number(row?.[closeIndex]) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function pickPreviousClose(payload, todayIso, boardId = null) {
  const rows = historyCloses(payload, boardId).filter((row) => row.date < todayIso);
  const last = rows[rows.length - 1];
  return last ? { date: last.date, close: last.close } : null;
}

/**
 * База для изменения цены, у которой дата наблюдения может быть вчерашней.
 *
 * Случай, который это лечит (31.10, золото): последняя сделка — закрытие 30.10
 * (10 149,5), и предыдущее закрытие тоже 30.10, потому что сегодня торгов не
 * было. Изменение выходило «0,00 % к 30.10» — то есть цена сравнивалась сама с
 * собой, а −3,65 % за пятницу исчезали.
 *
 * Правило: если наблюдённая цена совпала с закрытием какой-то сессии, база —
 * закрытие ПРЕДЫДУЩЕЙ сессии перед ней. Если не совпала (сделка идёт прямо
 * сейчас), база — последнее закрытие строго раньше сегодняшнего дня.
 */
export function pickQuoteBase(payload, todayIso, observedValue, boardId = null) {
  const rows = historyCloses(payload, boardId);
  const value = Number(observedValue);
  // Совпадение ищется только среди сессий не позже сегодняшней: закрытие из
  // «будущего» относительно сегодняшнего дня базой быть не может.
  const matched = [...rows]
    .reverse()
    .find((row) => row.date <= todayIso && Math.abs(row.close - value) < 1e-9);
  const cutoff = matched ? matched.date : todayIso;
  const candidates = rows.filter((row) => row.date < cutoff);
  const last = candidates[candidates.length - 1];
  return last ? { date: last.date, close: last.close } : null;
}

async function fetchMoexPreviousClose(secid, todayIso) {
  const url =
    `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${secid}.json` +
    `?iss.meta=off&from=${shiftDate(todayIso, -12)}&till=${shiftDate(todayIso, -1)}`;
  const payload = await fetchJson(url);
  return pickPreviousClose(payload, todayIso);
}

/** История валютного рынка: золото и юань торгуются там, не в индексах. */
async function fetchCurrencyHistory(secid, todayIso) {
  const url =
    `https://iss.moex.com/iss/history/engines/currency/markets/selt/securities/${secid}.json` +
    `?iss.meta=off&from=${shiftDate(todayIso, -12)}&till=${shiftDate(todayIso, -1)}`;
  return fetchJson(url);
}

function rowsToObjects(block) {
  if (!block?.columns || !Array.isArray(block.data)) return [];
  return block.data.map((row) =>
    Object.fromEntries(block.columns.map((column, index) => [column, row[index]])),
  );
}

async function fetchMoexIndex(id, name, label) {
  const todayIso = moscowToday();
  const url = `https://iss.moex.com/iss/engines/stock/markets/index/securities/${id}.json?iss.meta=off`;
  // История нужна только ради базы: без неё изменение считать нечем, и
  // подставлять сюда LASTVALUE нельзя — это не закрытие предыдущей сессии.
  const [payload, previous] = await Promise.all([
    fetchJson(url),
    fetchMoexPreviousClose(id, todayIso).catch(() => null),
  ]);
  const row = rowsToObjects(payload.marketdata).find((item) => item.SECID === id);
  if (!row) throw new Error(`Нет marketdata для ${id}`);
  const value = Number(row.CURRENTVALUE ?? row.LASTVALUE);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Некорректное значение ${id}`);
  }
  const base = previous?.close ?? null;
  return {
    id: id.toLowerCase(),
    name,
    label,
    value: round(value, 2),
    unit: 'пункта',
    changePct: base === null ? null : round(((value - base) / base) * 100, 3),
    asOf: row.SYSTIME || `${row.TRADEDATE || ''} ${row.UPDATETIME || ''}`.trim(),
    previousDate: previous?.date ?? null,
    provider: 'Мосбиржа ISS',
    basis: base === null
      ? `Текущее значение индекса. Изменение к закрытию не посчитано: история ISS не отдала предыдущее закрытие — показывать вместо него разницу с предыдущим значением индекса было бы другим числом`
      : `Текущее значение индекса; изменение — к закрытию ${ruDate(previous.date)} по истории ISS. Публичный поток может быть задержан`,
    sourceUrl: `https://www.moex.com/ru/index/${id}/`,
  };
}

/**
 * Золото на Мосбирже, GLDRUB_TOM: рубли за грамм.
 *
 * Зачем свой источник вместо платного ключа: это та же публичная витрина ISS,
 * что и у индексов, — ключа не требует, не имеет лимита и отдаёт время
 * источника. Цена здесь биржевая сделка в рублях, а не мировой спот в
 * долларах за унцию: это разные числа с разной базой, и подписывать одно
 * именем другого нельзя. Пересчёт рубля за грамм в доллары за унцию сюда не
 * подставляется — российское золото торгуется со своей премией к споту, и
 * такой пересчёт выдал бы одно за другое.
 *
 * База изменения — закрытие предыдущей сессии из опубликованной истории, а не
 * PREVPRICE и не LASTCHANGE: у валютного рынка на один инструмент приходится
 * несколько площадок, и закрытия у них разные.
 */
async function fetchMoexGold() {
  const todayIso = moscowToday();
  const url =
    'https://iss.moex.com/iss/engines/currency/markets/selt/securities/GLDRUB_TOM.json?iss.meta=off';
  const [payload, history] = await Promise.all([
    fetchJson(url),
    fetchCurrencyHistory('GLDRUB_TOM', todayIso).catch(() => null),
  ]);
  const security = rowsToObjects(payload.securities).find(
    (item) => item.SECID === 'GLDRUB_TOM' && item.BOARDID === 'CETS',
  );
  const market = rowsToObjects(payload.marketdata).find(
    (item) => item.SECID === 'GLDRUB_TOM' && item.BOARDID === 'CETS',
  );
  if (!security || !market) throw new Error('Нет CETS для GLDRUB_TOM');

  // До первой сделки дня ISS отдаёт LAST = 0/null. Тогда показывается
  // предыдущее закрытие и изменение не считается: рисовать «0,00 %» на
  // отсутствии сделки — значит утверждать, что рынок стоял.
  const traded = [market.LAST, market.MARKETPRICETODAY, market.CLOSEPRICE]
    .map(Number)
    .find((candidate) => Number.isFinite(candidate) && candidate > 0);
  const fallback = Number(security.PREVPRICE);
  const value = traded ?? (Number.isFinite(fallback) ? fallback : null);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Некорректное значение GLDRUB_TOM');
  // База считается от наблюдённой цены: иначе субботняя плитка сравнивала
  // пятничное закрытие с ним же и показывала «0,00 %».
  const previous = history ? pickQuoteBase(history, todayIso, value, 'CETS') : null;

  const base = previous?.close ?? null;
  const hasTrade = traded !== undefined;
  return {
    id: 'gold-moex',
    name: 'Золото',
    label: 'Мосбиржа, рубли за грамм',
    value: round(value, 2),
    unit: '₽/г',
    changePct: base === null ? null : round(((value - base) / base) * 100, 3),
    asOf: market.SYSTIME || `${market.TRADEDATE || ''} ${market.UPDATETIME || ''}`.trim(),
    previousDate: previous?.date ?? null,
    provider: 'Мосбиржа ISS',
    basis: !hasTrade
      ? `Сделок в этой сессии ещё не было: показано закрытие предыдущей (${ruDate(previous?.date ?? todayIso)}), изменение поэтому не посчитано`
      : base === null
        ? 'Цена последней сделки GLDRUB_TOM. Изменение к закрытию не посчитано: история ISS не отдала предыдущее закрытие'
        : `Цена последней сделки GLDRUB_TOM; изменение — к закрытию ${ruDate(previous.date)} по истории ISS. Это биржевая цена в рублях за грамм, а не мировой спот в долларах за унцию`,
    sourceUrl: 'https://www.moex.com/ru/issue/GLDRUB_TOM/CETS',
  };
}

// Страница ЦБ с таблицей «ключевая ставка / инфляция / цель». Таблица приходит
// в самой разметке, поэтому читается обычным запросом без браузера.
// This parser consumes the configured HTML table, not XLSX binary bytes.
// A bare DownloadExcel URL returned 404 in both live audit rounds; a workbook
// is not a second HTML feed and must not be advertised as a working fallback.
const INFLATION_PAGE = 'https://www.cbr.ru/hd_base/infl/';

/**
 * Инфляция год к году из таблицы Банка России (данные Росстата).
 *
 * Последняя цифра — за опубликованный месяц: ЦБ публикует её в середине
 * следующего. Поэтому месяц печатается в подписи — иначе «6,35 %» в начале
 * ноября читалось бы как инфляция за ноябрь.
 *
 * Изменение считается в процентных пунктах: 6,33 → 6,35 это «+0,02 п.п.», а
 * не «+0,3 %». Процент от процента — другое число.
 */
async function fetchInflation() {
  const rows = parseInflationTable(await fetchText(INFLATION_PAGE));
  const picked = pickLatestInflation(rows);
  if (!picked) throw new Error('Таблица инфляции ЦБ не разобрана');

  const { latest, previous } = picked;
  const change = previous ? round(latest.inflation - previous.inflation, 2) : null;
  return {
    id: 'inflation',
    name: 'Инфляция',
    label: 'Рост цен, год к году',
    value: round(latest.inflation, 2),
    unit: '%',
    changePct: null,
    asOf: monthEndDate(latest.month),
    previousDate: previous ? monthEndDate(previous.month) : null,
    // Месячные данные нельзя сравнивать «к 31.08»: это читается как сравнение
    // с днём. Плитка печатает то же самое, что и подпись, — «к августу».
    previousLabel: previous ? monthDative(previous.month) : null,
    changeAbs: change,
    changeAbsUnit: 'п.п.',
    provider: 'Банк России (данные Росстата)',
    basis:
      `Инфляция за ${monthLabel(latest.month)} к тому же месяцу прошлого года; ` +
      (previous
        ? `изменение — к ${monthDative(previous.month)}, в процентных пунктах. `
        : '') +
      'ЦБ публикует месячное значение в середине следующего месяца, поэтому показываем последний опубликованный месяц, указанный рядом со значением',
    sourceUrl: 'https://www.cbr.ru/hd_base/infl/',
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
  // Таймаут ленты не повторяем: она либо отвечает за 4 секунды, либо не
  // отвечает вовсе. Повтор удваивал ожидание страницы и не спасал данные.
  return parseRss(await fetchText(source.url, FEED_TIMEOUT_MS, false), source);
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
  // Browsers must not retain API data. The shared edge TTL below is separate.
  setBrowserNoStore(res);
  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startedAt = Date.now();
  const errors = [];
  // Задачи-функции, а не готовые промисы: иначе все запросы стартуют до того,
  // как очередь по хосту успеет их придержать.
  const marketTasks = [
    ...CBR_CURRENCIES.map((currency) => ({ host: 'www.cbr.ru', run: () => fetchCbrIndicator(currency) })),
    { host: 'iss.moex.com', run: () => fetchMoexIndex('IMOEX', 'IMOEX', 'Индекс МосБиржи') },
    { host: 'iss.moex.com', run: () => fetchMoexIndex('RGBI', 'RGBI', 'Индекс гособлигаций') },
    { host: 'iss.moex.com', run: () => fetchMoexCny() },
    { host: 'www.cbr.ru', run: () => fetchCbrKeyRate() },
    { host: 'www.cbr.ru', run: () => fetchRuonia() },
    { host: 'www.cbr.ru', run: () => fetchReserves() },
    { host: 'iss.moex.com', run: () => fetchMoexOfz10y() },
    { host: 'iss.moex.com', run: () => fetchMoexGold() },
    { host: 'www.cbr.ru', run: () => fetchInflation() },
  ];
  const marketLabels = [
    ...CBR_CURRENCIES.map((currency) => currency.name),
    'IMOEX',
    'RGBI',
    'CNY MOEX',
    'Ключевая ставка ЦБ',
    'RUONIA',
    'Международные резервы',
    'Кривая доходности ОФЗ',
    'Золото на Мосбирже',
    'Инфляция ЦБ',
  ];
  const rssLabels = RSS_SOURCES.map((source) => source.name);

  // Сроки на запуск: очередь бережёт источник, но лежащий источник не должен
  // превращать страницу в 504. У лент срок короче — их много, они мелкие и
  // обновляются каждую минуту; рыночным индикаторам нужен запас.
  const feedDeadline = Date.now() + FEED_DEADLINE_MS;
  const deadline = Date.now() + RUN_DEADLINE_MS;
  const [marketResults, rssResults] = await Promise.all([
    Promise.allSettled(
      marketTasks.map((task) => withinDeadline(runOnMarketHost(task.host, task.run), deadline)),
    ),
    Promise.allSettled(
      RSS_SOURCES.map((source) =>
        withinDeadline(runOnFeedHost(source.url, () => fetchRss(source)), feedDeadline, source.name),
      ),
    ),
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

  // Не склеиваем похожие заголовки: у каждой публикации сохраняются её
  // собственные источник, время и ссылка. Похожие формулировки не доказывают,
  // что это одно событие.
  const headlines = headlinesRaw
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 18);

  // Неполный снимок не кэшируем надолго: если один источник не ответил,
  // плитка исчезает честно, но восстанавливаться должна за минуту-две, а не
  // висеть без значения четверть часа уже после того, как источник ожил.
  // Preserve the existing Vercel edge refresh cadence without browser caching.
  setVercelCdnCache(
    res,
    errors.length > 0
      ? 's-maxage=60, stale-while-revalidate=120'
      : 's-maxage=300, stale-while-revalidate=900',
  );
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    generatedAt: new Date().toISOString(),
    // Сколько занял снимок. Строка нужна не для красоты: спорить о «без
    // задержек» можно только числом, а не ощущением. Холодный ответ идёт
    // мимо кэша CDN, поэтому первое, что стоит смотреть при жалобе на
    // медленную страницу, — это значение здесь.
    elapsed_ms: Date.now() - startedAt,
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
