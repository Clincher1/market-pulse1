import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flame,
  LoaderCircle,
  RotateCcw,
  Snowflake,
  Thermometer,
} from 'lucide-react';
import type { TensionData } from '@/data/mockData';
import { fetchLiveTension } from '@/data/liveTension';
import GuideLink from './GuideLink';
import { ErrorNotice } from './SectionFallback';

type TensionPhase = 'loading' | 'live' | 'stale' | 'error';
type TensionPoint = TensionData['history'][number];

function clampTension(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

/** Ниже этого числа дней перцентиль и медиана — шум, а не контекст. */
const MIN_STATS_DAYS = 14;

/** Материал в выборке старше этого возраста — поток новостей считаем прерванным. */
const STALE_SAMPLE_HOURS = 6;

function hoursWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'час';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'часа';
  return 'часов';
}

function daysWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
  return 'дней';
}

function formatStatValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

function formatDateTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function pointColor(value: number) {
  if (value < 30) return '#38BDF8';
  if (value < 70) return '#F59E0B';
  return '#FB7185';
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const afterNext = points[index + 2] ?? next;
    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = current.y + (next.y - previous.y) / 6;
    const control2X = next.x - (afterNext.x - current.x) / 6;
    const control2Y = next.y - (afterNext.y - current.y) / 6;
    path += ` C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y}`;
  }
  return path;
}

function TensionHistoryChart({ history }: { history: TensionPoint[] }) {
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, history.length - 1));

  useEffect(() => {
    setSelectedIndex(Math.max(0, history.length - 1));
  }, [history]);

  const points = useMemo(() => {
    const width = 720;
    const chartLeft = 42;
    const chartRight = width - 18;
    const chartTop = 18;
    const chartBottom = 168;

    return history.map((point, index) => {
      const x =
        history.length === 1
          ? (chartLeft + chartRight) / 2
          : chartLeft + (index / (history.length - 1)) * (chartRight - chartLeft);
      const value = clampTension(point.value);
      const y = chartBottom - (value / 100) * (chartBottom - chartTop);
      return { ...point, value, x, y };
    });
  }, [history]);

  if (points.length === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-5 text-center text-sm leading-relaxed text-text-secondary">
        История индекса пока накапливается. Текущее значение уже доступно выше,
        а график появится после первых сохранённых дней.
      </div>
    );
  }

  const width = 720;
  const height = 210;
  const chartLeft = 42;
  const chartRight = width - 18;
  const chartTop = 18;
  const chartBottom = 168;
  const linePath = smoothPath(points);
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${chartBottom} L ${points[0].x} ${chartBottom} Z`
      : '';
  const selected = points[Math.min(selectedIndex, points.length - 1)];
  const selectedLeft = `${(selected.x / width) * 100}%`;
  const selectedTop = `${(selected.y / height) * 100}%`;
  const tooltipTranslateX =
    selected.x / width > 0.82 ? '-88%' : selected.x / width < 0.18 ? '-12%' : '-50%';
  const gridValues = [0, 25, 50, 75, 100];
  const first = points[0];
  const last = points[points.length - 1];
  const change = Math.round((last.value - first.value) * 10) / 10;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label={`История напряжённости: ${points
            .map((point) => `${point.day} — ${Math.round(point.value)}`)
            .join('; ')}`}
        >
          <defs>
            {/*
              Градиенты привязаны к абсолютной шкале Y (18..168 = 100..0),
              поэтому низкое значение всегда синее, среднее — янтарное,
              высокое — красное. Цвет не зависит от времени слева направо.
            */}
            <linearGradient
              id="tension-history-area"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="18"
              x2="0"
              y2="168"
            >
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.28" />
              <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient
              id="tension-history-line"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="18"
              x2="0"
              y2="168"
            >
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
          </defs>

          {gridValues.map((gridValue) => {
            const y = chartBottom - (gridValue / 100) * (chartBottom - chartTop);
            return (
              <g key={gridValue}>
                <line
                  x1={chartLeft}
                  x2={chartRight}
                  y1={y}
                  y2={y}
                  stroke="#FFFFFF"
                  strokeOpacity={gridValue === 50 ? 0.11 : 0.055}
                  strokeDasharray={gridValue === 50 ? '5 5' : undefined}
                />
                <text
                  x={chartLeft - 9}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#7C8798"
                >
                  {gridValue}
                </text>
              </g>
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#tension-history-area)" />}
          <path
            d={linePath}
            fill="none"
            stroke="url(#tension-history-line)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {selected && (
            <line
              x1={selected.x}
              x2={selected.x}
              y1={chartTop}
              y2={chartBottom}
              stroke={pointColor(selected.value)}
              strokeOpacity="0.28"
              strokeDasharray="4 5"
            />
          )}

          {points.map((point, index) => {
            const isSelected = index === Math.min(selectedIndex, points.length - 1);
            return (
              <g key={`${point.day}-${index}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="13"
                  fill="transparent"
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  aria-label={`${point.day}: индекс ${Math.round(point.value)} из 100`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onFocus={() => setSelectedIndex(index)}
                  onClick={() => setSelectedIndex(index)}
                >
                  <title>{`${point.day}: ${Math.round(point.value)}/100`}</title>
                </circle>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isSelected ? 6.5 : 4.2}
                  fill={isSelected ? '#FFFFFF' : pointColor(point.value)}
                  stroke="#111827"
                  strokeWidth="2"
                  className="pointer-events-none"
                />
                <text
                  x={point.x}
                  y={height - 12}
                  textAnchor="middle"
                  fontSize="11.5"
                  fontWeight={isSelected ? 700 : 500}
                  fill={isSelected ? '#E5E7EB' : '#7C8798'}
                >
                  {point.day}
                </text>
              </g>
            );
          })}
        </svg>

        {selected && (
          <div
            className="pointer-events-none absolute z-10 rounded-xl border border-white/15 bg-[#111827]/96 px-3 py-2 text-center shadow-xl"
            style={{
              left: selectedLeft,
              top: selectedTop,
              transform: `translate(${tooltipTranslateX}, calc(-100% - 12px))`,
            }}
          >
            <div className="whitespace-nowrap text-[11px] font-semibold text-slate-400">
              {selected.day}
            </div>
            <div className="whitespace-nowrap text-sm font-black text-white">
              {Math.round(selected.value)} / 100
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
        <span>
          Начало периода: <strong className="text-slate-200">{Math.round(first.value)}</strong>
          {' · '}последнее: <strong className="text-slate-200">{Math.round(last.value)}</strong>
        </span>
        <span className={change > 0 ? 'font-bold text-amber-300' : change < 0 ? 'font-bold text-sky-300' : 'font-bold text-slate-300'}>
          {change > 0 ? `+${change}` : change} пункта за период
        </span>
      </div>
    </div>
  );
}

export default function TensionScale() {
  const [data, setData] = useState<TensionData | null>(null);
  const [phase, setPhase] = useState<TensionPhase>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dataRef = useRef<TensionData | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    const live = await fetchLiveTension();

    if (live) {
      dataRef.current = live;
      setData(live);
      setPhase('live');
    } else if (dataRef.current) {
      setPhase('stale');
    } else {
      setPhase('error');
    }

    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const safeLoad = async () => {
      if (!isMounted) return;
      await load();
    };

    void safeLoad();
    const interval = window.setInterval(() => void safeLoad(), 300_000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [load]);

  const value = data ? clampTension(data.current) : 0;
  const markerPosition = `${value}%`;
  const updatedLabel = formatDateTime(data?.updatedAt);

  // Время пересчёта (updatedAt) тикает каждые 15 минут даже тогда, когда новых
  // новостей нет и окно держит старые материалы. Поэтому о том, что поток идёт,
  // судим по возрасту самого свежего материала в выборке, а не по updatedAt.
  const sampleAgeHours = useMemo(() => {
    const raw = data?.sampleNewest;
    if (!raw) return null;
    const timestamp = new Date(raw).getTime();
    if (!Number.isFinite(timestamp)) return null;
    return Math.max(0, (Date.now() - timestamp) / 3_600_000);
  }, [data?.sampleNewest]);
  const sampleStale = sampleAgeHours !== null && sampleAgeHours > STALE_SAMPLE_HOURS;
  const staleHours = sampleAgeHours === null ? 0 : Math.round(sampleAgeHours);
  const sourceMix = data?.sourceMix ?? null;

  const historyStats = data?.historyStats ?? null;
  const showHistoryStats = Boolean(
    historyStats && historyStats.days >= MIN_STATS_DAYS && historyStats.median !== null,
  );
  // aboveDays — прошлые дни выше текущего значения: именно их доля
  // отвечает на фразу «ниже, чем в N% дней», и наоборот для belowDays.
  const lowerThanShare =
    historyStats && historyStats.days > 0
      ? Math.round((historyStats.aboveDays / historyStats.days) * 100)
      : 0;
  const higherThanShare =
    historyStats && historyStats.days > 0
      ? Math.round((historyStats.belowDays / historyStats.days) * 100)
      : 0;
  const contextPhrase = historyStats
    ? historyStats.aboveDays >= historyStats.belowDays
      ? `Ниже, чем в ${lowerThanShare}% накопленных дней`
      : `Выше, чем в ${higherThanShare}% накопленных дней`
    : '';

  const getStatusIcon = () => {
    if (value < 30) return <Snowflake className="h-5 w-5 text-blue-400" />;
    if (value < 70) return <Thermometer className="h-5 w-5 text-yellow-400" />;
    return <Flame className="h-5 w-5 text-red-400" />;
  };

  return (
    <motion.section
      id="tension"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 scroll-mt-24 lg:mb-12"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Activity className="h-6 w-6 text-cyan-300" />
        <h2 className="text-xl font-bold tracking-tight lg:text-2xl">
          Шкала напряжённости мира
        </h2>
        <GuideLink
          href="#guide-tension"
          label="Как читать шкалу"
          mobileLabel="Справка"
        />
      </div>
      <p className="-mt-4 mb-6 max-w-2xl text-xs leading-relaxed text-slate-400">
        Доля негатива во взвешенном потоке деловых лент за 24 часа. Это тон
        бизнес-прессы, а не оценка ситуации в мире.
      </p>

      <div className="relative rounded-xl2 border border-cyan-300/25 bg-bg-card p-5 shadow-xl shadow-cyan-950/20 sm:p-6 lg:p-8">
        {phase === 'loading' && !data && (
          <div className="min-h-[430px]" aria-busy="true" aria-label="Загрузка индекса напряжённости">
            <div className="flex items-center gap-3 text-text-secondary">
              <LoaderCircle className="h-5 w-5 animate-spin text-blue-300" />
              <span className="text-sm font-semibold">Загружаем актуальный индекс…</span>
            </div>
            <div className="mt-8 h-20 w-44 animate-pulse rounded-3xl bg-white/[0.06]" />
            <div className="mt-8 h-8 animate-pulse rounded-full bg-white/[0.07]" />
            <div className="mt-8 h-48 animate-pulse rounded-3xl bg-white/[0.045]" />
            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              Пока нет ответа сервера, демонстрационное значение не подставляется:
              лучше короткая загрузка, чем число, которое выглядит живым.
            </p>
          </div>
        )}

        {phase === 'error' && !data && (
          <ErrorNotice
            title="Индекс напряжённости временно недоступен"
            message="Не удалось получить живые данные из публичного кэша. Мы не показываем демонстрационное значение под видом актуального. Попробуйте обновить сейчас или дождитесь автоматической проверки через пять минут."
            onRetry={() => {
              setPhase('loading');
              void load(true);
            }}
            actionLabel={isRefreshing ? 'Проверяем…' : 'Обновить индекс'}
          />
        )}

        {data && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-2.5">
              {phase === 'live' ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Живые данные{updatedLabel ? ` · обновлено ${updatedLabel}` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Показано последнее успешное значение{updatedLabel ? ` от ${updatedLabel}` : ''}
                </span>
              )}

              {sampleStale && (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Нет свежих материалов {staleHours} {hoursWord(staleHours)} — значение считается по уходящему окну
                </span>
              )}

              {phase === 'stale' && (
                <button
                  type="button"
                  onClick={() => void load(true)}
                  disabled={isRefreshing}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-extrabold text-slate-100 transition-colors hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Проверяем…' : 'Повторить'}
                </button>
              )}

              {isRefreshing && phase === 'live' && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Обновляем…
                </span>
              )}
            </div>

            {sourceMix && sourceMix.length > 0 && (
              <p className="-mt-3 mb-6 text-xs leading-relaxed text-slate-400">
                Источники в выборке: {sourceMix.map((s) => `${s.name} ${s.count}`).join(' · ')}
                {sourceMix.length < 4
                  ? ' — в окно попали не все четыре ленты, взгляд уже, чем заявлено'
                  : ''}
              </p>
            )}

            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="text-6xl font-extrabold tracking-tighter tabular-nums lg:text-7xl">
                  {Math.round(value)}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {getStatusIcon()}
                    <span
                      className={`text-lg font-semibold ${
                        value < 30
                          ? 'text-blue-400'
                          : value < 70
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }`}
                    >
                      {data.label || 'Без подписи'}
                    </span>
                  </div>
                  <span className="text-sm text-text-secondary">из 100</span>
                </div>
              </div>
            </div>

            <div className="relative mb-2 pt-9">
              <div
                className="h-8 overflow-hidden rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, #3B82F6 0%, #3B82F6 30%, #F59E0B 50%, #EF4444 70%, #EF4444 100%)',
                }}
              >
                <div className="h-full w-full bg-linear-to-r from-blue-500/20 via-transparent to-transparent" />
              </div>
              <motion.div
                initial={{ left: 0 }}
                animate={{ left: markerPosition }}
                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
                className="absolute top-[calc(50%+18px)] z-10 -translate-x-1/2 -translate-y-1/2"
              >
                <div className="h-12 w-1 rounded-full bg-white shadow-lg shadow-white/30" />
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-white px-2 py-0.5 text-xs font-bold text-bg-primary">
                  {Math.round(value)}
                </div>
              </motion.div>
            </div>

            <div className="mb-8 flex justify-between px-1 text-xs text-text-secondary">
              <span>0 — Холодно</span>
              <span>30</span>
              <span>50</span>
              <span>70</span>
              <span>100 — Горячо</span>
            </div>

            {historyStats && (
              <div className="-mt-4 mb-8 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm leading-relaxed text-text-secondary">
                {showHistoryStats ? (
                  <>
                    <span className="font-extrabold text-text-primary">Исторический контекст:</span>{' '}
                    {contextPhrase} · медиана —{' '}
                    <span className="font-bold tabular-nums text-text-primary">
                      {formatStatValue(historyStats.median)}
                    </span>{' '}
                    · максимум —{' '}
                    <span className="font-bold tabular-nums text-text-primary">
                      {formatStatValue(historyStats.max)}
                    </span>{' '}
                    · наблюдений: {historyStats.days} {daysWord(historyStats.days)}. Это фон
                    новостного внимания, а не вероятность кризиса.
                  </>
                ) : (
                  <>
                    Исторический контекст появится после {MIN_STATS_DAYS} дней наблюдений:
                    сейчас накоплено{' '}
                    <span className="font-bold tabular-nums text-text-primary">
                      {historyStats.days} из {MIN_STATS_DAYS}
                    </span>
                    . Перцентиль и медиану на меньшей выборке не показываем — это был бы шум.
                  </>
                )}
              </div>
            )}

            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-text-secondary">
                  Изменение за последние 7 дней
                </div>
                {data.history.length < 7 && (
                  <div className="text-xs font-medium text-warning">
                    Накоплено {data.history.length} из 7 дней
                  </div>
                )}
              </div>
              <TensionHistoryChart history={data.history} />
            </div>

            <div className="mt-6 border-t border-border-subtle pt-5 text-sm text-text-secondary">
              На основе анализа{' '}
              <span className="font-semibold text-text-primary">
                {(data.newsCount ?? 0).toLocaleString('ru-RU')}
              </span>{' '}
              новостей за сутки
              {phase === 'stale' && (
                <span className="mt-1 block text-xs text-amber-200/80">
                  Обновление временно не удалось; автоматическая проверка повторится через пять минут.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </motion.section>
  );
}
