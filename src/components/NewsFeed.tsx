import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Filter,
  RotateCcw,
  SearchX,
} from 'lucide-react';
import type { NewsHeadline } from '@/data/marketTypes';
import { useLiveNews } from '@/hooks/useLiveNews';
import GuideLink from './GuideLink';
import { ErrorNotice } from './SectionFallback';
import { SectionThemeBadge } from './sectionThemes';

const ALL_SOURCES = 'Все источники';
const NEWS_PREVIEW_COUNT = 4;
type NewsViewMode = 'latest' | 'half' | 'all';

function formatPublishedAt(publishedAt?: string | null, fallback?: string | null): string {
  const value = publishedAt || fallback;
  if (!value) return 'время публикации не указано';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date)} МСК`;
}

function NewsCard({ item, index }: { item: NewsHeadline; index: number }) {
  return (
    <motion.article
      data-testid="news-card"
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.24, delay: Math.min(index * 0.035, 0.25) }}
      className="rounded-xl2 border border-border-subtle bg-bg-card p-5 shadow-lg transition-colors hover:border-amber-300/40 hover:bg-bg-card-hover lg:p-6"
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="rounded-md bg-amber-400/10 px-2.5 py-1 font-bold text-amber-900">
          {item.source || 'Источник не указан'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-text-secondary">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {formatPublishedAt(item.published_at, item.time)}
        </span>
      </div>

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block min-h-8 py-1"
        >
          <h3 className="text-base font-bold leading-snug text-text-primary transition-colors group-hover:text-amber-900 lg:text-lg">
            {item.title || 'Заголовок не указан'}
            <ExternalLink className="ml-1 inline h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          </h3>
        </a>
      ) : (
        <div>
          <h3 className="text-base font-bold leading-snug text-text-primary lg:text-lg">
            {item.title || 'Заголовок не указан'}
          </h3>
          <p className="mt-2 text-xs text-text-secondary">Ссылка на публикацию не предоставлена источником.</p>
        </div>
      )}
    </motion.article>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
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
    <div ref={rootRef} className="relative w-full sm:max-w-sm">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`min-h-11 w-full rounded-xl border bg-slate-50 px-3.5 py-2.5 text-left text-sm font-semibold text-text-primary transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
          open ? 'border-accent bg-accent/10' : 'border-slate-200 hover:border-accent/60 hover:bg-accent/10'
        }`}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="truncate">{value}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-amber-900 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-bg-card p-1.5 shadow-2xl shadow-black/50"
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
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
                    selected ? 'bg-accent-strong text-white' : 'text-text-primary hover:bg-slate-100 hover:text-text-primary'
                  }`}
                >
                  <span className="truncate">{option}</span>
                  {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
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
    news,
    loading,
    error,
    refresh,
    isRefreshing,
    lastUpdatedAt,
  } = useLiveNews();
  const [source, setSource] = useState(ALL_SOURCES);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleMode, setVisibleMode] = useState<NewsViewMode>('latest');

  const sourceOptions = useMemo(() => {
    const unique = [...new Set(news.map((item) => item.source).filter(Boolean))];
    return [ALL_SOURCES, ...unique.sort((a, b) => a.localeCompare(b, 'ru'))];
  }, [news]);

  useEffect(() => {
    if (!sourceOptions.includes(source)) setSource(ALL_SOURCES);
  }, [source, sourceOptions]);

  useEffect(() => {
    setVisibleMode('latest');
  }, [source]);

  const filteredNews = useMemo(
    () => news.filter((item) => source === ALL_SOURCES || item.source === source),
    [news, source],
  );
  const activeFilterCount = source === ALL_SOURCES ? 0 : 1;
  const resetFilters = () => setSource(ALL_SOURCES);
  const halfCount = Math.min(filteredNews.length, Math.max(NEWS_PREVIEW_COUNT, Math.ceil(filteredNews.length / 2)));
  const visibleCount = visibleMode === 'all'
    ? filteredNews.length
    : visibleMode === 'half'
      ? halfCount
      : Math.min(NEWS_PREVIEW_COUNT, filteredNews.length);
  const visibleNews = filteredNews.slice(0, visibleCount);
  const hiddenNewsCount = Math.max(0, filteredNews.length - visibleCount);
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
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="mb-10 scroll-mt-24 lg:mb-12"
    >
      <SectionThemeBadge themeId="news" className="mb-4" />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight lg:text-2xl">Глобальные новости</h2>
        <GuideLink href="/guide#guide-news" label="О новостной ленте" mobileLabel="Справка" />
        {lastUpdatedLabel && !error && (
          <span className="ml-auto hidden text-xs font-semibold text-text-secondary sm:inline">
            Последняя проверка в {lastUpdatedLabel}
          </span>
        )}
      </div>
      <p className="mb-5 max-w-3xl text-sm leading-relaxed text-text-secondary">
        Показаны исходные заголовки, источник, время публикации и ссылка. Лента не
        ранжирует публикации по модельной важности или тональности и не приписывает
        им предполагаемое влияние на цены. Заголовок сам по себе не подтверждает
        отдельное событие или его причину.
      </p>

      <div className="relative z-30 mb-6 rounded-xl2 border border-amber-300/25 bg-bg-card p-4 shadow-lg shadow-amber-950/20 lg:p-5">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-text-secondary">
            <Filter className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-extrabold text-slate-700">Фильтр по источнику</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-slate-950">1</span>
            )}
          </div>
          <span className="text-sm font-semibold text-text-secondary" aria-live="polite">
            На экране {visibleCount} из {filteredNews.length} заголовков
          </span>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="news-filter-panel"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-sm font-extrabold text-amber-900 transition-colors hover:bg-amber-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {filtersOpen ? 'Свернуть' : 'Выбрать источник'}
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>
        <div id="news-filter-panel" className={filtersOpen ? 'mt-4 border-t border-slate-200 pt-4' : 'hidden'}>
          <FilterSelect
            label="Фильтр по источнику"
            value={source}
            options={sourceOptions}
            onChange={setSource}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <p className="text-xs leading-relaxed text-text-secondary" aria-live="polite">
              {`Загружено ${news.length} публикаций; фильтру соответствуют ${filteredNews.length}; на экране ${visibleCount}.`}
            </p>
            <button
              type="button"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
              className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-extrabold text-text-primary transition-colors hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Сбросить фильтр
            </button>
          </div>
        </div>
      </div>

      {loading && news.length === 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Загрузка заголовков">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl2 border border-border-subtle bg-bg-card p-5 lg:p-6">
              <div className="flex gap-2">
                <div className="h-6 w-24 animate-pulse rounded-md bg-slate-50" />
                <div className="h-6 w-36 animate-pulse rounded-md bg-slate-50" />
              </div>
              <div className="mt-5 h-6 animate-pulse rounded-sm bg-slate-50" />
              <div className="mt-2 h-6 w-3/4 animate-pulse rounded-sm bg-slate-50" />
            </div>
          ))}
        </div>
      )}

      {error && news.length === 0 && !loading && (
        <ErrorNotice
          title="Не удалось загрузить ленту новостей"
          message="Публичный кэш временно не ответил. Повторите загрузку сейчас — остальные разделы сайта продолжают работать независимо."
          onRetry={() => void refresh()}
          actionLabel={isRefreshing ? 'Загружаем…' : 'Повторить загрузку'}
          className="mb-6"
        />
      )}

      {error && news.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-900" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-900" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Не удалось обновить ленту. Ниже последние успешно загруженные заголовки
            {lastUpdatedLabel ? ` (проверка в ${lastUpdatedLabel})` : ''}.
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-extrabold text-amber-900 transition-colors hover:bg-amber-300/25 disabled:opacity-60"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {isRefreshing ? 'Проверяем…' : 'Повторить'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="news-grid">
        <AnimatePresence mode="popLayout">
          {visibleNews.map((item, index) => (
            <NewsCard key={item.id} item={item} index={index} />
          ))}
        </AnimatePresence>
      </div>

      {filteredNews.length > NEWS_PREVIEW_COUNT && (
        <div data-testid="news-expand-controls" className="mt-6 rounded-xl2 border border-amber-300/25 bg-amber-400/[0.06] p-4 shadow-lg shadow-amber-950/10">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p data-testid="news-visible-status" className="text-sm font-extrabold text-amber-900" aria-live="polite">
                На экране {visibleCount} из {filteredNews.length}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {hiddenNewsCount > 0
                  ? `Скрыто ещё ${hiddenNewsCount} заголовков из загруженной выборки.`
                  : 'Все загруженные заголовки по выбранному источнику открыты.'}
              </p>
            </div>
            <div role="group" aria-label="Количество заголовков на экране" className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="news-show-latest"
                aria-pressed={visibleMode === 'latest'}
                onClick={() => setVisibleMode('latest')}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-200 ${visibleMode === 'latest' ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-slate-200 bg-slate-50 text-text-primary hover:bg-slate-100'}`}
              >
                {visibleMode === 'latest' ? 'Последние 4' : 'Свернуть до 4'}
              </button>
              <button
                type="button"
                data-testid="news-show-half"
                aria-pressed={visibleMode === 'half'}
                onClick={() => setVisibleMode('half')}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-200 ${visibleMode === 'half' ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-amber-300/30 bg-amber-400/10 text-amber-900 hover:bg-amber-400/15'}`}
              >
                Показать половину · {halfCount}
              </button>
              <button
                type="button"
                data-testid="news-show-all"
                aria-pressed={visibleMode === 'all'}
                onClick={() => setVisibleMode('all')}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-extrabold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-200 ${visibleMode === 'all' ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-amber-300/30 bg-amber-400/10 text-amber-900 hover:bg-amber-400/15'}`}
              >
                Показать все · {filteredNews.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && news.length > 0 && filteredNews.length === 0 && (
        <div className="rounded-xl2 border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <SearchX className="mx-auto h-9 w-9 text-slate-500" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-extrabold text-text-primary">У этого источника нет загруженных заголовков</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
            В кэше есть {news.length} публикаций, но ни одна не относится к выбранному источнику.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-strong px-5 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-strong-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Показать все источники
          </button>
        </div>
      )}
    </motion.section>
  );
}
