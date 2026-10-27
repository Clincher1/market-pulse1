/* eslint-disable react-refresh/only-export-components -- Vercel serverless function, not a Vite module. */
import { readFile } from 'node:fs/promises';

/**
 * Stage 5: server-generated Telegram card for the deterministic brief.
 *
 * The image is built only from the same public read-only data as the site:
 * Supabase cached_* tables, daily_snapshots and /api/russia-insights.
 * No query parameter is read or emitted, so the card carries no tracking
 * marker. Missing sources degrade to explicit "not enough data" lines;
 * fallback/demo numbers are never substituted.
 */

type AnyRecord = Record<string, unknown>;

type BriefCard = {
  stampLabel: string;
  tensionValue: number | null;
  tensionLabel: string;
  tensionMeta: string;
  facts: string[];
  consequences: string[];
  changesTitle: string | null;
  changes: string[];
  changesNote: string | null;
  changesExtraNote: string | null;
  watch: string | null;
};

type FontSpec = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700 | 800;
  style: 'normal';
};

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ??
  {};

const SUPABASE_URL =
  env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://hekzplfftannlzwvgwwm.supabase.co';
// Publishable/anon key only. The same key is already shipped to browsers;
// Supabase RLS grants it SELECT-only access to the public cache tables.
const SITE_ORIGIN = env.VERCEL_URL
  ? `https://${env.VERCEL_URL}`
  : 'https://market-pulse1-eta.vercel.app';
const SUPABASE_ANON_KEY =
  env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_FPAh2Z30aCCKpbfDdDrM_g_urRwk8r-';

const KNOWN_ASSET_IDS = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'];
const GLOBAL_CHANGE_THRESHOLDS: Record<string, number> = {
  'usd-eur': 0.25,
  sp500: 0.4,
  gold: 0.5,
  brent: 0.8,
  btc: 1.5,
};
const RUSSIA_CHANGE_THRESHOLDS: Record<string, number> = {
  'usd-rub': 0.3,
  'eur-rub': 0.3,
  'cny-rub-moex': 0.3,
  'cny-rub-cbr': 0.3,
  imoex: 0.5,
  rgbi: 0.1,
};

let fontsPromise: Promise<FontSpec[]> | undefined;

function loadFonts(): Promise<FontSpec[]> {
  if (!fontsPromise) {
    const specs = [
      ['./assets/Inter-Regular-subset.ttf', 400],
      ['./assets/Inter-Bold-subset.ttf', 700],
      ['./assets/Inter-ExtraBold-subset.ttf', 800],
    ] as const;
    fontsPromise = Promise.all(
      specs.map(async ([path, weight]) => {
        const buffer = await readFile(new URL(path, import.meta.url));
        return {
          name: 'Inter',
          data: buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ) as ArrayBuffer,
          weight,
          style: 'normal' as const,
        };
      }),
    );
  }
  return fontsPromise;
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const m10 = abs % 10;
  const m100 = abs % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')}%`;
}

function truncateText(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…` : clean;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatStamp(values: Array<string | undefined>, fallbackNow = false): string | null {
  const timestamps = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));
  const time = timestamps.length ? Math.max(...timestamps) : fallbackNow ? Date.now() : null;
  if (time === null) return null;
  return (
    new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    }).format(new Date(time)) + ' МСК'
  );
}

function formatDateOnly(value?: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(date);
}

function moscowDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function moscowHour(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parsed = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Europe/Moscow',
    }).format(date),
  );
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSupabase(path: string): Promise<unknown> {
  if (!SUPABASE_ANON_KEY) throw new Error('Missing public Supabase key');
  return fetchJsonWithTimeout(
    `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    },
    1900,
  );
}

async function fetchRussia(): Promise<AnyRecord | null> {
  try {
    const url = new URL('/api/russia-insights', SITE_ORIGIN).toString();
    const payload = await fetchJsonWithTimeout(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'MarketPulse-BriefCard/1.0 (+https://market-pulse1-eta.vercel.app/)',
        },
      },
      2400,
    );
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function firstRow(value: unknown): AnyRecord | null {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : null;
}

function rows(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function dedupeTensionHistory(value: unknown): Array<{ day: string; value: number }> {
  if (!Array.isArray(value)) return [];
  const byDay = new Map<string, { day: string; value: number }>();
  value.filter(isRecord).forEach((point) => {
    const day = stringValue(point.day);
    const pointValue = finiteNumber(point.value);
    if (day && pointValue !== null) byDay.set(day, { day, value: pointValue });
  });
  return [...byDay.values()];
}

function lastSparkline(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  const values = value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  return values.length ? values[values.length - 1] : null;
}

function formatIndicatorValue(indicator: AnyRecord): string {
  const value = finiteNumber(indicator.value) ?? 0;
  const decimals = stringValue(indicator.unit) === '₽' ? 4 : 2;
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function publicSignalLabel(direction: string, probability: number | null): string {
  if (
    probability === null ||
    probability < 60 ||
    (direction !== 'up' && direction !== 'down')
  ) {
    return 'Нет сигнала';
  }
  const side = direction === 'up' ? 'вверх' : 'вниз';
  return probability < 70 ? `Слабый перекос ${side}` : side === 'вверх' ? 'Вверх' : 'Вниз';
}

async function buildBriefCard(): Promise<BriefCard> {
  const today = moscowDateKey();
  const [tensionResult, newsResult, assetsResult, forecastsResult, snapshotResult, russia] =
    await Promise.all([
      Promise.allSettled([
        fetchSupabase(
          'cached_tension?select=value,label,history,news_count,updated_at&id=eq.1&limit=1',
        ),
      ]).then((items) => items[0]),
      Promise.allSettled([
        fetchSupabase(
          'cached_news?select=source,title,published_at,importance,confidence&order=published_at.desc.nullslast&limit=80',
        ),
      ]).then((items) => items[0]),
      Promise.allSettled([
        fetchSupabase('cached_assets?select=id,name,price,change,sparkline&limit=20'),
      ]).then((items) => items[0]),
      Promise.allSettled([
        fetchSupabase(
          'cached_forecasts?select=id,asset,direction,probability,updated_at&limit=20',
        ),
      ]).then((items) => items[0]),
      Promise.allSettled([
        fetchSupabase(
          `daily_snapshots?select=date,captured_at,tension,assets,russia,forecasts&date=eq.${today}&limit=1`,
        ),
      ]).then((items) => items[0]),
      fetchRussia(),
    ]);

  const tensionRow = firstRow(settledValue(tensionResult, null));
  const newsRows = rows(settledValue(newsResult, []));
  const assetRows = rows(settledValue(assetsResult, []));
  const forecastRows = rows(settledValue(forecastsResult, []));
  const snapshotRow = firstRow(settledValue(snapshotResult, null));
  const russiaMarkets = rows(russia?.markets);

  const tensionValueRaw = finiteNumber(tensionRow?.value);
  const tensionValue =
    tensionValueRaw === null ? null : Math.round(Math.min(100, Math.max(0, tensionValueRaw)));
  const tensionLabel = stringValue(tensionRow?.label);
  const tensionHistory = dedupeTensionHistory(tensionRow?.history);
  const previousTension = tensionHistory[tensionHistory.length - 2]?.value;
  const tensionDelta =
    tensionValue !== null && typeof previousTension === 'number'
      ? tensionValue - Math.round(previousTension)
      : null;
  const newsCount = Math.max(0, Math.floor(finiteNumber(tensionRow?.news_count) ?? 0));

  const liveAssets = assetRows.filter((asset) => {
    const id = stringValue(asset.id);
    return (
      KNOWN_ASSET_IDS.includes(id) &&
      stringValue(asset.price) !== '—' &&
      finiteNumber(asset.change) !== null &&
      Array.isArray(asset.sparkline) &&
      asset.sparkline.length >= 2
    );
  });

  const indicatorById = new Map(
    russiaMarkets.map((indicator) => [stringValue(indicator.id), indicator]),
  );
  const russiaCandidateIds = [
    'usd-rub',
    'eur-rub',
    indicatorById.has('cny-rub-moex') ? 'cny-rub-moex' : 'cny-rub-cbr',
    'imoex',
    'rgbi',
  ];
  const russiaCandidates = russiaCandidateIds
    .map((id) => indicatorById.get(id))
    .filter((indicator): indicator is AnyRecord => Boolean(indicator))
    .filter((indicator) => finiteNumber(indicator.changePct) !== null);

  const facts: string[] = [];
  if (tensionValue !== null) {
    const deltaText =
      tensionDelta === null
        ? ''
        : tensionDelta === 0
          ? ', без изменения к предыдущему дню'
          : `, ${tensionDelta > 0 ? '+' : '−'}${Math.abs(tensionDelta)} ${plural(Math.abs(tensionDelta), ['пункт', 'пункта', 'пунктов'])} к предыдущему дню`;
    facts.push(
      `Шкала напряжённости — ${tensionValue}/100${tensionLabel ? ` («${tensionLabel}»)` : ''}${deltaText}; на основе ${newsCount.toLocaleString('ru-RU')} ${plural(newsCount, ['новости', 'новостей', 'новостей'])} за сутки.`,
    );
  }

  const topEvent =
    newsRows
      .map((item) => ({
        ...item,
        _title: decodeEntities(stringValue(item.title)),
        _source: stringValue(item.source),
        _importance: finiteNumber(item.importance) ?? 0,
        _confidence: finiteNumber(item.confidence) ?? 0,
        _time: item.published_at ? new Date(stringValue(item.published_at)).getTime() : 0,
      }))
      .filter((item) => item._title && item._importance >= 7)
      .sort(
        (a, b) =>
          b._importance - a._importance || b._confidence - a._confidence || b._time - a._time,
      )[0] ?? null;

  if (topEvent) {
    facts.push(
      `Главная публикация (${Math.round(topEvent._importance)}/10): «${truncateText(topEvent._title, 112)}»${topEvent._source ? ` — ${topEvent._source}` : ''}. Это заголовок источника.`,
    );
  }

  const strongestGlobal =
    [...liveAssets].sort(
      (a, b) => Math.abs(finiteNumber(b.change) ?? 0) - Math.abs(finiteNumber(a.change) ?? 0),
    )[0] ?? null;
  if (strongestGlobal && facts.length < 3) {
    facts.push(
      `Сильнейшее дневное движение внешнего фона — ${stringValue(strongestGlobal.name)} ${formatPct(finiteNumber(strongestGlobal.change))} (последнее значение ${stringValue(strongestGlobal.price)}).`,
    );
  }

  const strongestRussia =
    [...russiaCandidates].sort(
      (a, b) =>
        Math.abs(finiteNumber(b.changePct) ?? 0) - Math.abs(finiteNumber(a.changePct) ?? 0),
    )[0] ?? null;
  if (strongestRussia && facts.length < 3) {
    facts.push(
      `В российском контуре заметнее всего изменился ${stringValue(strongestRussia.name)}: ${formatIndicatorValue(strongestRussia)} ${stringValue(strongestRussia.unit)} (${formatPct(finiteNumber(strongestRussia.changePct))}).`,
    );
  }

  if (facts.length === 0) {
    facts.push(
      'Бриф временно недоступен: не хватает свежих данных сразу из нескольких публичных блоков. Выдуманный итог не подставляем.',
    );
  }

  const Brent = liveAssets.find((asset) => stringValue(asset.id) === 'brent') ?? null;
  const BrentChange = finiteNumber(Brent?.change);
  const consequences: string[] = [];
  if (BrentChange !== null && Math.abs(BrentChange) >= 1) {
    consequences.push(
      BrentChange < 0
        ? `Сырьевой канал: падение Brent на ${formatPct(BrentChange)} давит на экспортную выручку и бюджетные ожидания; важно, подхватит ли движение рубль.`
        : `Сырьевой канал: рост Brent на ${formatPct(BrentChange)} поддерживает экспортную выручку; проверяем реакцию рубля и IMOEX.`,
    );
  }

  const fxChanges = russiaCandidates
    .filter((indicator) =>
      ['usd-rub', 'eur-rub', 'cny-rub-moex', 'cny-rub-cbr'].includes(stringValue(indicator.id)),
    )
    .map((indicator) => finiteNumber(indicator.changePct))
    .filter((value): value is number => value !== null);
  const fxAverage =
    fxChanges.length >= 2
      ? fxChanges.reduce((sum, value) => sum + value, 0) / fxChanges.length
      : null;
  if (fxAverage !== null && Math.abs(fxAverage) > 0.15 && consequences.length < 2) {
    consequences.push(
      fxAverage > 0
        ? `Валютный канал: иностранные валюты в среднем ${formatPct(fxAverage)} к рублю — импорт и валютные платежи требуют внимания.`
        : `Валютный канал: корзина валют в среднем ${formatPct(fxAverage)} к рублю — импорт дешевле в рублях, а валютная выручка при конвертации ниже.`,
    );
  }

  const rgbi = indicatorById.get('rgbi');
  const rgbiChange = finiteNumber(rgbi?.changePct);
  if (rgbiChange !== null && Math.abs(rgbiChange) >= 0.1 && consequences.length < 2) {
    consequences.push(
      rgbiChange >= 0
        ? `Стоимость денег: RGBI ${formatPct(rgbiChange)} — цены гособлигаций растут, доходности при прочих равных снижаются. Это рыночный фон, а не обещание дешёвых кредитов.`
        : `Стоимость денег: RGBI ${formatPct(rgbiChange)} — цены гособлигаций снижаются, доходности при прочих равных растут и финансовые условия жёстче.`,
    );
  }

  if (consequences.length === 0 && (Brent || fxChanges.length >= 2 || rgbi)) {
    consequences.push(
      'Существенных движений по ключевым каналам сейчас нет: Brent, валютная корзина и RGBI остаются в пределах наших порогов дневного шума.',
    );
  }
  if (consequences.length === 0) {
    consequences.push('Данных российского контура пока недостаточно для вывода о последствиях.');
  }

  let watch: string | null = null;
  const cnyMoex = indicatorById.get('cny-rub-moex');
  if (cnyMoex && cnyMoex.changePct === null) {
    const previousDate = formatDateOnly(
      typeof cnyMoex.previousDate === 'string' ? cnyMoex.previousDate : null,
    );
    watch = `Первые сделки CNYRUB_TOM на Мосбирже: биржевого изменения пока нет, сайт показывает предыдущее закрытие${previousDate ? ` от ${previousDate}` : ''}.`;
  } else if (tensionDelta !== null && Math.abs(tensionDelta) >= 10) {
    watch = `Продолжится ли движение шкалы к следующему обновлению: сегодня уже ${tensionDelta > 0 ? '+' : '−'}${Math.abs(tensionDelta)} ${plural(Math.abs(tensionDelta), ['пункт', 'пункта', 'пунктов'])} к предыдущему дню.`;
  } else if (BrentChange !== null && Math.abs(BrentChange) >= 2.5) {
    watch = `Подтвердят ли CNY/RUB и IMOEX внешний импульс Brent (${formatPct(BrentChange)}), или российский контур его проигнорирует.`;
  } else if (topEvent && topEvent._importance >= 8) {
    watch = `Реакцию цен на главную тему ленты: пока это новость с важностью ${Math.round(topEvent._importance)}/10, а не подтверждённое движение рынка.`;
  } else if (russiaCandidates.length > 0) {
    watch = 'USD/RUB и IMOEX: появятся ли в российском контуре движения сильнее обычного дневного шума.';
  }

  let changesTitle: string | null = null;
  const changes: string[] = [];
  let changesNote: string | null = null;
  let changesExtraNote: string | null = null;

  if (snapshotRow) {
    const capturedAt = stringValue(snapshotRow.captured_at);
    const baselineStamp = formatStamp([capturedAt]);
    const hour = moscowHour(capturedAt);
    changesTitle =
      hour !== null && hour < 11 ? 'Что изменилось с утра' : 'Что изменилось со снимка дня';
    changesNote = baselineStamp ? `точка отсчёта: ${baselineStamp}` : null;

    const candidates: Array<{ score: number; text: string }> = [];
    let comparable = 0;
    const snapshotTension = isRecord(snapshotRow.tension) ? snapshotRow.tension : null;
    const baseTension = finiteNumber(snapshotTension?.value);
    if (tensionValue !== null && baseTension !== null) {
      comparable += 1;
      const base = Math.round(baseTension);
      const delta = tensionValue - base;
      if (Math.abs(delta) >= 5) {
        candidates.push({
          score: 100,
          text: `Шкала: ${base}/100 → ${tensionValue}/100 (${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${plural(Math.abs(delta), ['пункт', 'пункта', 'пунктов'])}).`,
        });
      }
    }

    const snapshotAssets = new Map(
      rows(snapshotRow.assets).map((asset) => [stringValue(asset.id), asset]),
    );
    liveAssets.forEach((asset) => {
      const id = stringValue(asset.id);
      const base = finiteNumber(snapshotAssets.get(id)?.last);
      const current = lastSparkline(asset.sparkline);
      if (base === null || base <= 0 || current === null || current <= 0) return;
      comparable += 1;
      const deltaPct = (current / base - 1) * 100;
      const threshold = GLOBAL_CHANGE_THRESHOLDS[id] ?? 0.5;
      if (Math.abs(deltaPct) < threshold) return;
      candidates.push({
        score: 70 + Math.min(18, (Math.abs(deltaPct) / threshold) * 4),
        text: `${stringValue(asset.name)}: ${formatPct(deltaPct)} к снимку; последнее значение ${stringValue(asset.price)}.`,
      });
    });

    const snapshotRussiaObject = isRecord(snapshotRow.russia) ? snapshotRow.russia : null;
    const snapshotRussia = new Map(
      rows(snapshotRussiaObject?.markets).map((indicator) => [
        stringValue(indicator.id),
        indicator,
      ]),
    );
    russiaMarkets.forEach((indicator) => {
      const id = stringValue(indicator.id);
      const threshold = RUSSIA_CHANGE_THRESHOLDS[id];
      const base = finiteNumber(snapshotRussia.get(id)?.value);
      const current = finiteNumber(indicator.value);
      if (threshold === undefined || base === null || base <= 0 || current === null || current <= 0) {
        return;
      }
      comparable += 1;
      const deltaPct = (current / base - 1) * 100;
      if (Math.abs(deltaPct) < threshold) return;
      candidates.push({
        score: 76 + Math.min(18, (Math.abs(deltaPct) / threshold) * 4),
        text: `${stringValue(indicator.name)}: ${formatPct(deltaPct)} к снимку; сейчас ${formatIndicatorValue(indicator)} ${stringValue(indicator.unit)}.`,
      });
    });

    const snapshotForecasts = new Map(
      rows(snapshotRow.forecasts).map((forecast) => [stringValue(forecast.id), forecast]),
    );
    forecastRows.forEach((forecast) => {
      const base = snapshotForecasts.get(stringValue(forecast.id));
      const baseProbability = finiteNumber(base?.probability);
      const currentProbability = finiteNumber(forecast.probability);
      if (!base || baseProbability === null || currentProbability === null) return;
      comparable += 1;
      const baseLabel = publicSignalLabel(stringValue(base.direction), baseProbability);
      const currentLabel = publicSignalLabel(
        stringValue(forecast.direction),
        currentProbability,
      );
      const balanceDelta = Math.abs(currentProbability - baseProbability);
      const statusChanged = baseLabel !== currentLabel;
      if (!statusChanged && balanceDelta < 10) return;
      candidates.push({
        score: statusChanged ? 92 : 58,
        text: `Сигнал ${stringValue(forecast.asset)}: баланс ${Math.round(baseProbability)} → ${Math.round(currentProbability)}; статус ${statusChanged ? `«${baseLabel}» → «${currentLabel}»` : `по-прежнему «${currentLabel}»`}.`,
      });
    });

    const sorted = candidates.sort((a, b) => b.score - a.score);
    if (comparable === 0) {
      changes.push('Сопоставимых актуальных значений для дельт пока недостаточно.');
    } else if (sorted.length === 0) {
      changes.push('Значимых изменений со снимка нет: показатели остаются в пределах порогов шума.');
    } else {
      changes.push(...sorted.slice(0, 2).map((item) => item.text));
      if (sorted.length > 2) {
        changesExtraNote = `Ещё ${sorted.length - 2} ${plural(sorted.length - 2, ['изменение', 'изменения', 'изменений'])} выше порогов — на сайте.`;
      }
    }
  }

  const sourceStamp = formatStamp([
    typeof tensionRow?.updated_at === 'string' ? tensionRow.updated_at : undefined,
    typeof russia?.generatedAt === 'string' ? russia.generatedAt : undefined,
  ]);
  const stampLabel = sourceStamp
    ? `обновлено ${sourceStamp}`
    : `сформировано ${formatStamp([], true)}`;

  const tensionMeta =
    tensionValue === null
      ? 'данные шкалы временно недоступны'
      : `${tensionDelta === null ? 'нет предыдущего дня для сравнения' : tensionDelta === 0 ? 'без изменения к предыдущему дню' : `${tensionDelta > 0 ? '+' : '−'}${Math.abs(tensionDelta)} ${plural(Math.abs(tensionDelta), ['пункт', 'пункта', 'пунктов'])} к предыдущему дню`} · ${newsCount.toLocaleString('ru-RU')} ${plural(newsCount, ['новость', 'новости', 'новостей'])} за сутки`;

  return {
    stampLabel,
    tensionValue,
    tensionLabel,
    tensionMeta,
    facts: facts.slice(0, 3).map((fact) => truncateText(fact, 196)),
    consequences: consequences.slice(0, 2).map((item) => truncateText(item, 188)),
    changesTitle,
    changes: changes.map((item) => truncateText(item, 166)),
    changesNote,
    changesExtraNote,
    watch: watch ? truncateText(watch, 190) : null,
  };
}

function SectionTitle({ children, note }: { children: string; note?: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: 2.4,
          color: '#94a3b8',
        }}
      >
        {children}
      </div>
      {note ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: '#7dd3fc' }}>{note}</div>
      ) : null}
    </div>
  );
}

function FactItem({ index, text }: { index: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', marginTop: index ? 17 : 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 18,
          background: '#2563eb',
          color: '#ffffff',
          fontSize: 19,
          fontWeight: 800,
          marginRight: 16,
          marginTop: 2,
          flexShrink: 0,
        }}
      >
        {index + 1}
      </div>
      <div style={{ flex: 1, fontSize: 28, lineHeight: 1.3, color: '#dbeafe' }}>{text}</div>
    </div>
  );
}

function BulletItem({ text, first }: { text: string; first: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', marginTop: first ? 0 : 14 }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          background: '#22d3ee',
          marginRight: 15,
          marginTop: 13,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, fontSize: 26, lineHeight: 1.3, color: '#cbd5e1' }}>{text}</div>
    </div>
  );
}

function BriefImage({ card }: { card: BriefCard }) {
  const tensionBarWidth = `${card.tensionValue ?? 0}%`;
  const tensionColor =
    card.tensionValue === null
      ? '#475569'
      : card.tensionValue >= 70
        ? '#f87171'
        : card.tensionValue >= 45
          ? '#fbbf24'
          : '#22d3ee';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        width: 1080,
        height: 1600,
        padding: '54px 58px 46px',
        background: '#050914',
        backgroundImage:
          'linear-gradient(145deg, #050914 0%, #081426 54%, #04111f 100%)',
        color: '#f8fafc',
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 62,
              height: 62,
              borderRadius: 19,
              background: '#2563eb',
              color: '#ffffff',
              fontSize: 25,
              fontWeight: 800,
              marginRight: 17,
            }}
          >
            MP
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.6 }}>Market Pulse</div>
            <div style={{ fontSize: 19, color: '#94a3b8', marginTop: 3 }}>
              Мировые события → рынки → Россия
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            padding: '10px 15px',
            borderRadius: 999,
            border: '1px solid #263449',
            background: 'rgba(255,255,255,0.045)',
            color: '#cbd5e1',
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          {card.stampLabel}
        </div>
      </div>

      <div style={{ display: 'flex', marginTop: 30, fontSize: 56, fontWeight: 800, letterSpacing: -1.6 }}>
        Бриф за 60 секунд
      </div>

      <div
        style={{
          display: 'flex',
          boxSizing: 'border-box',
          flexDirection: 'column',
          width: '100%',
          marginTop: 25,
          padding: '25px 28px 27px',
          borderRadius: 28,
          border: '1px solid #22334d',
          background: 'rgba(255,255,255,0.045)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2.2, color: '#94a3b8' }}>
            ШКАЛА НАПРЯЖЁННОСТИ
          </div>
          {card.tensionLabel ? (
            <div style={{ fontSize: 21, fontWeight: 700, color: '#e2e8f0' }}>
              «{card.tensionLabel}»
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%', marginTop: 12 }}>
          <div style={{ fontSize: 84, lineHeight: 0.95, fontWeight: 800, letterSpacing: -3 }}>
            {card.tensionValue === null ? '—/100' : `${card.tensionValue}/100`}
          </div>
          <div style={{ flex: 1, marginLeft: 28, marginBottom: 8, fontSize: 22, lineHeight: 1.35, color: '#aebbd0' }}>
            {card.tensionMeta}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 15,
            borderRadius: 999,
            background: '#17243a',
            marginTop: 19,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', width: tensionBarWidth, height: '100%', background: tensionColor, borderRadius: 999 }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 24 }}>
        <SectionTitle>ФАКТЫ</SectionTitle>
        {card.facts.map((fact, index) => (
          <FactItem key={index} index={index} text={fact} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 22 }}>
        <SectionTitle>ЧТО ЭТО ЗНАЧИТ ДЛЯ РОССИИ</SectionTitle>
        {card.consequences.map((item, index) => (
          <BulletItem key={index} text={item} first={index === 0} />
        ))}
      </div>

      {card.changesTitle ? (
        <div
          style={{
            display: 'flex',
            boxSizing: 'border-box',
            flexDirection: 'column',
            width: '100%',
            marginTop: 20,
            padding: '20px 22px 22px',
            borderRadius: 24,
            border: '1px solid rgba(34,211,238,0.20)',
            background: 'rgba(8,145,178,0.075)',
          }}
        >
          <SectionTitle note={card.changesNote}>{card.changesTitle.toUpperCase()}</SectionTitle>
          {card.changes.map((item, index) => (
            <BulletItem key={index} text={item} first={index === 0} />
          ))}
          {card.changesExtraNote ? (
            <div style={{ display: 'flex', marginTop: 10, fontSize: 18, color: '#7dd3fc' }}>
              {card.changesExtraNote}
            </div>
          ) : null}
        </div>
      ) : null}

      {card.watch ? (
        <div
          style={{
            boxSizing: 'border-box',
            display: 'flex',
            width: '100%',
            marginTop: 18,
            padding: '19px 22px 21px',
            borderRadius: 24,
            border: '1px solid rgba(34,211,238,0.35)',
            background: 'rgba(8,47,73,0.55)',
            fontSize: 26,
            lineHeight: 1.35,
            color: '#e0f2fe',
          }}
        >
          <div style={{ width: 192, flexShrink: 0, fontWeight: 800, color: '#a5f3fc' }}>
            Смотреть сегодня:
          </div>
          <div style={{ flex: 1 }}>{card.watch}</div>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          marginTop: 'auto',
          paddingTop: 24,
          borderTop: '1px solid #1e293b',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div style={{ fontSize: 21, fontWeight: 800, color: '#7dd3fc' }}>
            market-pulse1-eta.vercel.app
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#cbd5e1' }}>
            Факты отдельно. Гипотезы — с проверкой.
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 9, fontSize: 17, color: '#7c8da6' }}>
          Информационный обзор публичных данных. Не инвестиционная рекомендация.
        </div>
      </div>
    </div>
  );
}

type NodeRequest = {
  method?: string;
};

type NodeResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => NodeResponse;
  json: (body: unknown) => void;
  send: (body: Buffer) => void;
};

export default async function handler(req: NodeRequest, res: NodeResponse) {
  if (!['GET', 'HEAD'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const [{ default: satori }, { Resvg }] = await Promise.all([
      import('satori'),
      import('@resvg/resvg-js'),
    ]);
    const [card, fonts] = await Promise.all([buildBriefCard(), loadFonts()]);
    const svg = await satori(<BriefImage card={card} />, {
      width: 1080,
      height: 1600,
      fonts,
    });
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1080 },
    })
      .render()
      .asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Disposition', 'attachment; filename="market-pulse-brief.png"');
    res.status(200).send(png);
  } catch (error) {
    console.error('Brief image generation failed:', error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({
      error: 'Brief image generation failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
