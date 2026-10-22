import { Grid2x2, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { AssetData } from '@/data/mockData';
import GuideLink from './GuideLink';

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

function HeatTile({ asset }: { asset: AssetData }) {
  const change = asset.change ?? 0;
  const cap = SATURATION_CAPS[asset.id] ?? 3;
  const nearlyFlat = Math.abs(change) < 0.005;
  const DirectionIcon = nearlyFlat ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const tooltip =
    `${asset.name}: ${asset.price}, изменение ${formatChange(change)}. ` +
    `Насыщенность цвета нормирована к шкале ±${cap}% для этого актива. ` +
    'Площадь плитки одинакова для всех активов и ничего не кодирует.';

  return (
    <article
      title={tooltip}
      aria-label={tooltip}
      className="min-h-[118px] rounded-xl border border-white/10 p-4 text-white shadow-lg transition-transform duration-300 hover:-translate-y-0.5"
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
    </article>
  );
}

function SkeletonTiles() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Загрузка тепловой карты">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="min-h-[118px] animate-pulse rounded-xl border border-border-subtle bg-bg-card p-4"
        >
          <div className="h-4 w-20 rounded bg-white/10" />
          <div className="mt-5 h-6 w-24 rounded bg-white/10" />
          <div className="mt-4 h-5 w-16 rounded bg-white/10" />
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
    <div className="mb-5 rounded-xl2 border border-border-subtle bg-bg-card p-4 shadow-lg sm:p-5">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-text-primary">
            <Grid2x2 className="h-5 w-5 text-accent" />
            Тепловая карта рынка
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">
            Быстрый обзор пяти активов: цвет показывает знак изменения, насыщенность — его силу
            относительно обычной шкалы конкретного актива.
          </p>
        </div>
        <GuideLink
          href="#guide-assets"
          label="Как читать карту"
          mobileLabel="Справка"
        />
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
          у разных активов не обязательно означает одинаковое процентное движение.
        </p>
      </div>
    </div>
  );
}
