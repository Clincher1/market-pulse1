import { motion } from 'framer-motion';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import MarketHeatmap from './MarketHeatmap';
import GuideLink from './GuideLink';

export default function KeyAssets() {
  const { assets, loading, error } = useLiveAssets();

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 lg:mb-12"
    >
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl lg:text-2xl font-bold tracking-tight">
          Ключевые активы
        </h2>
        {loading && (
          <span className="text-sm text-text-secondary animate-pulse">
            обновление…
          </span>
        )}
        <GuideLink
          href="#guide-assets"
          label="Цена, % и график"
          mobileLabel="Справка"
        />
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
