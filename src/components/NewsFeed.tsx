import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Filter, Clock, Gauge, Heart, ExternalLink, ShieldQuestion } from 'lucide-react';
import { NewsItem } from '@/data/mockData';
import { useLiveNews } from '@/hooks/useLiveNews';

const ALL_SOURCES = 'Все источники';
const ALL_TOPICS = 'Все темы';
const SENTIMENT_OPTIONS = ['Любая', 'Позитивная', 'Нейтральная', 'Негативная'];

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

// Относительное время: "только что" / "N мин назад" / "N ч назад" / "N дн назад".
// Будущие даты (часы источника впереди) не дают отрицательных значений.
function formatTime(published_at: string | null | undefined): string {
  if (!published_at) return 'Неизвестно';
  const time = new Date(published_at).getTime();
  if (!Number.isFinite(time)) return 'Неизвестно';
  const diffMins = Math.floor((Date.now() - time) / 60000);
  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} дн назад`;
}

function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const confidence = item.confidence ?? 0.5;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
      className="bg-bg-card rounded-xl2 p-5 lg:p-6 border border-border-subtle shadow-lg hover:border-accent/30 hover:bg-bg-card-hover transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-accent/10 text-accent text-xs font-bold rounded-md">
            {item.source}
          </span>
          <span className="text-xs text-text-secondary flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(item.published_at)}
          </span>
        </div>
      </div>

      {/* Заголовок — ссылка только если у новости реально есть URL */}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block mb-3"
        >
          <h3 className="text-base lg:text-lg font-bold leading-snug text-text-primary group-hover:text-accent transition-colors">
            {item.title}
            <ExternalLink className="inline-block w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
          </h3>
        </a>
      ) : (
        <h3 className="text-base lg:text-lg font-bold leading-snug text-text-primary mb-3">
          {item.title}
        </h3>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-text-secondary font-medium">Влияние:</span>
        <div className="flex items-center gap-2 flex-wrap">
          {(item.impacts ?? []).map((impact, i) => (
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

      <p className="text-sm text-text-secondary leading-relaxed mb-4">
        {item.summary}
      </p>

      <div className="flex items-center gap-5 pt-4 border-t border-border-subtle flex-wrap">
        <div className="flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-xs text-text-secondary">Тональность:</span>
          <span className={`text-xs font-bold ${sentimentColor(item.sentiment)}`}>
            {item.sentiment > 0 ? '+' : ''}
            {Number(item.sentiment.toFixed(2))} {sentimentLabel(item.sentiment)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-xs text-text-secondary">Важность:</span>
          <span className={`text-xs font-bold ${importanceColor(item.importance)}`}>
            {item.importance}/10
          </span>
        </div>

        {/* Уверенность ИИ */}
        <div className="flex items-center gap-1.5">
          <ShieldQuestion className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-xs text-text-secondary">Уверенность:</span>
          <span
            className={`text-xs font-bold ${
              confidence > 0.7
                ? 'text-positive'
                : confidence > 0.4
                  ? 'text-warning'
                  : 'text-negative'
            }`}
          >
            {Math.round(confidence * 100)}%
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
  const { news: liveNews, loading, error } = useLiveNews();

  const [filters, setFilters] = useState<FilterState>({
    source: ALL_SOURCES,
    topic: ALL_TOPICS,
    sentiment: 'Любая',
  });

  // Списки фильтров строятся из реально пришедших новостей,
  // поэтому в них нет "мёртвых" источников/тем без единой новости.
  const sourceOptions = useMemo(() => {
    const unique = [...new Set(liveNews.map((n) => n.source).filter(Boolean))];
    return [ALL_SOURCES, ...unique.sort((a, b) => a.localeCompare(b, 'ru'))];
  }, [liveNews]);

  const topicOptions = useMemo(() => {
    const unique = [...new Set(liveNews.map((n) => n.topic).filter(Boolean))];
    return [ALL_TOPICS, ...unique.sort((a, b) => a.localeCompare(b, 'ru'))];
  }, [liveNews]);

  // Если после обновления выбранное значение фильтра исчезло из данных —
  // сбрасываем его, чтобы пользователь не смотрел в пустую ленту.
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      source: sourceOptions.includes(prev.source) ? prev.source : ALL_SOURCES,
      topic: topicOptions.includes(prev.topic) ? prev.topic : ALL_TOPICS,
    }));
  }, [sourceOptions, topicOptions]);

  const filteredNews = useMemo(() => {
    return liveNews.filter((item) => {
      // Скрываем мало важные новости (важность < 3)
      if (item.importance < 3) return false;

      const sourceMatch =
        filters.source === ALL_SOURCES || item.source === filters.source;
      const topicMatch =
        filters.topic === ALL_TOPICS || item.topic === filters.topic;
      const sentimentMatch = sentimentMatches(item.sentiment, filters.sentiment);
      return sourceMatch && topicMatch && sentimentMatch;
    });
  }, [filters, liveNews]);

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
          {sourceOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.topic}
          onChange={(e) => setFilters({ ...filters, topic: e.target.value })}
        >
          {topicOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.sentiment}
          onChange={(e) => setFilters({ ...filters, sentiment: e.target.value })}
        >
          {SENTIMENT_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-sm text-text-secondary self-center ml-auto hidden lg:block">
          {filteredNews.length} из {liveNews.length}
        </span>
      </div>

      {loading && liveNews.length === 0 && (
        <div className="text-center py-16 text-text-secondary">
          Загрузка новостей...
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-negative">
          Ошибка: {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredNews.map((item, i) => (
            <NewsCard key={item.id} item={item} index={i} />
          ))}
        </AnimatePresence>
      </div>

      {!loading && filteredNews.length === 0 && !error && (
        <div className="text-center py-16 text-text-secondary">
          Нет новостей, соответствующих выбранным фильтрам
        </div>
      )}
    </motion.section>
  );
}
