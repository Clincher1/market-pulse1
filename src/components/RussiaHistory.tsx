import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
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

const WIDTH = 640;
const HEIGHT = 220;
const PAD_X = 44;
const PAD_Y = 22;

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
  // точность, которой у источника нет.
  const digits = unit === '₽' ? 4 : 2;
  const text = value.toFixed(digits).replace('.', ',');
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

function Chart({ series, window }: { series: HistorySeries; window: RussiaHistoryPayload['window'] }) {
  const points = series.points;
  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || (series.unit === '%' ? 0.5 : Math.max(rawMax * 0.02, 1));
  const minValue = rawMin - span * 0.12;
  const maxValue = rawMax + span * 0.12;

  const fromDay = dayNumber(window.from || points[0].date);
  const tillDay = dayNumber(window.till || points[points.length - 1].date);
  const daySpan = tillDay - fromDay || 1;

  const x = (iso: string) => {
    const day = dayNumber(iso);
    const ratio = Number.isFinite(day) ? (day - fromDay) / daySpan : 0;
    return PAD_X + Math.min(1, Math.max(0, ratio)) * (WIDTH - PAD_X * 2);
  };
  const y = (value: number) =>
    PAD_Y + ((maxValue - value) / (maxValue - minValue)) * (HEIGHT - PAD_Y * 2);

  let path = '';
  if (series.kind === 'step') {
    const first = points[0];
    path = `M${x(first.date).toFixed(1)} ${y(first.value).toFixed(1)}`;
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      path += ` L${x(point.date).toFixed(1)} ${y(points[index - 1].value).toFixed(1)}`;
      path += ` L${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`;
    }
    // Уровень действует до конца окна: следующей ступени в данных нет.
    path += ` L${x(window.till || points[points.length - 1].date).toFixed(1)} ${y(points[points.length - 1].value).toFixed(1)}`;
  } else {
    path = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`)
      .join(' ');
  }

  const lowest = points.reduce((acc, point) => (point.value < acc.value ? point : acc), points[0]);
  const highest = points.reduce((acc, point) => (point.value > acc.value ? point : acc), points[0]);
  const aria =
    `${series.name}: ${points.length} точек с ${ruDate(points[0].date)} по ${ruDate(points[points.length - 1].date)}. ` +
    `Первое значение ${formatValue(points[0].value, series.unit)}, последнее ${formatValue(points[points.length - 1].value, series.unit)}. ` +
    `Минимум ${formatValue(lowest.value, series.unit)} (${ruDate(lowest.date)}), максимум ${formatValue(highest.value, series.unit)} (${ruDate(highest.date)}). ` +
    `Источник: ${series.provider}.`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={aria}>
      <title>{aria}</title>
      {[minValue, maxValue].map((value, index) => (
        <g key={`grid-${index}`}>
          <line
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={y(value)}
            y2={y(value)}
            stroke="currentColor"
            className="text-white/10"
          />
          <text x={PAD_X - 6} y={y(value) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
            {value.toFixed(series.unit === 'пункта' ? 0 : 2).replace('.', ',')}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="currentColor" className="text-blue-300" strokeWidth="2" />
      {series.kind === 'line' &&
        points.map((point) => (
          <circle
            key={`dot-${point.date}`}
            cx={x(point.date)}
            cy={y(point.value)}
            r={1.8}
            className="fill-blue-200"
          />
        ))}
      {series.kind === 'step' &&
        points.map((point) => (
          <circle
            key={`step-${point.date}`}
            cx={x(point.date)}
            cy={y(point.value)}
            r={3}
            className="fill-amber-300"
          />
        ))}
      <text x={PAD_X} y={12} className="fill-slate-400 text-[10px]">
        значения: {series.unit}
      </text>
      <text x={PAD_X} y={HEIGHT - 4} className="fill-slate-400 text-[10px]">
        {ruDate(window.from)}
      </text>
      <text x={WIDTH - PAD_X} y={HEIGHT - 4} textAnchor="end" className="fill-slate-400 text-[10px]">
        {ruDate(window.till)}
      </text>
    </svg>
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
        <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
          Динамика за 3 месяца — из первоисточников
        </div>
        {data?.window.from && (
          <div className="text-[11px] font-medium text-slate-500">
            окно {ruDate(data.window.from)} — {ruDate(data.window.till)}
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-slate-400">
          Загружаем историю из Мосбиржи и Банка России. Пока ответа нет — чисел здесь не будет.
        </div>
      )}

      {!loading && data && data.series.length === 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Историю получить не удалось, поэтому графиков нет.
            {data.errors.length > 0 ? ` Причина: ${data.errors.join('; ')}.` : ''}
          </span>
        </div>
      )}

      {!loading && data && data.series.length > 0 && series && stats && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {data.series.map((item) => {
              const active = item.id === series.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(item.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-accent/60 bg-accent/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="text-lg font-extrabold tabular-nums text-white">
              {formatValue(stats.last.value, series.unit)}
            </span>
            {stats.change && (
              <span className="text-xs font-semibold text-slate-300">
                {stats.change} с {ruDate(stats.first.date)}
              </span>
            )}
            {!stats.change && series.kind === 'step' && (
              <span className="text-xs text-slate-400">в этом окне ставка не менялась</span>
            )}
            <span className="text-xs text-slate-400">
              минимум {formatValue(stats.min, series.unit)} · максимум {formatValue(stats.max, series.unit)}
            </span>
          </div>

          <div className="mt-2">
            <Chart series={series} window={data.window} />
          </div>

          <div className="mt-2 flex flex-col gap-1.5 text-[11px] leading-relaxed text-slate-400">
            <div className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-300" />
              <span>
                {series.note} Точек: {series.points.length}. Источник — {series.provider};{' '}
                <a
                  href={series.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 underline-offset-2 hover:underline"
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
              <details className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <summary className="cursor-pointer select-none font-bold text-slate-400 transition-colors hover:text-slate-200">
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

          <details className="mt-2 text-[11px] text-slate-400">
            <summary className="cursor-pointer select-none font-semibold text-slate-300">
              Все {series.points.length} значений ряда
            </summary>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead>
                  <tr className="text-slate-500">
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
            <div className="mt-2 text-[11px] font-medium text-amber-200/80">
              Не получено: {data.errors.join('; ')}. Ряд без данных не рисуется и не заменяется
              похожим.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
