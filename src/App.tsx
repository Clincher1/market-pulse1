import Header from '@/components/Header';
import TensionScale from '@/components/TensionScale';
import KeyAssets from '@/components/KeyAssets';
import NewsFeed from '@/components/NewsFeed';
import Forecasts from '@/components/Forecasts';
import Footer from '@/components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <Header />
      <main className="max-w-[1400px] mx-auto px-6 lg:px-10 pt-24 lg:pt-28 pb-8">
        <TensionScale />
        <KeyAssets />
        <NewsFeed />
        <Forecasts />
      </main>
      <Footer />
    </div>
  );
}

export default App;
