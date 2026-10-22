import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import MarketHeatmap from './MarketHeatmap';
import GuideLink from './GuideLink';

export default function KeyAssets() {
  const { assets, loading, error } = useLiveAssets();

  return (
    <motion.section
      id="global-markets"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="my-6 scroll-mt-24"
    >
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-cyan-300">
              <Globe className="h-3.5 w-3.5" />
              Глобальный контур
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight lg:text-2xl">
              Мировые рынки — внешний фон
            </h2>
          </div>
          {loading && (
            <span className="animate-pulse text-sm text-text-secondary">
              обновление…
            </span>
          )}
          <GuideLink
            href="#guide-assets"
            label="Цена, % и график"
            mobileLabel="Справка"
          />
        </div>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Это не российский рынок.</strong> Ниже только внешние ориентиры:
          USD/EUR, S&amp;P 500, Brent, золото и BTC. Рубль, Мосбиржа и RGBI показаны выше в отдельном
          российском контуре — так внешний драйвер не смешивается с реакцией России.
        </p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-warning">
          Живые цены временно недоступны — показаны последние доступные значения.
        </div>
      )}

      <MarketHeatmap assets={assets} loading={loading} />
    </motion.section>
  );
}
