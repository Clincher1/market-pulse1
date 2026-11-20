import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Database, ExternalLink, RotateCcw, Target } from 'lucide-react';
import GuideLink from './GuideLink';
import { ErrorNotice } from './SectionFallback';
import { SectionThemeBadge } from './sectionThemes';
import { formatPercent } from '@/lib/percent';
import { horizonLabel, horizonOutlook } from '@/lib/forecastHorizon';
import { startPolling } from '@/lib/polling';
import {
  fetchMarketMemory,
  type MarketMemoryData,
  type MemoryForecast,
} from '@/data/liveMarketMemory';

const EMPTY_FORECASTS: MemoryForecast[] = [];

const ASSET_META: Record<string, { label: string; source: string }> = {
  sp500: { label: 'S&P 500', source: 'FRED SP500, дневной индекс (архивный ряд)'  },
  Brent: { label: 'Brent', source: 'FRED DCOILBRENTEU, спот Brent (архивный ряд)'  },
  gold: { label: 'Gold index', source: 'Nasdaq gold index: доходность, не USD/oz' },
  btc: { label: 'BTC', source: 'FRED/Coinbase, дневной ряд' },
  eurusd: { label: 'EUR/USD', source: 'USD за EUR; обратная величина к плитке USD/EUR' },
};

function assetLabel(assetKey: string): string {
  return ASSET_META[assetKey]?.label ?? assetKey;
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date)} МСК`;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(date);
}

function formatPct(value?: number): string {
  return formatPercent(value);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-bg-primary/55 p-4">
      <div className="break-words text-[11px] font-extrabold uppercase leading-snug tracking-[0.08em] text-text-secondary sm:tracking-[0.13em]">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-text-primary">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-text-secondary">{hint}</div>
    </div>
  );
}

function ForecastLedgerCard({ forecast }: { forecast: MemoryForecast }) {
  const evaluated = forecast.outcomeStatus === 'evaluated';
  const outlook = horizonOutlook(forecast);
  const directionLabel =
    forecast.direction === 'up' ? 'вверх' : forecast.direction === 'down' ? 'вниз' : 'воздержание';
  const comparisonLabel =
    !evaluated || forecast.direction === 'none'
      ? null
      : forecast.directionHit === true
        ? 'Знак изменения цены совпал с записанным направлением'
        : forecast.directionHit === false
          ? 'Знак изменения цены не совпал с записанным направлением'
          : 'Направление не сопоставлено';

  return (
    <article className="rounded-xl2 border border-border-subtle bg-bg-card p-5 shadow-lg">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-text-primary">{assetLabel(forecast.assetKey)}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">
            Ценовой ряд: {ASSET_META[forecast.assetKey]?.source ?? forecast.assetKey}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-extrabold text-text-secondary">
          Записанное направление: {directionLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">Дата записи</div>
          <div className="text-xs font-extrabold text-text-primary">{formatDateTime(forecast.issuedAt)}</div>
        </div>
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">Горизонт</div>
          <div className="text-xs font-extrabold text-text-primary">{forecast.horizonTradingDays} торговых дней</div>
        </div>
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">Версия расчёта</div>
          <div className="text-xs font-extrabold text-text-primary">{forecast.aggregationVersion}</div>
        </div>
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">Статус исхода</div>
          <div className="text-xs font-extrabold text-text-primary">
            {evaluated ? 'рассчитан' : horizonLabel(outlook, (iso) => formatDate(iso))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs">
        <span className="font-semibold text-text-secondary">Изменение ценового ряда за горизонт</span>
        <span className="font-extrabold tabular-nums text-text-primary">
          {evaluated ? formatPct(forecast.returnPct) : 'не рассчитано'}
        </span>
      </div>
      {forecast.outcomeObservationDate && (
        <p className="mt-1 text-[11px] text-text-secondary">
          Дата значения исхода: {formatDate(forecast.outcomeObservationDate)}
        </p>
      )}
      {comparisonLabel && (
        <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">{comparisonLabel}.</p>
      )}
      <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-text-secondary">
        Это сохранённая запись прогноза и результат по выбранному ценовому ряду; причинная связь с новостями не устанавливается.
        {forecast.promptVersion ? ` Версия классификатора: ${forecast.promptVersion}.` : ''}
      </p>
    </article>
  );
}

export default function MarketMemory() {
  const [data, setData] = useState<MarketMemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    if (hasDataRef.current) setIsRefreshing(true);
    try {
      const next = await fetchMarketMemory();
      if (!mountedRef.current) return;
      hasDataRef.current = true;
      setData(next);
      setError(null);
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить архив прогнозов');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const stopPolling = startPolling(() => void load());
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [load]);

  const forecasts = data?.forecasts ?? EMPTY_FORECASTS;
  const unavailable = forecasts.filter((forecast) => forecast.outcomeStatus === 'insufficient_price_data').length;
  const overdue = useMemo(
    () => forecasts.filter((forecast) => horizonOutlook(forecast).state === 'overdue').length,
    [forecasts],
  );

  return (
    <motion.section
      id="market-memory"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 scroll-mt-24 lg:mb-12"
    >
      <SectionThemeBadge themeId="memory" className="mb-4" />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-400/15 text-fuchsia-800">
          <Target className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight lg:text-2xl">Архив прогнозных записей</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-extrabold text-text-secondary">
              Новые прогнозы не выпускаются
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">
            Сохранённые направления прогнозов и рассчитанные изменения выбранных ценовых рядов
            за заданный торговый горизонт. Это исторические модельные записи, а не текущие
            сигналы: движение цены после даты прогноза не доказывает связь с заголовками или
            событиями. Новые прогнозы не выпускаются; исходные записи в базе остаются без
            изменений.
          </p>
        </div>
        <GuideLink href="/guide#guide-memory" label="Как читать архив" mobileLabel="Справка" />
      </div>

      <div className="overflow-hidden rounded-xl2 border border-fuchsia-300/25 bg-linear-to-br from-fuchsia-400/10 via-bg-card to-bg-card shadow-xl shadow-fuchsia-950/20">
        <div className="border-b border-slate-200 p-5 lg:p-6">
          {loading && !data ? (
            <div aria-busy="true" aria-label="Загрузка архива прогнозов">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="min-h-28 rounded-xl border border-slate-200 bg-bg-primary/55 p-4">
                    <div className="h-3 w-28 animate-pulse rounded-sm bg-slate-50" />
                    <div className="mt-4 h-8 w-16 animate-pulse rounded-sm bg-slate-50" />
                    <div className="mt-3 h-3 animate-pulse rounded-sm bg-slate-50" />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-sm text-text-secondary">
                Загружаем сохранённые записи и результаты по ценовым рядам…
              </p>
            </div>
          ) : error && !data ? (
            <ErrorNotice
              title="Архив прогнозов временно недоступен"
              message="Не удалось прочитать публичные архивные данные. Повторная проверка также выполнится автоматически через пять минут."
              onRetry={() => void load()}
              actionLabel={isRefreshing ? 'Проверяем…' : 'Повторить загрузку'}
            />
          ) : (
            <>
              {error && data && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-900" role="status">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-900" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    Не удалось обновить архив. Ниже последний успешно загруженный снимок.
                  </span>
                  <button
                    type="button"
                    onClick={() => void load()}
                    disabled={isRefreshing}
                    className="inline-flex min-h-9 items-center gap-2 rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-extrabold text-amber-900 transition-colors hover:bg-amber-300/25 disabled:opacity-60"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {isRefreshing ? 'Проверяем…' : 'Повторить'}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <StatCard
                  label="Архивные прогнозные записи"
                  value={String(data?.stats?.forecastSnapshots ?? forecasts.length)}
                  hint="сохранённые ранее записи"
                />
                <StatCard
                  label="Исход рассчитан"
                  value={String(data?.stats?.evaluatedForecasts ?? forecasts.filter((forecast) => forecast.outcomeStatus === 'evaluated').length)}
                  hint="изменение выбранного ценового ряда за горизонт"
                />
                <StatCard
                  label="Исход не рассчитан"
                  value={String(data?.stats?.pendingForecasts ?? forecasts.filter((forecast) => forecast.outcomeStatus !== 'evaluated').length)}
                  hint="запись сохранена без результата"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5" aria-hidden="true" />
                  Последняя прогнозная запись: {formatDateTime(data?.stats?.latestForecastIssuedAt)}
                </span>
                <span>Последнее обновление цен: {formatDateTime(data?.stats?.latestPriceFetchAt)}</span>
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-bg-primary/55 p-4 text-xs leading-relaxed text-text-secondary">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-800" aria-hidden="true" />
                <span>
                  <strong className="text-text-primary">Ограничение:</strong> архив содержит
                  записанные модельные ожидания. Результат показывает изменение цены за горизонт,
                  но не устанавливает, что новость вызвала это движение.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="p-5 lg:p-6">
          {forecasts.length > 0 ? (
            <>
              {unavailable > 0 && (
                <p className="mb-4 rounded-xl border border-slate-200 bg-bg-primary/55 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                  У {unavailable} из {forecasts.length} загруженных записей не хватает последующих наблюдений
                  исходного инструмента. Срок уже прошёл, но подмена старого ряда FRED Brent или S&amp;P 500
                  другим источником исказила бы результат. Новые прогнозы не запускаются;
                  исходные прогнозы сохранены, доступные исходы досчитаны по тем же рядам.
                </p>
              )}
              {overdue > 0 && (
                <p className="mb-4 rounded-xl border border-amber-300/25 bg-amber-400/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-900">
                  Торговый горизонт завершился у {overdue} из {forecasts.length} загруженных записей,
                  но результат не рассчитан. Эти записи остаются в архиве без изменения исходных полей.
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {forecasts.map((forecast) => (
                  <ForecastLedgerCard key={forecast.forecastId} forecast={forecast} />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-bg-primary/45 px-5 py-10 text-center text-sm leading-relaxed text-text-secondary">
              В загруженной части архива нет прогнозных записей. Новые прогнозы не выпускаются;
              исходные архивные строки не удаляются.
            </div>
          )}
          <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-text-secondary">
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Сопоставление относится только к ценовому ряду и указанному горизонту. Оно не
            подтверждает, что похожие заголовки описывают одно событие или что публикация стала
            причиной изменения цены.
          </p>
        </div>
      </div>
    </motion.section>
  );
}
