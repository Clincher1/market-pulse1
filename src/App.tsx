import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import TensionScale from '@/components/TensionScale';
import RussiaBusiness from '@/components/RussiaBusiness';
import KeyAssets from '@/components/KeyAssets';
import NewsFeed from '@/components/NewsFeed';
import Forecasts from '@/components/Forecasts';
import AnalyticsGuide from '@/components/AnalyticsGuide';
import Footer from '@/components/Footer';

type AppView = 'dashboard' | 'guide';

function viewFromHash(hash: string): AppView {
  return hash === '#guide' || hash.startsWith('#guide-') ? 'guide' : 'dashboard';
}

function App() {
  const [view, setView] = useState<AppView>(() =>
    typeof window === 'undefined' ? 'dashboard' : viewFromHash(window.location.hash)
  );
  const [currentHash, setCurrentHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash
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

    // После переключения между дашбордом и вкладкой «Как читать» целевой
    // элемент может появиться только на следующем кадре. Два RAF дают
    // React время смонтировать нужный вид перед прокруткой к якорю.
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.querySelector(currentHash)?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [currentHash, view]);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <Header activeView={view} />
      <main className="max-w-[1400px] mx-auto px-6 lg:px-10 pt-24 lg:pt-28 pb-8">
        {view === 'guide' ? (
          <AnalyticsGuide />
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
            <RussiaBusiness globalMarkets={<KeyAssets />} />
            <NewsFeed />
            <Forecasts />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
