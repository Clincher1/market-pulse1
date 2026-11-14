import { setBrowserNoStore, setVercelCdnCache } from './_shared/responseCache.js';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { readFile } from 'node:fs/promises';

/**
 * Stage 5: server-generated Telegram card for the deterministic brief.
 *
 * Plain ESM is deliberate: Vercel's Node builder serves this project API
 * reliably from JavaScript, while its TSX compilation path failed in
 * production. Satori receives React elements created through jsx-runtime
 * calls instead of JSX syntax. Data comes only from the same public
 * read-only sources as the site; no query parameter is read or emitted.
 */
const env = globalThis.process?.env ??
    {};
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://hekzplfftannlzwvgwwm.supabase.co';
// Publishable/anon key only. The same key is already shipped to browsers;
// Supabase RLS grants it SELECT-only access to the public cache tables.
const SITE_ORIGIN = env.VERCEL_URL
    ? `https://${env.VERCEL_URL}`
    : 'https://market-pulse1-eta.vercel.app';
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_FPAh2Z30aCCKpbfDdDrM_g_urRwk8r-';
const KNOWN_ASSET_IDS = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'];
let fontsPromise;
function loadFonts() {
    if (!fontsPromise) {
        const specs = [
            ['./assets/Inter-Regular-subset.ttf', 400],
            ['./assets/Inter-Bold-subset.ttf', 700],
            ['./assets/Inter-ExtraBold-subset.ttf', 800],
        ];
        fontsPromise = Promise.all(specs.map(async ([path, weight]) => {
            const buffer = await readFile(new URL(path, import.meta.url));
            return {
                name: 'Inter',
                data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
                weight,
                style: 'normal',
            };
        }));
    }
    return fontsPromise;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
function stringValue(value) {
    return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}
function formatPct(value) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return '—';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')}%`;
}
/**
 * Цена из кэша приходит строкой источника («$123.10», «$105,432», «0.8985»).
 * На карточке рядом стоят российские числа с запятой, поэтому цена переводится
 * в ту же локаль: иначе «$105,432» читается по-русски как сто пять с дробью.
 * Неразбираемая строка возвращается как есть — выдумывать нечего.
 */
function formatPriceText(value) {
    const text = stringValue(value);
    const match = text.match(/^([^\d\-−]*)(\d[\d,]*(?:\.\d+)?)$/);
    if (!match)
        return text;
    const numeric = match[2].replace(/,/g, '');
    const number = Number(numeric);
    if (!Number.isFinite(number))
        return text;
    const digits = Math.min(numeric.split('.')[1]?.length ?? 0, 4);
    return match[1] + new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(number).replace(/\s/g, '\u00A0');
}
function formatStamp(values, fallbackNow = false) {
    const timestamps = values
        .map((value) => (value ? new Date(value).getTime() : Number.NaN))
        .filter((value) => Number.isFinite(value));
    const time = timestamps.length ? Math.max(...timestamps) : fallbackNow ? Date.now() : null;
    if (time === null)
        return null;
    return (new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
    }).format(new Date(time)) + ' МСК');
}
/**
 * «за 27 окт.» / «на 12:02 МСК» — на какой момент верна цена.
 * Пустая строка, если источник дату не назвал: подпись не додумывает её.
 */
function observationLabel(asOf) {
    if (!asOf)
        return '';
    const text = stringValue(asOf).trim();
    if (!text)
        return '';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text) ||
        /^\d{4}-\d{2}-\d{2}[T ]00:00(:00(\.0+)?)?(Z|[+-]00(:?00)?)$/.test(text);
    const parsed = new Date(dateOnly ? `${text.slice(0, 10)}T00:00:00Z` : text);
    if (Number.isNaN(parsed.getTime()))
        return '';
    if (dateOnly) {
        return `за ${new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'short',
            timeZone: 'Europe/Moscow',
        }).format(parsed)}`;
    }
    const clock = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
    return clock ? `на ${clock} МСК` : '';
}
function formatDateOnly(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return null;
    const date = new Date(`${value}T12:00:00+03:00`);
    if (Number.isNaN(date.getTime()))
        return null;
    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Moscow',
    }).format(date);
}
function moscowDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
async function fetchJsonWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        return (await response.json());
    }
    finally {
        clearTimeout(timer);
    }
}
async function fetchSupabase(path) {
    if (!SUPABASE_ANON_KEY)
        throw new Error('Missing public Supabase key');
    return fetchJsonWithTimeout(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Accept: 'application/json',
        },
    }, 1900);
}
async function fetchRussia() {
    try {
        const url = new URL('/api/russia-insights', SITE_ORIGIN).toString();
        const payload = await fetchJsonWithTimeout(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'MarketPulse-BriefCard/1.0 (+https://market-pulse1-eta.vercel.app/)',
            },
        }, 2400);
        return isRecord(payload) ? payload : null;
    }
    catch {
        return null;
    }
}
function settledValue(result, fallback) {
    return result.status === 'fulfilled' ? result.value : fallback;
}
function firstRow(value) {
    return Array.isArray(value) && isRecord(value[0]) ? value[0] : null;
}
function rows(value) {
    return Array.isArray(value) ? value.filter(isRecord) : [];
}
function lastSparkline(value) {
    if (!Array.isArray(value))
        return null;
    const values = value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    return values.length ? values[values.length - 1] : null;
}
function formatIndicatorValue(indicator) {
    const value = finiteNumber(indicator.value) ?? 0;
    const decimals = stringValue(indicator.unit) === '₽' ? 4 : 2;
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}
function formatSeriesValue(value, sample) {
    const match = stringValue(sample).match(/^([^\d\-−]*)(\d[\d,]*(?:\.(\d+))?)/);
    const prefix = match?.[1] ?? '';
    const decimals = Math.min(match?.[3]?.length ?? 2, 8);
    return formatPriceText(`${prefix}${value.toFixed(decimals)}`);
}
function sameObservationDay(a, b) {
    const left = stringValue(a).slice(0, 10);
    const right = stringValue(b).slice(0, 10);
    return Boolean(left && right && left === right);
}
async function buildBriefCard() {
    const today = moscowDateKey();
    const [assetsResult, snapshotResult, russia] = await Promise.all([
        Promise.allSettled([
            fetchSupabase('cached_assets?select=id,name,price,change,sparkline,as_of,source_label,updated_at&limit=20'),
        ]).then((items) => items[0]),
        Promise.allSettled([
            fetchSupabase(`daily_snapshots?select=date,captured_at,assets,russia&date=eq.${today}&limit=1`),
        ]).then((items) => items[0]),
        fetchRussia(),
    ]);
    const assetRows = rows(settledValue(assetsResult, []));
    const snapshotRow = firstRow(settledValue(snapshotResult, null));
    const liveAssets = assetRows.filter((asset) => {
        const id = stringValue(asset.id);
        return KNOWN_ASSET_IDS.includes(id) &&
            stringValue(asset.price) !== '—' &&
            finiteNumber(asset.change) !== null &&
            Array.isArray(asset.sparkline) &&
            asset.sparkline.length >= 2;
    });
    const russiaMarkets = rows(russia?.markets);
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
        .filter((indicator) => Boolean(indicator))
        .filter((indicator) => finiteNumber(indicator.changePct) !== null);

    const facts = [];
    const strongestGlobal = [...liveAssets].sort(
        (a, b) => Math.abs(finiteNumber(b.change) ?? 0) - Math.abs(finiteNumber(a.change) ?? 0),
    )[0] ?? null;
    if (strongestGlobal) {
        const observed = observationLabel(strongestGlobal.as_of);
        facts.push(
            `Наибольшее по модулю дневное изменение среди загруженных мировых рядов: ${stringValue(strongestGlobal.name)} ${formatPct(finiteNumber(strongestGlobal.change))}; последнее значение ${formatPriceText(strongestGlobal.price)}${strongestGlobal.source_label ? `; источник ${stringValue(strongestGlobal.source_label)}` : ''}${observed ? `; дата наблюдения ${observed}` : '; дата наблюдения не указана источником'}.`,
        );
    }
    const strongestRussia = [...russiaCandidates].sort(
        (a, b) => Math.abs(finiteNumber(b.changePct) ?? 0) - Math.abs(finiteNumber(a.changePct) ?? 0),
    )[0] ?? null;
    if (strongestRussia) {
        const observed = formatDateOnly(stringValue(strongestRussia.asOf)) ?? stringValue(strongestRussia.asOf);
        facts.push(
            `Наибольшее по модулю изменение среди выбранных российских рядов: ${stringValue(strongestRussia.name)} ${formatPct(finiteNumber(strongestRussia.changePct))}; значение ${formatIndicatorValue(strongestRussia)} ${stringValue(strongestRussia.unit)}${observed ? `; дата наблюдения ${observed}` : ''}${strongestRussia.provider ? `; источник ${stringValue(strongestRussia.provider)}` : ''}.`,
        );
    }
    if (facts.length === 0) {
        facts.push('Актуальные рыночные значения сейчас не получены.');
    }

    let changesTitle = null;
    const changes = [];
    let changesNote = null;
    let changesExtraNote = null;
    if (snapshotRow) {
        const capturedAt = stringValue(snapshotRow.captured_at);
        changesTitle = 'Сравнение с сохранённым снимком';
        const baselineStamp = formatStamp([capturedAt]);
        changesNote = baselineStamp ? `точка отсчёта: ${baselineStamp}` : null;
        const candidates = [];
        let comparable = 0;
        const unchangedNames = [];
        const baselineAssets = new Map(rows(snapshotRow.assets).map((asset) => [stringValue(asset.id), asset]));

        liveAssets.forEach((asset) => {
            const baseline = baselineAssets.get(stringValue(asset.id));
            if (!baseline) return;
            const oldName = stringValue(baseline.name).trim();
            const currentName = stringValue(asset.name).trim();
            if (oldName && currentName && oldName !== currentName) {
                unchangedNames.push(`${currentName} (изменилось название инструмента)`);
                return;
            }
            const base = finiteNumber(baseline.last);
            const current = lastSparkline(asset.sparkline);
            if (base === null || base <= 0 || current === null || current <= 0) return;
            comparable += 1;
            const deltaPct = (current / base - 1) * 100;
            if (Math.round(deltaPct * 100) === 0) return;
            const baselineDate = observationLabel(baseline.as_of);
            const currentDate = observationLabel(asset.as_of);
            const dateText = sameObservationDay(baseline.as_of, asset.as_of)
                ? (currentDate ? `; дата наблюдения ${currentDate}` : '')
                : `; дата в снимке ${baselineDate || 'не указана'}, сейчас ${currentDate || 'не указана'}`;
            candidates.push({
                magnitude: Math.abs(deltaPct),
                text: `${currentName || stringValue(asset.id)}: ${formatSeriesValue(current, asset.price)} против ${formatSeriesValue(base, stringValue(baseline.price) || stringValue(asset.price))} в снимке; ${formatPct(deltaPct)} = (последняя точка ряда / точка снимка − 1) × 100${asset.source_label ? `; источник ${stringValue(asset.source_label)}` : ''}${dateText}.`,
            });
        });

        const snapshotRussia = new Map(
            rows(isRecord(snapshotRow.russia) ? snapshotRow.russia.markets : null)
                .map((indicator) => [stringValue(indicator.id), indicator]),
        );
        russiaMarkets.forEach((indicator) => {
            const id = stringValue(indicator.id);
            const baseline = snapshotRussia.get(id);
            if (!baseline) return;
            const oldProvider = stringValue(baseline.provider);
            const currentProvider = stringValue(indicator.provider);
            if (oldProvider && currentProvider && oldProvider !== currentProvider) {
                unchangedNames.push(`${stringValue(indicator.name)} (сменился источник)`);
                return;
            }
            const base = finiteNumber(baseline.value);
            const current = finiteNumber(indicator.value);
            if (base === null || base <= 0 || current === null || current <= 0) return;
            comparable += 1;
            const deltaPct = (current / base - 1) * 100;
            if (Math.round(deltaPct * 100) === 0) return;
            const baselineDate = formatDateOnly(stringValue(baseline.asOf)) ?? stringValue(baseline.asOf);
            const currentDate = formatDateOnly(stringValue(indicator.asOf)) ?? stringValue(indicator.asOf);
            candidates.push({
                magnitude: Math.abs(deltaPct),
                text: `${stringValue(indicator.name)}: ${formatIndicatorValue(indicator)} ${stringValue(indicator.unit)} против ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(base)} ${stringValue(indicator.unit)} в снимке; ${formatPct(deltaPct)} = (текущее значение / значение в снимке − 1) × 100${currentProvider ? `; источник ${currentProvider}` : ''}; даты наблюдений ${baselineDate || 'не указана'} → ${currentDate || 'не указана'}.`,
            });
        });

        const ordered = candidates.sort((a, b) => b.magnitude - a.magnitude);
        if (comparable === 0) {
            changes.push('Нет сопоставимых актуальных значений для сравнения.');
        }
        else if (ordered.length === 0) {
            changes.push('В сопоставимых рядах изменение не отличается от нуля на точности вывода 0,01 %.');
        }
        else {
            changes.push(...ordered.slice(0, 6).map((item) => item.text));
        }
        const notes = [];
        if (ordered.length > 6) {
            notes.push(`Показано 6 из ${ordered.length} рядов с ненулевой дельтой на точности 0,01 %, отсортированных по абсолютной величине.`);
        }
        if (unchangedNames.length > 0) {
            notes.push(`Не сравнивались: ${[...new Set(unchangedNames)].join(', ')} — изменился инструмент или источник.`);
        }
        if (comparable > 0) {
            notes.push('Формула: (текущее значение / значение в снимке − 1) × 100; дельта округлена до 0,01 %.');
        }
        changesExtraNote = notes.length ? notes.join(' ') : null;
    }

    const stampValues = [
        ...assetRows.map((asset) => stringValue(asset.updated_at) || undefined),
        typeof russia?.generatedAt === 'string' ? russia.generatedAt : undefined,
    ];
    const sourceStamp = formatStamp(stampValues);
    const stampLabel = sourceStamp ? `обновлено ${sourceStamp}` : `сформировано ${formatStamp([], true)}`;
    return {
        stampLabel,
        facts: facts.slice(0, 2),
        changesTitle,
        changes,
        changesNote,
        changesExtraNote,
    };
}
function SectionTitle({ children, note }) {
    return (_jsxs("div", { style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: 14,
        }, children: [_jsx("div", { style: {
                    fontSize: 21,
                    fontWeight: 800,
                    letterSpacing: 2.4,
                    color: '#94a3b8',
                }, children: children }), note ? (_jsx("div", { style: { fontSize: 18, fontWeight: 700, color: '#7dd3fc' }, children: note })) : null] }));
}
function FactItem({ index, text }) {
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', width: '100%', marginTop: index ? 17 : 0 }, children: [_jsx("div", { style: {
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
                }, children: index + 1 }), _jsx("div", { style: { flex: 1, fontSize: 28, lineHeight: 1.3, color: '#dbeafe' }, children: text })] }));
}
function BulletItem({ text, first }) {
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', width: '100%', marginTop: first ? 0 : 14 }, children: [_jsx("div", { style: {
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: '#22d3ee',
                    marginRight: 15,
                    marginTop: 13,
                    flexShrink: 0,
                } }), _jsx("div", { style: { flex: 1, fontSize: 26, lineHeight: 1.3, color: '#cbd5e1' }, children: text })] }));
}
function BriefImage({ card }) {
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            width: 1080,
            minHeight: 920,
            padding: '54px 58px 46px',
            background: '#050914',
            backgroundImage: 'linear-gradient(145deg, #050914 0%, #081426 54%, #04111f 100%)',
            color: '#f8fafc',
            fontFamily: 'Inter',
        }, children: [
            _jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                }, children: [
                    _jsxs("div", { style: { display: 'flex', alignItems: 'center' }, children: [
                            _jsx("div", { style: {
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
                                }, children: "MP" }),
                            _jsxs("div", { style: { display: 'flex', flexDirection: 'column' }, children: [
                                    _jsx("div", { style: { fontSize: 30, fontWeight: 800, letterSpacing: -0.6 }, children: "Market Pulse" }),
                                    _jsx("div", { style: { fontSize: 19, color: '#94a3b8', marginTop: 3 }, children: "Мировые котировки · российские ряды" }),
                                ] }),
                        ] }),
                    _jsx("div", { style: {
                            display: 'flex',
                            padding: '10px 15px',
                            borderRadius: 999,
                            border: '1px solid #263449',
                            background: 'rgba(255,255,255,0.045)',
                            color: '#cbd5e1',
                            fontSize: 18,
                            fontWeight: 700,
                        }, children: card.stampLabel }),
                ] }),
            _jsx("div", { style: { display: 'flex', marginTop: 30, fontSize: 48, fontWeight: 800, letterSpacing: -1.3 }, children: "Рыночные значения и сравнения" }),
            _jsxs("div", { style: { display: 'flex', flexDirection: 'column', width: '100%', marginTop: 26 }, children: [
                    _jsx(SectionTitle, { children: "РЫНОЧНЫЕ ЗНАЧЕНИЯ" }),
                    card.facts.map((fact, index) => _jsx(FactItem, { index: index, text: fact }, index)),
                ] }),
            card.changesTitle ? (_jsxs("div", { style: {
                    display: 'flex',
                    boxSizing: 'border-box',
                    flexDirection: 'column',
                    width: '100%',
                    marginTop: 24,
                    padding: '22px 24px 24px',
                    borderRadius: 24,
                    border: '1px solid rgba(34,211,238,0.20)',
                    background: 'rgba(8,145,178,0.075)',
                }, children: [
                    _jsx(SectionTitle, { note: card.changesNote, children: card.changesTitle.toUpperCase() }),
                    card.changes.map((item, index) => _jsx(BulletItem, { text: item, first: index === 0 }, index)),
                    card.changesExtraNote ? (_jsx("div", { style: { display: 'flex', marginTop: 14, fontSize: 18, lineHeight: 1.35, color: '#7dd3fc' }, children: card.changesExtraNote })) : null,
                ] })) : null,
            _jsxs("div", { style: {
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    marginTop: 'auto',
                    paddingTop: 24,
                    borderTop: '1px solid #1e293b',
                }, children: [
                    _jsxs("div", { style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                        }, children: [
                            _jsx("div", { style: { fontSize: 21, fontWeight: 800, color: '#7dd3fc' }, children: "market-pulse1-eta.vercel.app" }),
                            _jsx("div", { style: { fontSize: 19, fontWeight: 700, color: '#cbd5e1' }, children: "Источники и расчёты без выводов о причинах" }),
                        ] }),
                    _jsx("div", { style: { display: 'flex', marginTop: 9, fontSize: 17, color: '#7c8da6' }, children: "Информационный обзор публичных рыночных данных. Не инвестиционная рекомендация." }),
                ] }),
        ] }));
}
/**
 * Рендер PNG из уже собранной карточки. Вынесено из обработчика, чтобы
 * карточку можно было отрисовать в тесте и измерить: до этого единственный
 * способ узнать, обрезался ли длинный бриф, — глазами в мессенджере.
 *
 * `onStage` сохраняет диагностику: снаружи бинарный ответ не посмотреть,
 * поэтому самопроверка зовёт адрес с ?diag=1 и получает стадию, на которой
 * всё сломалось.
 */
export async function renderBrief(card, onStage = () => { }) {
    onStage('renderers');
    const rendererPromise = Promise.all([import('satori'), import('@resvg/resvg-js')]);
    onStage('fonts');
    const fontsPromise = loadFonts();
    const [[{ default: satori }, { Resvg }], fonts] = await Promise.all([rendererPromise, fontsPromise]);
    onStage('satori');
    const svg = await satori(_jsx(BriefImage, { card: card }), {
        width: 1080,
        // 'auto' — satori измеряет содержимое сам; вместе с minHeight на
        // корне это даёт карточку по размеру текста, без пустот и обрезки.
        height: 'auto',
        fonts,
    });
    onStage('resvg');
    const png = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1080 },
    })
        .render()
        .asPng();
    return Buffer.from(png);
}

export default async function handler(req, res) {
    setBrowserNoStore(res);
    if (!['GET', 'HEAD'].includes(req.method ?? '')) {
        res.setHeader('Allow', 'GET, HEAD');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    // Стадия нужна, чтобы поломка не выглядела одинаково: «не загрузились
    // шрифты», «упал рендерер» и «упала отдача байтов» чинятся по-разному.
    // Самопроверка зовёт этот адрес с ?diag=1 и называет стадию в отчёте:
    // снаружи бинарный ответ не посмотреть, поэтому причина нужна изнутри.
    let stage = 'data';
    const wantsDiagnostics = new URL(req.url ?? '/', 'https://x').searchParams.get('diag') === '1';
    try {
        const card = await buildBriefCard();
        // Стадии рендера сообщает сам renderBrief: renderers → fonts → satori →
        // resvg. Здесь остаются только «данные» до вызова и «отдача» после.
        const body = await renderBrief(card, (next) => { stage = next; });
        stage = 'send';
        // Keep the existing Vercel edge TTL without allowing browser storage.
        setVercelCdnCache(res, 's-maxage=60, stale-while-revalidate=300');
        // asPng() отдаёт Uint8Array. Через res.end нужен именно Buffer с
        // известной длиной: тип тела здесь не угадывается, а размер известен
        // заранее, поэтому Content-Length ставится явно.
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': String(body.length),
            'Content-Disposition': 'attachment; filename="market-pulse-brief.png"',
        });
        res.end(body);
    }
    catch (error) {
        console.error('Brief image generation failed:', stage, error);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (wantsDiagnostics) {
            // Только стадия и текст ошибки рендерера: ни данных, ни ключей.
            // Сайт публичный, поэтому по умолчанию этого никто не видит, а
            // самопроверка получает причину вместо голого «HTTP 500».
            res.status(200).json({
                ok: false,
                stage,
                error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 400) : String(error).slice(0, 400),
            });
            return;
        }
        res.status(500).json({ error: 'Brief image generation failed', stage });
    }
}
