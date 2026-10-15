import { motion } from 'framer-motion';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  Clock,
  Target,
  ShieldQuestion,
} from 'lucide-react';
import { forecasts, ForecastData } from '@/data/mockData';

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
  const isUp = forecast.direction === 'up';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
      className="bg-bg-card rounded-xl2 p-6 lg:p-7 border border-border-subtle shadow-lg hover:border-accent/30 transition-all duration-300"
    >
      {/* Asset + Direction */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-lg font-bold text-text-primary">{forecast.asset}</span>
        <div
          className={`flex items-center gap-2 ${
            isUp ? 'text-positive' : 'text-negative'
          }`}
        >
          {isUp ? (
            <ArrowUpCircle className="w-7 h-7" />
          ) : (
            <ArrowDownCircle className="w-7 h-7" />
          )}
          <span className="text-sm font-bold uppercase tracking-wide">
            {isUp ? 'Вверх' : 'Вниз'}
          </span>
        </div>
      </div>

      {/* Probability bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-secondary">Вероятность</span>
          <span
            className={`text-2xl font-bold tabular-nums ${
              isUp ? 'text-positive' : 'text-negative'
            }`}
          >
            {forecast.probability}%
          </span>
        </div>
        <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${forecast.probability}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.3 + index * 0.1, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              isUp ? 'bg-positive' : 'bg-negative'
            }`}
          />
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 text-text-secondary mt-0.5 shrink-0" />
          <div>
            <div className="text-xs text-text-secondary mb-0.5">Окно</div>
            <div className="text-sm font-semibold text-text-primary">
              {forecast.window}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ShieldQuestion className="w-4 h-4 text-text-secondary mt-0.5 shrink-0" />
          <div>
            <div className="text-xs text-text-secondary mb-0.5">Уверенность</div>
            <span
              className={`inline-block text-sm font-semibold px-2 py-0.5 rounded-md ${confidenceBg(
                forecast.confidence
              )} ${confidenceColor(forecast.confidence)}`}
            >
              {forecast.confidence}
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        {forecasts.map((f, i) => (
          <ForecastCard key={f.id} forecast={f} index={i} />
        ))}
      </div>

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
