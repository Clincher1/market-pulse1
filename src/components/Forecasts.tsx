import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  MinusCircle,
  AlertTriangle,
  Clock,
  Target,
  ShieldQuestion,
} from 'lucide-react';
import { ForecastData } from '@/data/mockData';
import { fetchLiveForecasts } from '@/data/liveForecasts';
import GuideLink from './GuideLink';

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
      className="bg-bg-card rounded-xl2 p-6 lg:p-7 border border-border-subtle shadow-lg hover:border-accent/30 transition-all duration-300"
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
          <div className="absolute left-1/2 -top-[3px] h-[14px] w-[2px] -translate-x-1/2 rounded bg-white/90" />
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
          <Target className="w-4 h-4 text-accent mt-0.5 shrink-0" />
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

export default function Forecasts() {
  const [forecasts, setForecasts] = useState<ForecastData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const live = await fetchLiveForecasts();
      if (!isMounted) return;

      if (live.length > 0) {
        setForecasts(live);
        setError(null);
      } else {
        // Не затираем уже показанные прогнозы пустым результатом.
        setError('Не удалось загрузить прогнозы');
      }
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 300_000); // обновление каждые 5 минут
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <motion.section
      id="forecasts"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 lg:mb-12"
    >
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl lg:text-2xl font-bold tracking-tight">Прогнозы</h2>
        <GuideLink
          href="#guide-forecasts"
          label="Что значит процент"
          mobileLabel="Справка"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-text-secondary animate-pulse">
          Загрузка прогнозов...
        </div>
      ) : forecasts.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          Прогнозы временно недоступны
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 text-sm text-warning">
              Не удалось обновить прогнозы — показаны последние доступные.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
            {forecasts.map((f, i) => (
              <ForecastCard key={f.id} forecast={f} index={i} />
            ))}
          </div>
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