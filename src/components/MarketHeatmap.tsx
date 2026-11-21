import { useEffect, useId, useRef, useState } from "react";
import {
  ExternalLink,
  Globe,
  Grid2x2,
  Minus,
  Palette as PaletteIcon,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { moscowClock, observationLabel, observationLagLabel } from "@/lib/asOf";
import { formatCapPercent, formatPercent } from "@/lib/percent";
import { formatPriceText } from "@/lib/price";
import { AssetData } from "@/data/marketTypes";
import ExpandHint from "./ExpandHint";
import {
  fetchAssetPriceHistory,
  type AssetHistoryPoint,
  type AssetPriceHistory,
} from "@/data/assetPriceHistory";

/**
 * Временные визуальные шкалы насыщенности, в процентах изменения.
 *
 * Разные активы имеют разную обычную волатильность: движение USD/EUR на
 * 0.8% заметно сильнее, чем движение BTC на те же 0.8%. До появления
 * честного числового ряда цен это сознательно простая эвристика, а не
 * статистический z-score. Точный процент всегда напечатан на плитке.
 */
const SATURATION_CAPS: Record<string, number> = {
  "usd-eur": 0.8,
  sp500: 2,
  gold: 2.5,
  brent: 4,
  btc: 6,
};

type Rgb = [number, number, number];

/**
 * Горизонты цвета плиток. Интервалы считаются в сохранённых наблюдениях
 * источника (дневных закрытиях), а не в календарных днях: дневное закрытие
 * приходит позже календарного дня, и подпись обязана это честно отражать.
 */
const HORIZON_OPTIONS = [
  { id: "day", label: "День", accusative: "день", intervals: 1 },
  { id: "week", label: "Неделя", accusative: "неделю", intervals: 5 },
  { id: "month", label: "Месяц", accusative: "месяц", intervals: 29 },
] as const;

type HorizonId = (typeof HORIZON_OPTIONS)[number]["id"];
type PaletteId = "standard" | "colorblind";

const PALETTE_STORAGE_KEY = "market-pulse-heatmap-palette";

const NEUTRAL: Rgb = [30, 41, 59];

/**
 * Две палитры направления. Стандартная — красно-зелёная; альтернативная
 * сине-оранжевая различается при дейтеранопии/протанопии. Знак при этом
 * всегда продублирован текстом процента и иконкой тренда.
 */
const PALETTES: Record<
  PaletteId,
  {
    tilePositive: Rgb;
    tileNegative: Rgb;
    linePositive: string;
    lineNegative: string;
  }
> = {
  standard: {
    // Заливка темнее, чем «яркий» emerald/red: белый текст на плите держится
    // только на тёмном конце шкалы. Замер 09.11.2026: на прежнем [5, 150, 105]
    // белый даже без прозрачности давал 3,77:1, а подписи с text-white/65 —
    // 2,93:1. Здесь 5,48:1 и 6,54:1, подписи при /95 — не ниже 4,7:1.
    // Насыщенность по-прежнему кодирует величину, число рядом остаётся точным.
    tilePositive: [4, 120, 87],
    tileNegative: [185, 28, 28],
    linePositive: "#047857",
    lineNegative: "#b91c1c",
  },
  colorblind: {
    tilePositive: [3, 105, 161],
    tileNegative: [194, 65, 12],
    linePositive: "#0369a1",
    lineNegative: "#c2410c",
  },
};

function mix(from: Rgb, to: Rgb, amount: number): string {
  const value = from.map((channel, index) =>
    Math.round(channel + (to[index] - channel) * amount),
  );
  return `rgb(${value[0]}, ${value[1]}, ${value[2]})`;
}

function rgbString([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function horizonOption(id: HorizonId) {
  return (
    HORIZON_OPTIONS.find((option) => option.id === id) ?? HORIZON_OPTIONS[0]
  );
}

/**
 * Изменение за выбранный горизонт по спарклайну. Для дня предпочитаем
 * официальное поле change бэкенда; для недели/месяца считаем от точки
 * N наблюдений назад. Возвращает фактическое число интервалов, если ряд
 * короче запрошенного горизонта.
 */
function horizonChange(
  asset: AssetData,
  horizonId: HorizonId,
): { change: number | null; intervals: number } {
  const points = (asset.sparkline ?? []).filter((value) =>
    Number.isFinite(value),
  );
  if (horizonId === "day") {
    if (typeof asset.change === "number" && Number.isFinite(asset.change)) {
      return { change: asset.change, intervals: 1 };
    }
  }
  if (points.length < 2) return { change: null, intervals: 0 };
  const intervals = Math.min(
    horizonOption(horizonId).intervals,
    points.length - 1,
  );
  const base = points[points.length - 1 - intervals];
  const last = points[points.length - 1];
  if (!base) return { change: null, intervals };
  return { change: ((last - base) / base) * 100, intervals };
}

/**
 * Шкала насыщенности для горизонта: дневная шкала актива, растянутая на
 * √числа интервалов — грубое, но честно подписанное приближение того, как
 * растёт обычный разброс движения с длиной периода.
 */
function horizonCap(assetId: string, intervals: number): number {
  const dailyCap = SATURATION_CAPS[assetId] ?? 3;
  return dailyCap * Math.sqrt(Math.max(1, intervals));
}

function formatCap(cap: number): string {
  return formatCapPercent(cap);
}

function observationsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "наблюдение";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "наблюдения";
  return "наблюдений";
}

function tileColor(change: number, cap: number, paletteId: PaletteId): string {
  const palette = PALETTES[paletteId];
  const rawIntensity = Math.min(1, Math.abs(change) / cap);
  // Square-root easing makes small but real moves visible without
  // pretending that colour is a precise measurement. The number is exact.
  const intensity = Math.sqrt(rawIntensity);
  return mix(
    NEUTRAL,
    change >= 0 ? palette.tilePositive : palette.tileNegative,
    intensity,
  );
}

function directionalTextClass(value: number, paletteId: PaletteId): string {
  if (paletteId === "colorblind") {
    return value >= 0 ? "text-sky-800" : "text-orange-800";
  }
  return value >= 0 ? "text-emerald-800" : "text-red-800";
}

function readInitialPalette(): PaletteId {
  try {
    return window.localStorage.getItem(PALETTE_STORAGE_KEY) === "colorblind"
      ? "colorblind"
      : "standard";
  } catch {
    return "standard";
  }
}

function formatChange(change: number | null): string {
  return formatPercent(change);
}

/** Число для графика и статистики: точность зависит от масштаба актива. */
function formatValue(value: number): string {
  const abs = Math.abs(value);
  const digits = abs < 2 ? 4 : abs < 1000 ? 2 : 0;
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function daysWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "торговый день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "торговых дня";
  return "торговых дней";
}

const HISTORY_RANGE_OPTIONS = [30, 90, 180] as const;
type HistoryRangeDays = (typeof HISTORY_RANGE_OPTIONS)[number];

const DAY_MS = 86400000;

function dateMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function formatDateShort(dateOrMs: string | number): string {
  const value = typeof dateOrMs === "number" ? dateOrMs : dateMs(dateOrMs);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatDateLong(date: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateMs(date));
}

function calendarDaysWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "календарный день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14))
    return "календарных дня";
  return "календарных дней";
}

interface AssetSourceMeta {
  provider: string;
  series: string;
  url?: string;
  note: string;
}

/**
 * Откуда бэкенд берёт ряд для плитки. Показывается в панели актива,
 * чтобы посетитель мог проверить цифры у первоисточника.
 */
const ASSET_SOURCE_META: Record<string, AssetSourceMeta> = {
  "usd-eur": {
    provider: "Европейский центральный банк",
    series: "Референсный курс EUR (пересчёт в USD/EUR)",
    url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    note: "Дневные референсные курсы ЕЦБ.",
  },
  sp500: {
    provider: "Yahoo Finance",
    series: "^GSPC — индекс S&P 500, дневное закрытие",
    url: "https://finance.yahoo.com/quote/%5EGSPC",
    note: "Закрытие дня по индексу S&P 500. Последнее значение — закрытие последней завершённой сессии, поэтому может отставать от календарной даты на день-два.",
  },
  brent: {
    provider: "Yahoo Finance",
    series: "BZ=F — фьючерс Brent, $/баррель",
    url: "https://finance.yahoo.com/quote/BZ%3DF",
    note: "Это фьючерс ближайшего месяца на Brent (NYMEX), а не спот EIA. Спот и фьючерс расходятся на несколько долларов, поэтому плитка называет инструмент, а не только сорт нефти.",
  },
  gold: {
    provider: "gold-api.com",
    series: "XAU/USD — спот золота, наши дневные наблюдения",
    url: "https://gold-api.com",
    note: "История накапливается: последнее полученное нами наблюдение за завершённые UTC-сутки, не официальный close. Пропуски и прошлые дни не восстанавливаются.",
  },
  btc: {
    provider: "Kraken",
    series: "XBT/USD — дневные свечи",
    url: "https://www.kraken.com",
    note: "Крипторынок торгуется без выходных, поэтому этот ряд идёт и по субботам с воскресеньями.",
  },
};

/** Значения плитки печатаются одинаково: два знака, запятая, пробел между тысячами. */
function formatWindowValue(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function TileSparkline({ values }: { values: number[] }) {
  const points = values.filter((value) => Number.isFinite(value));

  if (points.length < 2) {
    return <div className="h-7 border-t border-white/20" aria-hidden="true" />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const coordinates = points.map((value, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = range === 0 ? 14 : 3 + ((max - value) / range) * 22;
    return { x, y };
  });
  const line = coordinates
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `0,28 ${line} 100,28`;
  const last = coordinates[coordinates.length - 1];

  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className="h-7 w-full overflow-visible"
      aria-hidden="true"
    >
      <polygon points={area} fill="rgba(255,255,255,0.14)" />
      <polyline
        points={line}
        fill="none"
        stroke="rgba(255,255,255,0.94)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last.x} cy={last.y} r="2.2" fill="white" />
    </svg>
  );
}

function HeatTile({
  asset,
  horizonId,
  paletteId,
  isFallback = false,
  isSelected = false,
  onSelect,
}: {
  asset: AssetData;
  horizonId: HorizonId;
  paletteId: PaletteId;
  isFallback?: boolean;
  isSelected?: boolean;
  onSelect: (id: string) => void;
}) {
  const horizon = horizonOption(horizonId);
  const { change: horizonChangeValue, intervals } = horizonChange(
    asset,
    horizonId,
  );
  const change = horizonChangeValue ?? 0;
  const cap = horizonCap(asset.id, intervals);
  const nearlyFlat = horizonChangeValue === null || Math.abs(change) < 0.005;
  const DirectionIcon = nearlyFlat
    ? Minus
    : change > 0
      ? TrendingUp
      : TrendingDown;
  const observed = observationLabel(asset.asOf);
  const asOf = moscowClock(asset.updatedAt);
  const provider = asset.sourceLabel || ASSET_SOURCE_META[asset.id]?.provider || '';
  const isYahooDaily = (asset.id === 'sp500' || asset.id === 'brent') && /yahoo finance/i.test(provider);
  const yahooLag = isYahooDaily ? observationLagLabel(asset.asOf) : '';
  const tooltip =
    `${asset.name}: ${formatPriceText(asset.price)}` +
    // Если источник сказал, на какой момент верна цена, показываем именно это.
    // Если нет — только время записи в кэш, и тогда «обновлено», а не «на».
    (observed ? `, цена ${observed}` : asOf ? `, обновлено ${asOf} МСК` : "") +
    `, изменение за горизонт «${horizon.label}» ` +
    `(${horizon.id === "day" ? (asset.id === 'gold' ? "к последнему нашему наблюдению завершённых UTC-суток" : "цена к предыдущему закрытию; не ход между двумя точками графика") : `${intervals} ${observationsWord(intervals)} источника`}): ` +
    `${horizonChangeValue === null ? "недостаточно данных" : formatChange(change)}. ` +
    `Насыщенность цвета нормирована к шкале ±${formatCap(cap)} для этого актива и горизонта. ` +
    "Белая мини-линия показывает форму последних сохранённых значений без оси цены и времени: точки стоят на равном расстоянии, поэтому пропуски в датах на ней не видны. " +
    "Площадь плитки одинакова для всех активов и ничего не кодирует. " +
    "Нажмите на плитку, чтобы развернуть график, статистику периода, диапазон сохранённых значений и источник данных." +
    (yahooLag ? ` Дата Yahoo: ${yahooLag}.` : "") +
    (isFallback
      ? " Внимание: свежая цена для этой плитки не получена, поэтому цена и изменение не показаны."
      : "");

  return (
    <>
      <button
        type="button"
        id={`heat-tile-${asset.id}`}
        title={tooltip}
        // Имя кнопки собирается из её же видимого текста, а не из aria-label:
        // длинное описание в aria-label не содержало видимых строк («шкала ±…»,
        // «Нажмите, чтобы развернуть»), и axe справедливо ругался
        // label-content-name-mismatch (WCAG 2.5.3 «Label in Name»).
        // Описание уходит в aria-describedby — так оно читается после имени.
        aria-describedby={`heat-help-${asset.id}`}
        aria-expanded={isSelected}
        aria-controls="asset-panel"
        onClick={() => onSelect(asset.id)}
        className={`flex min-h-[202px] w-full cursor-pointer flex-col rounded-xl border p-4 text-left text-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 ${
          isSelected
            ? "border-cyan-200/70 ring-2 ring-cyan-300"
            : "border-white/10"
        }`}
        style={{
          backgroundColor: isFallback
            ? "rgb(51, 65, 85)"
            : tileColor(change, cap, paletteId),
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-extrabold tracking-wide">
            {asset.name}
          </span>
          <DirectionIcon
            className="h-4 w-4 shrink-0 opacity-90"
            aria-hidden="true"
          />
        </div>
        {isFallback && (
          <span className="mt-2 inline-flex w-fit rounded-full border border-amber-200/35 bg-amber-300/15 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-amber-100">
            нет свежей цены
          </span>
        )}

        <div className="mt-3 text-xl font-extrabold tabular-nums leading-none">
          {isFallback ? "—" : formatPriceText(asset.price)}
        </div>

        {!isFallback && (observed || asset.updatedAt) && (
          <div className="mt-1 text-[11px] font-semibold text-white/95">
            {observed || `обновлено ${asOf} МСК`}
            {yahooLag && (
              <span data-testid="yahoo-observation-lag" className="mt-0.5 block text-white/85">
                {yahooLag}
              </span>
            )}
          </div>
        )}

        <div data-testid="heat-tile-change-scale" className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <span className="text-base font-extrabold tabular-nums">
            {isFallback || horizonChangeValue === null
              ? "—"
              : formatChange(nearlyFlat ? 0 : change)}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/95">
            шкала ±{formatCap(cap)}
          </span>
        </div>

        <div className="mt-auto pt-3">
          <TileSparkline values={asset.sparkline ?? []} />
        </div>

        <ExpandHint
          expanded={isSelected}
          closedLabel="Нажмите, чтобы развернуть"
          openLabel="Нажмите, чтобы свернуть"
          testId="heat-tile-expand-hint"
          className="mt-3 w-full justify-center border-white/40 bg-black/25 px-2 text-center leading-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
        />
      </button>
      <p id={`heat-help-${asset.id}`} className="sr-only">
        {tooltip}
      </p>
    </>
  );
}

/**
 * Резервный большой график панели. Он используется только если публичная
 * датированная история временно недоступна: ряд спарклайна не содержит
 * календарных дат, поэтому ось X честно подписана в торговых днях.
 */
function AssetChart({
  values,
  paletteId,
  highlightIndex = null,
  highlightLabel = "",
}: {
  values: number[];
  paletteId: PaletteId;
  highlightIndex?: number | null;
  highlightLabel?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = values.filter((value) => Number.isFinite(value));

  if (points.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-text-secondary">
        Недостаточно сохранённых значений для графика.
      </div>
    );
  }

  const width = 720;
  const height = 208;
  const padTop = 12;
  const padBottom = 20;
  const rawMin = Math.min(...points);
  const rawMax = Math.max(...points);
  const pad = (rawMax - rawMin) * 0.06 || Math.abs(rawMax) * 0.01 || 1;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min;
  const coords = points.map((value, index) => ({
    x: (index / (points.length - 1)) * width,
    y: padTop + ((max - value) / range) * (height - padTop - padBottom),
    value,
  }));
  const line = coords
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const first = points[0];
  const last = points[points.length - 1];
  const periodChange = first !== 0 ? ((last - first) / first) * 100 : 0;
  const palette = PALETTES[paletteId];
  const stroke =
    periodChange > 0.005
      ? palette.linePositive
      : periodChange < -0.005
        ? palette.lineNegative
        : "#cbd5e1";
  const highlight =
    highlightIndex !== null &&
    highlightIndex > 0 &&
    highlightIndex < coords.length
      ? coords[highlightIndex]
      : null;
  const active = activeIndex !== null ? coords[activeIndex] : null;
  const activePct = active ? (active.x / width) * 100 : 0;
  const activeOffset =
    activeIndex !== null ? points.length - 1 - activeIndex : 0;

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    setActiveIndex(Math.round(ratio * (points.length - 1)));
  };

  return (
    <div>
      <div
        className="relative h-52 w-full select-none"
        style={{ touchAction: "pan-y" }}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setActiveIndex(null)}
        role="img"
        aria-label={`График дневных значений: от ${formatValue(first)} до ${formatValue(last)}, изменение за период ${formatChange(periodChange)}`}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1="0"
              x2={width}
              y1={padTop + fraction * (height - padTop - padBottom)}
              y2={padTop + fraction * (height - padTop - padBottom)}
              stroke="rgba(148,163,184,0.22)"
              strokeWidth="1"
              strokeDasharray="4 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polygon points={area} fill={`url(#${gradientId})`} />
          <polyline
            points={line}
            fill="none"
            stroke={stroke}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {highlight && (
            <>
              <line
                x1={highlight.x}
                x2={highlight.x}
                y1={padTop}
                y2={height - padBottom}
                stroke="rgba(71,85,105,0.45)"
                strokeWidth="1.2"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={highlight.x}
                cy={highlight.y}
                r="3.2"
                fill="#ffffff"
                stroke={stroke}
                strokeWidth="1.6"
              />
            </>
          )}
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r="3.4"
            fill={stroke}
            stroke="#0A1424"
            strokeWidth="1.4"
          />
          {active && (
            <circle
              cx={active.x}
              cy={active.y}
              r="4.2"
              fill="#ffffff"
              stroke={stroke}
              strokeWidth="2"
            />
          )}
        </svg>

        <span className="absolute right-1 top-0 rounded-sm border border-slate-200 bg-white/95 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700 shadow-sm">
          max {formatValue(rawMax)}
        </span>
        <span className="absolute bottom-0 right-1 rounded-sm border border-slate-200 bg-white/95 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700 shadow-sm">
          min {formatValue(rawMin)}
        </span>

        {active && (
          <>
            <div
              className="absolute bottom-0 top-0 w-px bg-slate-500/50"
              style={{ left: `${activePct}%` }}
              aria-hidden="true"
            />
            <div
              className="absolute top-1 whitespace-nowrap rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-bold tabular-nums text-text-primary shadow-sm"
              style={{
                left: `${activePct}%`,
                transform: `translateX(${activePct < 18 ? "0%" : activePct > 82 ? "-100%" : "-50%"})`,
              }}
            >
              {formatValue(active.value)}
              <span className="ml-1.5 font-semibold text-text-secondary">
                {activeOffset === 0
                  ? "последнее закрытие"
                  : `${activeOffset} ${daysWord(activeOffset)} назад`}
              </span>
            </div>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
        Дневные наблюдения · последние {points.length} {daysWord(points.length)} ·
        наведите курсор или коснитесь графика, чтобы увидеть значения.
        {highlight && highlightLabel
          ? ` Пунктир — начало выбранного горизонта (${highlightLabel}).`
          : ""}{" "}
        Датированная история временно недоступна, поэтому календарные даты для
        этих точек не показываются.
      </p>
    </div>
  );
}

/**
 * Stage 6 dated chart. The x-coordinate is linear in calendar time, weekends
 * and publication gaps keep their real width, and the tooltip prints the
 * exact source observation date rather than "N points ago".
 */
function DatedAssetChart({
  points,
  domainStartMs,
  domainEndMs,
  paletteId,
}: {
  points: AssetHistoryPoint[];
  domainStartMs: number;
  domainEndMs: number;
  paletteId: PaletteId;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length < 2 || domainEndMs <= domainStartMs) {
    return (
      <div className="flex h-52 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-text-secondary">
        Недостаточно датированных значений для выбранного периода.
      </div>
    );
  }

  const width = 720;
  const height = 208;
  const padTop = 12;
  const padBottom = 20;
  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.06 || Math.abs(rawMax) * 0.01 || 1;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min;
  const domainRange = domainEndMs - domainStartMs;
  const coords = points.map((point) => {
    const time = dateMs(point.date);
    return {
      ...point,
      time,
      x: ((time - domainStartMs) / domainRange) * width,
      y: padTop + ((max - point.value) / range) * (height - padTop - padBottom),
    };
  });
  const line = coords
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${coords[0].x.toFixed(1)},${height} ${line} ${coords[coords.length - 1].x.toFixed(1)},${height}`;
  const first = points[0];
  const last = points[points.length - 1];
  const periodChange =
    first.value !== 0 ? ((last.value - first.value) / first.value) * 100 : 0;
  const palette = PALETTES[paletteId];
  const stroke =
    periodChange > 0.005
      ? palette.linePositive
      : periodChange < -0.005
        ? palette.lineNegative
        : "#cbd5e1";
  const active = activeIndex !== null ? coords[activeIndex] : null;
  const activePct = active ? (active.x / width) * 100 : 0;
  const tickFractions = [0, 1 / 3, 2 / 3, 1];

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    const targetTime = domainStartMs + ratio * domainRange;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    coords.forEach((point, index) => {
      const distance = Math.abs(point.time - targetTime);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex(nearestIndex);
  };

  return (
    <div>
      <div
        className="relative h-52 w-full select-none"
        style={{ touchAction: "pan-y" }}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setActiveIndex(null)}
        role="img"
        aria-label={`Датированный график дневных значений с ${formatDateLong(first.date)} по ${formatDateLong(last.date)}: от ${formatValue(first.value)} до ${formatValue(last.value)}, изменение за период ${formatChange(periodChange)}`}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={`h-${fraction}`}
              x1="0"
              x2={width}
              y1={padTop + fraction * (height - padTop - padBottom)}
              y2={padTop + fraction * (height - padTop - padBottom)}
              stroke="rgba(148,163,184,0.22)"
              strokeWidth="1"
              strokeDasharray="4 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {tickFractions.map((fraction) => (
            <line
              key={`v-${fraction}`}
              x1={fraction * width}
              x2={fraction * width}
              y1={padTop}
              y2={height - padBottom}
              stroke="rgba(148,163,184,0.15)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polygon points={area} fill={`url(#${gradientId})`} />
          <polyline
            points={line}
            fill="none"
            stroke={stroke}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r="3.4"
            fill={stroke}
            stroke="#0A1424"
            strokeWidth="1.4"
          />
          {active && (
            <circle
              cx={active.x}
              cy={active.y}
              r="4.2"
              fill="#ffffff"
              stroke={stroke}
              strokeWidth="2"
            />
          )}
        </svg>

        <span className="absolute right-1 top-0 rounded-sm border border-slate-200 bg-white/95 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700 shadow-sm">
          max {formatValue(rawMax)}
        </span>
        <span className="absolute bottom-0 right-1 rounded-sm border border-slate-200 bg-white/95 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700 shadow-sm">
          min {formatValue(rawMin)}
        </span>

        {active && (
          <>
            <div
              className="absolute bottom-0 top-0 w-px bg-slate-500/50"
              style={{ left: `${activePct}%` }}
              aria-hidden="true"
            />
            <div
              data-testid="dated-chart-tooltip"
              className="absolute top-1 whitespace-nowrap rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-bold tabular-nums text-text-primary shadow-sm"
              style={{
                left: `${activePct}%`,
                transform: `translateX(${activePct < 18 ? "0%" : activePct > 82 ? "-100%" : "-50%"})`,
              }}
            >
              {formatValue(active.value)}
              <span className="ml-1.5 font-semibold text-text-secondary">
                {formatDateLong(active.date)}
              </span>
            </div>
          </>
        )}
      </div>

      <div
        className="relative mt-1 h-5 text-[11px] font-semibold tabular-nums text-text-secondary"
        aria-hidden="true"
      >
        {tickFractions.map((fraction) => {
          const tickMs = domainStartMs + fraction * domainRange;
          return (
            <span
              key={fraction}
              className="absolute top-0 whitespace-nowrap"
              style={{
                left: `${fraction * 100}%`,
                transform: `translateX(${fraction === 0 ? "0%" : fraction === 1 ? "-100%" : "-50%"})`,
              }}
            >
              {new Intl.DateTimeFormat("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                timeZone: "UTC",
              }).format(tickMs)}
            </span>
          );
        })}
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
        Дневные наблюдения · {points.length} {observationsWord(points.length)} ·{" "}
        {formatDateLong(first.date)} — {formatDateLong(last.date)}. Ось X
        линейна по календарным датам источника; наведите курсор или коснитесь
        графика, чтобы увидеть точную дату и значение.
      </p>
    </div>
  );
}

function AssetPanel({
  asset,
  horizonId,
  paletteId,
  isFallback,
  onClose,
}: {
  asset: AssetData;
  horizonId: HorizonId;
  paletteId: PaletteId;
  isFallback: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const points = (asset.sparkline ?? []).filter((value) =>
    Number.isFinite(value),
  );
  const last = points[points.length - 1];
  const horizon = horizonOption(horizonId);
  const { change: selectedChange, intervals: selectedIntervals } =
    horizonChange(asset, horizonId);
  const highlightIndex =
    points.length >= 2 && selectedIntervals > 0
      ? points.length - 1 - selectedIntervals
      : null;
  const meta = ASSET_SOURCE_META[asset.id];
  const windowValues = points.slice(-30);
  const windowMin = windowValues.length > 0 ? Math.min(...windowValues) : null;
  const windowMax = windowValues.length > 0 ? Math.max(...windowValues) : null;
  const windowPositionPct =
    windowMin !== null &&
    windowMax !== null &&
    last !== undefined &&
    windowMax > windowMin
      ? Math.round(((last - windowMin) / (windowMax - windowMin)) * 100)
      : 0;
  const [historyRangeDays, setHistoryRangeDays] =
    useState<HistoryRangeDays>(90);
  const [historyState, setHistoryState] = useState<{
    assetId: string;
    status: "loading" | "ready" | "error";
    history: AssetPriceHistory | null;
  }>({ assetId: asset.id, status: "loading", history: null });

  useEffect(() => {
    let cancelled = false;
    setHistoryRangeDays(90);
    setHistoryState({ assetId: asset.id, status: "loading", history: null });
    // Gold uses exactly the tile's new-source cache; never a second, divergent history.
    const goldPoints = (asset.sparkDates ?? []).map((date, index) => ({ date, value: asset.sparkline[index] }));
    const request = asset.id === 'gold'
      ? Promise.resolve(goldPoints.length >= 2 ? {
          assetId: asset.id, instrumentId: 'gold_api_xau_observed_daily', provider: 'gold-api.com · наши наблюдения UTC',
          providerSymbol: 'XAU', points: goldPoints, unfinishedDayExcluded: true,
        } : null)
      : fetchAssetPriceHistory(asset.id);
    request.then((history) => {
      if (cancelled) return;
      setHistoryState({
        assetId: asset.id,
        status: history ? "ready" : "error",
        history,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.sparkDates, asset.sparkline]);

  const history =
    historyState.assetId === asset.id && historyState.status === "ready"
      ? historyState.history
      : null;
  const historyLoading =
    historyState.assetId !== asset.id || historyState.status === "loading";
  const historyPoints = history?.points ?? [];
  const lastHistoryPoint = historyPoints[historyPoints.length - 1] ?? null;
  const historyDomainEndMs = lastHistoryPoint
    ? dateMs(lastHistoryPoint.date)
    : 0;
  const historyDomainStartMs = historyDomainEndMs - historyRangeDays * DAY_MS;
  const visibleHistoryPoints = historyPoints.filter((point) => {
    const time = dateMs(point.date);
    return time >= historyDomainStartMs && time <= historyDomainEndMs;
  });
  const firstVisibleHistoryPoint = visibleHistoryPoints[0] ?? null;
  const lastVisibleHistoryPoint =
    visibleHistoryPoints[visibleHistoryPoints.length - 1] ?? null;
  const historyRangeChange =
    firstVisibleHistoryPoint &&
    lastVisibleHistoryPoint &&
    firstVisibleHistoryPoint.value !== 0
      ? ((lastVisibleHistoryPoint.value - firstVisibleHistoryPoint.value) /
          firstVisibleHistoryPoint.value) *
        100
      : null;
  const minHistoryPoint = visibleHistoryPoints.reduce<AssetHistoryPoint | null>(
    (best, point) => (best === null || point.value < best.value ? point : best),
    null,
  );
  const maxHistoryPoint = visibleHistoryPoints.reduce<AssetHistoryPoint | null>(
    (best, point) => (best === null || point.value > best.value ? point : best),
    null,
  );
  const isHistoryPartial = Boolean(
    historyPoints[0] && dateMs(historyPoints[0].date) > historyDomainStartMs,
  );

  // Ровно те точки, из которых нарисована линия: их можно сверить с
  // первоисточником по дате. Больше тридцати строк не показываем, чтобы
  // раскрытый список не превращался в полотно.
  const checkRows = visibleHistoryPoints.slice(-30).map((point) => {
    const index = visibleHistoryPoints.findIndex(
      (item) => item.date === point.date,
    );
    const previous = index > 0 ? visibleHistoryPoints[index - 1] : null;
    const delta =
      previous && previous.value !== 0
        ? ((point.value - previous.value) / previous.value) * 100
        : null;
    return { point, delta };
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [asset.id]);

  return (
    <div
      ref={panelRef}
      id="asset-panel"
      role="region"
      aria-label={`Подробно об активе ${asset.name}`}
      className="mt-3 animate-fade-in rounded-xl border border-cyan-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-extrabold tracking-tight text-text-primary">
              {asset.name}
            </h4>
            {isFallback && (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-amber-900">
                нет свежей цены
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            Последнее значение:{" "}
            <span className="font-extrabold tabular-nums text-text-primary">
              {formatPriceText(asset.price)}
            </span>
            {!isFallback && (asset.asOf || asset.updatedAt) && (
              <span className="text-text-secondary">
                {" "}
                (
                {observationLabel(asset.asOf) ||
                  `обновлено ${moscowClock(asset.updatedAt)} МСК`}
                )
                {/* Кто ответил за число. Источник слота выбирается вручную,
                    поэтому площадка подписывается рядом с ценой: иначе цена
                    одной биржи выглядела бы как цена другой. */}
                {asset.sourceLabel ? ` · ${asset.sourceLabel}` : ''}
              </span>
            )}
            {" · "}
            <span
              className={`font-extrabold tabular-nums ${asset.change === null ? 'text-text-secondary' : directionalTextClass(asset.change, paletteId)}`}
            >
              {isFallback ? "—" : formatChange(asset.change)}
            </span>{" "}
            {asset.id === 'gold' ? 'к последнему наблюдению завершённых UTC-суток' : 'за день'}
          </p>
          {asset.id === 'gold' && <p className="mt-1 text-xs text-text-secondary">{ASSET_SOURCE_META.gold.note}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Свернуть панель актива"
          className="ml-auto inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-extrabold text-cyan-900 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Свернуть
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {isFallback && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          Свежая цена по этому активу не получена, поэтому цена и изменение не
          показаны: подставлять вместо них сохранённое или выдуманное число мы
          не будем.
        </p>
      )}

      <div className="mt-4">
        {historyLoading ? (
          <div
            className="flex h-52 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-center text-sm text-text-secondary"
            role="status"
          >
            Загружаем датированную историю дневных значений…
          </div>
        ) : history && lastHistoryPoint ? (
          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <div className="min-w-0 flex-1">
                <h5 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
                  История с датами
                </h5>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  Ряд:{" "}
                  <span className="font-bold text-text-primary">
                    {history.provider}
                  </span>
                  {history.providerSymbol ? ` · ${history.providerSymbol}` : ""}
                  {" · "}последнее наблюдение:{" "}
                  <time
                    dateTime={lastHistoryPoint.date}
                    className="font-bold text-text-primary"
                  >
                    {formatDateLong(lastHistoryPoint.date)}
                  </time>{" "}
                  ({observationLagLabel(lastHistoryPoint.date)}).
                </p>
              </div>
              <div
                role="group"
                aria-label="Период датированного графика в календарных днях"
                className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 p-1"
              >
                {HISTORY_RANGE_OPTIONS.map((days) => (
                  <button
                    key={days}
                    id={`asset-history-range-${days}`}
                    type="button"
                    aria-pressed={historyRangeDays === days}
                    onClick={() => setHistoryRangeDays(days)}
                    className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-extrabold tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                      historyRangeDays === days
                        ? "bg-cyan-300 text-[#071120]"
                        : "text-text-secondary hover:bg-slate-100 hover:text-text-primary"
                    }`}
                  >
                    {days} дн.
                  </button>
                ))}
              </div>
            </div>

            <DatedAssetChart
              key={`${asset.id}-${historyRangeDays}-${firstVisibleHistoryPoint?.date ?? ""}-${lastVisibleHistoryPoint?.date ?? ""}`}
              points={visibleHistoryPoints}
              domainStartMs={historyDomainStartMs}
              domainEndMs={historyDomainEndMs}
              paletteId={paletteId}
            />

            {history.unfinishedDayExcluded && (
              <p className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] leading-relaxed text-cyan-900">
                Сегодняшний день ещё не закрыт, поэтому последняя точка графика
                — наблюдение за {formatDateLong(lastHistoryPoint.date)}. Текущая цена
                дня показана на плитке выше и меняется в течение суток; на
                график она не подмешивается, чтобы закрытый и незакрытый день не
                сравнивались как одно и то же.
              </p>
            )}

            {isHistoryPartial && historyPoints[0] && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                Доступная датированная история начинается{" "}
                {formatDateLong(historyPoints[0].date)}, поэтому выбранный
                диапазон {historyRangeDays} {calendarDaysWord(historyRangeDays)}{" "}
                показан частично. Более ранних значений в этот ряд не
                подмешивали.
              </p>
            )}
          </div>
        ) : asset.id === 'gold' ? (
          <p className="text-sm text-text-secondary">История gold-api.com накапливается с момента перехода. Для линии нужны два завершённых UTC-дня; прошлые значения не подставляются.</p>
        ) : (
          <AssetChart
            values={points}
            paletteId={paletteId}
            highlightIndex={highlightIndex}
            highlightLabel={`${horizon.label.toLowerCase()}: последние ${selectedIntervals} ${observationsWord(selectedIntervals)}`}
          />
        )}
      </div>

      {history &&
      visibleHistoryPoints.length >= 2 &&
      firstVisibleHistoryPoint &&
      lastVisibleHistoryPoint &&
      minHistoryPoint &&
      maxHistoryPoint ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Изменение периода ·{" "}
              {formatDateShort(firstVisibleHistoryPoint.date)}–
              {formatDateShort(lastVisibleHistoryPoint.date)}
            </dt>
            <dd
              className={`mt-0.5 text-base font-extrabold tabular-nums ${directionalTextClass(historyRangeChange ?? 0, paletteId)}`}
            >
              {historyRangeChange !== null
                ? formatChange(historyRangeChange)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Минимум · {formatDateShort(minHistoryPoint.date)}
            </dt>
            <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
              {formatValue(minHistoryPoint.value)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Максимум · {formatDateShort(maxHistoryPoint.date)}
            </dt>
            <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
              {formatValue(maxHistoryPoint.value)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Последнее · {formatDateShort(lastVisibleHistoryPoint.date)}
            </dt>
            <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
              {formatValue(lastVisibleHistoryPoint.value)}
            </dd>
          </div>
        </dl>
      ) : (
        !historyLoading &&
        points.length >= 2 && (
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                За {horizon.accusative} · {selectedIntervals}{" "}
                {observationsWord(selectedIntervals)}
              </dt>
              <dd
                className={`mt-0.5 text-base font-extrabold tabular-nums ${directionalTextClass(selectedChange ?? 0, paletteId)}`}
              >
                {selectedChange !== null ? formatChange(selectedChange) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                Минимум · {points.length} {daysWord(points.length)}
              </dt>
              <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
                {formatValue(Math.min(...points))}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                Максимум · {points.length} {daysWord(points.length)}
              </dt>
              <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
                {formatValue(Math.max(...points))}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                Последнее дневное наблюдение
              </dt>
              <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
                {formatValue(last)}
              </dd>
            </div>
          </dl>
        )
      )}

      {history && visibleHistoryPoints.length > 0 && (
        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="min-h-6 cursor-pointer py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
            Проверить данные · {visibleHistoryPoints.length}{" "}
            {observationsWord(visibleHistoryPoints.length)}
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
            Это ровно те точки, из которых построена линия выше: ряд{" "}
            <span className="font-bold text-text-primary">
              {history.providerSymbol}
            </span>{" "}
            ({history.instrumentId}), источник — {history.provider}. Каждую
            строку можно сверить с первоисточником по дате. Сегодняшний
            незакрытый день в список не входит.
          </p>
          <div className="mt-2 max-h-56 overflow-auto focus-visible:outline-2 focus-visible:outline-cyan-600" tabIndex={0} role="region" aria-label={`Таблица наблюдений ${asset.name}`}>
            <table className="w-full text-left text-[11px] tabular-nums">
              <thead className="sticky top-0 bg-slate-50 text-text-secondary">
                <tr>
                  <th scope="col" className="py-1 pr-2 font-bold">
                    Дата
                  </th>
                  <th scope="col" className="py-1 pr-2 font-bold">
                    Наблюдение
                  </th>
                  <th scope="col" className="py-1 font-bold">
                    К предыдущему
                  </th>
                </tr>
              </thead>
              <tbody>
                {checkRows.map(({ point, delta }) => (
                  <tr key={point.date} className="border-t border-slate-200">
                    <td className="py-1 pr-2 text-text-secondary">
                      {formatDateShort(point.date)}
                    </td>
                    <td className="py-1 pr-2 font-bold text-text-primary">
                      {formatValue(point.value)}
                    </td>
                    <td
                      className={`py-1 font-bold ${
                        delta === null
                          ? "text-text-secondary"
                          : directionalTextClass(delta, paletteId)
                      }`}
                    >
                      {delta === null ? "—" : formatChange(delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleHistoryPoints.length > 30 && (
            <p className="mt-2 text-[11px] text-text-secondary">
              Показаны последние 30 записей из {visibleHistoryPoints.length}:
              весь диапазон целиком на графике, здесь — конец ряда.
            </p>
          )}
        </details>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section
          aria-label="Диапазон сохранённых значений"
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <h5 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
            Диапазон 30 значений
          </h5>
          {windowValues.length >= 2 &&
          windowMin !== null &&
          windowMax !== null &&
          last !== undefined ? (
            <>
              <p className="mt-2 text-sm font-bold text-text-primary">
                от {formatWindowValue(windowMin)} до{" "}
                {formatWindowValue(windowMax)}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                последнее значение {formatWindowValue(last)} — на{" "}
                {windowPositionPct}% выше минимума окна
              </p>
              <div
                className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-cyan-700"
                  style={{ width: `${windowPositionPct}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
                Это факт по сохранённым закрытиям: где цена стоит внутри своего
                окна. Ожиданий и рекомендаций здесь нет — выдача прогнозов
                остановлена 31 октября 2026 года.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Сохранённых значений пока меньше двух, поэтому диапазон не
              считается.
            </p>
          )}
        </section>

        <section
          aria-label="Источник данных"
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <h5 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
            Источник данных
          </h5>
          {meta ? (
            <div className="mt-2">
              <p className="text-sm font-bold text-text-primary">
                {meta.provider}
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {meta.series}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {meta.note}
              </p>
              {meta.url && (
                <a
                  href={meta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-blue-800 transition-colors hover:border-cyan-300 hover:bg-cyan-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-700"
                >
                  Открыть первоисточник
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Ряд хранится в кэше Market Pulse и обновляется серверным писателем
              цен.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">
            Это дневные закрытия, а не поток котировок в реальном времени.
          </p>
        </section>
      </div>
    </div>
  );
}

function SkeletonTiles() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      aria-label="Загрузка тепловой карты"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="min-h-[202px] animate-pulse rounded-xl border border-border-subtle bg-bg-card p-4"
        >
          <div className="h-4 w-20 rounded-sm bg-slate-200" />
          <div className="mt-5 h-6 w-24 rounded-sm bg-slate-200" />
          <div className="mt-4 h-5 w-16 rounded-sm bg-slate-200" />
          <div className="mt-5 h-7 rounded-sm bg-slate-200" />
          <div className="mt-3 h-7 rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function readInitialAssetId(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("asset");
  } catch {
    return null;
  }
}

export default function MarketHeatmap({
  assets,
  loading,
  fallbackAssetIds = [],
}: {
  assets: AssetData[];
  loading: boolean;
  fallbackAssetIds?: string[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    readInitialAssetId,
  );
  const [horizonId, setHorizonId] = useState<HorizonId>("day");
  const [paletteId, setPaletteId] = useState<PaletteId>(readInitialPalette);

  // Палитра — функциональная настройка доступности. Хранится только
  // локально в браузере и никуда не отправляется.
  useEffect(() => {
    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, paletteId);
    } catch {
      // Недоступное хранилище не должно ломать карту.
    }
  }, [paletteId]);

  const selectedAsset =
    !loading && selectedId
      ? (assets.find((asset) => asset.id === selectedId) ?? null)
      : null;

  // Синхронизируем выбор с URL (?asset=brent), чтобы панелью можно было
  // делиться ссылкой, не ломая якорную навигацию по разделам.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (selectedId) url.searchParams.set("asset", selectedId);
      else url.searchParams.delete("asset");
      window.history.replaceState(null, "", url);
    } catch {
      // URL-синхронизация не критична для работы панели.
    }
  }, [selectedId]);

  // Esc закрывает панель и возвращает фокус на плитку.
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
        document.getElementById(`heat-tile-${selectedId}`)?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId((previous) => (previous === id ? null : id));
  };

  const handleClose = () => {
    if (selectedId) document.getElementById(`heat-tile-${selectedId}`)?.focus();
    setSelectedId(null);
  };

  return (
    <div className="relative overflow-hidden rounded-xl2 border border-cyan-200 bg-white/95 p-4 shadow-sm sm:p-5">
      <div
        className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-blue-500 via-cyan-400 to-emerald-500"
        aria-hidden="true"
      />
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-text-primary">
            <Grid2x2 className="h-5 w-5 text-cyan-800" />
            Тепловая карта мировых рынков
          </h3>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-cyan-900">
            <Globe className="h-3.5 w-3.5" />
            Глобальный контур
          </span>
        </div>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-text-secondary">
          Внешние ориентиры, не российские активы. Цвет — знак изменения,
          насыщенность — его сила относительно обычной шкалы конкретного актива,
          белая линия — форма последних сохранённых дневных значений. Нажмите на
          плитку: под картой откроются график, статистика периода и источник.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Горизонт изменения на тепловой карте"
          className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1"
        >
          {HORIZON_OPTIONS.map((option) => (
            <button
              key={option.id}
              id={`heat-horizon-${option.id}`}
              type="button"
              disabled={loading}
              aria-pressed={horizonId === option.id}
              onClick={() => setHorizonId(option.id)}
              className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 ${
                horizonId === option.id
                  ? "bg-cyan-300 text-[#071120]"
                  : "text-text-secondary hover:bg-slate-100 hover:text-text-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          id="heat-palette-toggle"
          type="button"
          disabled={loading}
          aria-pressed={paletteId === "colorblind"}
          title={
            paletteId === "colorblind"
              ? "Включена сине-оранжевая палитра: синий — рост, оранжевый — снижение"
              : "Включить сине-оранжевую палитру для дальтоников"
          }
          onClick={() =>
            setPaletteId((previous) =>
              previous === "colorblind" ? "standard" : "colorblind",
            )
          }
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 ${
            paletteId === "colorblind"
              ? "border-sky-200 bg-sky-50 text-sky-900"
              : "border-slate-200 bg-white text-text-secondary hover:bg-slate-100 hover:text-text-primary"
          }`}
        >
          <PaletteIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Палитра для дальтоников
        </button>
        <p className="w-full text-[11px] leading-relaxed text-text-secondary sm:w-auto sm:flex-1">
          День — изменение цены к предыдущему закрытию, а не разность двух точек графика.
          Неделя — пять переходов между сохранёнными закрытиями, месяц — до 29.
          Это наблюдения, а не обязательно календарные дни; текущая цена может отличаться от конца ряда.
        </p>
      </div>

      {loading ? (
        <SkeletonTiles />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {assets.map((asset) => (
              <HeatTile
                key={asset.id}
                asset={asset}
                horizonId={horizonId}
                paletteId={paletteId}
                isFallback={fallbackAssetIds.includes(asset.id)}
                isSelected={selectedId === asset.id}
                onSelect={handleSelect}
              />
            ))}
          </div>
          {selectedAsset && (
            <AssetPanel
              asset={selectedAsset}
              horizonId={horizonId}
              paletteId={paletteId}
              isFallback={fallbackAssetIds.includes(selectedAsset.id)}
              onClose={handleClose}
            />
          )}
        </>
      )}

      <div className="mt-4">
        <div
          className="h-2 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${rgbString(PALETTES[paletteId].tileNegative)} 0%, ${rgbString(NEUTRAL)} 50%, ${rgbString(PALETTES[paletteId].tilePositive)} 100%)`,
          }}
          aria-hidden="true"
        />
        <div className="mt-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          <span>сильнее вниз</span>
          <span>0%</span>
          <span>сильнее вверх</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-text-secondary">
          {paletteId === "colorblind"
            ? "В сине-оранжевой палитре синий означает рост, оранжевый — снижение; знак всегда продублирован процентом и стрелкой. "
            : ""}
          Площадь плиток одинакова: это не капитализация, не объём торгов и не
          важность актива. Сравнивайте по напечатанному проценту — одинаковая
          насыщенность у разных активов не значит одинаковое движение. У
          мини-линии нет осей, её наклон между активами не сравнить.
        </p>
      </div>
    </div>
  );
}
