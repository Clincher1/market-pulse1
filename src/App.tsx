import { lazy, Suspense, useEffect, useState } from 'react';
import Header from '@/components/Header';
import DailyPassport from './components/DailyPassport';
import TensionScale from '@/components/TensionScale';
import DailyBrief from '@/components/DailyBrief';
import RussiaBusiness from '@/components/RussiaBusiness';
import KeyAssets from '@/components/KeyAssets';
import Footer from '@/components/Footer';
import GuideTeaser from '@/components/GuideTeaser';
import DashboardQuickNav from '@/components/DashboardQuickNav';
import MarketTicker from '@/components/MarketTicker';
import TrustStrip from '@/components/TrustStrip';
import HowWeKnow from '@/components/HowWeKnow';
import BusinessMoney from '@/components/BusinessMoney';
import { SectionThemeBadge } from '@/components/sectionThemes';
import WhatChanged from '@/components/WhatChanged';
import { DeferredMount, SectionFallback } from '@/components/SectionFallback';
import { SectionBoundary } from '@/components/SectionBoundary';

const NewsFeed = lazy(() => import('@/components/NewsFeed'));
const MarketMemory = lazy(() => import('@/components/MarketMemory'));
const AboutProject = lazy(() => import('@/components/AboutProject'));
const AnalyticsGuide = lazy(() => import('@/components/AnalyticsGuide'));
const SystemStatus = lazy(() => import('@/components/SystemStatus'));

type AppView = 'dashboard' | 'guide' | 'status';

function viewFromHash(hash: string): AppView {
  if (hash === '#status') return 'status';
  return hash === '#guide' || hash.startsWith('#guide-') ? 'guide' : 'dashboard';
}

function App() {
  const [view, setView] = useState<AppView>(() =>
    typeof window === 'undefined' ? 'dashboard' : viewFromHash(window.location.hash),
  );
  const [currentHash, setCurrentHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );

  useEffect(() => {
    const syncViewWithHash = () => {
      setCurrentHash(window.location.hash);
      setView(viewFromHash(window.location.hash));
    };

    syncViewWithHash();
    window.addEventListener('hashchange', syncViewWithHash);
    return () => window.removeEventListener('hashchange', syncViewWithHash);
  }, []);

  useEffect(() => {
    if (!currentHash) {
      if (view === 'guide') window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // После переключения между дашбордом и гидом целевой элемент может
    // появиться только после загрузки lazy-чанка (например, #guide-memory
    // внутри AnalyticsGuide). Кроме того, асинхронные данные в секциях выше
    // цели могут изменить высоту страницы уже после первой прокрутки.
    // Поэтому несколько секунд мягко проверяем позицию и корректируем её,
    // пока пользователь сам не начнёт прокручивать страницу.
    let cancelled = false;
    let userInterrupted = false;
    let timer = 0;
    let attempts = 0;
    let corrections = 0;
    let stableTicks = 0;
    let lastHeight = 0;
    const startedAt = Date.now();
    // Данные секций приходят асинхронно и могут сдвинуть цель уже после первой
    // прокрутки, поэтому держим корректировку дольше, но выходим, как только
    // положение стало устойчивым, либо вмешался пользователь.
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
      let target: Element | null = null;
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
      {/*
        Первый Tab должен вести к содержанию, а не в шапку и нижнюю панель: до
        этого до main добирались через девять ссылок навигации на каждой
        странице. Ссылка видна только при фокусе — иначе она влезала бы в макет.
      */}
      <a
        href="#main"
        onClick={(event) => {
          // preventDefault обязателен: у роутера хэш — это адрес экрана, и
          // переход по #main выбросил бы с гида на дашборд. Без скриптов
          // ссылка остаётся рабочей как обычный якорь.
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
                message="Читаем отчёт самопроверки: индекс, ленты, котировки, историю…"
                minHeightClass="min-h-[60vh]"
                className="rounded-[28px]"
              />
            }
          >
            <SectionBoundary title="Состояние системы">
              <SystemStatus />
            </SectionBoundary>
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
            <SectionBoundary title="Методология">
              <AnalyticsGuide />
            </SectionBoundary>
          </Suspense>
        ) : (
          <>
            <section id="dashboard" className="mb-8 max-w-5xl scroll-mt-24 lg:mb-10">
              <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">
                Россия · мировая экономика · рынки
              </div>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                Что сейчас происходит на рынках — и откуда это известно
              </h1>
              <p className="mt-3 max-w-4xl text-base leading-relaxed text-text-secondary lg:text-lg">
                Дашборд фиксирует факты: российские курсы и Мосбиржу, мировой фон, напряжённость
                новостного фона и главные события дня. У каждого числа видно, когда оно получено,
                а у котировок — ещё и откуда: источник подписан на плитке или в раскрытой панели.
                Сайт не предсказывает цены и не даёт рекомендаций: здесь нет вероятностей и
                «сигналов» на будущее. Раздел «Что меняется» описывает только то, что уже произошло
                в рядах — серии дней, края окна, узкие диапазоны. Выдача прогнозов остановлена
                31 октября 2026 года; старые записи остаются в архиве памяти рынка вместе с промахами.
              </p>
            </section>

            {/* Первый экран по образцу лендингов: состояние рынка одной полосой,
                затем то, что можно проверить, затем процесс. Данные здесь только
                из кэша — новых запросов эти блоки не делают, кроме окна
                самопроверки за 7 дней. */}
            <MarketTicker />
            <TrustStrip />
            <HowWeKnow />

            <SectionBoundary title="Деньги бизнеса сегодня">
              <BusinessMoney />
            </SectionBoundary>

            <DashboardQuickNav />

            <SectionBoundary title="Паспорт дня">
              <DailyPassport />
            </SectionBoundary>

            <SectionBoundary title="Что меняется">
              <WhatChanged />
            </SectionBoundary>

            <SectionBoundary title="Россия">
              <RussiaBusiness />
            </SectionBoundary>

            <section
              id="global-economy"
              aria-labelledby="global-economy-title"
              className="mb-10 scroll-mt-24 rounded-[28px] border border-cyan-300/25 bg-cyan-400/[0.03] p-3 shadow-xl shadow-cyan-950/20 sm:p-5 lg:mb-12 lg:p-6"
            >
              <div className="mb-7 px-1 pt-1 sm:px-2">
                <SectionThemeBadge themeId="global" />
                <h2
                  id="global-economy-title"
                  className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl"
                >
                  Глобальная экономика
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-300 sm:text-base">
                  Внешний фон после российского блока: шкала новостного напряжения, затем
                  котировки и графики. Рубль и Мосбиржа — выше, в синем разделе.
                </p>
              </div>

              <SectionBoundary title="Шкала напряжённости">
                <TensionScale />
              </SectionBoundary>
              <SectionBoundary title="Мировые рынки">
                <KeyAssets />
              </SectionBoundary>
            </section>

            <SectionBoundary title="Бриф">
              <DailyBrief />
            </SectionBoundary>

            <DeferredMount
              targetId="news"
              fallback={
                <SectionFallback
                  id="news"
                  title="Глобальные новости"
                  message="Раздел загрузится при приближении к нему, чтобы первая страница открывалась быстрее."
                  minHeightClass="min-h-[560px]"
                  className="mb-10 lg:mb-12"
                />
              }
            >
              <Suspense
                fallback={
                  <SectionFallback
                    id="news"
                    title="Глобальные новости"
                    message="Готовим фильтры, источники и последние четыре новости…"
                    minHeightClass="min-h-[560px]"
                    className="mb-10 lg:mb-12"
                  />
                }
              >
                <SectionBoundary title="Глобальные новости" id="news">
                  <NewsFeed />
                </SectionBoundary>
              </Suspense>
            </DeferredMount>

            <DeferredMount
              targetId="market-memory"
              fallback={
                <SectionFallback
                  id="market-memory"
                  title="Память рынка"
                  message="Исследовательский раздел подключится при прокрутке: события, каналы влияния, аналогии и журнал проверки."
                  minHeightClass="min-h-[760px]"
                  className="mb-10 lg:mb-12"
                />
              }
            >
              <Suspense
                fallback={
                  <SectionFallback
                    id="market-memory"
                    title="Память рынка"
                    message="Поднимаем архив событий, зафиксированные ожидания и их исходы…"
                    minHeightClass="min-h-[760px]"
                    className="mb-10 lg:mb-12"
                  />
                }
              >
                <SectionBoundary title="Память рынка" id="market-memory">
                  <MarketMemory />
                </SectionBoundary>
              </Suspense>
            </DeferredMount>

            <GuideTeaser />

            <DeferredMount
              targetId="about"
              rootMargin="700px 0px"
              fallback={
                <SectionFallback
                  id="about"
                  title="О проекте"
                  message="Как устроена автономная система Market Pulse и что она сознательно не обещает."
                  minHeightClass="min-h-[460px]"
                  className="mb-10 lg:mb-12"
                />
              }
            >
              <Suspense
                fallback={
                  <SectionFallback
                    id="about"
                    title="О проекте"
                    message="Архитектура, стек, правила честности и ограничения…"
                    minHeightClass="min-h-[460px]"
                    className="mb-10 lg:mb-12"
                  />
                }
              >
                <SectionBoundary title="О проекте" id="about">
                  <AboutProject />
                </SectionBoundary>
              </Suspense>
            </DeferredMount>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
