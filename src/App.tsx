import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { m as motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, BookOpen, HeartPulse, Sparkles } from 'lucide-react';
import Header from '@/components/Header';
const DailyBrief = lazy(() => import('@/components/DailyBrief'));
const RussiaBusiness = lazy(() => import('@/components/RussiaBusiness'));
const KeyAssets = lazy(() => import('@/components/KeyAssets'));
import Footer from '@/components/Footer';
import MarketTicker from '@/components/MarketTicker';
import TrustStrip from '@/components/TrustStrip';
import HowWeKnow from '@/components/HowWeKnow';
import PulseOrbit from '@/components/PulseOrbit';
import PageSignalIntro from '@/components/PageSignalIntro';
const BusinessMoney = lazy(() => import('@/components/BusinessMoney'));
const WhatChanged = lazy(() => import('@/components/WhatChanged'));
const MarketDesk = lazy(() => import('@/components/MarketDesk'));
import { DASHBOARD_THEME_ORDER, SECTION_THEMES, type SectionThemeId } from '@/components/sectionThemes.data';
import { SectionFallback } from '@/components/SectionFallback';
import { SectionBoundary } from '@/components/SectionBoundary';
import PAGE_DESCRIPTIONS from '@/lib/pageDescriptions.json';
import { PAGE_PATHS, pathFromLegacyHash, viewFromLocation, type AppView } from '@/lib/routes';

const NewsFeed = lazy(() => import('@/components/NewsFeed'));
const AboutProject = lazy(() => import('@/components/AboutProject'));
const AnalyticsGuide = lazy(() => import('@/components/AnalyticsGuide'));
const SystemStatus = lazy(() => import('@/components/SystemStatus'));

type SectionPageView = Exclude<AppView, 'dashboard' | 'guide' | 'status'>;
type InnerPageView = Exclude<AppView, 'dashboard'>;

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

const PAGE_INFO: Record<InnerPageView, PageInfo> = {
  passport: {
    themeId: 'passport',
    title: 'Сводка дня',
    description: PAGE_DESCRIPTIONS.passport,
  },
  russia: {
    themeId: 'russia',
    title: 'Россия и бизнес',
    description: PAGE_DESCRIPTIONS.russia,
  },
  global: {
    themeId: 'global',
    title: 'Мировые рынки',
    description: PAGE_DESCRIPTIONS.global,
  },
  brief: {
    themeId: 'brief',
    title: 'Коротко о рынке',
    description: PAGE_DESCRIPTIONS.brief,
  },
  news: {
    themeId: 'news',
    title: 'Лента публикаций',
    description: PAGE_DESCRIPTIONS.news,
  },
  memory: {
    themeId: 'memory',
    title: 'Архив и оценки',
    description: PAGE_DESCRIPTIONS.memory,
  },
  guide: {
    themeId: 'guide',
    title: 'Методология Market Pulse',
    description: PAGE_DESCRIPTIONS.guide,
  },
  about: {
    themeId: 'about',
    title: 'О проекте',
    description: PAGE_DESCRIPTIONS.about,
  },
  status: {
    themeId: 'status',
    title: 'Состояние системы',
    description: PAGE_DESCRIPTIONS.status,
  },
};

function DashboardPage() {
  const reduceMotion = useReducedMotion();
  const appear = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: reduceMotion
      ? { duration: 0 }
      : { duration: 0.52, delay, ease: 'easeOut' as const },
  });

  return (
    <>
      <section id="dashboard" className="overview-hero mb-12 scroll-mt-24 lg:mb-16">
        <div className="overview-hero__backdrop" aria-hidden="true" />
        <div className="overview-hero__copy">
          <motion.div className="overview-hero__eyebrow" {...appear(0.04)}>
            <span className="overview-hero__eyebrow-mark" aria-hidden="true">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span>MARKET PULSE</span>
            <span className="overview-hero__eyebrow-divider" aria-hidden="true" />
            <span className="overview-hero__eyebrow-subtitle">картина без лишнего шума</span>
          </motion.div>

          <motion.h1 className="overview-hero__title" initial={false}>
            Рынки в движении.
            <br />
            <span>Факты — на виду.</span>
          </motion.h1>

          <motion.p className="overview-hero__description" {...appear(0.16)}>
            Россия, мировые активы и деловые публикации — в одном обзоре. У каждого числа есть источник
            и время наблюдения, когда они доступны.
          </motion.p>

          <motion.div className="overview-hero__actions" {...appear(0.22)}>
            <a href={PAGE_PATHS.passport} className="overview-hero__primary-action">
              Смотреть сводку дня
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a href={PAGE_PATHS.guide} className="overview-hero__secondary-action">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Как проверяем данные
            </a>
          </motion.div>

          <motion.div className="overview-hero__note" {...appear(0.28)}>
            <span className="overview-hero__note-mark" aria-hidden="true">01</span>
            <p>Без прогнозов и рекомендаций. Источники и даты — рядом с числами.</p>
          </motion.div>
        </div>

        <motion.div className="overview-hero__visual" {...appear(0.14)}>
          <PulseOrbit />
        </motion.div>
      </section>

      <SectionBoundary title="Обзор и мои ориентиры">
        <Suspense fallback={<SectionFallback title="Главное за минуту" minHeightClass="min-h-[520px]" />}>
          <MarketDesk summary />
        </Suspense>
      </SectionBoundary>

      <section aria-labelledby="page-links-title" className="overview-topics mb-10 lg:mb-14">
        <div className="overview-topics__heading">
          <div>
            <p className="overview-section-kicker">ВЫБЕРИТЕ СВОЙ МАРШРУТ</p>
            <h2 id="page-links-title" className="overview-topics__title">С чего начнём?</h2>
          </div>
          <p className="overview-topics__intro">
            Одна тема — одна страница. Ничего лишнего не нужно прокручивать.
          </p>
        </div>

        <nav aria-label="Страницы Market Pulse" className="overview-topics__grid">
          {DASHBOARD_THEME_ORDER.map((themeId, index) => {
            const theme = SECTION_THEMES[themeId];
            const Icon = theme.icon;
            return (
              <motion.a
                key={theme.id}
                href={theme.href}
                className={`overview-topic-card group ${theme.cardClass}`}
                initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.42, delay: 0.08 + index * 0.045, ease: 'easeOut' }
                }
                whileHover={reduceMotion ? undefined : { y: -5, scale: 1.012 }}
                whileTap={reduceMotion ? undefined : { scale: 0.99 }}
              >
                <span className="overview-topic-card__topline">
                  <span className={`overview-topic-card__icon ${theme.iconClass}`} aria-hidden="true">
                    <Icon className="h-[19px] w-[19px]" />
                  </span>
                  <span className="overview-topic-card__index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </span>
                <span className="overview-topic-card__copy">
                  <span className={`overview-topic-card__title ${theme.textClass}`}>{theme.label}</span>
                  <span className="overview-topic-card__description">{theme.description}</span>
                </span>
                <span className="overview-topic-card__open">
                  Перейти
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </motion.a>
            );
          })}
        </nav>

        <a href={PAGE_PATHS.status} className="overview-status-link">
          <span className="overview-status-link__icon" aria-hidden="true">
            <HeartPulse className="h-[18px] w-[18px]" />
          </span>
          <span className="overview-status-link__text">
            <span className="overview-status-link__title">Состояние системы</span>
            <span className="overview-status-link__description">Источники, котировки и проверки</span>
          </span>
          <ArrowRight className="overview-status-link__arrow" aria-hidden="true" />
        </a>
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
          <PageSignalIntro page={page} />
          <SectionBoundary title="Деньги бизнеса сегодня"><Suspense fallback={<SectionFallback title="Деньги бизнеса сегодня" />}><BusinessMoney /></Suspense></SectionBoundary>
          <SectionBoundary title="Что меняется"><Suspense fallback={<SectionFallback title="Что меняется" />}><WhatChanged /></Suspense></SectionBoundary>
        </>
      );
    case 'russia':
      return (
        <>
          <PageSignalIntro page={page} />
          <SectionBoundary title="Россия и бизнес"><Suspense fallback={<SectionFallback title="Россия и бизнес" />}><RussiaBusiness /></Suspense></SectionBoundary>
        </>
      );
    case 'global':
      return (
        <>
          <PageSignalIntro page={page} />
          <MarketTicker />
          <SectionBoundary title="Мои ориентиры и сравнение">
            <Suspense fallback={<SectionFallback title="Мои ориентиры и сравнение" minHeightClass="min-h-[600px]" />}>
              <MarketDesk />
            </Suspense>
          </SectionBoundary>
          <section
            id="global-economy"
            aria-labelledby="global-economy-title"
            className="deferred-market-layout mb-10 scroll-mt-24 rounded-[28px] border border-cyan-200/80 bg-linear-to-br from-cyan-50/80 via-white to-blue-50/70 p-3 shadow-sm sm:p-5 lg:mb-12 lg:p-6"
          >
            <div className="mb-6 px-1 pt-1 sm:px-2">
              <h2 id="global-economy-title" className="text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
                Глобальная экономика
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-text-secondary sm:text-base">
                Мировые котировки и графики с датами наблюдений. Рубль и Мосбиржа находятся на отдельной странице российского контура.
              </p>
            </div>
            <SectionBoundary title="Мировые рынки"><Suspense fallback={<SectionFallback title="Мировые рынки" />}><KeyAssets /></Suspense></SectionBoundary>
          </section>
        </>
      );
    case 'brief':
      return (
        <>
          <PageSignalIntro page={page} />
          <SectionBoundary title="Бриф"><Suspense fallback={<SectionFallback title="Бриф" />}><DailyBrief /></Suspense></SectionBoundary>
        </>
      );
    case 'news':
      return (
        <>
          <PageSignalIntro page={page} />
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
      // Compatibility only: the incomplete forecast archive is not public.
      return <DashboardPage />;
    case 'about':
      return (
        <>
          <PageSignalIntro page={page} />
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
  const firstView = useRef(true);
  useEffect(() => { firstView.current = false; }, []);
  const reduceMotion = useReducedMotion();
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
    const description = PAGE_DESCRIPTIONS[view];
    document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')
      .forEach(meta => meta.setAttribute('content', description));
    document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]')
      .forEach(meta => meta.setAttribute('content', document.title));
    const canonical = `https://market-pulse1-eta.vercel.app${PAGE_PATHS[view]}`;
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical);
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
    <div className="site-shell min-h-screen pb-20 text-text-primary lg:pb-0" data-view={view}>
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
        <motion.div
          key={view}
          initial={reduceMotion || firstView.current ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.34, ease: 'easeOut' }}
        >
          {view === 'status' ? (
            <>
              <PageSignalIntro page={PAGE_INFO.status} />
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
            </>
          ) : view === 'guide' ? (
            <>
              <PageSignalIntro page={PAGE_INFO.guide} />
              <Suspense
                fallback={
                  <SectionFallback
                    title="Методология Market Pulse"
                    message="Загружаем полный гид: источники, формулы и ограничения…"
                    minHeightClass="min-h-[70vh]"
                    className="rounded-[28px]"
                  />
                }
              >
                <SectionBoundary title="Методология"><AnalyticsGuide /></SectionBoundary>
              </Suspense>
            </>
          ) : view === 'dashboard' ? (
            <DashboardPage />
          ) : (
            <SectionPage view={view} />
          )}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}

export default App;
