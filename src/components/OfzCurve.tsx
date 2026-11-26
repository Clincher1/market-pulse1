import { useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Info } from 'lucide-react';
import type { RussiaMarketIndicator } from '@/data/russiaInsights';
import { formatTick, nearestIndexByFraction, niceTicks, tickStep } from '@/lib/chartAxis';

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
  // Хук стоит до раннего возврата: порядок вызовов не должен зависеть от того,
  // сколько точек пришло от источника.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
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

  // Ось доходностей подписывается круглыми процентами внутри диапазона кривой.
  const yTicks = niceTicks(rawMin, rawMax);
  const yStep = tickStep(yTicks);
  const xPositions = points.map((point) => point.x);
  const active = activeIndex !== null ? points[Math.min(activeIndex, points.length - 1)] : null;

  const pickNearest = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width) return;
    const viewX = ((clientX - rect.left) / rect.width) * width;
    const left = xPositions[0];
    const right = xPositions[xPositions.length - 1];
    const fraction = right > left ? (viewX - left) / (right - left) : 0;
    setActiveIndex(nearestIndexByFraction(xPositions, fraction));
  };

  const handlePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pickNearest(event.clientX, event.currentTarget);
  };

  const handleKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setActiveIndex(null);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    const lastIndex = points.length - 1;
    const current = activeIndex ?? lastIndex;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? lastIndex
          : event.key === 'ArrowLeft'
            ? Math.max(0, current - 1)
            : Math.min(lastIndex, current + 1);
    setActiveIndex(next);
  };

  const ariaLabel =
    `Кривая бескупонной доходности ОФЗ, ${curve.length} точек по срокам от ${formatTerm(minPeriod)} ` +
    `до ${formatTerm(maxPeriod)}. Минимум ${formatRate(lowest.value)} на сроке ${formatTerm(lowest.period)}, ` +
    `максимум ${formatRate(highest.value)} на сроке ${formatTerm(highest.period)}. Источник: ${indicator.provider}, ${asOf}.`;

  return (
    <figure className="mt-[var(--space-2)] rounded-2xl border border-slate-200 bg-white p-[var(--space-2)] shadow-sm">
      <figcaption className="mb-[var(--space-2)] flex flex-wrap items-baseline justify-between gap-[var(--space-1)]">
        <div>
          <div className="text-sm font-extrabold text-text-primary">Кривая доходности ОФЗ по срокам</div>
          <div className="mt-[var(--space-1)] text-[11px] font-medium text-text-secondary">
            {curve.length} точек от {formatTerm(minPeriod)} до {formatTerm(maxPeriod)};{' '}
            {indicator.provider}, {asOf}
          </div>
        </div>
        <a
          href="https://iss.moex.com/iss/engines/stock/zcyc.json?iss.meta=off"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-[11px] font-semibold text-blue-800 underline-offset-2 hover:underline"
        >
          Открыть источник
        </a>
      </figcaption>

      <div
        className="relative touch-pan-y select-none"
        tabIndex={0}
        role="group"
        aria-label="Кривая доходности ОФЗ. Стрелками влево и вправо выбирается срок, доходность показывается подсказкой."
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setActiveIndex(null)}
        onKeyDown={handleKey}
        onBlur={() => setActiveIndex(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={ariaLabel}
        >
          <text x={padX} y={11} className="fill-slate-600 text-[11px]">
            шкала — проценты
          </text>

          {/* Отметки — круглые проценты внутри диапазона кривой. Раньше ось
              подписывала только края рисунка (13,2 и 16,9), которых на кривой
              нет, и по двум числам нельзя было понять уровень доходности. */}
          {yTicks.map((tick) => {
            const y = scaleY(tick, minValue, maxValue, height, padY);
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200"
                  strokeWidth="1"
                />
                <text
                  x={padX - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-600 text-[11px] tabular-nums"
                >
                  {formatTick(tick, yStep)}
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
                className="fill-slate-600 text-[11px]"
              >
                {formatTerm(tick)}
              </text>
            );
          })}

          <path d={path} fill="none" stroke="currentColor" className="text-blue-800" strokeWidth="2" />
          {points.map((point) => (
            <circle
              key={`p-${point.period}`}
              cx={point.x}
              cy={point.y}
              r={2}
              className="fill-blue-700"
            />
          ))}

          {tenYear && (
            <g>
              <circle cx={tenYear.x} cy={tenYear.y} r={4.5} className="fill-amber-700" />
              <text
                x={tenYear.x}
                y={tenYear.y - 9}
                textAnchor="middle"
                className="fill-amber-800 text-[11px] font-semibold"
              >
                10 лет · {formatRate(tenYear.value)}
              </text>
            </g>
          )}

          {active && (
            <g>
              <line
                x1={active.x}
                x2={active.x}
                y1={padY}
                y2={height - padY}
                stroke="currentColor"
                className="text-slate-300"
                strokeDasharray="4 4"
              />
              <circle
                cx={active.x}
                cy={active.y}
                r={4.5}
                className="fill-white"
                stroke="#1e40af"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white/95 px-[var(--space-2)] py-[var(--space-1)] text-center shadow-lg"
            style={{
              left: `${(active.x / width) * 100}%`,
              top: `${(active.y / height) * 100}%`,
              transform: `translate(${
                active.x / width > 0.78 ? '-92%' : active.x / width < 0.22 ? '-8%' : '-50%'
              }, calc(-100% - 12px))`,
            }}
          >
            <div className="whitespace-nowrap text-[11px] font-semibold text-text-secondary">
              срок {formatTerm(active.period)}
            </div>
            <div className="whitespace-nowrap text-sm font-black text-text-primary">
              {formatRate(active.value)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-[var(--space-1)] flex items-start gap-[var(--space-1)] text-[11px] leading-relaxed text-text-secondary">
        <Info className="mt-[var(--space-1)] h-3.5 w-3.5 shrink-0 text-blue-800" />
        <span>
          Минимум {formatRate(lowest.value)} на сроке {formatTerm(lowest.period)}, максимум{' '}
          {formatRate(highest.value)} на сроке {formatTerm(highest.period)}. Ось сроков
          логарифмическая, иначе 3 месяца и год слиплись бы в одну точку. Наведение или касание
          показывает доходность выбранного срока. Это точки кривой бескупонной доходности, а не
          сделки по конкретным выпускам; публичный поток может быть задержан.
        </span>
      </div>

      {/* A table's intrinsic minimum width can exceed sr-only's 1px box.
          Clip a normal table inside a screen-reader-only block instead. */}
      <div className="sr-only">
      <table>
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
      </div>
    </figure>
  );
}
