import { lazy, Suspense, useEffect, useState } from 'react';
import Header from '@/components/Header';
import TensionScale from '@/components/TensionScale';
import DailyBrief from '@/components/DailyBrief';
import RussiaBusiness from '@/components/RussiaBusiness';
import KeyAssets from '@/components/KeyAssets';
import Footer from '@/components/Footer';
import { DeferredMount, SectionFallback } from '@/components/SectionFallback';

const NewsFeed = lazy(() => import('@/components/NewsFeed'));
const Forecasts = lazy(() => import('@/components/Forecasts'));
const MarketMemory = lazy(() => import('@/components/MarketMemory'));
const AboutProject = lazy(() => import('@/components/AboutProject'));
const AnalyticsGuide = lazy(() => import('@/components/AnalyticsGuide'));

type AppView = 'dashboard' | 'guide';

function viewFromHash(hash: string): AppView {
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
    // внутри AnalyticsGuide). Поэтому не ограничиваемся одним кадром:
    // повторяем поиск несколько секунд, пока элемент реально не появится.
    let cancelled = false;
    let timer = 0;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;
      let target: Element | null = null;
      try {
        target = document.querySelector(currentHash);
      } catch {
        return;
      }

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      attempts += 1;
      if (attempts < 16) {
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
    };
  }, [currentHash, view]);

  return (
    <div className="min-h-screen bg-bg-primary pb-20 text-text-primary md:pb-0">
      <Header activeView={view} />
      <main className="mx-auto max-w-[1400px] px-4 pb-8 pt-24 sm:px-6 lg:px-10 lg:pt-28">
        {view === 'guide' ? (
          <Suspense
            fallback={
              <SectionFallback
                title="Методология Market Pulse"
                message="Загружаем полный гид: данные, сигналы, память рынка и ограничения…"
                minHeightClass="min-h-[70vh]"
                className="rounded-[28px]"
              />
            }
          >
            <AnalyticsGuide />
          </Suspense>
        ) : (
          <>
            <section className="mb-8 max-w-5xl lg:mb-10">
              <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">
                Аналитика простым языком
              </div>
              <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                Что произошло в мире — и что это значит для России и рынков
              </h1>
              <p className="mt-3 max-w-4xl text-base leading-relaxed text-text-secondary lg:text-lg">
                За несколько минут: сначала общий новостной фон, затем российские курсы и последствия для бизнеса,
                после этого фактическая реакция цен и только в конце — осторожная гипотеза, а не обещание прибыли.
              </p>
              <div className="mt-5 grid gap-2 text-sm font-semibold text-slate-200 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/4.5 px-4 py-3">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-white">1</span>
                  Смотрите фон и российские индикаторы
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4.5 px-4 py-3">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-white">2</span>
                  Проверяйте цены и первоисточники
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4.5 px-4 py-3">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-white">3</span>
                  Отличайте факт от прогноза
                </div>
              </div>
            </section>

            <TensionScale />
            <DailyBrief />
            <RussiaBusiness globalMarkets={<KeyAssets />} />

            <DeferredMount
              targetId="news"
              fallback={
                <SectionFallback
                  id="news"
                  title="Лента событий"
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
                    title="Лента событий"
                    message="Готовим фильтры, источники и последние новости…"
                    minHeightClass="min-h-[560px]"
                    className="mb-10 lg:mb-12"
                  />
                }
              >
                <NewsFeed />
              </Suspense>
            </DeferredMount>

            <DeferredMount
              targetId="forecasts"
              fallback={
                <SectionFallback
                  id="forecasts"
                  title="Сигналы по активам"
                  message="Раздел загрузится при приближении к нему; слабый баланс по-прежнему будет показан как «Нет сигнала»."
                  minHeightClass="min-h-[520px]"
                  className="mb-10 lg:mb-12"
                />
              }
            >
              <Suspense
                fallback={
                  <SectionFallback
                    id="forecasts"
                    title="Сигналы по активам"
                    message="Проверяем баланс свидетельств и порог 60/40…"
                    minHeightClass="min-h-[520px]"
                    className="mb-10 lg:mb-12"
                  />
                }
              >
                <Forecasts />
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
                    message="Собираем паспорта событий, замороженные сигналы и фактические исходы…"
                    minHeightClass="min-h-[760px]"
                    className="mb-10 lg:mb-12"
                  />
                }
              >
                <MarketMemory />
              </Suspense>
            </DeferredMount>

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
                <AboutProject />
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
