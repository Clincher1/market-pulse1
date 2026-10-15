import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { AssetData } from '@/data/mockData';
import { useLiveAssets } from '@/hooks/useLiveAssets';

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const chartData = data.map((v, i) => ({ i, v }));
  const color = positive ? '#10B981' : '#EF4444';

  return (
    <ResponsiveContainer width="100%" height={50}>
      <LineChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.8}
          dot={false}
          activeDot={false}
          isAnimationActive={true}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AssetCard({ asset, index }: { asset: AssetData; index: number }) {
  const positive = asset.change >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: 'easeOut' }}
      className="bg-bg-card rounded-xl2 p-5 border border-border-subtle shadow-lg hover:border-accent/30 hover:bg-bg-card-hover transition-all duration-300 group cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-semibold text-text-secondary group-hover:text-text-primary transition-colors">
          {asset.name}
        </span>
        <div
          className={`flex items-center gap-1 text-xs font-bold ${
            positive ? 'text-positive' : 'text-negative'
          }`}
        >
          {positive ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          {positive ? '+' : ''}
          {asset.change.toFixed(1)}%
        </div>
      </div>

      <div className="text-2xl font-bold tracking-tight tabular-nums mb-3">
        {asset.price}
      </div>

      <div className="mt-2 -mx-1">
        <Sparkline data={asset.sparkline} positive={positive} />
      </div>
    </motion.div>
  );
}

export default function KeyAssets() {
  const { assets } = useLiveAssets();

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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {assets.map((asset, i) => (
          <AssetCard key={asset.id} asset={asset} index={i} />
        ))}
      </div>
    </motion.section>
  );
}