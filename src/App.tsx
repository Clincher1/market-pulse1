import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, HeartPulse } from 'lucide-react';
import Header from '@/components/Header';
import DailyPassport from './components/DailyPassport';
import DailyBrief from '@/components/DailyBrief';
import RussiaBusiness from '@/components/RussiaBusiness';
import KeyAssets from '@/components/KeyAssets';
import Footer from '@/components/Footer';
import MarketTicker from '@/components/MarketTicker';
import TrustStrip from '@/components/TrustStrip';
import HowWeKnow from '@/components/HowWeKnow';
import BusinessMoney from '@/components/BusinessMoney';
import WhatChanged from '@/components/WhatChanged';
import { DASHBOARD_THEME_ORDER, SECTION_THEMES, type SectionThemeId } from '@/components/sectionThemes.data';
import { SectionFallback } from '@/components/SectionFallback';
import { SectionBoundary } from '@/components/SectionBoundary';
import { PAGE_PATHS, pathFromLegacyHash, viewFromLocation, type AppView } from '@/lib/routes';

const NewsFeed = lazy(() => import('@/components/NewsFeed'));
const MarketMemory = lazy(() => import('@/components/MarketMemory'));
const AboutProject = lazy(() => import('@/components/AboutProject'));
const AnalyticsGuide = lazy(() => import('@/components/AnalyticsGuide'));
const SystemStatus = lazy(() => import('@/components/SystemStatus'));

type SectionPageView = Exclude<AppView, 'dashboard' | 'guide' | 'status'>;

type PageInfo = {
  themeId: SectionThemeId;
  title: string;
  description: string;
};

const VIEW_TITLES: Record<AppView, string> = {
  dashboard: 'Обзор рынка',
  passport: 'Сводка дня',
  russia: 'Россия и бизнес',
  global: 'Мировые рынки',
  brief: 'Коротко о рынке',
  news: 'Новости',
  memory: 'Память рынка',
  guide: 'Как читать сайт',
  about: 'О проекте',
  status: 'Состояние системы',
};

const PAGE_INFO: Record<SectionPageView, PageInfo> = {
  passport: {
    themeId: 'passport',
    title: 'Сводка дня',
    description: 'Зафиксированный паспорт, денежные ориентиры и изменения, уже видимые в рядах.',
  },
  russia: {
    themeId: 'russia',
    title: 'Россия и бизнес',
    description: 'Курсы, Московская биржа и российские деловые заголовки — каждый блок со своим источником.',
  },
  global: {
    themeId: 'global',
    title: 'Мировые рынки',
    description: 'Внешние рыночные ориентиры и история наблюдений, отделённые от российского контура.',
  },
  brief: {
    themeId: 'brief',
    title: 'Коротко о рынке',
    description: 'Сжатый обзор фактов из текущего снимка данных — без прогнозов и рекомендаций.',
  },
  news: {
    themeId: 'news',
    title: 'Лента публикаций',
    description: 'Исходные заголовки и ссылки на публикации; заголовок сам по себе не подтверждает событие или его причину.',
  },
  memory: {
    themeId: 'memory',
    title: 'Архив и оценки',
    description: 'Исторические прогнозные записи и рассчитанные исходы сохранены для проверки; новые прогнозы не выпускаются.',
  },
  about: {
    themeId: 'about',
    title: 'О проекте',
    description: 'Как устроен Market Pulse, откуда берутся данные и какие ограничения соблюдает сайт.',
  },
};

function PageHeading({ page }: { page: PageInfo }) {
  const theme = SECTION_THEMES[page.themeId];
  const Icon = theme.icon;

  return (
    <header className="relative mb-7 overflow-hidden rounded-[28px] border border-border-subtle bg-linear-to-br from-white via-blue-50/70 to-cyan-50/70 p-5 shadow-[0_12px_34px_rgba(15,23,42,0.06)] sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-blue-200/35 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${theme.iconClass}`} aria-hidden="true">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] font-extrabold uppercase tracking-[0.15em] ${theme.textClass}`}>
            {theme.order} · {theme.label}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
            {page.title}
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-text-secondary sm:text-base">
            {page.description}
          </p>
        </div>
        <a
          href={PAGE_PATHS.dashboard}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-sm font-bold text-text-primary shadow-sm transition-colors hover:border-accent/40 hover:bg-blue-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
        >
          Все разделы <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

function DashboardPage() {
  return (
    <>
      <section id="dashboard" className="mb-8 scroll-mt-24 lg:mb-9">
        <div className="relative overflow-hidden rounded-[32px] border border-blue-100 bg-linear-to-br from-white via-sky-50 to-indigo-50/80 p-6 shadow-[0_18px_48px_rgba(30,64,175,0.08)] sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-12 -top-20 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl" aria-hidden="true" />
          <div className="relative max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-blue-800 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
              Market Pulse · обзор
            </div>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-text-primary sm:text-4xl lg:text-5xl">
              Рынки — по темам, без лишнего шума
            </h1>
            <p className="mt-4 max-w-4xl text-base leading-relaxed text-text-secondary sm:text-lg">
              Рынки России и мира, заголовки публикаций и архив наблюдений — по отдельным страницам. У значений указан источник и момент наблюдения, когда они доступны. Новые прогнозы не выпускаются.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={PAGE_PATHS.passport}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-strong px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-blue-900/10 transition-all hover:-translate-y-0.5 hover:bg-accent-strong-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
              >
                Открыть сводку дня <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href={PAGE_PATHS.global}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-5 py-2.5 text-sm font-extrabold text-text-primary shadow-sm transition-colors hover:border-cyan-300 hover:bg-cyan-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
              >
                Мировые рынки <ArrowRight className="h-4 w-4 text-cyan-700" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="page-links-title" className="mb-8 lg:mb-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="page-links-title" className="text-xl font-extrabold tracking-tight text-text-primary sm:text-2xl">
              Перейти к разделу
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Каждая тема открывается отдельно — навигация остаётся в шапке и внизу экрана.
            </p>
          </div>
        </div>
        <nav aria-label="Страницы Market Pulse" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {DASHBOARD_THEME_ORDER.map((themeId) => {
            const theme = SECTION_THEMES[themeId];
            const Icon = theme.icon;
            return (
              <a
                key={theme.id}
                href={theme.href}
                className={`group flex min-h-[92px] items-center gap-3 rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${theme.cardClass}`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${theme.iconClass}`} aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-extrabold ${theme.textClass}`}>{theme.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{theme.description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </a>
            );
          })}
          <a
            href={PAGE_PATHS.status}
            className="group flex min-h-[92px] items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white" aria-hidden="true">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-emerald-800">Состояние системы</span>
              <span className="mt-1 block text-xs leading-relaxed text-text-secondary">Проверки источников, котировок и истории</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-emerald-700 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
        </nav>
      </section>

    </>
  );
}

function SectionPage({ view }: { view: SectionPageView }) {
  const page = PAGE_INFO[view];

  switch (view) {
    case 'passport':
      return (
        <>
          <PageHeading page={page} />
          <SectionBoundary title="Паспорт дня"><DailyPassport /></SectionBoundary>
          <SectionBoundary title="Деньги бизнеса сегодня"><BusinessMoney /></SectionBoundary>
          <SectionBoundary title="Что меняется"><WhatChanged /></SectionBoundary>
        </>
      );
    case 'russia':
      return (
        <>
          <PageHeading page={page} />
          <SectionBoundary title="Россия и бизнес"><RussiaBusiness /></SectionBoundary>
        </>
      );
    case 'global':
      return (
        <>
          <PageHeading page={page} />
          <MarketTicker />
          <section
            id="global-economy"
            aria-labelledby="global-economy-title"
            className="mb-10 scroll-mt-24 rounded-[28px] border border-cyan-200/80 bg-linear-to-br from-cyan-50/80 via-white to-blue-50/70 p-3 shadow-sm sm:p-5 lg:mb-12 lg:p-6"
          >
            <div className="mb-6 px-1 pt-1 sm:px-2">
              <h2 id="global-economy-title" className="text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
                Глобальная экономика
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-text-secondary sm:text-base">
                Мировые котировки и графики с датами наблюдений. Рубль и Мосбиржа находятся на отдельной странице российского контура.
              </p>
            </div>
            <SectionBoundary title="Мировые рынки"><KeyAssets /></SectionBoundary>
          </section>
        </>
      );
    case 'brief':
      return (
        <>
          <PageHeading page={page} />
          <SectionBoundary title="Бриф"><DailyBrief /></SectionBoundary>
        </>
      );
    case 'news':
      return (
        <>
          <PageHeading page={page} />
          <Suspense
            fallback={
              <SectionFallback
                id="news"
                title="Глобальные новости"
                message="Готовим фильтры, источники и последние заголовки…"
                minHeightClass="min-h-[560px]"
                className="mb-10 lg:mb-12"
              />
            }
          >
            <SectionBoundary title="Глобальные новости"><NewsFeed /></SectionBoundary>
          </Suspense>
        </>
      );
    case 'memory':
      return (
        <>
          <PageHeading page={page} />
          <Suspense
            fallback={
              <SectionFallback
                id="market-memory"
                title="Память рынка"
                message="Загружаем архив прежних записей и рассчитанные исходы по ценовым рядам…"
                minHeightClass="min-h-[760px]"
                className="mb-10 lg:mb-12"
              />
            }
          >
            <SectionBoundary title="Память рынка"><MarketMemory /></SectionBoundary>
          </Suspense>
        </>
      );
    case 'about':
      return (
        <>
          <PageHeading page={page} />
          <Suspense
            fallback={
              <SectionFallback
                id="about"
                title="О проекте"
                message="Загружаем архитектуру, правила честности и ограничения проекта…"
                minHeightClass="min-h-[460px]"
                className="mb-10 lg:mb-12"
              />
            }
          >
            <SectionBoundary title="О проекте"><AboutProject /></SectionBoundary>
          </Suspense>
          <details className="mb-10 rounded-2xl border border-border-subtle bg-bg-card p-4 shadow-sm lg:mb-12">
            <summary className="cursor-pointer text-sm font-extrabold text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent">
              Как собираем и проверяем данные
            </summary>
            <div className="mt-4">
              <HowWeKnow />
            </div>
          </details>
        </>
      );
  }
}

function App() {
  const [view, setView] = useState<AppView>(() =>
    typeof window === 'undefined' ? 'dashboard' : viewFromLocation(window.location.pathname, window.location.hash),
  );
  const [currentHash, setCurrentHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );

  useEffect(() => {
    const syncViewWithLocation = () => {
      const legacyPath = pathFromLegacyHash(window.location.pathname, window.location.hash);
      if (legacyPath) window.history.replaceState(null, '', legacyPath);

      setCurrentHash(window.location.hash);
      setView(viewFromLocation(window.location.pathname, window.location.hash));
    };

    syncViewWithLocation();
    window.addEventListener('hashchange', syncViewWithLocation);
    window.addEventListener('popstate', syncViewWithLocation);
    return () => {
      window.removeEventListener('hashchange', syncViewWithLocation);
      window.removeEventListener('popstate', syncViewWithLocation);
    };
  }, []);

  useEffect(() => {
    document.title = `${VIEW_TITLES[view]} — Market Pulse`;
  }, [view]);

  useEffect(() => {
    if (!currentHash) {
      if (view === 'guide') window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // A destination can appear after its lazy chunk loads. Recheck its position
    // briefly while async data settles, but stop as soon as the user takes over.
    let cancelled = false;
    let userInterrupted = false;
    let timer = 0;
    let attempts = 0;
    let corrections = 0;
    let stableTicks = 0;
    let lastHeight = 0;
    const startedAt = Date.now();
    const SETTLE_LIMIT_MS = 15000;
    const MAX_CORRECTIONS = 12;
    const markInterrupted = () => {
      userInterrupted = true;
    };

    window.addEventListener('wheel', markInterrupted, { passive: true });
    window.addEventListener('touchmove', markInterrupted, { passive: true });
    window.addEventListener('keydown', markInterrupted);

    const tryScroll = () => {
      if (cancelled || userInterrupted) return;
      let target: Element | null;
      try {
        target = document.querySelector(currentHash);
      } catch {
        return;
      }

      if (target) {
        const top = target.getBoundingClientRect().top;
        const height = document.documentElement.scrollHeight;
        const heightChanged = height !== lastHeight;
        lastHeight = height;

        const outOfRange = top < 48 || top > 220;
        if ((corrections === 0 || outOfRange) && corrections < MAX_CORRECTIONS) {
          target.scrollIntoView({
            behavior: corrections === 0 ? 'smooth' : 'auto',
            block: 'start',
          });
          corrections += 1;
          stableTicks = 0;
        } else if (heightChanged) {
          stableTicks = 0;
        } else {
          stableTicks += 1;
        }

        if (stableTicks >= 3 && Date.now() - startedAt > 1200) return;

        if (Date.now() - startedAt < SETTLE_LIMIT_MS) {
          timer = window.setTimeout(tryScroll, corrections === 1 ? 750 : 550);
        }
        return;
      }

      attempts += 1;
      if (Date.now() - startedAt < SETTLE_LIMIT_MS) {
        timer = window.setTimeout(tryScroll, attempts < 4 ? 60 : 250);
      }
    };

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(tryScroll);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener('wheel', markInterrupted);
      window.removeEventListener('touchmove', markInterrupted);
      window.removeEventListener('keydown', markInterrupted);
    };
  }, [currentHash, view]);

  return (
    <div className="min-h-screen bg-bg-primary pb-20 text-text-primary lg:pb-0">
      <a
        href="#main"
        onClick={(event) => {
          const main = document.getElementById('main');
          if (!main) return;
          event.preventDefault();
          main.focus({ preventScroll: true });
          main.scrollIntoView({ block: 'start' });
        }}
        className="sr-only rounded-full bg-accent-strong px-4 py-2 text-sm font-extrabold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
      >
        Перейти к содержанию
      </a>
      <Header activeView={view} />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-[1400px] px-4 pb-8 pt-24 outline-hidden sm:px-6 lg:px-10 lg:pt-28"
      >
        {view === 'status' ? (
          <Suspense
            fallback={
              <SectionFallback
                title="Состояние системы"
                message="Читаем отчёт самопроверки: источники, котировки, даты и историю…"
                minHeightClass="min-h-[60vh]"
                className="rounded-[28px]"
              />
            }
          >
            <TrustStrip />
            <SectionBoundary title="Состояние системы"><SystemStatus /></SectionBoundary>
          </Suspense>
        ) : view === 'guide' ? (
          <Suspense
            fallback={
              <SectionFallback
                title="Методология Market Pulse"
                message="Загружаем полный гид: источники, ограничения и память рынка…"
                minHeightClass="min-h-[70vh]"
                className="rounded-[28px]"
              />
            }
          >
            <SectionBoundary title="Методология"><AnalyticsGuide /></SectionBoundary>
          </Suspense>
        ) : view === 'dashboard' ? (
          <DashboardPage />
        ) : (
          <SectionPage view={view} />
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
