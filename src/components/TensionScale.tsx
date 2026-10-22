import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Flame, Snowflake, Thermometer } from 'lucide-react';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { tensionData as fallbackData } from '@/data/mockData';
import { fetchLiveTension } from '@/data/liveTension';
import GuideLink from './GuideLink';

export default function TensionScale() {
  const [data, setData] = useState(fallbackData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const live = await fetchLiveTension();
      if (isMounted && live) {
        setData(live);
      }
      if (isMounted) setLoading(false);
    }

    load();
    const interval = setInterval(load, 300_000); // Обновляем каждые 5 минут
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const value = Math.min(100, Math.max(0, data.current));

  // Позиция маркера строго соответствует значению: 43 -> 43% шкалы.
  const markerPosition = `${value}%`;

  const getStatusIcon = () => {
    if (value < 30) return <Snowflake className="w-5 h-5 text-blue-400" />;
    if (value < 70) return <Thermometer className="w-5 h-5 text-yellow-400" />;
    return <Flame className="w-5 h-5 text-red-400" />;
  };

  return (
    <motion.section
      id="dashboard"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 lg:mb-12"
    >
      <div className="flex items-center gap-3 mb-6">
        <Activity className="w-6 h-6 text-accent" />
        <h2 className="text-xl lg:text-2xl font-bold tracking-tight">
          Шкала напряжённости мира
        </h2>
        <GuideLink
          href="#guide-tension"
          label="Как читать шкалу"
          mobileLabel="Справка"
        />
      </div>

      <div className="bg-bg-card rounded-xl2 p-6 lg:p-8 border border-border-subtle shadow-xl relative">
        {loading && (
          <div className="absolute inset-0 bg-bg-card/80 flex items-center justify-center z-10 rounded-xl2">
            <span className="text-text-secondary animate-pulse">Загрузка индекса...</span>
          </div>
        )}

        {/* Current value display */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="text-6xl lg:text-7xl font-extrabold tracking-tighter tabular-nums">
              {value}
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {getStatusIcon()}
                <span className={`text-lg font-semibold ${value < 30 ? 'text-blue-400' : value < 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {data.label}
                </span>
              </div>
              <span className="text-sm text-text-secondary">из 100</span>
            </div>
          </div>
        </div>

        {/* Gradient bar */}
        <div className="relative mb-2">
          <div
            className="h-8 rounded-full overflow-hidden"
            style={{
              background:
                'linear-gradient(90deg, #3B82F6 0%, #3B82F6 30%, #F59E0B 50%, #EF4444 70%, #EF4444 100%)',
            }}
          >
            <div className="h-full w-full bg-linear-to-r from-blue-500/20 via-transparent to-transparent" />
          </div>
          {/* Marker */}
          <motion.div
            initial={{ left: 0 }}
            animate={{ left: markerPosition }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          >
            <div className="w-1 h-12 bg-white rounded-full shadow-lg shadow-white/30" />
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-white text-bg-primary text-xs font-bold rounded-sm whitespace-nowrap">
              {value}
            </div>
          </motion.div>
        </div>

        {/* Scale labels */}
        <div className="flex justify-between text-xs text-text-secondary px-1 mb-8">
          <span>0 — Холодно</span>
          <span>30</span>
          <span>50</span>
          <span>70</span>
          <span>100 — Горячо</span>
        </div>

        {/* 7-day chart */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-text-secondary font-medium">
              Изменение за последние 7 дней
            </div>
            {/* Честная подпись, если реальных дней в истории меньше 7
                (дубли одного дня схлопываются в liveTension.ts) */}
            {data.history.length < 7 && (
              <div className="text-xs text-warning font-medium">
                Накоплено {data.history.length} из 7 дней
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.history.length > 0 ? data.history : fallbackData.history} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="tensionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  background: '#111827',
                  border: '1px solid #1F2937',
                  borderRadius: '12px',
                  color: '#F9FAFB',
                  fontSize: '13px',
                }}
                labelStyle={{ color: '#9CA3AF' }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#F59E0B"
                strokeWidth={2.5}
                fill="url(#tensionGradient)"
                dot={{ fill: '#F59E0B', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-6 pt-5 border-t border-border-subtle text-sm text-text-secondary">
          На основе анализа{' '}
          <span className="text-text-primary font-semibold">
            {(data.newsCount ?? 0).toLocaleString('ru-RU')}
          </span>{' '}
          новостей за сутки
        </div>
      </div>
    </motion.section>
  );
}
