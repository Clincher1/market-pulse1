import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import {
  axisUnitLabel,
  formatTick,
  nearestIndexByFraction,
  niceTicks,
  tickStep,
} from '@/lib/chartAxis';
import {
  fetchRussiaHistory,
  type HistoryPoint,
  type HistorySeries,
  type RussiaHistory as RussiaHistoryPayload,
} from '@/data/russiaHistory';

/**
 * История за окно ~3 месяца — из тех же первоисточников, что и плитки.
 *
 * Рисуются только пришедшие точки. Пропущенные торговые дни и выходные не
 * заполняются: расстояние по горизонтали — это календарь, а не «столько же
 * дней». Ключевая ставка рисуется ступенями: она меняется решением, а не
 * каждую сессию.
 */

const WIDTH = 720;
const HEIGHT = 260;
const PAD_LEFT = 56;
const PAD_RIGHT = 18;
const PAD_TOP = 24;
const PAD_BOTTOM = 34;

function ruDate(iso: string | undefined): string {
  if (!iso) return '';
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso;
}

function dayNumber(iso: string): number {
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed / 86_400_000 : Number.NaN;
}

function formatValue(value: number, unit: string): string {
  // Рубли — четыре знака, как на плитках курсов. Пункты, проценты и млрд $
  // публикуются с двумя знаками: показывать «729,6000 млрд $» значит обещать
  // точность, которой у источника нет. Разряды разделяются пробелом, иначе
  // «2509,26» здесь и «2 509,26» на плитке — два написания одного числа.
  const digits = unit === '₽' ? 4 : 2;
  const text = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return unit === '₽' ? `${text} ₽` : `${text} ${unit}`;
}

function formatChange(series: HistorySeries, first: HistoryPoint, last: HistoryPoint): string | null {
  if (series.unit === '%') {
    const delta = last.value - first.value;
    // «0,00 п.п.» читается как измерение, а не как «ставка не менялась»:
    // для ступеней это разные утверждения, поэтому нулевую дельту не рисуем.
    if (!Number.isFinite(delta) || delta === 0) return null;
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
    return `${sign}${Math.abs(delta).toFixed(2).replace('.', ',')} п.п.`;
  }
  if (first.value === 0) return null;
  const pct = ((last.value - first.value) / first.value) * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(2).replace('.', ',')} %`;
}

function monthStartTicks(fromIso: string, tillIso: string): string[] {
  const matchFrom = /^(\d{4})-(\d{2})-\d{2}$/.exec(fromIso);
  const matchTill = /^(\d{4})-(\d{2})-\d{2}$/.exec(tillIso);
  if (!matchFrom || !matchTill) return [];
  let year = Number(matchFrom[1]);
  let month = Number(matchFrom[2]) + 1;
  const till = `${matchTill[1]}-${matchTill[2]}`;
  const fromDay = dayNumber(fromIso);
  const tillDay = dayNumber(tillIso);
  const ticks: string[] = [];
  for (let guard = 0; guard < 24; guard += 1) {
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > till) break;
    const iso = `${key}-01`;
    const day = dayNumber(iso);
    // Подпись, стоящая в двух днях от края, наезжает на подпись края: окно
    // начинается 31.07, и «01.08» встало бы вплотную к «31.07».
    if (day - fromDay > 3 && tillDay - day > 3) ticks.push(iso);
    month += 1;
  }
  return ticks;
}

function shortDate(iso: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[2]}.${match[1]}` : iso;
}

/**
 * График одного ряда за окно истории.
 *
 * Подписи вертикальной оси — круглые отметки из самого диапазона данных
 * (2 100, 2 200, 2 300…), а не края рисунка: раньше там появлялись «2017» и
 * «2578», которых в ряду нет, и «2017» читалось как год. Точки нажимаются и
 * ловят курсор: выбранная дата и её значение показываются своей подсказкой,
 * а не системной белой рамкой браузера.
 */
export function Chart({ series, window }: { series: HistorySeries; window: RussiaHistoryPayload['window'] }) {
  const points = series.points.filter((point) => Number.isFinite(point?.value));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length === 0) return null;

  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || (series.unit === '%' ? 0.5 : Math.max(rawMax * 0.02, 1));
  const minValue = rawMin - span * 0.12;
  const maxValue = rawMax + span * 0.12;

  const fromIso = window.from || points[0].date;
  const tillIso = window.till || points[points.length - 1].date;
  const fromDay = dayNumber(fromIso);
  const tillDay = dayNumber(tillIso);
  const daySpan = tillDay - fromDay || 1;

  const x = (iso: string) => {
    const day = dayNumber(iso);
    const ratio = Number.isFinite(day) ? (day - fromDay) / daySpan : 0;
    return PAD_LEFT + Math.min(1, Math.max(0, ratio)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  };
  const y = (value: number) =>
    PAD_TOP + ((maxValue - value) / (maxValue - minValue)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  let path: string;
  if (series.kind === 'step') {
    const first = points[0];
    path = `M${x(first.date).toFixed(1)} ${y(first.value).toFixed(1)}`;
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      path += ` L${x(point.date).toFixed(1)} ${y(points[index - 1].value).toFixed(1)}`;
      path += ` L${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`;
    }
    // Уровень действует до конца окна: следующей ступени в данных нет.
    path += ` L${x(tillIso).toFixed(1)} ${y(points[points.length - 1].value).toFixed(1)}`;
  } else {
    path = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`)
      .join(' ');
  }

  const lowest = points.reduce((acc, point) => (point.value < acc.value ? point : acc), points[0]);
  const highest = points.reduce((acc, point) => (point.value > acc.value ? point : acc), points[0]);

  const ticks = niceTicks(rawMin, rawMax);
  const step = tickStep(ticks);
  const positions = points.map((point) => x(point.date));
  const active = activeIndex !== null ? points[Math.min(activeIndex, points.length - 1)] : null;
  const activeX = active ? x(active.date) : 0;
  const activeY = active ? y(active.value) : 0;
  const tooltipLeft = `${(activeX / WIDTH) * 100}%`;
  const tooltipTop = `${(activeY / HEIGHT) * 100}%`;
  const tooltipShift = activeX / WIDTH > 0.78 ? '-92%' : activeX / WIDTH < 0.22 ? '-8%' : '-50%';

  const pickNearest = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width) return;
    const viewX = ((clientX - rect.left) / rect.width) * WIDTH;
    const left = positions[0];
    const right = positions[positions.length - 1];
    const fraction = right > left ? (viewX - left) / (right - left) : 0;
    setActiveIndex(nearestIndexByFraction(positions, fraction));
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
    const last = points.length - 1;
    const current = activeIndex ?? last;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowLeft'
            ? Math.max(0, current - 1)
            : Math.min(last, current + 1);
    setActiveIndex(next);
  };

  const aria =
    `${series.name}: ${points.length} точек с ${ruDate(points[0].date)} по ${ruDate(points[points.length - 1].date)}. ` +
    `Первое значение ${formatValue(points[0].value, series.unit)}, последнее ${formatValue(points[points.length - 1].value, series.unit)}. ` +
    `Минимум ${formatValue(lowest.value, series.unit)} (${ruDate(lowest.date)}), максимум ${formatValue(highest.value, series.unit)} (${ruDate(highest.date)}). ` +
    `Источник: ${series.provider}.`;

  const labelAnchor = (iso: string) => {
    const position = x(iso) / WIDTH;
    return position < 0.12 ? 'start' : position > 0.88 ? 'end' : 'middle';
  };

  return (
    <div>
      <div
        className="relative touch-pan-y select-none"
        tabIndex={0}
        role="group"
        aria-label={`График ${series.name}. Стрелками влево и вправо выбирается дата, значение показывается подсказкой.`}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setActiveIndex(null)}
        onKeyDown={handleKey}
        onBlur={() => setActiveIndex(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={aria}>
          <text x={PAD_LEFT} y={14} className="fill-slate-600 text-[11px]">
            шкала — {axisUnitLabel(series.unit)}
          </text>

          {ticks.map((tick) => (
            <g key={`tick-${tick}`}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={y(tick)}
                y2={y(tick)}
                stroke="currentColor"
                className="text-slate-200"
              />
              <text
                x={PAD_LEFT - 8}
                y={y(tick) + 3}
                textAnchor="end"
                className="fill-slate-600 text-[11px] tabular-nums"
              >
                {formatTick(tick, step)}
              </text>
            </g>
          ))}

          <path d={path} fill="none" stroke="currentColor" className="text-blue-800" strokeWidth="2" />

          {series.kind === 'line' &&
            points.map((point) => (
              <circle key={`dot-${point.date}`} cx={x(point.date)} cy={y(point.value)} r={1.8} className="fill-blue-700" />
            ))}
          {series.kind === 'step' &&
            points.map((point) => (
              <circle key={`step-${point.date}`} cx={x(point.date)} cy={y(point.value)} r={3} className="fill-amber-800" />
            ))}

          {/* Минимум и максимум подписаны на самом графике: без них «высоко или
              низко» приходилось угадывать по двум крайним числам. */}
          <g>
            <circle cx={x(highest.date)} cy={y(highest.value)} r={3} className="fill-emerald-700" />
            <text
              x={x(highest.date)}
              y={y(highest.value) - 8}
              textAnchor={labelAnchor(highest.date)}
              className="fill-emerald-800 text-[11px] font-semibold tabular-nums"
            >
              макс {formatValue(highest.value, series.unit)}
            </text>
            <circle cx={x(lowest.date)} cy={y(lowest.value)} r={3} className="fill-rose-700" />
            <text
              x={x(lowest.date)}
              y={y(lowest.value) + 14}
              textAnchor={labelAnchor(lowest.date)}
              className="fill-rose-800 text-[11px] font-semibold tabular-nums"
            >
              мин {formatValue(lowest.value, series.unit)}
            </text>
          </g>

          {active && (
            <g>
              <line
                x1={activeX}
                x2={activeX}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke="currentColor"
                className="text-text-secondary"
                strokeDasharray="4 4"
              />
              <circle cx={activeX} cy={activeY} r={4.5} className="fill-white" stroke="#0A1424" strokeWidth="1.5" />
            </g>
          )}

          {[fromIso, ...monthStartTicks(fromIso, tillIso), tillIso].map((iso) => (
            <text
              key={`x-${iso}`}
              x={x(iso)}
              y={HEIGHT - 8}
              textAnchor={labelAnchor(iso)}
              className="fill-slate-600 text-[11px] tabular-nums"
            >
              {shortDate(iso)}
            </text>
          ))}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center shadow-lg"
            style={{ left: tooltipLeft, top: tooltipTop, transform: `translate(${tooltipShift}, calc(-100% - 12px))` }}
          >
            <div className="whitespace-nowrap text-[11px] font-semibold text-text-secondary">{ruDate(active.date)}</div>
            <div className="whitespace-nowrap text-sm font-black text-text-primary">
              {formatValue(active.value, series.unit)}
            </div>
            {series.kind === 'step' && active.since && (
              <div className="whitespace-nowrap text-[11px] font-semibold text-text-secondary">
                действует с {ruDate(active.since)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-medium text-text-secondary">
        <span>Наведите курсор или коснитесь графика — дата и значение появятся в подсказке.</span>
        <span>Отметки шкалы — круглые числа; пропущенные дни не заполняются.</span>
      </div>
    </div>
  );
}

export default function RussiaHistory() {
  const [data, setData] = useState<RussiaHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    fetchRussiaHistory().then((payload) => {
      if (cancelled) return;
      setData(payload);
      setSelectedId(payload.series[0]?.id ?? '');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const series = useMemo(() => {
    if (!data) return null;
    return data.series.find((item) => item.id === selectedId) ?? data.series[0] ?? null;
  }, [data, selectedId]);

  const stats = useMemo(() => {
    if (!series) return null;
    const points = series.points;
    const first = points[0];
    const last = points[points.length - 1];
    const values = points.map((point) => point.value);
    return {
      first,
      last,
      min: Math.min(...values),
      max: Math.max(...values),
      change: formatChange(series, first, last),
    };
  }, [series]);

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
          Динамика за 3 месяца — из первоисточников
        </div>
        {data?.window.from && (
          <div className="text-[11px] font-medium text-text-secondary">
            окно {ruDate(data.window.from)} — {ruDate(data.window.till)}
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-text-secondary">
          Загружаем историю из Мосбиржи и Банка России. Пока ответа нет — чисел здесь не будет.
        </div>
      )}

      {!loading && data && data.series.length === 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Историю получить не удалось, поэтому графиков нет.
            {data.errors.length > 0 ? ` Причина: ${data.errors.join('; ')}.` : ''}
          </span>
        </div>
      )}

      {!loading && data && data.series.length > 0 && series && stats && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {data.series.map((item) => {
              const active = item.id === series.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(item.id)}
                  className={`min-h-11 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="text-lg font-extrabold tabular-nums text-text-primary">
              {formatValue(stats.last.value, series.unit)}
            </span>
            {stats.change && (
              <span className="text-xs font-semibold text-text-secondary">
                {stats.change} с {ruDate(stats.first.date)}
              </span>
            )}
            {!stats.change && series.kind === 'step' && (
              <span className="text-xs text-text-secondary">в этом окне ставка не менялась</span>
            )}
            <span className="text-xs text-text-secondary">
              минимум {formatValue(stats.min, series.unit)} · максимум {formatValue(stats.max, series.unit)}
            </span>
          </div>

          <div className="mt-2">
            <Chart series={series} window={data.window} />
          </div>

          <div className="mt-2 flex flex-col gap-1.5 text-[11px] leading-relaxed text-text-secondary">
            <div className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-800" />
              <span>
                {series.note} Точек: {series.points.length}. Источник — {series.provider};{' '}
                <a
                  href={series.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-blue-800 underline-offset-2 hover:underline"
                >
                  открыть источник
                </a>
                .{series.truncated ? ' Источник отдал больше строк, чем поместилось в один ответ.' : ''}
              </span>
            </div>
            {/* Четыре абзаца методики подряд закрывали сам график. Первый —
                про пропущенные дни — остаётся на виду, остальные раскрываются. */}
            {data.notes.slice(0, 1).map((note) => (
              <div key={note} className="flex items-start gap-1.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span>{note}</span>
              </div>
            ))}
            {data.notes.length > 1 && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <summary className="min-h-11 cursor-pointer select-none py-3 font-bold text-text-secondary transition-colors hover:text-text-primary">
                  Как читать график
                </summary>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {data.notes.slice(1).map((note) => (
                    <span key={note} className="flex items-start gap-1.5">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span>{note}</span>
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>

          <details className="mt-2 text-[11px] text-text-secondary">
            <summary className="min-h-11 cursor-pointer select-none py-3 font-semibold text-text-secondary">
              Все {series.points.length} значений ряда
            </summary>
            <div className="mt-2 max-h-64 overflow-auto focus-visible:outline-2 focus-visible:outline-cyan-600" tabIndex={0} role="region" aria-label={`Таблица наблюдений ${series.name}`}>
              <table className="w-full text-left tabular-nums">
                <thead>
                  <tr className="text-text-secondary">
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Дата
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      Значение
                    </th>
                    {series.kind === 'step' && (
                      <th scope="col" className="py-1 font-medium">
                        Действует с
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {series.points.map((point) => (
                    <tr key={point.date}>
                      <td className="py-0.5 pr-3">{ruDate(point.date)}</td>
                      <td className="py-0.5 pr-3">{formatValue(point.value, series.unit)}</td>
                      {series.kind === 'step' && (
                        <td className="py-0.5">
                          {point.since ? ruDate(point.since) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {data.errors.length > 0 && (
            <div className="mt-2 text-[11px] font-medium text-amber-800">
              Не получено: {data.errors.join('; ')}. Ряд без данных не рисуется и не заменяется
              похожим.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
