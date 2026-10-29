import { Info } from 'lucide-react';
import type { RussiaMarketIndicator } from '@/data/russiaInsights';

/**
 * Кривая бескупонной доходности ОФЗ — как её отдала Мосбиржа.
 *
 * Рисуются только пришедшие точки: ничего не сглаживается, не достраивается
 * и не «усредняется» до красивой дуги. Если источник дал две точки, будет две.
 */

type Point = { period: number; value: number };

const X_TICKS = [0.25, 0.5, 1, 2, 5, 10, 15, 20];

function formatTerm(period: number): string {
  if (period < 1) {
    const months = Math.round(period * 12);
    return `${months} мес`;
  }
  return `${String(period).replace('.', ',')} г`;
}

function formatRate(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} %`;
}

/** Сроки на оси логарифмические: иначе 3 месяца и год слиплись бы в одну точку. */
function scaleX(period: number, min: number, max: number, width: number, pad: number) {
  const inner = width - pad * 2;
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  if (logMax === logMin) return pad + inner / 2;
  return pad + ((Math.log(period) - logMin) / (logMax - logMin)) * inner;
}

function scaleY(value: number, min: number, max: number, height: number, pad: number) {
  const inner = height - pad * 2;
  if (max === min) return pad + inner / 2;
  return pad + ((max - value) / (max - min)) * inner;
}

export default function OfzCurve({ indicator }: { indicator: RussiaMarketIndicator }) {
  const curve = (indicator.curve ?? [])
    .filter((point) => Number.isFinite(point?.period) && Number.isFinite(point?.value))
    .slice()
    .sort((a, b) => a.period - b.period) as Point[];

  if (curve.length < 2) return null;

  const width = 640;
  const height = 220;
  const padX = 34;
  const padY = 24;

  const periods = curve.map((point) => point.period);
  const values = curve.map((point) => point.value);
  const minPeriod = Math.min(...periods);
  const maxPeriod = Math.max(...periods);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Поля по вертикали — чтобы линия не липла к рамке. Диапазон берётся из данных.
  const span = rawMax - rawMin || 0.5;
  const minValue = rawMin - span * 0.15;
  const maxValue = rawMax + span * 0.15;

  const points = curve.map((point) => ({
    ...point,
    x: scaleX(point.period, minPeriod, maxPeriod, width, padX),
    y: scaleY(point.value, minValue, maxValue, height, padY),
  }));

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const tenYear = points.find((point) => point.period === 10);
  const lowest = curve.reduce((acc, point) => (point.value < acc.value ? point : acc), curve[0]);
  const highest = curve.reduce((acc, point) => (point.value > acc.value ? point : acc), curve[0]);
  const ticks = X_TICKS.filter((tick) => tick >= minPeriod && tick <= maxPeriod);
  const asOf = indicator.curveAsOf ? `время источника ${indicator.curveAsOf} МСК` : 'время источника не указано';

  const ariaLabel =
    `Кривая бескупонной доходности ОФЗ, ${curve.length} точек по срокам от ${formatTerm(minPeriod)} ` +
    `до ${formatTerm(maxPeriod)}. Минимум ${formatRate(lowest.value)} на сроке ${formatTerm(lowest.period)}, ` +
    `максимум ${formatRate(highest.value)} на сроке ${formatTerm(highest.period)}. Источник: ${indicator.provider}, ${asOf}.`;

  return (
    <figure className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold text-white">Кривая доходности ОФЗ по срокам</div>
          <div className="mt-0.5 text-[11px] font-medium text-slate-400">
            {curve.length} точек от {formatTerm(minPeriod)} до {formatTerm(maxPeriod)};{' '}
            {indicator.provider}, {asOf}
          </div>
        </div>
        <a
          href="https://www.moex.com/ru/marketdata/indices/state/gcurve/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-blue-300 underline-offset-2 hover:underline"
        >
          Открыть источник
        </a>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>

        {[minValue, maxValue].map((value, index) => {
          const y = scaleY(value, minValue, maxValue, height, padY);
          return (
            <g key={`y-${index}`}>
              <line
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-white/10"
                strokeWidth="1"
              />
              <text
                x={padX - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 text-[10px]"
              >
                {value.toFixed(1).replace('.', ',')}
              </text>
            </g>
          );
        })}

        {ticks.map((tick) => {
          const x = scaleX(tick, minPeriod, maxPeriod, width, padX);
          return (
            <text
              key={`x-${tick}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {formatTerm(tick)}
            </text>
          );
        })}

        <path d={path} fill="none" stroke="currentColor" className="text-blue-300" strokeWidth="2" />
        {points.map((point) => (
          <circle
            key={`p-${point.period}`}
            cx={point.x}
            cy={point.y}
            r={2}
            className="fill-blue-200"
          />
        ))}

        {tenYear && (
          <g>
            <circle cx={tenYear.x} cy={tenYear.y} r={4.5} className="fill-amber-300" />
            <text
              x={tenYear.x}
              y={tenYear.y - 9}
              textAnchor="middle"
              className="fill-amber-200 text-[10px] font-semibold"
            >
              10 лет · {formatRate(tenYear.value)}
            </text>
          </g>
        )}
      </svg>

      <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-300" />
        <span>
          Минимум {formatRate(lowest.value)} на сроке {formatTerm(lowest.period)}, максимум{' '}
          {formatRate(highest.value)} на сроке {formatTerm(highest.period)}. Ось сроков
          логарифмическая, иначе 3 месяца и год слиплись бы в одну точку. Это точки кривой
          бескупонной доходности, а не сделки по конкретным выпускам; публичный поток может быть
          задержан.
        </span>
      </div>

      <table className="sr-only">
        <caption>Значения кривой доходности ОФЗ по срокам</caption>
        <thead>
          <tr>
            <th scope="col">Срок</th>
            <th scope="col">Доходность</th>
          </tr>
        </thead>
        <tbody>
          {curve.map((point) => (
            <tr key={`row-${point.period}`}>
              <td>{formatTerm(point.period)}</td>
              <td>{formatRate(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
