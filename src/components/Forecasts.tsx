import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  MinusCircle,
  AlertTriangle,
  Clock,
  RotateCcw,
  Target,
  ShieldQuestion,
  BarChart3,
} from 'lucide-react';
import { ForecastData } from '@/data/mockData';
import {
  fetchLiveForecasts,
  fetchForecastTrackRecord,
  TrackRecordRow,
} from '@/data/liveForecasts';
import GuideLink from './GuideLink';
import { ErrorNotice } from './SectionFallback';
import { SectionThemeBadge } from './sectionThemes';

function confidenceColor(confidence: string): string {
  if (confidence === 'Высокая') return 'text-positive';
  if (confidence === 'Средняя') return 'text-warning';
  return 'text-negative';
}

function confidenceBg(confidence: string): string {
  if (confidence === 'Высокая') return 'bg-positive/10';
  if (confidence === 'Средняя') return 'bg-warning/10';
  return 'bg-negative/10';
}

function ForecastCard({ forecast, index }: { forecast: ForecastData; index: number }) {
  // Защитный порог и на фронте: даже если старая строка бэкенда ещё
  // содержит up/down при балансе ниже 60/40, направленный вывод не показываем.
  const hasSignal = forecast.direction !== 'none' && forecast.probability >= 60;
  const isUp = hasSignal && forecast.direction === 'up';
  const isWeakTilt = hasSignal && forecast.probability < 70;
  const directionLabel = !hasSignal
    ? 'Нет сигнала'
    : isWeakTilt
      ? `Слабый перекос ${isUp ? 'вверх' : 'вниз'}`
      : isUp
        ? 'Вверх'
        : 'Вниз';
  const signalColor = !hasSignal
    ? 'text-text-secondary'
    : isUp
      ? 'text-positive'
      : 'text-negative';
  const barColor = !hasSignal ? 'bg-neutral' : isUp ? 'bg-positive' : 'bg-negative';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
      className="bg-bg-card rounded-xl2 p-6 lg:p-7 border border-emerald-300/20 shadow-lg shadow-emerald-950/10 hover:border-emerald-300/45 transition-all duration-300"
    >
      {/* Asset + Direction */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <span className="text-lg font-bold text-text-primary">{forecast.asset}</span>
        <div className={`flex items-center gap-2 text-right ${signalColor}`}>
          {!hasSignal ? (
            <MinusCircle className="w-7 h-7 shrink-0" />
          ) : isUp ? (
            <ArrowUpCircle className="w-7 h-7 shrink-0" />
          ) : (
            <ArrowDownCircle className="w-7 h-7 shrink-0" />
          )}
          <span className="text-sm font-bold uppercase tracking-wide">
            {directionLabel}
          </span>
        </div>
      </div>

      {/* Probability bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-secondary">Баланс сигналов</span>
          <span className={`text-2xl font-bold tabular-nums ${signalColor}`}>
            {forecast.probability}%
          </span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed mb-3">
          {hasSignal
            ? 'Доля взвешенных новостных сигналов на стороне стрелки. 50% — перевеса нет; это не шанс движения цены.'
            : 'Доля взвешенных сигналов на большей стороне. Ниже порога 60% сигналы считаются шумом, поэтому направленный вывод не делается.'}
        </p>
        <div className="relative">
          <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${forecast.probability}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.3 + index * 0.1, ease: 'easeOut' }}
              className={`h-full rounded-full ${barColor}`}
            />
          </div>
          <div className="absolute left-1/2 top-[-3px] h-[14px] w-[2px] -translate-x-1/2 rounded-sm bg-white/90" />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-medium text-text-secondary">
          <span>0%</span>
          <span>50% — нет перевеса</span>
          <span>100%</span>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 text-text-secondary mt-0.5 shrink-0" />
          <div>
            <div className="text-xs text-text-secondary mb-0.5">Окно</div>
            <div className="text-sm font-semibold text-text-primary">
              {hasSignal ? forecast.time_window : '—'}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ShieldQuestion className="w-4 h-4 text-text-secondary mt-0.5 shrink-0" />
          <div>
            <div className="text-xs text-text-secondary mb-0.5">Уверенность</div>
            <span
              className={`inline-block text-sm font-semibold px-2 py-0.5 rounded-md ${
                hasSignal
                  ? `${confidenceBg(forecast.confidence)} ${confidenceColor(forecast.confidence)}`
                  : 'bg-neutral/10 text-text-secondary'
              }`}
            >
              {hasSignal ? forecast.confidence : 'Нет вывода'}
            </span>
          </div>
        </div>
      </div>

      {/* Reason */}
      <div className="pt-4 border-t border-border-subtle">
        <div className="flex items-start gap-2">
          <Target className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs text-text-secondary mb-1">Основание</div>
            <p className="text-sm text-text-primary leading-relaxed">
              {forecast.reason}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const MIN_SCORED_FOR_VERDICT = 30;

/**
 * Честный счёт: не «мы умеем предсказывать», а сколько прогнозов выдано,
 * сколько уже проверено рынком и с каким качеством. Брайер 0.25 — это
 * подбрасывание монеты, 0 — идеал. Пока проверенных меньше тридцати, сайт
 * прямо говорит, что вывода о предсказательной силе нет.
 */
function ForecastScoreboard({ track }: { track: TrackRecordRow | null }) {
  if (!track) return null;

  const enough = track.scored >= MIN_SCORED_FOR_VERDICT;
  const percent = (value: number | null) =>
    value === null ? '—' : `${Math.round(value * 100)} %`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="mt-6 rounded-xl2 border border-slate-600/30 bg-bg-card/60 p-5 lg:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 shrink-0 text-emerald-300" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-secondary">
          Честный счёт прогнозов
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs text-text-secondary mb-0.5">Выдано</div>
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {track.issued}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-secondary mb-0.5">Проверено рынком</div>
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {track.scored}
          </div>
          <div className="text-[11px] text-text-secondary">
            ещё {track.pending} в работе
          </div>
        </div>
        <div>
          <div className="text-xs text-text-secondary mb-0.5">Попаданий</div>
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {percent(track.hit_rate)}
          </div>
          <div className="text-[11px] text-text-secondary">монетка даёт 50 %</div>
        </div>
        <div>
          <div className="text-xs text-text-secondary mb-0.5">Точность (Брайер)</div>
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {track.mean_brier === null ? '—' : track.mean_brier.toFixed(2)}
          </div>
          <div className="text-[11px] text-text-secondary">монетка 0.25, идеал 0</div>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-text-secondary">
        {enough
          ? `Проверенных прогнозов достаточно, чтобы судить о качестве. Текущая точность ${
              track.mean_brier?.toFixed(2) ?? '—'
            } против 0.25 у подбрасывания монеты — ${
              track.verdict === 'edge'
                ? 'преимущество подтверждено.'
                : 'преимущества над монеткой не видно, поэтому сигналы не выдаются за торговую рекомендацию.'
            }`
          : `Проверено ${track.scored} прогнозов из ${MIN_SCORED_FOR_VERDICT}, нужных для вывода — сайт не утверждает, что умеет предсказывать. Первая неделя отработала хуже монетки: девять из одиннадцати прогнозов говорили «вверх», а рынок в те дни падал. Причина была в шкале, а не в пороге: двум слабым совпавшим новостям хватало, чтобы получить оценку 1.000 — уверенность из почти ничего. С 28.10.2026 оценка сжимается к собственной базовой частоте актива, а направленный вывод требует минимум трёх независимых событий. Старые строки из истории не удалены: счёт не переписывается задним числом.`}
      </p>
    </motion.div>
  );
}

export default function Forecasts() {
  const [forecasts, setForecasts] = useState<ForecastData[]>([]);
  const [track, setTrack] = useState<TrackRecordRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    if (hasDataRef.current) setIsRefreshing(true);
    const [live, record] = await Promise.all([
      fetchLiveForecasts(),
      fetchForecastTrackRecord(),
    ]);
    if (!mountedRef.current) return;
    setTrack(record);

    if (live.length > 0) {
      hasDataRef.current = true;
      setForecasts(live);
      setError(null);
    } else {
      // Не затираем уже показанные сигналы пустым результатом: UI явно
      // помечает их как последние доступные, а не обновлённые.
      setError('Не удалось загрузить сигналы');
    }
    setLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const interval = setInterval(() => void load(), 300_000); // каждые 5 минут
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load]);

  return (
    <motion.section
      id="forecasts"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 scroll-mt-24 lg:mb-12"
    >
      <SectionThemeBadge themeId="forecasts" className="mb-4" />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight lg:text-2xl">Сигналы по активам</h2>
        <GuideLink
          href="#guide-forecasts"
          label="Что значит процент"
          mobileLabel="Справка"
        />
        {isRefreshing && (
          <span className="text-xs font-semibold text-slate-500">обновление…</span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5" aria-busy="true" aria-label="Загрузка сигналов">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="min-h-72 rounded-xl2 border border-border-subtle bg-bg-card p-6">
              <div className="flex items-center justify-between">
                <div className="h-6 w-24 animate-pulse rounded-sm bg-white/10" />
                <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
              </div>
              <div className="mt-10 h-8 w-20 animate-pulse rounded-sm bg-white/12" />
              <div className="mt-4 h-2 animate-pulse rounded-full bg-white/[0.08]" />
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
                <div className="h-12 animate-pulse rounded-xl bg-white/[0.06]" />
              </div>
              <div className="mt-8 space-y-2">
                <div className="h-4 animate-pulse rounded-sm bg-white/[0.07]" />
                <div className="h-4 w-4/5 animate-pulse rounded-sm bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      ) : forecasts.length === 0 ? (
        <ErrorNotice
          title="Сигналы временно недоступны"
          message="Не удалось прочитать публичный кэш прогнозов. Это не означает «нет сигнала» по рынку: направленный вывод просто не может быть показан без данных."
          onRetry={() => void load()}
          actionLabel={isRefreshing ? 'Проверяем…' : 'Повторить загрузку'}
        />
      ) : (
        <>
          {error && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100" role="status">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
              <span className="min-w-0 flex-1">
                Не удалось обновить сигналы — показаны последние успешно загруженные.
              </span>
              <button
                type="button"
                onClick={() => void load()}
                disabled={isRefreshing}
                className="inline-flex min-h-9 items-center gap-2 rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-extrabold text-amber-50 transition-colors hover:bg-amber-300/25 disabled:opacity-60"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Проверяем…' : 'Повторить'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            {forecasts.map((f, i) => (
              <ForecastCard key={f.id} forecast={f} index={i} />
            ))}
          </div>
          <ForecastScoreboard track={track} />
        </>
      )}

      {/* Disclaimer */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-6 bg-warning/5 border border-warning/20 rounded-xl2 p-5 lg:p-6 flex items-start gap-4"
      >
        <AlertTriangle className="w-6 h-6 text-warning shrink-0 mt-0.5" />
        <p className="text-base lg:text-lg font-semibold text-warning leading-snug">
          Это аналитика, а не инвестиционная рекомендация. Решение всегда за вами.
        </p>
      </motion.div>
    </motion.section>
  );
}