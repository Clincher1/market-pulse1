import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import TensionScale from '@/components/TensionScale';
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
            <TensionScale />
            <KeyAssets />
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
