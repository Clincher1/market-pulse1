import { Globe, Grid2x2, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { AssetData } from '@/data/mockData';

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
  Brent: 4,
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

function HeatTile({ asset }: { asset: AssetData }) {
  const change = asset.change ?? 0;
  const cap = SATURATION_CAPS[asset.id] ?? 3;
  const nearlyFlat = Math.abs(change) < 0.005;
  const DirectionIcon = nearlyFlat ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const tooltip =
    `${asset.name}: ${asset.price}, изменение ${formatChange(change)}. ` +
    `Насыщенность цвета нормирована к шкале ±${cap}% для этого актива. ` +
    'Белая мини-линия показывает только форму последних сохранённых дневных значений без оси цены и времени. ' +
    'Площадь плитки одинакова для всех активов и ничего не кодирует.';

  return (
    <article
      title={tooltip}
      aria-label={tooltip}
      className="flex min-h-[154px] flex-col rounded-xl border border-white/10 p-4 text-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5"
      style={{ backgroundColor: tileColor(asset) }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-extrabold tracking-wide">{asset.name}</h3>
        <DirectionIcon className="h-4 w-4 shrink-0 opacity-90" aria-hidden="true" />
      </div>

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
    </article>
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
          <div className="h-4 w-20 rounded bg-white/10" />
          <div className="mt-5 h-6 w-24 rounded bg-white/10" />
          <div className="mt-4 h-5 w-16 rounded bg-white/10" />
          <div className="mt-5 h-7 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export default function MarketHeatmap({
  assets,
  loading,
}: {
  assets: AssetData[];
  loading: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl2 border border-cyan-300/20 bg-[#0C1626] p-4 shadow-lg sm:p-5">
      <div
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-500"
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
          драйвер, затем реакция рубля и Мосбиржи.
        </p>
      </div>

      {loading ? (
        <SkeletonTiles />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {assets.map((asset) => (
            <HeatTile key={asset.id} asset={asset} />
          ))}
        </div>
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
