import { useEffect, useMemo, useState } from 'react';
import { m as motion } from 'framer-motion';
import {
  AlertTriangle,
  Banknote,
  ExternalLink,
  Info,
  Minus,
  Newspaper,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import GuideLink from './GuideLink';
import MoneySpreads from './MoneySpreads';
import OfzCurve from './OfzCurve';
import RussiaHistory from './RussiaHistory';
import { SectionThemeBadge } from './sectionThemes';
import FreshnessDot from './FreshnessDot';
import { formatPercent as formatPercentShared } from '@/lib/percent';
import { startPolling } from '@/lib/polling';
import { buildMoneySpreads } from '@/lib/spreads';
import { formatObservationTimestamp } from '@/lib/dateDisplay.mjs';
import {
  fetchRussiaInsights,
  RussiaHeadline,
  RussiaInsights,
  RussiaMarketIndicator,
} from '@/data/russiaInsights';

// Эти индикаторы показываются отдельными группами, чтобы не смешивать валюты,
// стоимость денег и недельный ряд международных резервов.
const MONEY_INDICATOR_IDS = ['key-rate', 'ruonia', 'ofz-10y', 'inflation'];
const RESERVE_INDICATOR_IDS = ['reserves'];

const EXPECTED_INDICATOR_NAMES: Record<string, string> = {
  'usd-rub': 'USD/RUB',
  'eur-rub': 'EUR/RUB',
  imoex: 'IMOEX',
  rgbi: 'RGBI',
  'key-rate': 'ключевая ставка',
  reserves: 'международные резервы',
  ruonia: 'RUONIA',
  'ofz-10y': 'доходность ОФЗ',
  'gold-moex': 'золото на Мосбирже',
  inflation: 'инфляция',
};

function formatPercent(value: number | null | undefined): string {
  return formatPercentShared(value);
}

/**
 * Абсолютное изменение с единицей из ответа: «+0,05 п.п.» у ставок,
 * «+6,4 млрд $» у резервов. Знаки после запятой не добиваются нулями —
 * 6,40 и 6,4 это одно и то же число, а лишний ноль выглядит точнее, чем есть.
 */
function formatAbsChange(value: number | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const text = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${sign}${text} ${unit ?? ''}`.trim();
}

/** Короткая дата для подписи «к 27.10» — только там, где рядом стоит дельта. */
function formatShortDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value ?? '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(new Date(`${value}T12:00:00+03:00`));
}

function formatIndicatorValue(indicator: RussiaMarketIndicator): string {
  const decimals = indicator.unit === '₽' ? 4 : 2;
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(indicator.value);
}

function formatAsOf(indicator: RussiaMarketIndicator): string {
  if (indicator.asOfLabel) return indicator.asOfLabel;
  if (/^\d{4}-\d{2}-\d{2}$/.test(indicator.asOf)) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Moscow',
    }).format(new Date(`${indicator.asOf}T12:00:00+03:00`));
  }
  if (indicator.asOf.includes('T')) return formatObservationTimestamp(indicator.asOf);
  return indicator.provider.includes('Мосбиржа') ? `${indicator.asOf} МСК` : indicator.asOf;
}

function formatMoscowDateTime(value: string | undefined): string {
  return (value && formatObservationTimestamp(value)) || 'время публикации не указано';
}

function MarketTile({ indicator }: { indicator: RussiaMarketIndicator }) {
  // У ставок процент от процента читался бы как «ставка выросла на 0,36 %»,
  // поэтому для них показывается разница в процентных пунктах с датой
  // предыдущего опубликованного значения.
  const change = indicator.changePct ?? indicator.changeAbs ?? 0;
  const isIndex = indicator.id === 'imoex' || indicator.id === 'rgbi';
  // У золота база та же, что у индексов, — закрытие предыдущей сессии Мосбиржи,
  // и её дату тоже нужно печатать рядом: субботняя сделка иначе читалась бы
  // как движение за сутки.
  const hasCloseBase = isIndex || indicator.id === 'gold-moex';
  const changeClass = change > 0
    ? 'text-positive'
    : change < 0
      ? 'text-negative'
      : 'text-text-secondary';
  // Стрелка вверх у нулевого изменения — тоже утверждение о движении,
  // которого не было: при 0,00 % рисуется горизонтальная черта.
  const Icon = change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;

  return (
    <a
      href={indicator.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-bg-card p-[var(--space-2)] shadow-lg transition-all hover:-translate-y-0.5 hover:border-accent/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
      title={`${indicator.provider}: ${indicator.basis}`}
    >
      <div className="flex items-start justify-between gap-[var(--space-1)]">
        <div>
          <div className="text-sm font-extrabold tracking-wide text-text-primary">{indicator.name}</div>
          <div className="mt-[var(--space-1)] text-[11px] font-medium text-text-secondary">{indicator.label}</div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-blue-800" />
      </div>
      <div className="mt-[var(--space-2)] flex flex-wrap items-baseline gap-x-[var(--space-1)] gap-y-[var(--space-1)]">
        <span className="text-4xl font-extrabold tabular-nums text-text-primary">
          {formatIndicatorValue(indicator)}
        </span>
        <span className="text-xs font-semibold text-text-secondary">{indicator.unit}</span>
        {indicator.changePct !== null ? (
          <span
            className={`inline-flex items-center gap-[var(--space-1)] text-sm font-extrabold tabular-nums ${changeClass}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {formatPercent(indicator.changePct)}
            {/* У индексов база — закрытие предыдущей сессии, и её дата
                печатается рядом: без неё «+0,16 %» у субботней сессии
                читалось бы как движение за сутки с нуля. */}
            {hasCloseBase && indicator.previousDate && (
              <span className="text-[11px] font-semibold text-text-secondary">
                к {formatShortDate(indicator.previousDate)}
              </span>
            )}
          </span>
        ) : indicator.changeAbs !== null && indicator.changeAbs !== undefined ? (
          <span
            className={`inline-flex items-center gap-[var(--space-1)] text-sm font-extrabold tabular-nums ${changeClass}`}
            title={`Разница с предыдущим опубликованным значением${
              indicator.previousDate ? ` за ${formatShortDate(indicator.previousDate)}` : ''
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {formatAbsChange(indicator.changeAbs, indicator.changeAbsUnit)}
            {indicator.previousLabel ? (
              // Месячный ряд: «к августу» вместо «к 31.08», иначе сравнение
              // месячных данных читается как сравнение с конкретным днём.
              <span className="text-[11px] font-semibold text-text-secondary">
                к {indicator.previousLabel}
              </span>
            ) : (
              indicator.previousDate && (
                <span className="text-[11px] font-semibold text-text-secondary">
                  к {formatShortDate(indicator.previousDate)}
                </span>
              )
            )}
          </span>
        ) : null}
      </div>
      <div className="mb-[var(--space-2)] mt-[var(--space-2)] border-t border-slate-200 pt-[var(--space-1)] text-[11px] leading-relaxed text-text-secondary">
        <div className="market-source"><FreshnessDot asOf={indicator.asOf} /><span className="font-bold text-slate-700">{indicator.provider}</span> · {formatAsOf(indicator)}</div>
        <div className="mt-[var(--space-1)]">{indicator.basis}</div>
      </div>
      <span
        data-testid="russia-source-tile-hint"
        className="mt-auto inline-flex w-full items-center justify-center gap-[var(--space-1)] rounded-full border border-blue-300/25 bg-blue-400/10 px-[var(--space-1)] py-[var(--space-1)] text-[11px] font-extrabold leading-none text-blue-800"
      >
        Открыть источник
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </span>
    </a>
  );
}

function HeadlineRow({ headline }: { headline: RussiaHeadline }) {
  return (
    <a
      href={headline.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-slate-200 bg-slate-50 px-[var(--space-2)] py-[var(--space-2)] transition-colors hover:border-accent/50 hover:bg-accent/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex flex-wrap items-center gap-x-[var(--space-1)] gap-y-[var(--space-1)] text-[11px] font-bold text-text-secondary">
        <span className="text-blue-800">{headline.source}</span>
        <span>{headline.section}</span>
        <time className="ml-auto shrink-0 font-medium" dateTime={headline.publishedAt}>
          {formatMoscowDateTime(headline.publishedAt)}
        </time>
      </div>
      <h4 className="mt-[var(--space-1)] text-sm font-bold leading-snug text-text-primary group-hover:text-blue-800">
        {headline.title}
      </h4>
      <span className="mt-[var(--space-1)] inline-flex items-center gap-[var(--space-1)] text-[11px] font-semibold text-blue-800">
        Открыть публикацию <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </span>
    </a>
  );
}

/** 2026-09-30 → «сентябрь 2026»: месячный ряд нельзя подписывать днём. */
function monthOf(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-/.exec(iso);
  if (!match) return null;
  const names = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
  ];
  const name = names[Number(match[2]) - 1];
  return name ? `за ${name} ${match[1]}` : null;
}

export default function RussiaBusiness() {
  const [insights, setInsights] = useState<RussiaInsights>({
    generatedAt: '',
    markets: [],
    headlines: [],
    errors: [],
    notes: [],
  });
  const [insightsLoading, setInsightsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await fetchRussiaInsights();
      if (!mounted) return;
      if (data.markets.length || data.headlines.length) setInsights(data);
      setInsightsLoading(false);
    }
    load();
    const stopPolling = startPolling(() => void load());
    return () => {
      mounted = false;
      stopPolling();
    };
  }, []);



  const indicators = useMemo(() => {
    const byId = new Map(insights.markets.map((indicator) => [indicator.id, indicator]));
    const ordered = [
      'usd-rub',
      'eur-rub',
      'cny-rub-moex',
      'imoex',
      'rgbi',
      // Золото в рублях за грамм: биржевая сделка Мосбиржи, не мировой спот.
      'gold-moex',
      // Стоимость денег: ключевая ставка ЦБ и точка кривой ОФЗ. Обе строки
      // приходят из тех же публичных источников, что и остальные числа.
      'key-rate',
      'ruonia',
      'ofz-10y',
    ]
      .map((id) => byId.get(id))
      .filter((indicator): indicator is RussiaMarketIndicator => Boolean(indicator));
    if (!byId.has('cny-rub-moex') && byId.has('cny-rub-cbr')) {
      ordered.splice(2, 0, byId.get('cny-rub-cbr')!);
    }
    // Порядок задан списком, но прятать незнакомый id нельзя: сервер добавил
    // RUONIA, а страница полгода показывала «плитки нет», хотя строка в ответе
    // была. Всё, что пришло и не попало в список, показываем в конце. Курс ЦБ
    // на юань — не дубль: он нужен только когда биржевого юаня нет.
    const shown = new Set(ordered.map((indicator) => indicator.id));
    for (const indicator of insights.markets) {
      if (shown.has(indicator.id) || indicator.id === 'cny-rub-cbr') continue;
      shown.add(indicator.id);
      ordered.push(indicator);
    }
    return ordered;
  }, [insights.markets]);

  const moneyIndicators = useMemo(
    () => indicators.filter((indicator) => MONEY_INDICATOR_IDS.includes(indicator.id)),
    [indicators],
  );
  const mainIndicators = useMemo(
    () =>
      indicators.filter(
        (indicator) =>
          !MONEY_INDICATOR_IDS.includes(indicator.id) &&
          !RESERVE_INDICATOR_IDS.includes(indicator.id),
      ),
    [indicators],
  );
  const reserveIndicator = useMemo(
    () => indicators.find((indicator) => indicator.id === 'reserves') ?? null,
    [indicators],
  );
  const ofzIndicator = useMemo(
    () => indicators.find((indicator) => indicator.id === 'ofz-10y') ?? null,
    [indicators],
  );
  const missingIndicators = useMemo(() => {
    const present = new Set(indicators.map((indicator) => indicator.id));
    const hasCny = present.has('cny-rub-moex') || present.has('cny-rub-cbr');
    return Object.entries(EXPECTED_INDICATOR_NAMES)
      .filter(([id]) => !present.has(id))
      .map(([, name]) => name)
      .filter((name) => !(name === 'CNY/RUB' && hasCny));
  }, [indicators]);

  const indicatorById = useMemo(
    () => new Map(insights.markets.map((indicator) => [indicator.id, indicator])),
    [insights.markets],
  );

  /**
   * Производные факты по ставкам. Считаются только из опубликованных значений
   * и только когда есть все слагаемые: половинчатая разность выглядела бы как
   * настоящий результат.
   */
  const moneySpreads = useMemo(() => {
    const withDate = (indicator: RussiaMarketIndicator | undefined, prefix = '') => {
      if (!indicator || !Number.isFinite(indicator.value)) return null;
      const day = indicator.asOf ? indicator.asOf.slice(0, 10).split('-').reverse().join('.') : 'дата не указана';
      return { value: indicator.value, asOf: `${prefix}${day}` };
    };
    const ofz = indicatorById.get('ofz-10y');
    // Инфляция — месячный ряд: её дата в ответе это конец месяца, но читателю
    // нужно «за сентябрь 2026», иначе «30.09.2026» выглядит как дневное число.
    const inflation = indicatorById.get('inflation');
    const inflationMonth = inflation?.asOf ? monthOf(inflation.asOf) : null;
    return buildMoneySpreads({
      keyRate: withDate(indicatorById.get('key-rate'), 'с '),
      inflation:
        inflation && Number.isFinite(inflation.value)
          ? { value: inflation.value, asOf: inflationMonth ?? 'месяц не указан' }
          : null,
      ofz10y: withDate(ofz),
      curve: ofz?.curve ?? null,
      curveAsOf: ofz?.curveAsOf
        ? ofz.curveAsOf.slice(0, 10).split('-').reverse().join('.')
        : null,
    });
  }, [indicatorById]);


  return (
    <motion.section
      id="russia-business"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-[var(--space-5)] scroll-mt-[var(--space-6)] lg:mb-[var(--space-6)]"
    >
      <div className="overflow-hidden rounded-[var(--radius)] border border-accent/25 shadow-2xl">
        <div className="flex h-1.5" aria-hidden="true">
          <div className="flex-1 bg-slate-100" />
          <div className="flex-1 bg-blue-600" />
          <div className="flex-1" />
        </div>

        <div className="p-[var(--space-3)] sm:p-[var(--space-4)] lg:p-[var(--space-4)]">
          <div className="flex flex-wrap items-start gap-[var(--space-2)]">
            <div className="min-w-0 max-w-4xl">
              <SectionThemeBadge themeId="russia" />
              <h2 className="mt-[var(--space-2)] text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
                Пульс российского бизнеса
              </h2>
              <p className="mt-[var(--space-1)] max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
                Проверяемые курсы и биржевые значения с источниками и датами; отдельно — исходные
                заголовки российских деловых лент со ссылками. Заголовки не используются для оценки
                важности, тональности или предполагаемого влияния на цены.
              </p>
            </div>
            <GuideLink href="/guide#guide-russia" label="Как читать блок" mobileLabel="Справка" />
          </div>

          <div className="mt-[var(--space-3)]">
            <div className="mb-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-1)]">
              <div className="flex items-center gap-[var(--space-1)] text-sm font-extrabold uppercase tracking-[0.12em] text-blue-800">
                <Banknote className="h-4 w-4" />
                Российские рынки и официальные курсы
              </div>
              <span className="ml-auto rounded-full border border-blue-300/25 bg-blue-400/10 px-[var(--space-1)] py-[var(--space-1)] text-[11px] font-extrabold uppercase tracking-[0.12em] text-blue-800">
                Российский контур
              </span>
            </div>
            {insightsLoading && indicators.length === 0 ? (
              <div className="grid grid-cols-2 gap-[var(--space-2)] lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
                ))}
              </div>
            ) : indicators.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-[var(--space-2)] md:grid-cols-3 xl:grid-cols-5">
                  {mainIndicators.map((indicator) => (
                    <MarketTile key={indicator.id} indicator={indicator} />
                  ))}
                </div>
                {missingIndicators.length > 0 && (
                  <div className="mt-[var(--space-2)] flex items-start gap-[var(--space-1)] rounded-xl border border-amber-400/25 bg-amber-400/10 px-[var(--space-2)] py-[var(--space-1)] text-xs leading-relaxed text-amber-900">
                    <AlertTriangle className="mt-[var(--space-1)] h-3.5 w-3.5 shrink-0" />
                    <span>
                      Сейчас не получены: {missingIndicators.join(', ')}. Плитки нет до ответа
                      источника — число вместо неё не подставляется. Это не всегда поломка: у
                      RUONIA публикация на следующий день, у резервов — раз в неделю, ключевая
                      ставка меняется решением ЦБ и месяцами стоит на месте.
                    </span>
                  </div>
                )}
                {moneyIndicators.length > 0 && (
                  <>
                    <div className="mt-[var(--space-3)] mb-[var(--space-1)] text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
                      Стоимость денег — ставка ЦБ, RUONIA, инфляция и кривая ОФЗ
                    </div>
                    <div className="grid grid-cols-1 gap-[var(--space-2)] sm:grid-cols-2 lg:grid-cols-4">
                      {moneyIndicators.map((indicator) => (
                        <MarketTile key={indicator.id} indicator={indicator} />
                      ))}
                    </div>
                    <MoneySpreads spreads={moneySpreads} />
                    {ofzIndicator && <OfzCurve indicator={ofzIndicator} />}
                  </>
                )}
                {reserveIndicator && (
                  <>
                    <div className="mt-[var(--space-3)] mb-[var(--space-1)] text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-secondary">
                      Внешний буфер — международные резервы ЦБ
                    </div>
                    <div className="grid grid-cols-1 gap-[var(--space-2)] md:grid-cols-3">
                      <MarketTile indicator={reserveIndicator} />
                      <div className="rounded-2xl border border-slate-200 bg-bg-card p-[var(--space-2)] text-xs leading-relaxed text-text-secondary md:col-span-2">
                        <p className="font-semibold text-slate-700">
                          Валютные активы и монетарное золото Банка России — то, чем он проводит
                          операции на валютном рынке и отвечает по внешним обязательствам.
                        </p>
                        <p className="mt-[var(--space-1)]">
                          Ряд недельный: отчётная дата — пятница, публикация — на следующей неделе.
                          Последняя точка поэтому всегда за прошлую пятницу.
                        </p>
                        <details className="mt-[var(--space-1)] rounded-lg border border-slate-200 bg-bg-card px-[var(--space-1)] py-[var(--space-1)]">
                          <summary className="min-h-11 cursor-pointer select-none py-[var(--space-2)] text-xs font-bold text-text-secondary transition-colors hover:text-slate-700">
                            Почему в млрд $, а не в процентах
                          </summary>
                          <p className="mt-[var(--space-1)] text-xs leading-relaxed text-text-secondary">
                            Изменение — то же число, что в первоисточнике, без пересчёта в проценты.
                            Из недельного ряда сайт берёт только итог: структуру (валюта, золото, СДР)
                            этот ряд не отдаёт, и разбирать её по частям сайт не станет.
                          </p>
                        </details>
                      </div>
                    </div>
                  </>
                )}
                <RussiaHistory />
              </>
            ) : (
              <div className="flex items-start gap-[var(--space-2)] rounded-2xl border border-amber-400/25 bg-amber-400/10 p-[var(--space-2)] text-sm text-amber-900">
                <AlertTriangle className="mt-[var(--space-1)] h-5 w-5 shrink-0" />
                Российские источники временно недоступны. Сайт не подставляет выдуманные значения вместо курсов и индексов.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-[var(--space-3)] overflow-hidden rounded-[var(--radius)] border border-accent/25 shadow-2xl">
        <div className="p-[var(--space-3)] sm:p-[var(--space-4)] lg:p-[var(--space-4)]">
          <div className="mb-[var(--space-2)] flex items-center gap-[var(--space-1)] border-b border-slate-200 pb-[var(--space-2)]">
            <Newspaper className="h-5 w-5 text-blue-800" aria-hidden="true" />
            <div>
              <h3 className="text-lg font-extrabold text-text-primary">Российские деловые заголовки</h3>
              <p className="mt-[var(--space-1)] text-xs leading-relaxed text-text-secondary">
                Заголовки, источник, время публикации и ссылка на материал. Список не ранжируется
                по модельным оценкам и не связывает публикации с движением цен.
              </p>
            </div>
          </div>
          {insights.headlines.length > 0 ? (
            <div className="grid grid-cols-1 gap-[var(--space-1)] lg:grid-cols-2">
              {insights.headlines.map((headline) => (
                <HeadlineRow key={headline.id} headline={headline} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-bg-card p-[var(--space-3)] text-sm text-text-secondary">
              {insightsLoading ? 'Загружаем заголовки из подключённых лент…' : 'Заголовки временно недоступны.'}
            </div>
          )}
          <div className="mt-[var(--space-3)] grid gap-[var(--space-1)] border-t border-slate-200 pt-[var(--space-2)] text-[11px] leading-relaxed text-text-secondary md:grid-cols-3">
            {insights.notes.map((note) => (
              <div key={note} className="flex items-start gap-[var(--space-1)]">
                <Info className="mt-[var(--space-1)] h-3.5 w-3.5 shrink-0 text-blue-800" />
                <span>{note}</span>
              </div>
            ))}
          </div>
          {insights.errors.length > 0 && (
            <div className="mt-[var(--space-2)] text-[11px] font-medium text-amber-900/80">
              Часть источников не ответила при последнем обновлении: {insights.errors.length}. Остальные данные показаны как есть, без заполнения пробелов оценками.
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
