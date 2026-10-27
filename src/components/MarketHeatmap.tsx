import { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  Globe,
  Grid2x2,
  Minus,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { AssetData, ForecastData } from '@/data/mockData';
import { fetchLiveForecasts } from '@/data/liveForecasts';

/**
 * Временные визуальные шкалы насыщенности, в процентах изменения.
 *
 * Разные активы имеют разную обычную волатильность: движение USD/EUR на
 * 0.8% заметно сильнее, чем движение BTC на те же 0.8%. До появления
 * честного числового ряда цен это сознательно простая эвристика, а не
 * статистический z-score. Точный процент всегда напечатан на плитке.
 */
const SATURATION_CAPS: Record<string, number> = {
  'usd-eur': 0.8,
  sp500: 2,
  gold: 2.5,
  brent: 4,
  btc: 6,
};

type Rgb = [number, number, number];

const NEUTRAL: Rgb = [30, 41, 59];
const POSITIVE: Rgb = [5, 150, 105];
const NEGATIVE: Rgb = [220, 38, 38];

function mix(from: Rgb, to: Rgb, amount: number): string {
  const value = from.map((channel, index) =>
    Math.round(channel + (to[index] - channel) * amount),
  );
  return `rgb(${value[0]}, ${value[1]}, ${value[2]})`;
}

function tileColor(asset: AssetData): string {
  const cap = SATURATION_CAPS[asset.id] ?? 3;
  const rawIntensity = Math.min(1, Math.abs(asset.change ?? 0) / cap);
  // Square-root easing makes small but real moves visible without
  // pretending that colour is a precise measurement. The number is exact.
  const intensity = Math.sqrt(rawIntensity);
  return mix(NEUTRAL, asset.change >= 0 ? POSITIVE : NEGATIVE, intensity);
}

function formatChange(change: number): string {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

/** Число для графика и статистики: точность зависит от масштаба актива. */
function formatValue(value: number): string {
  const abs = Math.abs(value);
  const digits = abs < 2 ? 4 : abs < 1000 ? 2 : 0;
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function daysWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'торговый день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'торговых дня';
  return 'торговых дней';
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
  'usd-eur': {
    provider: 'Европейский центральный банк',
    series: 'Референсный курс EUR (пересчёт в USD/EUR)',
    url: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
    note: 'Дневные референсные курсы ЕЦБ.',
  },
  sp500: {
    provider: 'FRED (ФРС Сент-Луиса)',
    series: 'SP500 — индекс S&P 500',
    url: 'https://fred.stlouisfed.org/series/SP500',
    note: 'FRED публикует закрытия с задержкой в несколько дней, поэтому последнее значение может отставать от календарной даты.',
  },
  brent: {
    provider: 'FRED / EIA',
    series: 'DCOILBRENTEU — спот Brent, $/баррель',
    url: 'https://fred.stlouisfed.org/series/DCOILBRENTEU',
    note: 'EIA публикует дневной спот с задержкой около недели, поэтому последнее значение может отставать от календарной даты.',
  },
  gold: {
    provider: 'Twelve Data',
    series: 'XAU/USD — спот золота',
    url: 'https://twelvedata.com',
    note: 'Дневные значения спот-рынка золота.',
  },
  btc: {
    provider: 'Kraken',
    series: 'XBT/USD — дневные свечи',
    url: 'https://www.kraken.com',
    note: 'Крипторынок торгуется без выходных, поэтому этот ряд идёт и по субботам с воскресеньями.',
  },
};

/** Какие плитки имеют публичный прогноз в cached_forecasts и под каким именем. */
const FORECAST_ASSET_NAME: Record<string, string> = {
  brent: 'Brent',
  btc: 'BTC',
  sp500: 'S&P 500',
};

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
  const line = coordinates.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
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
  isFallback = false,
  isSelected = false,
  onSelect,
}: {
  asset: AssetData;
  isFallback?: boolean;
  isSelected?: boolean;
  onSelect: (id: string) => void;
}) {
  const change = asset.change ?? 0;
  const cap = SATURATION_CAPS[asset.id] ?? 3;
  const nearlyFlat = Math.abs(change) < 0.005;
  const DirectionIcon = nearlyFlat ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const tooltip =
    `${asset.name}: ${asset.price}, изменение ${formatChange(change)}. ` +
    `Насыщенность цвета нормирована к шкале ±${cap}% для этого актива. ` +
    'Белая мини-линия показывает только форму последних сохранённых дневных значений без оси цены и времени. ' +
    'Площадь плитки одинакова для всех активов и ничего не кодирует. ' +
    'Нажмите на плитку, чтобы развернуть график, статистику периода, текущий сигнал и источник данных.' +
    (isFallback
      ? ' Внимание: свежая цена для этой плитки не получена, показано резервное значение — не используйте его как текущую котировку.'
      : '');

  return (
    <button
      type="button"
      id={`heat-tile-${asset.id}`}
      title={tooltip}
      aria-label={tooltip}
      aria-expanded={isSelected}
      aria-controls="asset-panel"
      onClick={() => onSelect(asset.id)}
      className={`flex min-h-[154px] w-full cursor-pointer flex-col rounded-xl border p-4 text-left text-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 ${
        isSelected
          ? 'border-cyan-200/70 ring-2 ring-cyan-300'
          : 'border-white/10'
      }`}
      style={{ backgroundColor: isFallback ? 'rgb(51, 65, 85)' : tileColor(asset) }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-extrabold tracking-wide">{asset.name}</span>
        <span className="flex shrink-0 items-center gap-1">
          <DirectionIcon className="h-4 w-4 opacity-90" aria-hidden="true" />
          <ChevronDown
            className={`h-4 w-4 opacity-80 transition-transform duration-300 ${
              isSelected ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </span>
      </div>
      {isFallback && (
        <span className="mt-2 inline-flex w-fit rounded-full border border-amber-200/35 bg-amber-300/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-100">
          нет свежей цены
        </span>
      )}

      <div className="mt-3 text-xl font-extrabold tabular-nums leading-none">
        {asset.price}
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-base font-extrabold tabular-nums">
          {nearlyFlat ? '0.00%' : formatChange(change)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/65">
          шкала ±{cap}%
        </span>
      </div>

      <div className="mt-auto pt-3">
        <TileSparkline values={asset.sparkline ?? []} />
      </div>
    </button>
  );
}

/**
 * Большой график панели актива. Фаза 1: ряд — дневные значения спарклайна
 * без календарных дат, поэтому ось X честно подписана в торговых днях,
 * а подсказка показывает «N торговых дней назад».
 */
function AssetChart({ values }: { values: number[] }) {
  const gradientId = useId().replace(/:/g, '');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = values.filter((value) => Number.isFinite(value));

  if (points.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-sm text-text-secondary">
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
  const line = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const first = points[0];
  const last = points[points.length - 1];
  const periodChange = first !== 0 ? ((last - first) / first) * 100 : 0;
  const stroke = periodChange > 0.005 ? '#34d399' : periodChange < -0.005 ? '#f87171' : '#cbd5e1';
  const active = activeIndex !== null ? coords[activeIndex] : null;
  const activePct = active ? (active.x / width) * 100 : 0;
  const activeOffset = activeIndex !== null ? points.length - 1 - activeIndex : 0;

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setActiveIndex(Math.round(ratio * (points.length - 1)));
  };

  return (
    <div>
      <div
        className="relative h-52 w-full select-none"
        style={{ touchAction: 'pan-y' }}
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
              stroke="rgba(255,255,255,0.07)"
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
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r="3.4"
            fill={stroke}
            stroke="#0A1424"
            strokeWidth="1.4"
          />
          {active && (
            <circle cx={active.x} cy={active.y} r="4.2" fill="#ffffff" stroke={stroke} strokeWidth="2" />
          )}
        </svg>

        <span className="absolute right-1 top-0 rounded-sm bg-black/25 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white/85">
          max {formatValue(rawMax)}
        </span>
        <span className="absolute bottom-0 right-1 rounded-sm bg-black/25 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white/85">
          min {formatValue(rawMin)}
        </span>

        {active && (
          <>
            <div
              className="absolute bottom-0 top-0 w-px bg-white/25"
              style={{ left: `${activePct}%` }}
              aria-hidden="true"
            />
            <div
              className="absolute top-1 whitespace-nowrap rounded-md border border-white/15 bg-[#0B1526]/95 px-2 py-1 text-[11px] font-bold tabular-nums text-white shadow-lg"
              style={{
                left: `${activePct}%`,
                transform: `translateX(${activePct < 18 ? '0%' : activePct > 82 ? '-100%' : '-50%'})`,
              }}
            >
              {formatValue(active.value)}
              <span className="ml-1.5 font-semibold text-white/60">
                {activeOffset === 0
                  ? 'последнее закрытие'
                  : `${activeOffset} ${daysWord(activeOffset)} назад`}
              </span>
            </div>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
        Дневные закрытия · последние {points.length} {daysWord(points.length)} · наведите курсор
        или коснитесь графика, чтобы увидеть значения. Полная история с календарными датами —
        в следующей фазе.
      </p>
    </div>
  );
}

function AssetPanel({
  asset,
  isFallback,
  forecast,
  forecastLoading,
  onClose,
}: {
  asset: AssetData;
  isFallback: boolean;
  forecast: ForecastData | null;
  forecastLoading: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const points = (asset.sparkline ?? []).filter((value) => Number.isFinite(value));
  const first = points[0];
  const last = points[points.length - 1];
  const periodChange =
    points.length >= 2 && first !== 0 ? ((last - first) / first) * 100 : null;
  const meta = ASSET_SOURCE_META[asset.id];
  const forecastPublishedForAsset = asset.id in FORECAST_ASSET_NAME;
  // Тот же порог, что и в разделе «Прогнозы»: ниже 60/40 направления нет.
  const hasSignal = Boolean(
    forecast && forecast.direction !== 'none' && forecast.probability >= 60,
  );
  const signalUp = hasSignal && forecast?.direction === 'up';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [asset.id]);

  return (
    <div
      ref={panelRef}
      id="asset-panel"
      role="region"
      aria-label={`Подробно об активе ${asset.name}`}
      className="mt-3 animate-fade-in rounded-xl border border-cyan-300/25 bg-[#0A1424] p-4 shadow-lg sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-extrabold tracking-tight text-text-primary">
              {asset.name}
            </h4>
            {isFallback && (
              <span className="inline-flex rounded-full border border-amber-200/35 bg-amber-300/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-100">
                нет свежей цены
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            Последнее значение:{' '}
            <span className="font-extrabold tabular-nums text-text-primary">{asset.price}</span>
            {' · '}
            <span
              className={`font-extrabold tabular-nums ${
                (asset.change ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {formatChange(asset.change ?? 0)}
            </span>{' '}
            за день
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть панель актива"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isFallback && (
        <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-400/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-100">
          Свежая цена по этому активу не получена: график и цифры ниже — резервный снимок,
          не используйте его как текущую котировку.
        </p>
      )}

      <div className="mt-4">
        <AssetChart values={points} />
      </div>

      {points.length >= 2 && (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              За {points.length} {daysWord(points.length)}
            </dt>
            <dd
              className={`mt-0.5 text-base font-extrabold tabular-nums ${
                (periodChange ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {periodChange !== null ? formatChange(periodChange) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              Минимум периода
            </dt>
            <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
              {formatValue(Math.min(...points))}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              Максимум периода
            </dt>
            <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
              {formatValue(Math.max(...points))}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              Последнее закрытие
            </dt>
            <dd className="mt-0.5 text-base font-extrabold tabular-nums text-text-primary">
              {formatValue(last)}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section
          aria-label="Текущий сигнал"
          className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
        >
          <h5 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
            Сигнал сейчас
          </h5>
          {!forecastPublishedForAsset ? (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Публичный сигнал по этому активу не выпускается — он служит внешним ориентиром.
              События, влияющие на него, копятся в разделе «Память рынка» ниже.
            </p>
          ) : forecastLoading ? (
            <p className="mt-2 text-sm text-text-secondary">Загрузка сигнала…</p>
          ) : !forecast ? (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Сигнал временно недоступен. График выше построен по сохранённым ценам и от этого
              не зависит.
            </p>
          ) : (
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-extrabold ${
                    hasSignal
                      ? signalUp
                        ? 'bg-emerald-400/15 text-emerald-200'
                        : 'bg-red-400/15 text-red-200'
                      : 'bg-white/10 text-text-secondary'
                  }`}
                >
                  {hasSignal ? (
                    signalUp ? (
                      <TrendingUp className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="h-4 w-4" aria-hidden="true" />
                    )
                  ) : (
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {hasSignal ? (signalUp ? 'Вверх' : 'Вниз') : 'Нет сигнала'}
                </span>
                <span className="text-sm font-extrabold tabular-nums text-text-primary">
                  {forecast.probability}%
                </span>
                <span className="text-xs text-text-secondary">
                  горизонт {forecast.time_window} · уверенность: {forecast.confidence}
                </span>
              </div>
              <div
                className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full ${
                    hasSignal ? (signalUp ? 'bg-emerald-400' : 'bg-red-400') : 'bg-slate-400'
                  }`}
                  style={{ width: `${forecast.probability}%` }}
                />
              </div>
              {forecast.reason && (
                <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">
                  {forecast.reason}
                </p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-text-secondary/80">
                Процент — доля взвешенных новостных свидетельств на большей стороне. Ниже порога
                60% направленный вывод не делается: это шум, а не сигнал.
              </p>
            </div>
          )}
        </section>

        <section
          aria-label="Источник данных"
          className="rounded-lg border border-white/10 bg-white/[0.03] p-4"
        >
          <h5 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
            Источник данных
          </h5>
          {meta ? (
            <div className="mt-2">
              <p className="text-sm font-bold text-text-primary">{meta.provider}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{meta.series}</p>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{meta.note}</p>
              {meta.url && (
                <a
                  href={meta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-extrabold text-white transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  Открыть первоисточник
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Ряд хранится в кэше Market Pulse и обновляется серверным писателем цен.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-text-secondary/80">
            Это дневные закрытия, а не поток котировок в реальном времени.
          </p>
        </section>
      </div>
    </div>
  );
}

function SkeletonTiles() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Загрузка тепловой карты">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="min-h-[154px] animate-pulse rounded-xl border border-border-subtle bg-bg-card p-4"
        >
          <div className="h-4 w-20 rounded-sm bg-white/10" />
          <div className="mt-5 h-6 w-24 rounded-sm bg-white/10" />
          <div className="mt-4 h-5 w-16 rounded-sm bg-white/10" />
          <div className="mt-5 h-7 rounded-sm bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function readInitialAssetId(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('asset');
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
  const [selectedId, setSelectedId] = useState<string | null>(readInitialAssetId);
  const [forecasts, setForecasts] = useState<ForecastData[] | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const forecastRequestRef = useRef<Promise<ForecastData[]> | null>(null);

  const selectedAsset =
    !loading && selectedId ? assets.find((asset) => asset.id === selectedId) ?? null : null;

  // Синхронизируем выбор с URL (?asset=brent), чтобы панелью можно было
  // делиться ссылкой, не ломая якорную навигацию по разделам.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (selectedId) url.searchParams.set('asset', selectedId);
      else url.searchParams.delete('asset');
      window.history.replaceState(null, '', url);
    } catch {
      // URL-синхронизация не критична для работы панели.
    }
  }, [selectedId]);

  // Esc закрывает панель и возвращает фокус на плитку.
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null);
        document.getElementById(`heat-tile-${selectedId}`)?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  // Прогнозы нужны только открытой панели — грузим лениво. Один общий
  // промис в ref не даёт эффекту отменить собственный запрос при
  // переключении состояния загрузки или смене выбранного актива.
  useEffect(() => {
    if (!selectedAsset) return;
    let cancelled = false;
    if (!forecastRequestRef.current) {
      forecastRequestRef.current = fetchLiveForecasts();
    }
    setForecastLoading(true);
    forecastRequestRef.current.then((data) => {
      if (cancelled) return;
      setForecasts(data);
      setForecastLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedAsset]);

  const handleSelect = (id: string) => {
    setSelectedId((previous) => (previous === id ? null : id));
  };

  const handleClose = () => {
    if (selectedId) document.getElementById(`heat-tile-${selectedId}`)?.focus();
    setSelectedId(null);
  };

  const selectedForecast = selectedAsset
    ? forecasts?.find(
        (forecast) => forecast.asset === FORECAST_ASSET_NAME[selectedAsset.id],
      ) ?? null
    : null;

  return (
    <div className="relative overflow-hidden rounded-xl2 border border-cyan-300/20 bg-[#0C1626] p-4 shadow-lg sm:p-5">
      <div
        className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-blue-500 via-cyan-400 to-emerald-500"
        aria-hidden="true"
      />
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-text-primary">
            <Grid2x2 className="h-5 w-5 text-cyan-300" />
            Тепловая карта мировых рынков
          </h3>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-cyan-100">
            <Globe className="h-3.5 w-3.5" />
            Глобальный контур
          </span>
        </div>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-text-secondary">
          Внешние ориентиры, а не российские активы: цвет показывает знак изменения, насыщенность — его силу
          относительно обычной шкалы конкретного актива, а белая линия внутри плитки — форму последних
          сохранённых дневных значений. Сопоставляйте эту карту с российскими плитками выше: сначала внешний
          драйвер, затем реакция рубля и Мосбиржи. Нажмите на плитку — под картой развернутся
          график, статистика периода, текущий сигнал и источник данных.
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
                isFallback={fallbackAssetIds.includes(asset.id)}
                isSelected={selectedId === asset.id}
                onSelect={handleSelect}
              />
            ))}
          </div>
          {selectedAsset && (
            <AssetPanel
              asset={selectedAsset}
              isFallback={fallbackAssetIds.includes(selectedAsset.id)}
              forecast={selectedForecast}
              forecastLoading={forecastLoading}
              onClose={handleClose}
            />
          )}
        </>
      )}

      <div className="mt-4">
        <div
          className="h-2 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, rgb(220,38,38) 0%, rgb(30,41,59) 50%, rgb(5,150,105) 100%)',
          }}
          aria-hidden="true"
        />
        <div className="mt-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          <span>сильнее вниз</span>
          <span>0%</span>
          <span>сильнее вверх</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-text-secondary">
          Площадь всех плиток одинакова: она не означает капитализацию, объём торгов или
          важность актива. Сравнивайте активы по напечатанному проценту; одинаковая насыщенность
          у разных активов не обязательно означает одинаковое процентное движение. У мини-линии
          нет оси цены и времени, поэтому её наклон между активами напрямую сравнивать нельзя.
        </p>
      </div>
    </div>
  );
}
