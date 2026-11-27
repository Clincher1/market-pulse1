import { m as motion } from 'framer-motion';
import { AlertTriangle, Globe, RotateCcw } from 'lucide-react';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import MarketHeatmap from './MarketHeatmap';
import GuideLink from './GuideLink';
import { ErrorNotice } from './SectionFallback';

export default function KeyAssets() {
  const {
    assets,
    loading,
    error,
    hasLiveData,
    fallbackAssetIds,
    refresh,
    isRefreshing,
  } = useLiveAssets();

  const fallbackNames = assets
    .filter((asset) => fallbackAssetIds.includes(asset.id))
    .map((asset) => asset.name);

  return (
    <motion.section
      id="global-markets"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="my-[var(--space-3)] scroll-mt-[var(--space-6)] rounded-[var(--radius)] border border-cyan-300/25 bg-cyan-400/[0.04] p-[var(--space-2)] shadow-xl shadow-cyan-950/20 sm:p-[var(--space-3)]"
    >
      <div className="mb-[var(--space-3)]">
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <div>
            <div className="flex items-center gap-[var(--space-1)] text-[11px] font-extrabold uppercase tracking-[0.14em] text-cyan-800">
              <Globe className="h-3.5 w-3.5" />
              Глобальный контур · котировки
            </div>
            <h2 className="mt-[var(--space-1)] text-xl font-bold tracking-tight lg:text-2xl">
              Мировые рынки — внешний фон
            </h2>
          </div>
          {(loading || isRefreshing) && (
            <span className="animate-pulse text-sm text-text-secondary">
              обновление…
            </span>
          )}
          <GuideLink
            href="/guide#guide-assets"
            label="Цена, % и график"
            mobileLabel="Справка"
          />
        </div>
        <p className="mt-[var(--space-1)] max-w-[72ch] text-sm leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Это не российский рынок.</strong> Ниже только внешние ориентиры:
          USD/EUR, S&amp;P 500, Brent, золото и BTC. Рубль, Мосбиржа и RGBI находятся на отдельной странице российского
          контура — так внешний драйвер не смешивается с реакцией России.
        </p>
      </div>

      {error && !hasLiveData && !loading ? (
        <ErrorNotice
          title="Живые мировые цены пока не получены"
          message="Мы не показываем резервный демонстрационный набор под видом текущих котировок. Российский контур выше работает независимо; попробуйте обновить глобальные цены сейчас."
          onRetry={() => void refresh()}
          actionLabel={isRefreshing ? 'Загружаем…' : 'Повторить загрузку цен'}
        />
      ) : (
        <>
          {error && hasLiveData && (
            <div className="mb-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-2)] rounded-2xl border border-amber-300/25 bg-amber-400/10 px-[var(--space-2)] py-[var(--space-2)] text-sm text-amber-900" role="status">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-900" />
              <span className="min-w-0 flex-1">
                Обновление мировых цен не удалось. Показаны последние успешно полученные значения.
              </span>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={isRefreshing}
                className="inline-flex min-h-11 items-center gap-[var(--space-1)] rounded-full bg-amber-300/15 px-[var(--space-2)] py-[var(--space-1)] text-xs font-extrabold text-amber-900 transition-colors hover:bg-amber-300/25 disabled:opacity-60"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Проверяем…' : 'Повторить'}
              </button>
            </div>
          )}

          {!error && hasLiveData && fallbackNames.length > 0 && (
            <div className="mb-[var(--space-2)] flex items-start gap-[var(--space-1)] rounded-2xl border border-amber-300/20 bg-amber-400/[0.08] px-[var(--space-2)] py-[var(--space-2)] text-sm leading-relaxed text-amber-900" role="status">
              <AlertTriangle className="mt-[var(--space-1)] h-4 w-4 shrink-0 text-amber-900" />
              <span>
                Часть плиток не получила свежую цену: {fallbackNames.join(', ')}.
                Они помечены «нет свежей цены» и окрашены нейтрально, чтобы резервное
                значение нельзя было спутать с текущей котировкой.
              </span>
            </div>
          )}

          {loading && !hasLiveData ? (
            <div
              className="rounded-[var(--radius)] border border-border-subtle bg-bg-card p-[var(--space-3)]"
              aria-busy="true"
              aria-label="Загрузка живых котировок"
            >
              <p className="text-sm leading-relaxed text-text-secondary">
                Получаем живые котировки. Резервные значения в это время не
                показываем: цифра без свежей цены выглядела бы как настоящая.
              </p>
              <div className="mt-[var(--space-2)] grid gap-[var(--space-2)] sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-[202px] animate-pulse rounded-xl bg-slate-50"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <MarketHeatmap
              assets={assets}
              loading={loading}
              fallbackAssetIds={fallbackAssetIds}
            />
          )}
        </>
      )}
    </motion.section>
  );
}
