import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, Zap } from 'lucide-react';
import type { NewsItem, TensionData } from '@/data/mockData';
import { fetchLiveTension } from '@/data/liveTension';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import { useLiveNews } from '@/hooks/useLiveNews';
import {
  fetchRussiaInsights,
  type RussiaInsights,
  type RussiaMarketIndicator,
} from '@/data/russiaInsights';

/**
 * «Бриф за 60 секунд» (этап 3 дорожной карты).
 *
 * Собирается ДЕТЕРМИНИРОВАННО из тех же публичных блоков, которые
 * посетитель видит ниже: шкала напряжённости, лента событий, тепловая
 * карта и российский контур. Никакого свободного текста LLM: каждое
 * число в брифе можно проверить в блоке, куда ведёт ссылка пункта.
 * Пороги последствий повторяют логику каналов «России и бизнеса»
 * (Brent ≥1%, среднее валютной корзины >0.15%, RGBI ≥0.1%).
 */

interface BriefItem {
  id: string;
  href: string;
  body: ReactNode;
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const m10 = abs % 10;
  const m100 = abs % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')}%`;
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

function eventTimestamp(item: NewsItem): number {
  const parsed = item.published_at ? new Date(item.published_at).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function truncateTitle(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  return clean.length > 150 ? `${clean.slice(0, 147).trimEnd()}…` : clean;
}

function BriefLinkItem({ item, marker }: { item: BriefItem; marker: ReactNode }) {
  return (
    <li>
      <a
        href={item.href}
        className="group flex items-start gap-2.5 rounded-xl px-2 py-2 text-sm leading-relaxed text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-slate-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        {marker}
        <span className="min-w-0 flex-1">{item.body}</span>
        <ArrowRight
          className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-cyan-300"
          aria-hidden="true"
        />
      </a>
    </li>
  );
}

export default function DailyBrief() {
  const { assets, loading: assetsLoading, hasLiveData, fallbackAssetIds } = useLiveAssets();
  const { news, loading: newsLoading } = useLiveNews();
  const [tension, setTension] = useState<TensionData | null>(null);
  const [tensionLoaded, setTensionLoaded] = useState(false);
  const [insights, setInsights] = useState<RussiaInsights | null>(null);
  const [insightsLoaded, setInsightsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await fetchLiveTension();
      if (!mounted) return;
      if (data) setTension(data);
      setTensionLoaded(true);
    }
    void load();
    const interval = window.setInterval(load, 300_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await fetchRussiaInsights();
      if (!mounted) return;
      if (data.markets.length || data.headlines.length) setInsights(data);
      setInsightsLoaded(true);
    }
    void load();
    const interval = window.setInterval(load, 300_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const brief = useMemo(() => {
    const facts: BriefItem[] = [];
    const consequences: BriefItem[] = [];

    // --- Факт 1: шкала напряжённости ---
    let tensionDelta: number | null = null;
    if (tension) {
      const current = Math.round(Math.min(100, Math.max(0, tension.current)));
      const previous = tension.history[tension.history.length - 2]?.value;
      tensionDelta =
        typeof previous === 'number' && Number.isFinite(previous)
          ? current - Math.round(previous)
          : null;
      const deltaText =
        tensionDelta === null
          ? ''
          : tensionDelta === 0
            ? ', без изменения к предыдущему дню'
            : `, ${tensionDelta > 0 ? '+' : '−'}${Math.abs(tensionDelta)} ${plural(Math.abs(tensionDelta), ['пункт', 'пункта', 'пунктов'])} к предыдущему дню`;
      facts.push({
        id: 'tension',
        href: '#dashboard',
        body: (
          <>
            Шкала напряжённости —{' '}
            <strong className="tabular-nums text-text-primary">{current}/100</strong>
            {tension.label ? ` («${tension.label}»)` : ''}
            {deltaText}; на основе{' '}
            <strong className="tabular-nums text-text-primary">
              {(tension.newsCount ?? 0).toLocaleString('ru-RU')}
            </strong>{' '}
            {plural(tension.newsCount ?? 0, ['новости', 'новостей', 'новостей'])} за сутки.
          </>
        ),
      });
    }

    // --- Факт 2: самая заметная публикация ленты (если проходит порог) ---
    const topEvent =
      [...news]
        .filter((item) => item.title && item.importance >= 7)
        .sort(
          (a, b) =>
            b.importance - a.importance ||
            (b.confidence ?? 0) - (a.confidence ?? 0) ||
            eventTimestamp(b) - eventTimestamp(a),
        )[0] ?? null;
    if (topEvent) {
      facts.push({
        id: 'top-event',
        href: '#news',
        body: (
          <>
            Главная публикация ленты по нашей шкале важности (
            <strong className="tabular-nums text-text-primary">
              {Math.round(topEvent.importance)}/10
            </strong>
            ): «{truncateTitle(topEvent.title)}»
            {topEvent.source ? ` — ${topEvent.source}` : ''}. Это заголовок первоисточника,
            а не вывод о движении цен.
          </>
        ),
      });
    }

    // --- Факт 3: сильнейшее движение внешнего фона ---
    const liveAssets = hasLiveData
      ? assets.filter(
          (asset) =>
            !fallbackAssetIds.includes(asset.id) &&
            asset.price !== '—' &&
            Number.isFinite(asset.change) &&
            (asset.sparkline?.length ?? 0) >= 2,
        )
      : [];
    const strongestGlobal =
      [...liveAssets].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0] ?? null;
    if (strongestGlobal && facts.length < 3) {
      facts.push({
        id: 'global-move',
        href: '#global-markets',
        body: (
          <>
            Сильнейшее дневное движение внешнего фона —{' '}
            <strong className="text-text-primary">
              {strongestGlobal.name} {formatPct(strongestGlobal.change)}
            </strong>{' '}
            (последнее значение {strongestGlobal.price}).
          </>
        ),
      });
    }

    // --- Запасной факт 3: российский контур ---
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
    if (strongestRussia && facts.length < 3) {
      facts.push({
        id: 'russia-move',
        href: '#russia-business',
        body: (
          <>
            В российском контуре заметнее всего изменился{' '}
            <strong className="text-text-primary">{strongestRussia.name}</strong>:{' '}
            {formatIndicatorValue(strongestRussia)} {strongestRussia.unit} (
            <strong className="tabular-nums text-text-primary">
              {formatPct(strongestRussia.changePct)}
            </strong>
            ).
          </>
        ),
      });
    }

    // --- Последствия: те же пороги, что у каналов «России и бизнеса» ---
    const Brent = liveAssets.find((asset) => asset.id === 'brent') ?? null;
    if (Brent && Math.abs(Brent.change) >= 1) {
      consequences.push({
        id: 'cons-Brent',
        href: '#russia-business',
        body:
          Brent.change < 0 ? (
            <>
              Сырьевой канал: падение Brent на{' '}
              <strong className="tabular-nums text-text-primary">{formatPct(Brent.change)}</strong>{' '}
              давит на экспортную выручку и бюджетные ожидания; важно, подхватит ли движение
              рубль.
            </>
          ) : (
            <>
              Сырьевой канал: рост Brent на{' '}
              <strong className="tabular-nums text-text-primary">{formatPct(Brent.change)}</strong>{' '}
              поддерживает экспортную выручку; проверяем реакцию рубля и IMOEX.
            </>
          ),
      });
    }

    const fxIndicators = russiaCandidates.filter((indicator) =>
      ['usd-rub', 'eur-rub', 'cny-rub-moex', 'cny-rub-cbr'].includes(indicator.id),
    );
    const fxChanges = fxIndicators
      .map((indicator) => indicator.changePct)
      .filter((value): value is number => typeof value === 'number');
    const fxAverage =
      fxChanges.length >= 2
        ? fxChanges.reduce((sum, value) => sum + value, 0) / fxChanges.length
        : null;
    if (fxAverage !== null && Math.abs(fxAverage) > 0.15 && consequences.length < 2) {
      consequences.push({
        id: 'cons-fx',
        href: '#russia-business',
        body:
          fxAverage > 0 ? (
            <>
              Валютный канал: иностранные валюты в среднем{' '}
              <strong className="tabular-nums text-text-primary">{formatPct(fxAverage)}</strong>{' '}
              к рублю — импорт и валютные платежи требуют внимания.
            </>
          ) : (
            <>
              Валютный канал: корзина валют в среднем{' '}
              <strong className="tabular-nums text-text-primary">{formatPct(fxAverage)}</strong>{' '}
              к рублю — импорт дешевле в рублях, а валютная выручка при конвертации ниже.
            </>
          ),
      });
    }

    const rgbi = indicatorById.get('rgbi');
    if (
      rgbi &&
      typeof rgbi.changePct === 'number' &&
      Math.abs(rgbi.changePct) >= 0.1 &&
      consequences.length < 2
    ) {
      consequences.push({
        id: 'cons-rgbi',
        href: '#russia-business',
        body:
          rgbi.changePct >= 0 ? (
            <>
              Стоимость денег: RGBI{' '}
              <strong className="tabular-nums text-text-primary">{formatPct(rgbi.changePct)}</strong>{' '}
              — цены гособлигаций растут, доходности при прочих равных снижаются. Это рыночный
              фон, а не обещание дешёвых кредитов.
            </>
          ) : (
            <>
              Стоимость денег: RGBI{' '}
              <strong className="tabular-nums text-text-primary">{formatPct(rgbi.changePct)}</strong>{' '}
              — цены гособлигаций снижаются, доходности при прочих равных растут и финансовые
              условия жёстче.
            </>
          ),
      });
    }

    if (consequences.length === 0 && (Brent || fxChanges.length >= 2 || rgbi)) {
      consequences.push({
        id: 'cons-calm',
        href: '#russia-business',
        body: (
          <>
            Существенных движений по ключевым каналам сейчас нет: Brent, валютная корзина и
            RGBI остаются в пределах наших порогов дневного шума.
          </>
        ),
      });
    }

    // --- Смотреть сегодня: ровно один ориентир, по приоритету данных ---
    let watch: BriefItem | null = null;
    const cnyMoex = indicatorById.get('cny-rub-moex');
    if (cnyMoex && cnyMoex.changePct === null) {
      const previousDate = formatDateOnly(cnyMoex.previousDate);
      watch = {
        id: 'watch-cny',
        href: '#russia-business',
        body: (
          <>
            Первые сделки CNYRUB_TOM на Мосбирже: биржевого изменения пока нет, сайт показывает
            предыдущее закрытие{previousDate ? ` от ${previousDate}` : ''}.
          </>
        ),
      };
    } else if (tensionDelta !== null && Math.abs(tensionDelta) >= 10) {
      watch = {
        id: 'watch-tension',
        href: '#dashboard',
        body: (
          <>
            Продолжится ли движение шкалы к следующему обновлению: сегодня уже{' '}
            <strong className="tabular-nums text-text-primary">
              {tensionDelta > 0 ? '+' : '−'}
              {Math.abs(tensionDelta)} {plural(Math.abs(tensionDelta), ['пункт', 'пункта', 'пунктов'])}
            </strong>{' '}
            к предыдущему дню.
          </>
        ),
      };
    } else if (Brent && Math.abs(Brent.change) >= 2.5) {
      watch = {
        id: 'watch-Brent',
        href: '#russia-business',
        body: (
          <>
            Подтвердят ли CNY/RUB и IMOEX внешний импульс Brent (
            <strong className="tabular-nums text-text-primary">{formatPct(Brent.change)}</strong>
            ), или российский контур его проигнорирует.
          </>
        ),
      };
    } else if (topEvent && topEvent.importance >= 8) {
      watch = {
        id: 'watch-event',
        href: '#news',
        body: (
          <>
            Реакцию цен на главную тему ленты: пока это новость с важностью{' '}
            <strong className="tabular-nums text-text-primary">
              {Math.round(topEvent.importance)}/10
            </strong>
            , а не подтверждённое движение рынка.
          </>
        ),
      };
    } else if (russiaCandidates.length > 0) {
      watch = {
        id: 'watch-russia',
        href: '#russia-business',
        body: (
          <>
            USD/RUB и IMOEX: появятся ли в российском контуре движения сильнее обычного дневного
            шума.
          </>
        ),
      };
    }

    return { facts: facts.slice(0, 3), consequences: consequences.slice(0, 2), watch };
  }, [tension, news, assets, hasLiveData, fallbackAssetIds, insights]);

  // Показываем бриф только цельным снимком: полусобранный вариант мог бы
  // на секунду заявить «данных недостаточно» просто потому, что активы
  // или российский контур ещё в пути.
  const loading = assetsLoading || !tensionLoaded || !insightsLoaded || newsLoading;
  const stamp = formatStamp([tension?.updatedAt, insights?.generatedAt]);

  return (
    <section id="brief" className="mb-10 scroll-mt-24 lg:mb-12" aria-label="Бриф за 60 секунд">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Zap className="h-5 w-5 text-cyan-300" aria-hidden="true" />
        <h2 className="text-lg font-extrabold tracking-tight lg:text-xl">Бриф за 60 секунд</h2>
        {stamp && (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold tabular-nums text-text-secondary">
            обновлено {stamp}
          </span>
        )}
      </div>

      <div className="rounded-xl2 border border-border-subtle bg-bg-card p-4 shadow-lg sm:p-5">
        {loading ? (
          <div aria-busy="true" aria-label="Собираем бриф">
            <div className="h-5 w-56 animate-pulse rounded-sm bg-white/10" />
            <div className="mt-4 space-y-2.5">
              <div className="h-4 animate-pulse rounded-sm bg-white/[0.07]" />
              <div className="h-4 w-11/12 animate-pulse rounded-sm bg-white/[0.06]" />
              <div className="h-4 w-4/5 animate-pulse rounded-sm bg-white/[0.05]" />
            </div>
            <p className="mt-4 text-xs text-text-secondary">
              Собираем итоги из шкалы, цен и российского контура…
            </p>
          </div>
        ) : brief.facts.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-secondary">
            Бриф временно недоступен: не хватает свежих данных сразу из нескольких блоков.
            Ниже каждый раздел честно покажет своё состояние — выдуманный итог мы не подставляем.
          </p>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-secondary">
                  Факты
                </h3>
                <ol data-testid="brief-facts" className="mt-1.5 space-y-0.5">
                  {brief.facts.map((item, index) => (
                    <BriefLinkItem
                      key={item.id}
                      item={item}
                      marker={
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-white">
                          {index + 1}
                        </span>
                      }
                    />
                  ))}
                </ol>
              </div>

              <div>
                <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-secondary">
                  Что это значит для России
                </h3>
                {brief.consequences.length > 0 ? (
                  <ul data-testid="brief-consequences" className="mt-1.5 space-y-0.5">
                    {brief.consequences.map((item) => (
                      <BriefLinkItem
                        key={item.id}
                        item={item}
                        marker={
                          <span
                            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300"
                            aria-hidden="true"
                          />
                        }
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 px-2 text-sm leading-relaxed text-text-secondary">
                    Данных российского контура пока недостаточно для вывода о последствиях.
                  </p>
                )}
              </div>
            </div>

            {brief.watch && (
              <a
                data-testid="brief-watch"
                href={brief.watch.href}
                className="group mt-4 flex items-start gap-2.5 rounded-xl border border-cyan-300/20 bg-cyan-400/[0.07] px-3.5 py-3 text-sm leading-relaxed text-slate-200 transition-colors hover:border-cyan-300/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <strong className="font-extrabold text-cyan-100">Смотреть сегодня:</strong>{' '}
                  {brief.watch.body}
                </span>
                <ArrowRight
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-cyan-300/70 transition-colors group-hover:text-cyan-200"
                  aria-hidden="true"
                />
              </a>
            )}

            <p className="mt-3.5 text-[11px] leading-relaxed text-text-secondary/80">
              Бриф собирается автоматически только из блоков ниже: каждое число можно проверить
              по ссылке пункта. Новых данных и торговых рекомендаций здесь нет.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
