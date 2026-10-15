import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Filter, Clock, Gauge, Heart } from 'lucide-react';
import {
  newsItems,
  newsSources,
  newsTopics,
  newsSentiments,
  NewsItem,
} from '@/data/mockData';

function sentimentLabel(value: number): string {
  if (value < -0.3) return 'негатив';
  if (value < 0.3) return 'нейтрал';
  return 'позитив';
}

function sentimentColor(value: number): string {
  if (value < -0.3) return 'text-negative';
  if (value < 0.3) return 'text-text-secondary';
  return 'text-positive';
}

function importanceColor(value: number): string {
  if (value >= 8) return 'text-negative';
  if (value >= 6) return 'text-warning';
  return 'text-text-secondary';
}

function sentimentMatches(item: number, filter: string): boolean {
  if (filter === 'Любая') return true;
  const label = sentimentLabel(item);
  if (filter === 'Позитивная') return label === 'позитив';
  if (filter === 'Негативная') return label === 'негатив';
  if (filter === 'Нейтральная') return label === 'нейтрал';
  return true;
}

function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
      className="bg-bg-card rounded-xl2 p-5 lg:p-6 border border-border-subtle shadow-lg hover:border-accent/30 hover:bg-bg-card-hover transition-all duration-300"
    >
      {/* Source + time */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-accent/10 text-accent text-xs font-bold rounded-md">
            {item.source}
          </span>
          <span className="text-xs text-text-secondary flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {item.time}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-base lg:text-lg font-bold leading-snug mb-3 text-text-primary">
        {item.title}
      </h3>

      {/* Impact row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-text-secondary font-medium">Влияние:</span>
        <div className="flex items-center gap-2 flex-wrap">
          {item.impacts.map((impact, i) => (
            <span
              key={i}
              className={`flex items-center gap-1 text-xs font-semibold ${
                impact.direction === 'up' ? 'text-positive' : 'text-negative'
              }`}
            >
              {impact.asset}
              {impact.direction === 'up' ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-text-secondary leading-relaxed mb-4">
        {item.summary}
      </p>

      {/* Metrics row */}
      <div className="flex items-center gap-5 pt-4 border-t border-border-subtle flex-wrap">
        <div className="flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-xs text-text-secondary">Тональность:</span>
          <span className={`text-xs font-bold ${sentimentColor(item.sentiment)}`}>
            {item.sentiment > 0 ? '+' : ''}{item.sentiment} {sentimentLabel(item.sentiment)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-xs text-text-secondary">Важность:</span>
          <span className={`text-xs font-bold ${importanceColor(item.importance)}`}>
            {item.importance}/10
          </span>
        </div>
      </div>
    </motion.article>
  );
}

type FilterState = {
  source: string;
  topic: string;
  sentiment: string;
};

export default function NewsFeed() {
  const [filters, setFilters] = useState<FilterState>({
    source: 'Все источники',
    topic: 'Все темы',
    sentiment: 'Любая',
  });

  const filteredNews = useMemo(() => {
    return newsItems.filter((item) => {
      const sourceMatch =
        filters.source === 'Все источники' || item.source === filters.source;
      const topicMatch = filters.topic === 'Все темы' || item.topic === filters.topic;
      const sentimentMatch = sentimentMatches(item.sentiment, filters.sentiment);
      return sourceMatch && topicMatch && sentimentMatch;
    });
  }, [filters]);

  const selectClass =
    'bg-bg-card border border-border-subtle text-text-primary text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent transition-colors cursor-pointer appearance-none';

  return (
    <motion.section
      id="news"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 lg:mb-12"
    >
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl lg:text-2xl font-bold tracking-tight">Лента новостей</h2>
      </div>

      {/* Filters */}
      <div className="bg-bg-card rounded-xl2 p-4 lg:p-5 border border-border-subtle mb-6 flex flex-col sm:flex-row gap-3 lg:gap-4">
        <div className="flex items-center gap-2 text-text-secondary shrink-0">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium hidden sm:inline">Фильтры:</span>
        </div>
        <select
          className={selectClass}
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
        >
          {newsSources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.topic}
          onChange={(e) => setFilters({ ...filters, topic: e.target.value })}
        >
          {newsTopics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.sentiment}
          onChange={(e) => setFilters({ ...filters, sentiment: e.target.value })}
        >
          {newsSentiments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-sm text-text-secondary self-center ml-auto hidden lg:block">
          {filteredNews.length} из {newsItems.length}
        </span>
      </div>

      {/* News grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredNews.map((item, i) => (
            <NewsCard key={item.id} item={item} index={i} />
          ))}
        </AnimatePresence>
      </div>

      {filteredNews.length === 0 && (
        <div className="text-center py-16 text-text-secondary">
          Нет новостей, соответствующих выбранным фильтрам
        </div>
      )}
    </motion.section>
  );
}
