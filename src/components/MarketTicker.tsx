import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import { observationLabel } from '@/lib/asOf';
import { formatPercent } from '@/lib/percent';
import { formatPriceText } from '@/lib/price';

/**
 * Полоса рынка — один взгляд на пять ориентиров вместо прокрутки карточек.
 *
 * Приём взят с маркетинговых дашбордов (бегущая строка котировок), но
 * переделан под правило сайта: у каждого числа подписано, на какой момент оно
 * верно, и ничего не «бежит». Бесконечная анимация обещала бы живой поток,
 * которого нет: цены в кэше обновляются раз в 15 минут, а у дневных рядов
 * последнее наблюдение — закрытие прошлого дня. Поэтому полоса статична, а
 * подпись говорит «последнее наблюдение» или «на 10:21 МСК» словами из asOf.
 *
 * Если живых данных нет, полоса не подставляет нули: у каждого ориентира
 * стоит прочерк с подписью «нет данных».
 */
export default function MarketTicker() {
  const { assets, loading, fallbackAssetIds } = useLiveAssets();

  return (
    <section aria-labelledby="market-strip-title" className="mb-8 lg:mb-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id="market-strip-title"
          className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-secondary"
        >
          Пять ориентиров
        </h2>
        <p className="text-[11px] text-text-secondary">
          Цена и изменение к предыдущему закрытию. Процент получен от источника либо рассчитан приложением. Подпись под каждым значением говорит, на какой момент оно верно; график хранит отдельный ряд закрытий.
        </p>
      </div>

      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {assets.slice(0, 5).map((asset) => {
          const missing = asset.price === '—';
          const isFallback = fallbackAssetIds.includes(asset.id);
          const change = Number.isFinite(asset.change) ? asset.change : null;
          const direction =
            change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
          const Icon =
            direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
          const changeClass =
            direction === 'up'
              ? 'text-positive'
              : direction === 'down'
                ? 'text-negative'
                : 'text-text-secondary';
          const stamp = missing ? 'нет данных' : observationLabel(asset.asOf);

          return (
            <li
              key={asset.id}
              className="rounded-xl border border-border-subtle bg-bg-card px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[11px] font-bold text-text-secondary">
                  {asset.name}
                </span>
                {!missing && change !== null && (
                  <span className={`inline-flex shrink-0 items-center gap-0.5 text-[11px] font-extrabold tabular-nums ${changeClass}`}>
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {/* Ноль не подписывается знаком: «0,00 %» — это «не изменилось»,
                        а не рост, и стрелка рядом с ним врала бы. */}
                    {change !== null && Math.abs(change) < 0.005 ? 'без изменений' : formatPercent(change)}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-lg font-extrabold tabular-nums text-text-primary">
                {missing ? '—' : formatPriceText(asset.price)}
              </div>
              <div className="mt-0.5 text-[11px] leading-tight text-text-secondary">
                {loading && !missing ? 'проверяем источник…' : stamp || 'момент не указан'}
                {isFallback && !missing ? ' · резервное значение' : ''}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
