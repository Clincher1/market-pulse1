import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  GitBranch,
  History,
  Hourglass,
  Layers3,
  MinusCircle,
  Scale,
  ShieldAlert,
  Target,
  XCircle,
} from 'lucide-react';
import GuideLink from './GuideLink';
import {
  fetchMarketMemory,
  type MarketMemoryData,
  type MemoryAnalogue,
  type MemoryEvent,
  type MemoryEventOutcome,
  type MemoryForecast,
} from '@/data/liveMarketMemory';

type MemoryTab = 'events' | 'analogues' | 'forecasts';

const ASSET_META: Record<string, { label: string; note: string }> = {
  sp500: { label: 'S&P 500', note: 'FRED SP500, дневной индекс' },
  Brent: { label: 'Brent', note: 'FRED/EIA Europe Brent spot' },
  gold: { label: 'Gold index', note: 'Nasdaq gold index: доходность, не USD/oz' },
  btc: { label: 'BTC', note: 'FRED/Coinbase, дневной ряд' },
  eurusd: { label: 'EUR/USD', note: 'USD за EUR; обратная величина к плитке USD/EUR' },
};

const CHANNEL_LABELS: Record<string, string> = {
  monetary_policy: 'Ставки и центробанки',
  inflation: 'Инфляция',
  growth: 'Экономический рост',
  labor: 'Рынок труда',
  energy_supply: 'Предложение энергии',
  energy_demand: 'Спрос на энергию',
  geopolitics: 'Геополитика',
  trade_tariffs: 'Торговля и тарифы',
  fiscal: 'Бюджет и госфинансы',
  credit_liquidity: 'Кредит и ликвидность',
  corporate_earnings: 'Компании и прибыль',
  crypto_specific: 'Крипторынок',
  fx: 'Валютный канал',
  commodities: 'Сырьевые товары',
  regulation: 'Регулирование',
  other: 'Иной канал',
  none: 'Без рыночного канала',
};

function assetLabel(assetKey: string): string {
  return ASSET_META[assetKey]?.label ?? assetKey;
}

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatPct(value?: number, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatShare(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function directionMeta(direction: string) {
  if (direction === 'up') {
    return { label: 'вверх', className: 'text-positive', Icon: ArrowUpRight };
  }
  if (direction === 'down') {
    return { label: 'вниз', className: 'text-negative', Icon: ArrowDownRight };
  }
  return { label: 'нет сигнала', className: 'text-text-secondary', Icon: MinusCircle };
}

function sampleBadge(sampleSize: number): { label: string; className: string } {
  if (sampleSize >= 30) {
    return { label: 'рабочая выборка', className: 'border-positive/30 bg-positive/10 text-positive' };
  }
  if (sampleSize >= 8) {
    return { label: 'ранняя выборка', className: 'border-warning/30 bg-warning/10 text-warning' };
  }
  return { label: 'малая выборка', className: 'border-white/15 bg-white/5 text-text-secondary' };
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-bg-primary/55 p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-text-secondary">{label}</div>
      <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-text-primary">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-text-secondary">{hint}</div>
    </div>
  );
}

function OutcomeChip({ outcome }: { outcome: MemoryEventOutcome }) {
  const evaluated = outcome.status === 'evaluated';
  const hit = outcome.directionHit === true;
  const miss = outcome.directionHit === false;
  const Icon = !evaluated ? Hourglass : hit ? CheckCircle2 : miss ? XCircle : MinusCircle;
  const color = !evaluated
    ? 'border-white/12 bg-white/5 text-text-secondary'
    : hit
      ? 'border-positive/30 bg-positive/10 text-positive'
      : miss
        ? 'border-negative/30 bg-negative/10 text-negative'
        : 'border-white/12 bg-white/5 text-text-secondary';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {assetLabel(outcome.assetKey)} · {outcome.horizonTradingDays} дн ·{' '}
      {evaluated ? formatPct(outcome.returnPct) : 'ждёт цену'}
    </span>
  );
}

function EventCard({
  event,
  outcomes,
  selected,
  onSelect,
}: {
  event: MemoryEvent;
  outcomes: MemoryEventOutcome[];
  selected: boolean;
  onSelect: () => void;
}) {
  const topImpacts = event.impacts.slice(0, 3);

  return (
    <article
      className={`rounded-xl2 border bg-bg-card p-5 shadow-lg transition-all duration-300 lg:p-6 ${
        selected ? 'border-accent/60 ring-2 ring-accent/20' : 'border-border-subtle hover:border-accent/35'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="block w-full text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-extrabold text-accent">
            {channelLabel(event.transmissionChannel)}
          </span>
          {event.promptVersion !== 'event_classification_v3' && (
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-extrabold text-warning">
              Архив до v3
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
            <Clock3 className="h-3.5 w-3.5" /> {formatDateTime(event.latestPublishedAt)}
          </span>
          <span className="text-xs font-semibold text-text-secondary">
            {event.sourceCount} ист. · {event.articleCount} публ.
          </span>
        </div>

        <h3 className="text-base font-extrabold leading-snug text-text-primary lg:text-lg">{event.title}</h3>
        {event.summaryRu && (
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">{event.summaryRu}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {topImpacts.length > 0 ? topImpacts.map((impact) => {
            const meta = directionMeta(impact.direction);
            const Icon = meta.Icon;
            return (
              <span
                key={`${impact.asset}-${impact.direction}`}
                className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-extrabold ${meta.className}`}
              >
                {assetLabel(impact.asset)} <Icon className="h-3.5 w-3.5" /> {meta.label}
                <span className="text-text-secondary">· {Math.round(impact.strength * 100)}%</span>
              </span>
            );
          }) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-text-secondary">
              Направленных asset-сигналов не сохранено
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-bg-primary/55 px-2 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Важность</div>
            <div className="text-sm font-extrabold text-text-primary">{event.importance}/10</div>
          </div>
          <div className="rounded-lg bg-bg-primary/55 px-2 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Релевантность</div>
            <div className="text-sm font-extrabold text-text-primary">{formatShare(event.relevance)}</div>
          </div>
          <div className="rounded-lg bg-bg-primary/55 px-2 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Уверенность</div>
            <div className="text-sm font-extrabold text-text-primary">{formatShare(event.confidence)}</div>
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {selected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.13em] text-accent">
                  <GitBranch className="h-4 w-4" /> Цепочка передачи
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-white/8 px-2.5 py-1.5 text-text-primary">Событие</span>
                  <ArrowRight className="h-3.5 w-3.5 text-text-secondary" />
                  <span className="rounded-full bg-accent/15 px-2.5 py-1.5 text-blue-100">
                    {channelLabel(event.transmissionChannel)}
                  </span>
                  {topImpacts.map((impact) => (
                    <span key={`chain-${impact.asset}`} className="inline-flex items-center gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-text-secondary" />
                      <span className="rounded-full bg-white/8 px-2.5 py-1.5 text-text-primary">
                        {assetLabel(impact.asset)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {event.rationaleRu && (
                <p className="text-sm leading-relaxed text-text-secondary">
                  <strong className="text-text-primary">Почему так классифицировано:</strong> {event.rationaleRu}
                </p>
              )}

              {event.entities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {event.entities.map((entity) => (
                    <span key={entity} className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold text-slate-300">
                      {entity}
                    </span>
                  ))}
                </div>
              )}

              <div>
                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.13em] text-text-secondary">
                  Что произошло с ценами потом
                </div>
                {outcomes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {outcomes.slice(0, 15).map((outcome) => (
                      <OutcomeChip
                        key={`${outcome.assetKey}-${outcome.horizonTradingDays}-${outcome.expectedDirection}`}
                        outcome={outcome}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-text-secondary">
                    Исходы ещё не созданы или ждут дневных цен после события.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-text-secondary">
                <span>
                  Классификация: {event.promptVersion ?? '—'} · модель: {event.model ?? '—'}
                </span>
                {event.representativeUrl && (
                  <a
                    href={event.representativeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-extrabold text-accent hover:text-blue-300"
                  >
                    Первоисточник{event.representativeSource ? `: ${event.representativeSource}` : ''}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function AnalogueCard({ analogue }: { analogue: MemoryAnalogue }) {
  const badge = sampleBadge(analogue.sampleSize);
  const meta = directionMeta(analogue.expectedDirection);
  const Icon = meta.Icon;
  const median = analogue.medianReturnPct;

  return (
    <article className="rounded-xl2 border border-border-subtle bg-bg-card p-5 shadow-lg">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-extrabold text-accent">
          {channelLabel(analogue.transmissionChannel)}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${badge.className}`}>
          N={analogue.sampleSize} · {badge.label}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-text-primary">{assetLabel(analogue.assetKey)}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">{ASSET_META[analogue.assetKey]?.note}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-sm font-extrabold ${meta.className}`}>
          <Icon className="h-4 w-4" /> {meta.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Горизонт</div>
          <div className="text-sm font-extrabold text-text-primary">{analogue.horizonTradingDays} дн</div>
        </div>
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Попадания</div>
          <div className="text-sm font-extrabold text-text-primary">
            {analogue.hits}/{analogue.sampleSize}
          </div>
        </div>
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Медиана</div>
          <div className={`text-sm font-extrabold ${median !== undefined && median < 0 ? 'text-negative' : 'text-positive'}`}>
            {formatPct(median)}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-secondary">
        Аномальная медиана против обычного дневного фона: {formatPct(analogue.medianAbnormalReturnPct)}.
        {analogue.sampleSize < 8 ? ' Это только начало накопления, а не торговый вывод.' : ''}
      </p>
    </article>
  );
}

function ForecastLedgerCard({ forecast }: { forecast: MemoryForecast }) {
  const meta = directionMeta(forecast.direction);
  const Icon = meta.Icon;
  const evaluated = forecast.outcomeStatus === 'evaluated';
  const outcomeLabel = evaluated
    ? forecast.direction === 'none'
      ? 'воздержание проверено'
      : forecast.directionHit
        ? 'направление совпало'
        : 'направление не совпало'
    : 'ждёт горизонт и цены';

  return (
    <article className="rounded-xl2 border border-border-subtle bg-bg-card p-5 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-text-primary">{assetLabel(forecast.assetKey)}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{ASSET_META[forecast.assetKey]?.note}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-extrabold uppercase ${meta.className}`}>
          <Icon className="h-4 w-4" /> {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Выдан</div>
          <div className="text-xs font-extrabold text-text-primary">{formatDate(forecast.issueDate)}</div>
        </div>
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Горизонт</div>
          <div className="text-xs font-extrabold text-text-primary">{forecast.horizonTradingDays} торг. дн</div>
        </div>
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Вес вверх</div>
          <div className="text-xs font-extrabold text-text-primary">{formatShare(forecast.scoreUp)}</div>
        </div>
        <div className="rounded-lg bg-bg-primary/55 px-2 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Событий</div>
          <div className="text-xs font-extrabold text-text-primary">{forecast.evidenceCount}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs">
        <span className="font-semibold text-text-secondary">{outcomeLabel}</span>
        <span className={`font-extrabold tabular-nums ${forecast.returnPct !== undefined && forecast.returnPct < 0 ? 'text-negative' : 'text-positive'}`}>
          {evaluated ? formatPct(forecast.returnPct) : 'pending'}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-text-secondary">
        {forecast.aggregationVersion} · {forecast.promptVersion ?? 'prompt —'}
        {forecast.aggregationVersion !== 'aggregation_v2' ? ' · архивная версия, в сводку v2 не входит' : ''}
      </div>
    </article>
  );
}

export default function MarketMemory() {
  const [data, setData] = useState<MarketMemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<MemoryTab>('events');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const next = await fetchMarketMemory();
        if (!mounted) return;
        setData(next);
        setError(null);
        setSelectedEventId((current) => current && next.events.some((event) => event.eventId === current)
          ? current
          : next.events[0]?.eventId ?? null);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Не удалось загрузить память рынка');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 300_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const outcomesByEvent = useMemo(() => {
    const map = new Map<string, MemoryEventOutcome[]>();
    for (const outcome of data?.outcomes ?? []) {
      const list = map.get(outcome.eventId) ?? [];
      list.push(outcome);
      map.set(outcome.eventId, list);
    }
    return map;
  }, [data?.outcomes]);

  const reliableAnalogues = useMemo(
    () => (data?.analogues ?? []).filter((analogue) => analogue.promptVersion === 'event_classification_v3'),
    [data?.analogues],
  );
  const archivedAnalogueGroups = (data?.analogues.length ?? 0) - reliableAnalogues.length;

  const ledgerSummary = useMemo(() => {
    const forecasts = (data?.forecasts ?? []).filter(
      (forecast) => forecast.aggregationVersion === 'aggregation_v2',
    );
    const evaluatedDirectional = forecasts.filter(
      (forecast) => forecast.outcomeStatus === 'evaluated' && forecast.direction !== 'none',
    );
    return {
      evaluatedDirectional: evaluatedDirectional.length,
      hits: evaluatedDirectional.filter((forecast) => forecast.directionHit).length,
      abstentions: forecasts.filter((forecast) => forecast.direction === 'none').length,
    };
  }, [data?.forecasts]);

  const tabs: Array<{ id: MemoryTab; label: string; icon: typeof History }> = [
    { id: 'events', label: 'События', icon: History },
    { id: 'analogues', label: 'Исторические аналоги', icon: Layers3 },
    { id: 'forecasts', label: 'Журнал прогнозов', icon: Target },
  ];

  return (
    <motion.section
      id="market-memory"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 scroll-mt-24 lg:mb-12"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <BrainCircuit className="h-5 w-5" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight lg:text-2xl">Память рынка</h2>
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-extrabold text-warning">
              Исследовательский контур V2
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">
            Сайт запоминает событие, его классификацию и замороженный снимок прогноза — а потом сверяет это с реальными дневными ценами.
          </p>
        </div>
        <GuideLink href="#guide-memory" label="Как работает память" mobileLabel="Справка" />
      </div>

      <div className="overflow-hidden rounded-xl2 border border-accent/20 bg-linear-to-br from-accent/12 via-bg-card to-bg-card shadow-xl">
        <div className="border-b border-white/10 p-5 lg:p-6">
          {loading && !data ? (
            <div className="py-8 text-center text-text-secondary animate-pulse">Загружаем накопленную память…</div>
          ) : error && !data ? (
            <div className="flex items-start gap-3 rounded-xl border border-negative/25 bg-negative/5 p-4 text-sm text-negative">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Память рынка временно недоступна: {error}</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <StatCard label="Статей" value={String(data?.stats?.articlesTotal ?? 0)} hint="сырой новостной архив" />
                <StatCard label="Событий" value={String(data?.stats?.eventsTotal ?? 0)} hint="кластеры заголовков" />
                <StatCard label="Классифицировано" value={String(data?.stats?.classifiedEvents ?? 0)} hint="с каналом влияния" />
                <StatCard label="Реакций проверено" value={String(data?.stats?.evaluatedEventOutcomes ?? 0)} hint="событие × актив × горизонт" />
                <StatCard label="Снимков прогнозов" value={String(data?.stats?.forecastSnapshots ?? 0)} hint={`${data?.stats?.evaluatedForecasts ?? 0} уже оценено`} />
                <StatCard label="Ценовых точек" value={String(data?.stats?.priceSnapshots ?? 0)} hint="дневные ряды V2" />
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Статьи: {formatDateTime(data?.stats?.latestArticleFetchAt)}</span>
                <span>Классификация: {formatDateTime(data?.stats?.latestClassificationAt)}</span>
                <span>Цены: {formatDateTime(data?.stats?.latestPriceFetchAt)}</span>
                <span>Прогнозы: {formatDateTime(data?.stats?.latestForecastIssuedAt)}</span>
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/10 bg-bg-primary/55 p-4 text-xs leading-relaxed text-text-secondary">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>
                  <strong className="text-text-primary">Честное ограничение:</strong> выборка пока маленькая. Поэтому раздел показывает размер N и статус проверки,
                  а не выдаёт раннюю статистику за доказанную точность. Score вверх — доля взвешенных направленных доказательств, не калиброванная вероятность.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-white/10 p-3 scrollbar-hide">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={active}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? 'bg-accent text-white shadow-lg shadow-accent/25'
                    : 'border border-white/12 bg-white/5 text-slate-200 hover:border-accent/50 hover:bg-accent/10'
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 lg:p-6">
          {tab === 'events' && (
            data?.events.length ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {data.events.map((event) => (
                  <EventCard
                    key={event.eventId}
                    event={event}
                    outcomes={outcomesByEvent.get(event.eventId) ?? []}
                    selected={selectedEventId === event.eventId}
                    onSelect={() => setSelectedEventId((current) => current === event.eventId ? null : event.eventId)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState text="Классифицированных событий пока нет. Память уже собирает статьи и кластеры; карточки появятся после классификаций." />
            )
          )}

          {tab === 'analogues' && (
            reliableAnalogues.length ? (
              <>
                <p className="mb-4 max-w-4xl text-sm leading-relaxed text-text-secondary">
                  Аналоги группируются по каналу передачи, активу, ожидаемому направлению и горизонту. В надёжную выборку входят только классификации v3.
                  Медиана считается по уже наступившим дневным исходам; аномальная медиана дополнительно вычитает обычный дневной фон актива.
                  Это история реакций, а не доказательство причинности.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {reliableAnalogues.map((analogue) => (
                    <AnalogueCard
                      key={`${analogue.transmissionChannel}-${analogue.assetKey}-${analogue.expectedDirection}-${analogue.horizonTradingDays}`}
                      analogue={analogue}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyState text={archivedAnalogueGroups > 0
                ? 'Надёжных аналогов v3 пока нет. Архивные исходы v1/v2 сохранены для аудита, но намеренно не используются для статистических выводов: ручная проверка нашла в них слишком широкие spillover-воздействия. Аналоги появятся после классификаций v3 и наступления горизонтов 1, 3 и 10 торговых дней.'
                : 'Оценённых исторических аналогов пока недостаточно. Они появятся, когда у классифицированных событий наступят горизонты 1, 3 и 10 торговых дней.'} />
            )
          )}

          {tab === 'forecasts' && (
            data?.forecasts.length ? (
              <>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <StatCard label="Оценено направленных v2" value={String(ledgerSummary.evaluatedDirectional)} hint="только aggregation_v2 с наступившим горизонтом" />
                  <StatCard label="Совпадений направления v2" value={String(ledgerSummary.hits)} hint={ledgerSummary.evaluatedDirectional >= 30 ? 'можно начинать смотреть hit-rate' : 'точность пока не публикуем как вывод'} />
                  <StatCard label="Воздержаний v2" value={String(ledgerSummary.abstentions)} hint="«нет сигнала» — полноценный результат" />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.forecasts.map((forecast) => (
                    <ForecastLedgerCard key={forecast.forecastId} forecast={forecast} />
                  ))}
                </div>
              </>
            ) : (
              <EmptyState text="Снимков прогнозов V2 пока нет. Они появятся после дневного запуска агрегатора на классифицированных событиях." />
            )
          )}
        </div>
      </div>
    </motion.section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-bg-primary/45 px-5 py-10 text-center text-sm leading-relaxed text-text-secondary">
      {text}
    </div>
  );
}
