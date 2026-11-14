import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Camera, ExternalLink, History, Zap } from 'lucide-react';
import { formatPercent } from '@/lib/percent';
import { observationLabel } from '@/lib/asOf';
import { formatPriceText } from '@/lib/price';
import type { DailySnapshot } from '@/data/dailySnapshots';
import { fetchTodaySnapshot } from '@/data/dailySnapshots';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import {
  fetchRussiaInsights,
  type RussiaInsights,
  type RussiaMarketIndicator,
} from '@/data/russiaInsights';
import { SectionThemeBadge } from './sectionThemes';
import { startPolling } from '@/lib/polling';
import { instrumentChanged, sameObservationDay } from '@/lib/snapshotIdentity';
import { safeHttpUrl } from '@/lib/safeUrl';

/**
 * Сводка содержит только значения из публичных рыночных рядов и прозрачные
 * сравнения с сохранённым дневным снимком. Заголовки новостей, модельные
 * оценки и выводы о влиянии на рынок здесь не используются.
 */

interface BriefItem {
  id: string;
  href: string;
  body: ReactNode;
  sourceUrl?: string;
  sourceLabel?: string;
}

function formatPct(value: number | null | undefined): string {
  return formatPercent(value);
}

function formatIndicatorValue(indicator: RussiaMarketIndicator): string {
  const decimals = indicator.unit === '₽' ? 4 : 2;
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(indicator.value);
}

function formatDateOnly(value?: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(date);
}

function formatStamp(values: Array<string | undefined>): string | null {
  const timestamps = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  const latest = new Date(Math.max(...timestamps));
  return (
    new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    }).format(latest) + ' МСК'
  );
}

function currentSparklineLast(sparkline?: number[]): number | null {
  if (!Array.isArray(sparkline)) return null;
  const values = sparkline.filter((value) => Number.isFinite(value));
  return values.length ? values[values.length - 1] : null;
}

function formatSeriesValue(value: number, sample: string): string {
  const match = sample.match(/^([^\d\-−]*)(\d[\d,]*(?:\.(\d+))?)/);
  const prefix = match?.[1] ?? '';
  const decimals = Math.min(match?.[3]?.length ?? 2, 8);
  return formatPriceText(`${prefix}${value.toFixed(decimals)}`);
}


function BriefLinkItem({ item, marker }: { item: BriefItem; marker: ReactNode }) {
  const sourceUrl = item.sourceUrl ? safeHttpUrl(item.sourceUrl) : null;
  return (
    <li className="flex items-start gap-2.5 rounded-xl px-2 py-2 text-sm leading-relaxed text-text-secondary transition-colors hover:bg-white/[0.04]">
      {marker}
      <a
        href={item.href}
        className="group flex min-w-0 flex-1 items-start gap-2 text-text-secondary hover:text-slate-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        <span className="min-w-0 flex-1">{item.body}</span>
        <ArrowRight
          className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-violet-300"
          aria-hidden="true"
        />
      </a>
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-violet-200 hover:text-violet-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-violet-300"
          aria-label={`Открыть источник: ${item.sourceLabel ?? 'первоисточник'}`}
        >
          {item.sourceLabel ?? 'Источник'}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

export default function DailyBrief() {
  const { assets, loading: assetsLoading, hasLiveData, fallbackAssetIds } = useLiveAssets();
  const [insights, setInsights] = useState<RussiaInsights | null>(null);
  const [insightsLoaded, setInsightsLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [snapshotError, setSnapshotError] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await fetchRussiaInsights();
      if (!mounted) return;
      if (data.markets.length || data.headlines.length) setInsights(data);
      setInsightsLoaded(true);
    }
    void load();
    const stopPolling = startPolling(() => void load());
    return () => {
      mounted = false;
      stopPolling();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const result = await fetchTodaySnapshot();
      if (!mounted) return;
      setSnapshot(result.snapshot);
      setSnapshotError(result.error);
      setSnapshotLoaded(true);
    }
    void load();
    const stopPolling = startPolling(() => void load());
    return () => {
      mounted = false;
      stopPolling();
    };
  }, []);


  const liveAssets = useMemo(
    () =>
      hasLiveData
        ? assets.filter(
            (asset) =>
              !fallbackAssetIds.includes(asset.id) &&
              asset.price !== '—' &&
              Number.isFinite(asset.change) &&
              (asset.sparkline?.length ?? 0) >= 2,
          )
        : [],
    [assets, fallbackAssetIds, hasLiveData],
  );

  const brief = useMemo(() => {
    const facts: BriefItem[] = [];
    const strongestGlobal =
      [...liveAssets].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0] ?? null;

    if (strongestGlobal) {
      const observedAt = observationLabel(strongestGlobal.asOf);
      facts.push({
        id: 'global-move',
        href: '#global-economy',
        body: (
          <>
            Наибольшее по модулю дневное изменение среди загруженных мировых рядов:{' '}
            <strong className="text-text-primary">
              {strongestGlobal.name} {formatPct(strongestGlobal.change)}
            </strong>
            {` · последнее значение ${formatPriceText(strongestGlobal.price)}`}
            {strongestGlobal.sourceLabel ? ` · источник ${strongestGlobal.sourceLabel}` : ''}
            {observedAt ? ` · дата наблюдения ${observedAt}` : ' · дата наблюдения не указана'}.
          </>
        ),
      });
    }

    const indicatorById = new Map(
      (insights?.markets ?? []).map((indicator) => [indicator.id, indicator]),
    );
    const russiaCandidateIds = [
      'usd-rub',
      'eur-rub',
      indicatorById.has('cny-rub-moex') ? 'cny-rub-moex' : 'cny-rub-cbr',
      'imoex',
      'rgbi',
    ];
    const russiaCandidates = russiaCandidateIds
      .map((id) => indicatorById.get(id))
      .filter(
        (indicator): indicator is RussiaMarketIndicator =>
          Boolean(indicator) && typeof indicator?.changePct === 'number',
      );
    const strongestRussia =
      [...russiaCandidates].sort(
        (a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0),
      )[0] ?? null;

    if (strongestRussia) {
      const observedAt = formatDateOnly(strongestRussia.asOf) ?? strongestRussia.asOf;
      facts.push({
        id: 'russia-move',
        href: '#russia-business',
        body: (
          <>
            Наибольшее по модулю изменение среди выбранных российских рядов:{' '}
            <strong className="text-text-primary">
              {strongestRussia.name} {formatPct(strongestRussia.changePct)}
            </strong>{' '}
            · значение {formatIndicatorValue(strongestRussia)} {strongestRussia.unit}
            {observedAt ? ` · дата наблюдения ${observedAt}` : ''}
            {strongestRussia.provider ? ` · источник ${strongestRussia.provider}` : ''}.
          </>
        ),
        sourceUrl: strongestRussia.sourceUrl,
        sourceLabel: strongestRussia.provider || 'Источник',
      });
    }

    return facts;
  }, [insights, liveAssets]);

  const changeView = useMemo(() => {
    const empty = {
      items: [] as BriefItem[],
      comparable: 0,
      changed: 0,
      renamed: [] as string[],
    };
    if (!snapshot) return empty;

    const candidates: Array<{ magnitude: number; item: BriefItem }> = [];
    let comparable = 0;
    const renamed: string[] = [];
    const snapshotAssets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));

    liveAssets.forEach((asset) => {
      const baseline = snapshotAssets.get(asset.id);
      if (instrumentChanged(baseline, asset)) {
        renamed.push(asset.name);
        return;
      }

      const base = baseline?.last;
      const current = currentSparklineLast(asset.sparkline);
      if (
        typeof base !== 'number' ||
        !Number.isFinite(base) ||
        base <= 0 ||
        current === null ||
        current <= 0
      ) {
        return;
      }

      comparable += 1;
      const deltaPct = (current / base - 1) * 100;
      if (Math.round(deltaPct * 100) === 0) return;

      const currentDate = observationLabel(asset.asOf);
      const baselineDate = observationLabel(baseline?.asOf);
      const dateText = sameObservationDay(baseline?.asOf, asset.asOf)
        ? currentDate
          ? ` · дата наблюдения ${currentDate}`
          : ''
        : ` · дата в снимке ${baselineDate ?? 'не указана'}, сейчас ${currentDate ?? 'не указана'}`;
      candidates.push({
        magnitude: Math.abs(deltaPct),
        item: {
          id: `change-global-${asset.id}`,
          href: '#global-economy',
          body: (
            <>
              {asset.name}: {formatSeriesValue(current, asset.price)} против{' '}
              {formatSeriesValue(base, baseline?.price ?? asset.price)} в снимке;{' '}
              <strong className="tabular-nums text-text-primary">{formatPct(deltaPct)}</strong>
              {' '}= (последняя точка ряда / точка снимка − 1) × 100
              {asset.sourceLabel ? ` · источник ${asset.sourceLabel}` : ''}{dateText}.
            </>
          ),
        },
      });
    });

    const snapshotRussia = new Map(
      snapshot.russiaMarkets.map((indicator) => [indicator.id, indicator]),
    );
    (insights?.markets ?? []).forEach((indicator) => {
      const baseline = snapshotRussia.get(indicator.id);
      if (!baseline) return;
      if (
        baseline.provider &&
        indicator.provider &&
        baseline.provider !== indicator.provider
      ) {
        renamed.push(`${indicator.name} (сменился источник)`);
        return;
      }
      const base = baseline.value;
      const current = indicator.value;
      if (
        typeof base !== 'number' ||
        !Number.isFinite(base) ||
        base <= 0 ||
        !Number.isFinite(current) ||
        current <= 0
      ) {
        return;
      }

      comparable += 1;
      const deltaPct = (current / base - 1) * 100;
      if (Math.round(deltaPct * 100) === 0) return;
      const baselineDate = formatDateOnly(baseline.asOf) ?? baseline.asOf;
      const currentDate = formatDateOnly(indicator.asOf) ?? indicator.asOf;
      candidates.push({
        magnitude: Math.abs(deltaPct),
        item: {
          id: `change-russia-${indicator.id}`,
          href: '#russia-business',
          body: (
            <>
              {indicator.name}: {formatIndicatorValue(indicator)} {indicator.unit} против{' '}
              {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(base)}{' '}
              {indicator.unit} в снимке; <strong className="tabular-nums text-text-primary">
                {formatPct(deltaPct)}
              </strong>{' '}
              = (текущее значение / значение в снимке − 1) × 100
              {indicator.provider ? ` · источник ${indicator.provider}` : ''}
              {baselineDate || currentDate
                ? ` · даты наблюдений: ${baselineDate ?? 'не указана'} → ${currentDate ?? 'не указана'}`
                : ' · даты наблюдений не указаны'}.
            </>
          ),
          sourceUrl: indicator.sourceUrl,
          sourceLabel: indicator.provider || 'Источник',
        },
      });
    });

    const ordered = candidates.sort((a, b) => b.magnitude - a.magnitude);
    return {
      items: ordered.slice(0, 6).map((candidate) => candidate.item),
      comparable,
      changed: ordered.length,
      renamed: [...new Set(renamed)],
    };
  }, [insights, liveAssets, snapshot]);

  // Показываем сводку после загрузки рыночных рядов, российского контура и
  // сегодняшнего сохранённого снимка — иначе можно сравнить неполные выборки.
  const loading = assetsLoading || !insightsLoaded || !snapshotLoaded;
  const stamp = formatStamp([
    insights?.generatedAt,
    ...liveAssets.map((asset) => asset.updatedAt ?? undefined),
  ]);
  const baselineStamp = snapshot ? formatStamp([snapshot.capturedAt]) : null;
  const changesHeading = 'Сравнение с сохранённым снимком';

  const changesSection = (
    <div data-testid="brief-changes" className="mt-5 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <History className="h-4 w-4 text-violet-300" aria-hidden="true" />
        <h3 className="text-sm font-extrabold tracking-tight">{changesHeading}</h3>
        {baselineStamp && (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold tabular-nums text-text-secondary">
            точка отсчёта: {baselineStamp}
          </span>
        )}
      </div>

      {snapshotError ? (
        <p className="mt-2 px-1 text-sm leading-relaxed text-text-secondary">
          Не удалось загрузить снимок дня, поэтому сравнение не показываем.
        </p>
      ) : !snapshot ? (
        <p className="mt-2 px-1 text-sm leading-relaxed text-text-secondary">
          Снимок на сегодня ещё не записан; без сохранённой точки отсчёта сравнение не выполняется.
        </p>
      ) : changeView.comparable === 0 ? (
        <p className="mt-2 px-1 text-sm leading-relaxed text-text-secondary">
          Нет сопоставимых актуальных значений для сравнения.
        </p>
      ) : changeView.items.length > 0 ? (
        <ul data-testid="brief-changes-list" className="mt-1.5 space-y-0.5">
          {changeView.items.map((item) => (
            <BriefLinkItem
              key={item.id}
              item={item}
              marker={
                <span
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300"
                  aria-hidden="true"
                />
              }
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 px-1 text-sm leading-relaxed text-text-secondary">
          В сопоставимых рядах изменение не отличается от нуля на точности вывода 0,01 %.
        </p>
      )}

      {snapshot && changeView.renamed.length > 0 && (
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-text-secondary/80">
          Для {changeView.renamed.join(', ')} сравнение не выполняется: с момента снимка сменился
          инструмент или источник.
        </p>
      )}

      {snapshot && changeView.comparable > 0 && (
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-text-secondary/80">
          Формула: (текущее значение / значение в снимке − 1) × 100. Изменения округляются до
          0,01 % и сортируются по абсолютной величине; показано не более шести рядов.
          {changeView.changed > changeView.items.length
            ? ` Выведено ${changeView.items.length} из ${changeView.changed} рядов с ненулевой дельтой.`
            : ''}
        </p>
      )}
    </div>
  );

  return (
    <section id="brief" className="mb-10 scroll-mt-24 lg:mb-12" aria-label="Бриф за 60 секунд">
      <SectionThemeBadge themeId="brief" className="mb-4" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Zap className="h-5 w-5 text-violet-300" aria-hidden="true" />
        <h2 className="text-lg font-extrabold tracking-tight lg:text-xl">Бриф за 60 секунд</h2>
        {stamp && (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold tabular-nums text-text-secondary">
            обновлено {stamp}
          </span>
        )}
        <a
          data-testid="brief-telegram-image"
          href="/api/brief-image"
          download="market-pulse-brief.png"
          title="Серверная PNG-карточка с актуальными цифрами, без параметров отслеживания"
          aria-label="Снимок для Telegram — скачать PNG брифа"
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-400/[0.08] px-3.5 py-2 text-xs font-extrabold text-violet-100 transition-colors hover:border-violet-300/60 hover:bg-violet-400/[0.14] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Снимок для Telegram
        </a>
      </div>

      <div className="rounded-xl2 border border-violet-300/25 bg-bg-card p-4 shadow-lg shadow-violet-950/20 sm:p-5">
        {loading ? (
          <div aria-busy="true" aria-label="Собираем бриф">
            <div className="h-5 w-56 animate-pulse rounded-sm bg-white/10" />
            <div className="mt-4 space-y-2.5">
              <div className="h-4 animate-pulse rounded-sm bg-white/[0.07]" />
              <div className="h-4 w-11/12 animate-pulse rounded-sm bg-white/[0.06]" />
              <div className="h-4 w-4/5 animate-pulse rounded-sm bg-white/[0.05]" />
            </div>
            <p className="mt-4 text-xs text-text-secondary">
              Загружаем рыночные значения и сохранённую точку сравнения…
            </p>
          </div>
        ) : brief.length === 0 ? (
          <>
            <p className="text-sm leading-relaxed text-text-secondary">
              Актуальные рыночные значения для сводки сейчас недоступны. Неполные данные не
              заменяем оценками.
            </p>
            {changesSection}
          </>
        ) : (
          <>
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-secondary">
              Рыночные значения
            </h3>
            <ol data-testid="brief-facts" className="mt-1.5 space-y-0.5">
              {brief.map((item, index) => (
                <BriefLinkItem
                  key={item.id}
                  item={item}
                  marker={
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-extrabold text-white">
                      {index + 1}
                    </span>
                  }
                />
              ))}
            </ol>
            {changesSection}
            <p className="mt-3.5 text-[11px] leading-relaxed text-text-secondary/80">
              Сводка показывает загруженные значения и арифметические сравнения с сохранённым
              снимком. Совпадение по времени не объясняет причину изменения; рекомендации не
              выдаются.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
