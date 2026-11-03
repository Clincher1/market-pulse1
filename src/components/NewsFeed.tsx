import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, ChevronDown, TrendingUp, TrendingDown, Filter, Clock, Gauge, Heart, ExternalLink, RotateCcw, SearchX, ShieldQuestion } from 'lucide-react';
import { NewsItem } from '@/data/marketTypes';
import { useLiveNews } from '@/hooks/useLiveNews';
import GuideLink from './GuideLink';
import { ErrorNotice } from './SectionFallback';
import { SectionThemeBadge } from './sectionThemes';

const ALL_SOURCES = 'Все источники';
const ALL_TOPICS = 'Все темы';
const ALL_ASSETS = 'Все активы';
const ALL_IMPORTANCE = 'Любая важность';
const SENTIMENT_OPTIONS = ['Любая', 'Позитивная', 'Нейтральная', 'Негативная'];
// Порог «3+» совпадает с тем, какие материалы вообще попадают в индекс
// напряжённости: всё, что модель оценила ниже тройки, — личное, политическое
// и бытовое, оно только забивает ленту. Поэтому по умолчанию стоит оно.
const DEFAULT_IMPORTANCE = '3+ — по существу';
const IMPORTANCE_OPTIONS = [
  DEFAULT_IMPORTANCE,
  ALL_IMPORTANCE,
  '6+ — заметные',
  '8+ — важные',
  '9+ — критические',
];
const NEWS_PREVIEW_COUNT = 4;

type NewsViewMode = 'latest' | 'half' | 'all';

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

function importanceThreshold(filter: string): number {
  if (filter.startsWith('9+')) return 9;
  if (filter.startsWith('8+')) return 8;
  if (filter.startsWith('6+')) return 6;
  return 3; // прежняя защита ленты от малозначимого шума
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

function similarCountLabel(extra: number): string {
  if (extra === 1) return '+1 похожее сообщение';
  if (extra >= 2 && extra <= 4) return `+${extra} похожих сообщения`;
  return `+${extra} похожих сообщений`;
}

function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const confidence = item.confidence ?? 0.5;
  const duplicateExtra = Math.max(0, (item.duplicateCount ?? 1) - 1);

  return (
    <motion.article
      data-testid="news-card"
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
      className="bg-bg-card rounded-xl2 p-5 lg:p-6 border border-border-subtle shadow-lg hover:border-amber-300/40 hover:bg-bg-card-hover transition-all duration-300"
    >
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 bg-amber-400/10 text-amber-200 text-xs font-bold rounded-md">
            {item.source}
          </span>
          <span className="text-xs text-text-secondary flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(item.published_at)}
          </span>
        </div>
        {duplicateExtra > 0 && (
          <span
            className="px-2.5 py-1 bg-white/5 border border-border-subtle text-text-secondary text-xs font-semibold rounded-md"
            title={`Похожие повторные сообщения объединены. Источники группы: ${(item.duplicateSources ?? [item.source]).join(', ')}`}
          >
            {similarCountLabel(duplicateExtra)} объединено
          </span>
        )}
      </div>

      {/* Заголовок — ссылка только если у новости реально есть URL */}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block mb-3"
        >
          <h3 className="text-base lg:text-lg font-bold leading-snug text-text-primary group-hover:text-amber-200 transition-colors">
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
        {/* Не «Влияние», а «Влияние по разметке»: чипы — это ответ
            классификатора по тексту, а не измеренное движение цены. На карточке
            про политику он может перечислить все пять активов сразу, и без
            подписи это читалось как доказанная связь. */}
        <span
          className="text-xs text-text-secondary font-medium"
          title="Направление влияния ставит классификатор по тексту новости и разметке ленты; это оценка текста, а не движение цены"
        >
          Влияние по разметке:
        </span>
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
            {/* Запятая, как у всех чисел на сайте: «−0,35», а не «-0.35». */}
            {item.sentiment.toFixed(2).replace('.', ',').replace('-', '\u2212')}{' '}
            {sentimentLabel(item.sentiment)}
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
  asset: string;
  importance: string;
};

type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

// Кастомный тёмный dropdown вместо нативного <select>:
// браузерный popup на Windows игнорировал тёмную тему и рисовал белый список
// со светлым унаследованным текстом. Здесь панель полностью контролируется сайтом.
function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-1">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`min-h-11 w-full cursor-pointer rounded-xl border bg-white/6 px-3.5 py-2.5 text-left text-sm font-semibold text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors focus:outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/40 ${
          open
            ? 'border-accent bg-accent/10 ring-2 ring-accent/40'
            : 'border-white/15 hover:border-accent/60 hover:bg-accent/10'
        }`}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="truncate">{value}</span>
          <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
            {!open && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-50 [animation-duration:1.8s]" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-amber-200 transition-transform duration-200 ${
                open ? 'rotate-180' : 'animate-pulse [animation-duration:1.8s]'
              }`}
            />
          </span>
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-64 overflow-auto rounded-xl border border-white/12 bg-[#111827] p-1.5 shadow-2xl shadow-black/50 ring-1 ring-black/30"
          >
            {options.map((option) => {
              const selected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent/50 ${
                    selected
                      ? 'bg-accent-strong text-white'
                      : 'text-text-primary hover:bg-white/10 hover:text-white focus:bg-white/10'
                  }`}
                >
                  <span className="truncate">{option}</span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function NewsFeed() {
  const {
    news: liveNews,
    loading,
    error,
    refresh,
    isRefreshing,
    lastUpdatedAt,
  } = useLiveNews();

  const [filters, setFilters] = useState<FilterState>({
    source: ALL_SOURCES,
    topic: ALL_TOPICS,
    sentiment: 'Любая',
    asset: ALL_ASSETS,
    importance: DEFAULT_IMPORTANCE,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  // По умолчанию лента не превращается в длинную стену: видны только
  // четыре последние новости. Остальные открываются ступенями 50% и 100%.
  const [visibleMode, setVisibleMode] = useState<NewsViewMode>('latest');

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

  const assetOptions = useMemo(() => {
    const unique = [
      ...new Set(
        liveNews.flatMap((item) => (item.impacts ?? []).map((impact) => impact.asset)),
      ),
    ].filter(Boolean);
    return [ALL_ASSETS, ...unique.sort((a, b) => a.localeCompare(b, 'ru'))];
  }, [liveNews]);

  // Если после обновления выбранное значение фильтра исчезло из данных —
  // сбрасываем его, чтобы пользователь не смотрел в пустую ленту.
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      source: sourceOptions.includes(prev.source) ? prev.source : ALL_SOURCES,
      topic: topicOptions.includes(prev.topic) ? prev.topic : ALL_TOPICS,
      asset: assetOptions.includes(prev.asset) ? prev.asset : ALL_ASSETS,
    }));
  }, [assetOptions, sourceOptions, topicOptions]);

  const resetFilters = () => {
    setFilters({
      source: ALL_SOURCES,
      topic: ALL_TOPICS,
      sentiment: 'Любая',
      asset: ALL_ASSETS,
      importance: DEFAULT_IMPORTANCE,
    });
  };

  const activeFilterCount = [
    filters.source !== ALL_SOURCES,
    filters.topic !== ALL_TOPICS,
    filters.sentiment !== 'Любая',
    filters.asset !== ALL_ASSETS,
    filters.importance !== ALL_IMPORTANCE,
  ].filter(Boolean).length;

  // При смене фильтров снова начинаем с компактного режима «последние 4»,
  // иначе новая выборка неожиданно развернётся на десятки карточек.
  useEffect(() => {
    setVisibleMode('latest');
  }, [filters]);

  const filteredNews = useMemo(() => {
    const minImportance = importanceThreshold(filters.importance);
    return liveNews.filter((item) => {
      if (item.importance < minImportance) return false;

      const sourceMatch =
        filters.source === ALL_SOURCES || item.source === filters.source;
      const topicMatch =
        filters.topic === ALL_TOPICS || item.topic === filters.topic;
      const sentimentMatch = sentimentMatches(item.sentiment, filters.sentiment);
      const assetMatch =
        filters.asset === ALL_ASSETS ||
        (item.impacts ?? []).some((impact) => impact.asset === filters.asset);
      return sourceMatch && topicMatch && sentimentMatch && assetMatch;
    });
  }, [filters, liveNews]);

  const halfCount = Math.min(
    filteredNews.length,
    Math.max(NEWS_PREVIEW_COUNT, Math.ceil(filteredNews.length / 2)),
  );
  const visibleCount =
    visibleMode === 'all'
      ? filteredNews.length
      : visibleMode === 'half'
        ? halfCount
        : Math.min(NEWS_PREVIEW_COUNT, filteredNews.length);
  const visibleNews = filteredNews.slice(0, visibleCount);
  const hiddenNewsCount = Math.max(0, filteredNews.length - visibleCount);
  const visibleShare = filteredNews.length > 0
    ? Math.round((visibleCount / filteredNews.length) * 100)
    : 0;

  // Пояс указан явно: иначе время рисуется в поясе того, кто открыл страницу
  // (а в статической сборке — в поясе сервера), и «12:45» нельзя проверить.
  const lastUpdatedLabel = lastUpdatedAt
    ? `${new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
      }).format(lastUpdatedAt)} МСК`
    : null;

  return (
    <motion.section
      id="news"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 scroll-mt-24 lg:mb-12"
    >
      <SectionThemeBadge themeId="news" className="mb-4" />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight lg:text-2xl">Глобальные новости</h2>
        <GuideLink
          href="#guide-news"
          label="Тональность и важность"
          mobileLabel="Справка"
        />
        {lastUpdatedLabel && !error && (
          <span className="ml-auto hidden text-xs font-semibold text-slate-400 sm:inline">
            Последняя проверка в {lastUpdatedLabel}
          </span>
        )}
      </div>
      <p className="mb-5 max-w-3xl text-sm leading-relaxed text-text-secondary">
        По умолчанию открыты только последние 4 новости. Остальная лента не удалена —
        её можно развернуть на половину или полностью кнопками под карточками.
      </p>

      <div className="relative z-30 mb-6 rounded-xl2 border border-amber-300/25 bg-bg-card p-4 shadow-lg shadow-amber-950/20 lg:p-5">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-text-secondary">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-extrabold text-slate-200">Фильтры</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-slate-950">
                {activeFilterCount}
              </span>
            )}
          </div>

          <span className="hidden text-sm font-semibold text-text-secondary sm:block" aria-live="polite">
            На экране {visibleCount} из {filteredNews.length} подходящих
          </span>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="news-filter-panel"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-sm font-extrabold text-amber-100 transition-colors hover:bg-amber-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {!filtersOpen && (
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-50 [animation-duration:1.8s]" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
              </span>
            )}
            {filtersOpen ? 'Свернуть фильтры' : 'Развернуть фильтры'}
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${
                filtersOpen ? 'rotate-180' : 'animate-pulse [animation-duration:1.8s]'
              }`}
            />
          </button>
        </div>

        <div
          id="news-filter-panel"
          className={`${filtersOpen ? 'mt-4 grid' : 'hidden'} grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5`}
        >
          <div>
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              Источник
            </span>
            <FilterSelect
              label="Фильтр по источнику"
              value={filters.source}
              options={sourceOptions}
              onChange={(source) => setFilters((prev) => ({ ...prev, source }))}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              Тема
            </span>
            <FilterSelect
              label="Фильтр по теме"
              value={filters.topic}
              options={topicOptions}
              onChange={(topic) => setFilters((prev) => ({ ...prev, topic }))}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              Актив влияния
            </span>
            <FilterSelect
              label="Фильтр по активу влияния"
              value={filters.asset}
              options={assetOptions}
              onChange={(asset) => setFilters((prev) => ({ ...prev, asset }))}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              Тональность
            </span>
            <FilterSelect
              label="Фильтр по тональности"
              value={filters.sentiment}
              options={SENTIMENT_OPTIONS}
              onChange={(sentiment) => setFilters((prev) => ({ ...prev, sentiment }))}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              Важность
            </span>
            <FilterSelect
              label="Фильтр по минимальной важности"
              value={filters.importance}
              options={IMPORTANCE_OPTIONS}
              onChange={(importance) => setFilters((prev) => ({ ...prev, importance }))}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/8 pt-4">
          <p className="text-xs leading-relaxed text-slate-400" aria-live="polite">
            {activeFilterCount > 0
              ? `Активно фильтров: ${activeFilterCount}. Подходит ${filteredNews.length} из ${liveNews.length} новостей; на экране сейчас ${visibleCount}.`
              : `Новости с важностью от 3/10: подходит ${filteredNews.length} из ${liveNews.length}; на экране сейчас ${visibleCount}.`}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            disabled={activeFilterCount === 0}
            className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-extrabold text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            Сбросить фильтры
          </button>
        </div>
      </div>

      {loading && liveNews.length === 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Загрузка новостей">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl2 border border-border-subtle bg-bg-card p-5 lg:p-6">
              <div className="flex gap-2">
                <div className="h-6 w-24 animate-pulse rounded-md bg-white/10" />
                <div className="h-6 w-20 animate-pulse rounded-md bg-white/[0.07]" />
              </div>
              <div className="mt-5 h-6 animate-pulse rounded-sm bg-white/10" />
              <div className="mt-2 h-6 w-3/4 animate-pulse rounded-sm bg-white/[0.08]" />
              <div className="mt-5 space-y-2">
                <div className="h-4 animate-pulse rounded-sm bg-white/[0.06]" />
                <div className="h-4 animate-pulse rounded-sm bg-white/[0.05]" />
                <div className="h-4 w-2/3 animate-pulse rounded-sm bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && liveNews.length === 0 && !loading && (
        <ErrorNotice
          title="Не удалось загрузить ленту новостей"
          message="Публичный кэш временно не ответил. Повторите загрузку сейчас — остальные разделы сайта при этом продолжают работать независимо."
          onRetry={() => void refresh()}
          actionLabel={isRefreshing ? 'Загружаем…' : 'Повторить загрузку'}
          className="mb-6"
        />
      )}

      {error && liveNews.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="min-w-0 flex-1">
            Не удалось обновить ленту. Ниже последние успешно загруженные новости
            {lastUpdatedLabel ? ` (проверка в ${lastUpdatedLabel})` : ''}.
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-extrabold text-amber-50 transition-colors hover:bg-amber-300/25 disabled:opacity-60"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Проверяем…' : 'Повторить'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="news-grid">
        <AnimatePresence mode="popLayout">
          {visibleNews.map((item, i) => (
            <NewsCard key={item.id} item={item} index={i} />
          ))}
        </AnimatePresence>
      </div>

      {filteredNews.length > NEWS_PREVIEW_COUNT && (
        <div
          data-testid="news-expand-controls"
          className="mt-6 rounded-xl2 border border-amber-300/25 bg-amber-400/[0.06] p-4 shadow-lg shadow-amber-950/10"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p
                data-testid="news-visible-status"
                className="text-sm font-extrabold text-amber-100"
                aria-live="polite"
              >
                На экране {visibleCount} из {filteredNews.length} · {visibleShare}%
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {hiddenNewsCount > 0
                  ? `Скрыто ещё: ${hiddenNewsCount}. Самые свежие новости остаются первыми.`
                  : 'Вся подходящая под фильтры лента открыта.'}
              </p>
            </div>

            <div
              role="group"
              aria-label="Количество новостей на экране"
              className="flex flex-wrap gap-2"
            >
              <button
                type="button"
                data-testid="news-show-latest"
                aria-pressed={visibleMode === 'latest'}
                onClick={() => setVisibleMode('latest')}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-200 ${
                  visibleMode === 'latest'
                    ? 'border-amber-300 bg-amber-400 text-slate-950'
                    : 'border-white/12 bg-white/[0.05] text-white hover:bg-white/10'
                }`}
              >
                {visibleMode === 'latest' ? 'Последние 4' : 'Свернуть до 4'}
              </button>
              <button
                type="button"
                data-testid="news-show-half"
                aria-pressed={visibleMode === 'half'}
                onClick={() => setVisibleMode('half')}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-200 ${
                  visibleMode === 'half'
                    ? 'border-amber-300 bg-amber-400 text-slate-950'
                    : 'border-amber-300/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15'
                }`}
              >
                Показать половину · {halfCount}
              </button>
              <button
                type="button"
                data-testid="news-show-all"
                aria-pressed={visibleMode === 'all'}
                onClick={() => setVisibleMode('all')}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-200 ${
                  visibleMode === 'all'
                    ? 'border-amber-300 bg-amber-400 text-slate-950'
                    : 'border-amber-300/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15'
                }`}
              >
                Показать все · {filteredNews.length}
              </button>
            </div>
          </div>

          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/25"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-500"
              style={{ width: `${visibleShare}%` }}
            />
          </div>
        </div>
      )}

      {!loading && liveNews.length > 0 && filteredNews.length === 0 && (
        <div className="rounded-xl2 border border-dashed border-white/12 bg-white/[0.03] px-6 py-14 text-center">
          <SearchX className="mx-auto h-9 w-9 text-slate-500" />
          <h3 className="mt-4 text-lg font-extrabold text-white">
            Под эту комбинацию фильтров новостей нет
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
            Это не означает, что лента пуста: в текущем кэше {liveNews.length} новостей,
            но ни одна одновременно не подходит под источник, тему, актив, тональность
            и выбранный порог важности.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-strong px-5 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-strong-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            <RotateCcw className="h-4 w-4" />
            Показать всю ленту
          </button>
        </div>
      )}
    </motion.section>
  );
}
