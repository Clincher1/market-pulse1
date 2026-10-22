import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Briefcase,
  Check,
  Clock,
  ExternalLink,
  Factory,
  Fuel,
  Globe,
  Info,
  Landmark,
  LineChart,
  Newspaper,
  Percent,
  ShieldAlert,
  Ship,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import GuideLink from './GuideLink';
import { NewsItem } from '@/data/mockData';
import { useLiveNews } from '@/hooks/useLiveNews';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import {
  fetchRussiaInsights,
  RussiaHeadline,
  RussiaInsights,
  RussiaMarketIndicator,
} from '@/data/russiaInsights';

type ChannelId = 'currency' | 'rates' | 'commodities' | 'demand' | 'trade';
type Status = 'calm' | 'watch' | 'pressure' | 'unknown';

const CHANNEL_LABELS: Record<ChannelId, string> = {
  currency: 'Валюта и платежи',
  rates: 'Ставки и кредиты',
  commodities: 'Сырьё и экспорт',
  demand: 'Спрос и экономика',
  trade: 'Торговля и санкции',
};

const CHANNEL_KEYWORDS: Record<ChannelId, string[]> = {
  currency: [
    'рубль', 'рубля', 'ruble', 'rouble', 'юан', 'yuan', 'cny', 'валют',
    'платеж', 'swift', 'доллар', 'dollar', 'евро', 'euro',
  ],
  rates: [
    'ключев', 'ставк', 'инфляц', 'центробанк', 'банк россии', 'фрс',
    'federal reserve', 'облигац', 'кредит', 'ипотек', 'доходност', 'rate',
  ],
  commodities: [
    'нефт', 'oil', 'Brent', 'opec', 'опек', 'газ', 'металл', 'зерн',
    'сырь', 'экспорт', 'commodity',
  ],
  demand: [
    'спрос', 'потребит', 'рознич', 'рецесс', 'ввп', 'gdp', 'безработ',
    'доход', 'продаж', 'consumer', 'retail',
  ],
  trade: [
    'санкци', 'тариф', 'пошлин', 'торгов', 'импорт', 'логист', 'поставк',
    'тамож', 'эмбарго', 'tariff', 'sanction', 'shipping',
  ],
};

const RUSSIA_KEYWORDS = [
  'росси', 'russia', 'russian', 'рубль', 'рубля', 'мосбирж', 'москв',
  'банк россии', 'центробанк', 'минфин', 'кремл', 'ofz', 'офз',
];

const CHANNEL_EXPLANATIONS: Record<ChannelId, string> = {
  currency:
    'Канал влияния: валютная выручка, импортные закупки и трансграничные платежи. Проверьте валюту договоров и ближайшие сроки оплаты; сайт не прогнозирует рубль по одной новости.',
  rates:
    'Канал влияния: стоимость кредитов, спрос на заёмное финансирование и оценка активов. Смотрите инфляцию, решения Банка России и динамику RGBI.',
  commodities:
    'Канал влияния: экспортная выручка, бюджетные доходы и внутренние цены на топливо и сырьё. Сопоставляйте событие с Brent и валютной парой.',
  demand:
    'Канал влияния: выручка компаний, потребительская активность и деловые ожидания. Отдельный заголовок не равен изменению спроса — нужны статистика и подтверждения.',
  trade:
    'Канал влияния: поставки, таможенные издержки, расчёты и доступ к рынкам. Проверяйте первоисточник и точный перечень ограничений, а не только заголовок.',
};

const CHANNEL_WATCH: Record<ChannelId, string> = {
  currency: 'USD/RUB, EUR/RUB и CNY/RUB на Мосбирже',
  rates: 'инфляцию, RGBI и следующее решение Банка России',
  commodities: 'Brent, валютные пары и IMOEX',
  demand: 'официальную статистику, IMOEX и потребительские индикаторы',
  trade: 'официальные документы, курсы валют и сроки поставок',
};

const PROFILES = [
  {
    id: 'importer',
    label: 'Импортирую',
    icon: Ship,
    channels: ['currency', 'trade'] as ChannelId[],
  },
  {
    id: 'exporter',
    label: 'Экспортирую',
    icon: Fuel,
    channels: ['commodities', 'trade', 'currency'] as ChannelId[],
  },
  {
    id: 'borrower',
    label: 'Есть кредиты',
    icon: Percent,
    channels: ['rates', 'demand'] as ChannelId[],
  },
  {
    id: 'producer',
    label: 'Производство',
    icon: Factory,
    channels: ['currency', 'commodities', 'trade'] as ChannelId[],
  },
  {
    id: 'retail',
    label: 'Торговля',
    icon: ShoppingBag,
    channels: ['demand', 'currency'] as ChannelId[],
  },
  {
    id: 'investor',
    label: 'Инвестирую',
    icon: LineChart,
    channels: ['rates', 'commodities', 'currency'] as ChannelId[],
  },
] as const;

type ProfileId = (typeof PROFILES)[number]['id'];
const PROFILE_STORAGE_KEY = 'market-pulse-business-profile-v1';

const STATUS_META: Record<Status, { label: string; classes: string; dot: string }> = {
  calm: {
    label: 'Спокойно',
    classes: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  watch: {
    label: 'Внимание',
    classes: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    dot: 'bg-amber-400',
  },
  pressure: {
    label: 'Повышенное движение',
    classes: 'border-red-400/30 bg-red-400/10 text-red-200',
    dot: 'bg-red-400',
  },
  unknown: {
    label: 'Нет данных',
    classes: 'border-white/15 bg-white/6 text-slate-300',
    dot: 'bg-slate-400',
  },
};

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function classifyText(text: string): ChannelId[] {
  const normalized = text.toLowerCase();
  return (Object.keys(CHANNEL_KEYWORDS) as ChannelId[]).filter((channel) =>
    includesAny(normalized, CHANNEL_KEYWORDS[channel]),
  );
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2).replace('.', ',')}%`;
}

function formatIndicatorValue(indicator: RussiaMarketIndicator): string {
  const decimals = indicator.unit === '₽' ? 4 : 2;
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(indicator.value);
}

function formatAsOf(indicator: RussiaMarketIndicator): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(indicator.asOf)) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Moscow',
    }).format(new Date(`${indicator.asOf}T12:00:00+03:00`));
  }
  return indicator.provider.includes('Мосбиржа') ? `${indicator.asOf} МСК` : indicator.asOf;
}

function formatMoscowDateTime(value: string | undefined): string {
  if (!value) return 'время неизвестно';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'время неизвестно';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date) + ' МСК';
}

function MarketTile({ indicator }: { indicator: RussiaMarketIndicator }) {
  const change = indicator.changePct ?? 0;
  const isIndex = indicator.id === 'imoex' || indicator.id === 'rgbi';
  const changeClass = !isIndex
    ? 'text-blue-200'
    : change > 0
      ? 'text-emerald-300'
      : change < 0
        ? 'text-red-300'
        : 'text-slate-300';
  const Icon = change >= 0 ? TrendingUp : TrendingDown;

  return (
    <a
      href={indicator.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group rounded-2xl border border-white/10 bg-black/20 p-4 shadow-lg transition-all hover:-translate-y-0.5 hover:border-accent/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
      title={`${indicator.provider}: ${indicator.basis}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold tracking-wide text-white">{indicator.name}</div>
          <div className="mt-0.5 text-[11px] font-medium text-slate-400">{indicator.label}</div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-blue-300" />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xl font-extrabold tabular-nums text-white">
          {formatIndicatorValue(indicator)}
        </span>
        <span className="text-xs font-semibold text-slate-400">{indicator.unit}</span>
        <span className={`inline-flex items-center gap-1 text-sm font-extrabold tabular-nums ${changeClass}`}>
          <Icon className="h-3.5 w-3.5" />
          {formatPercent(indicator.changePct)}
        </span>
      </div>
      <div className="mt-3 border-t border-white/10 pt-2.5 text-[11px] leading-relaxed text-slate-400">
        <span className="font-bold text-slate-200">{indicator.provider}</span> · {formatAsOf(indicator)}
        <div className="mt-0.5">{indicator.basis}</div>
      </div>
    </a>
  );
}

function ChannelCard({
  icon: Icon,
  title,
  status,
  basis,
  explanation,
}: {
  icon: typeof Wallet;
  title: string;
  status: Status;
  basis: string;
  explanation: string;
}) {
  const meta = STATUS_META[status];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4.5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-blue-200">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-extrabold text-white">{title}</h3>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${meta.classes}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-200">{basis}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{explanation}</p>
    </div>
  );
}

interface ScoredNews {
  item: NewsItem;
  channels: ChannelId[];
  directRussia: boolean;
  score: number;
  reasons: string[];
}

function scoreNews(news: NewsItem[], selectedProfiles: ProfileId[]): ScoredNews[] {
  const profileChannels = new Set<ChannelId>(
    PROFILES.filter((profile) => selectedProfiles.includes(profile.id)).flatMap(
      (profile) => profile.channels,
    ),
  );
  const now = Date.now();

  return news
    .map((item) => {
      const text = `${item.title} ${item.summary} ${item.topic}`.toLowerCase();
      const channels = new Set<ChannelId>(classifyText(text));
      for (const impact of item.impacts ?? []) {
        const asset = impact.asset.toLowerCase();
        if (asset.includes('Brent') || asset.includes('oil')) channels.add('commodities');
        if (asset.includes('usd') || asset.includes('eur')) channels.add('currency');
      }
      const channelList = [...channels];
      const directRussia = includesAny(text, RUSSIA_KEYWORDS);
      const ageHours = item.published_at
        ? Math.max(0, (now - new Date(item.published_at).getTime()) / 3_600_000)
        : 72;
      const freshness = ageHours <= 6 ? 1 : ageHours <= 24 ? 0.86 : ageHours <= 48 ? 0.68 : 0.45;
      const confidence = item.confidence ?? 0.5;
      const profileMatches = channelList.filter((channel) => profileChannels.has(channel)).length;
      const score =
        item.importance * (0.55 + confidence * 0.45) * freshness +
        (directRussia ? 3 : 0) +
        channelList.length * 0.6 +
        profileMatches * 1.4;
      const reasons: string[] = [];
      if (directRussia) reasons.push('прямая связь с Россией, рублём или российскими институтами');
      if (profileMatches) reasons.push('совпадает с вашим бизнес-профилем');
      reasons.push(`важность ${item.importance}/10 и уверенность классификации ${Math.round(confidence * 100)}%`);
      return { item, channels: channelList, directRussia, score, reasons };
    })
    .filter(
      (entry) =>
        entry.item.importance >= 5 &&
        (entry.item.confidence ?? 0.5) >= 0.4 &&
        (entry.directRussia || entry.channels.length > 0),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function EventCard({ scored }: { scored: ScoredNews }) {
  const { item, channels, reasons } = scored;
  const primaryChannel = channels[0];
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
        <span className="rounded-md bg-accent/20 px-2 py-1 text-blue-200">{item.source}</span>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          {formatMoscowDateTime(item.published_at)}
        </span>
        {channels.slice(0, 3).map((channel) => (
          <span key={channel} className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-slate-200">
            {CHANNEL_LABELS[channel]}
          </span>
        ))}
      </div>

      {item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="group mt-3 block">
          <h3 className="text-base font-extrabold leading-snug text-white group-hover:text-blue-200">
            {item.title}
            <ExternalLink className="mb-0.5 ml-1 inline h-3.5 w-3.5" />
          </h3>
        </a>
      ) : (
        <h3 className="mt-3 text-base font-extrabold leading-snug text-white">{item.title}</h3>
      )}

      <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.summary}</p>

      {primaryChannel && (
        <div className="mt-4 rounded-xl border border-accent/25 bg-accent/10 p-3.5">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-blue-200">
            Что это значит для бизнеса в России
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
            {CHANNEL_EXPLANATIONS[primaryChannel]}
          </p>
          <p className="mt-2 inline-flex items-start gap-1.5 text-xs font-semibold text-blue-100">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Смотреть дальше: {CHANNEL_WATCH[primaryChannel]}.
          </p>
        </div>
      )}

      <div className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Почему в подборке: {reasons.join('; ')}.
      </div>
    </article>
  );
}

function HeadlineRow({ headline }: { headline: RussiaHeadline }) {
  const channels = classifyText(`${headline.title} ${headline.categories.join(' ')}`).slice(0, 2);
  return (
    <a
      href={headline.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-white/[0.07] bg-white/[0.035] px-3.5 py-3 transition-colors hover:border-accent/50 hover:bg-accent/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
        <span className="text-blue-200">{headline.source}</span>
        <span>{headline.section}</span>
        <span className="ml-auto shrink-0 font-medium">{formatMoscowDateTime(headline.publishedAt)}</span>
      </div>
      <div className="mt-1.5 text-sm font-bold leading-snug text-slate-100 group-hover:text-white">
        {headline.title}
      </div>
      {channels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {channels.map((channel) => (
            <span key={channel} className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-slate-300">
              {CHANNEL_LABELS[channel]}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

function readProfiles(): ProfileId[] {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(PROFILES.map((profile) => profile.id));
    return parsed.filter((value): value is ProfileId => valid.has(value as ProfileId));
  } catch {
    return [];
  }
}

export default function RussiaBusiness({ globalMarkets }: { globalMarkets?: ReactNode }) {
  const { news, loading: newsLoading } = useLiveNews();
  const { assets } = useLiveAssets();
  const [insights, setInsights] = useState<RussiaInsights>({
    generatedAt: '',
    markets: [],
    headlines: [],
    errors: [],
    notes: [],
  });
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [selectedProfiles, setSelectedProfiles] = useState<ProfileId[]>(() => readProfiles());

  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await fetchRussiaInsights();
      if (!mounted) return;
      if (data.markets.length || data.headlines.length) setInsights(data);
      setInsightsLoading(false);
    }
    load();
    const interval = window.setInterval(load, 300_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(selectedProfiles));
    } catch {
      // Локальный профиль не критичен для работы дашборда.
    }
  }, [selectedProfiles]);

  const indicators = useMemo(() => {
    const byId = new Map(insights.markets.map((indicator) => [indicator.id, indicator]));
    const ordered = ['usd-rub', 'eur-rub', 'cny-rub-moex', 'imoex', 'rgbi']
      .map((id) => byId.get(id))
      .filter((indicator): indicator is RussiaMarketIndicator => Boolean(indicator));
    if (!byId.has('cny-rub-moex') && byId.has('cny-rub-cbr')) {
      ordered.splice(2, 0, byId.get('cny-rub-cbr')!);
    }
    return ordered;
  }, [insights.markets]);

  const indicatorById = useMemo(
    () => new Map(insights.markets.map((indicator) => [indicator.id, indicator])),
    [insights.markets],
  );
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const topEvents = useMemo(() => scoreNews(news, selectedProfiles), [news, selectedProfiles]);

  const channels = useMemo(() => {
    const usd = indicatorById.get('usd-rub');
    const eur = indicatorById.get('eur-rub');
    const cny = indicatorById.get('cny-rub-moex') ?? indicatorById.get('cny-rub-cbr');
    const fx = [usd, eur, cny].filter(Boolean) as RussiaMarketIndicator[];
    const fxChanges = fx.map((item) => item.changePct).filter((value): value is number => value !== null);
    const fxMax = fxChanges.length ? Math.max(...fxChanges.map(Math.abs)) : null;
    const fxAverage = fxChanges.length
      ? fxChanges.reduce((sum, value) => sum + value, 0) / fxChanges.length
      : null;
    const currencyStatus: Status = fxMax === null ? 'unknown' : fxMax < 0.4 ? 'calm' : fxMax < 1 ? 'watch' : 'pressure';

    const imoex = indicatorById.get('imoex');
    const rgbi = indicatorById.get('rgbi');
    const marketMoves = [imoex?.changePct, rgbi?.changePct].filter(
      (value): value is number => typeof value === 'number',
    );
    const marketStress = marketMoves.length
      ? Math.max(Math.abs(imoex?.changePct ?? 0) / 1.5, Math.abs(rgbi?.changePct ?? 0) / 0.6)
      : null;
    const marketStatus: Status = marketStress === null ? 'unknown' : marketStress < 0.5 ? 'calm' : marketStress < 1 ? 'watch' : 'pressure';

    const Brent = assetById.get('brent');
    const BrentAbs = Math.abs(Brent?.change ?? 0);
    const commodityStatus: Status = !Brent ? 'unknown' : BrentAbs < 1 ? 'calm' : BrentAbs < 2.5 ? 'watch' : 'pressure';

    const sp500 = assetById.get('sp500');
    const gold = assetById.get('gold');
    const negativeTop = topEvents.filter((entry) => entry.item.sentiment < -0.3).length;
    const globalStress = Math.max(Math.abs(sp500?.change ?? 0) / 1.5, negativeTop / 3);
    const globalStatus: Status = !sp500 ? 'unknown' : globalStress < 0.45 ? 'calm' : globalStress < 0.85 ? 'watch' : 'pressure';

    return [
      {
        icon: Wallet,
        title: 'Валюта и платежи',
        status: currencyStatus,
        basis: fx.length
          ? fx.map((item) => `${item.name} ${formatPercent(item.changePct)}`).join(' · ')
          : 'Курсы временно недоступны.',
        explanation:
          fxAverage === null
            ? 'Статус появится после загрузки курсов ЦБ и Мосбиржи.'
            : fxAverage > 0.15
              ? 'Иностранные валюты в среднем дорожают к рублю: импорт и валютные платежи требуют внимания.'
              : fxAverage < -0.15
                ? 'Рубль в среднем укрепляется к корзине: импорт дешевле в рублях, валютная выручка при конвертации ниже.'
                : 'Среднее движение корзины небольшое; смотрите отдельную валюту ваших договоров.',
      },
      {
        icon: Percent,
        title: 'Рынок и стоимость денег',
        status: marketStatus,
        basis: `IMOEX ${formatPercent(imoex?.changePct)} · RGBI ${formatPercent(rgbi?.changePct)}`,
        explanation:
          rgbi?.changePct === null || rgbi?.changePct === undefined
            ? 'RGBI временно недоступен, поэтому вывод о стоимости денег не делается.'
            : rgbi.changePct >= 0
              ? 'Цены гособлигаций растут; при прочих равных доходности снижаются. Это рыночный фон, а не обещание дешёвых кредитов.'
              : 'Цены гособлигаций снижаются; при прочих равных доходности растут и финансовые условия жёстче.',
      },
      {
        icon: Fuel,
        title: 'Сырьё и экспорт',
        status: commodityStatus,
        basis: Brent ? `Brent ${Brent.price} · ${formatPercent(Brent.change)}` : 'Brent временно недоступна.',
        explanation:
          'Нефть влияет на экспортную выручку, бюджетный фон и валютные ожидания. Сильное движение нужно сопоставлять с рублём и IMOEX.',
      },
      {
        icon: Globe,
        title: 'Глобальный риск',
        status: globalStatus,
        basis: `S&P 500 ${formatPercent(sp500?.change)} · Gold ${formatPercent(gold?.change)} · негативных событий в тройке: ${negativeTop}`,
        explanation:
          'Показывает, усиливается ли внешнее давление на рисковые активы. Это фон для проверки новостей, а не самостоятельный прогноз.',
      },
    ];
  }, [assetById, indicatorById, topEvents]);

  const toggleProfile = (profileId: ProfileId) => {
    setSelectedProfiles((previous) =>
      previous.includes(profileId)
        ? previous.filter((item) => item !== profileId)
        : [...previous, profileId],
    );
  };

  return (
    <motion.section
      id="russia-business"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="mb-10 scroll-mt-24 lg:mb-12"
    >
      <div className="overflow-hidden rounded-[28px] border border-accent/25 bg-linear-to-br from-[#102747] via-bg-card to-[#281722] shadow-2xl">
        <div className="flex h-1.5" aria-hidden="true">
          <div className="flex-1 bg-slate-100" />
          <div className="flex-1 bg-blue-600" />
          <div className="flex-1 bg-red-600" />
        </div>

        <div className="p-5 sm:p-7 lg:p-8">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-blue-200">
                <Landmark className="h-3.5 w-3.5" />
                Для бизнеса в России
              </div>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Пульс российского бизнеса
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Официальные курсы, Мосбиржа и мировые события — в переводе на язык последствий:
                что произошло, кого это может затронуть, как уже отреагировал рынок и что проверить дальше.
              </p>
            </div>
            <GuideLink href="#guide-russia" label="Как читать блок" mobileLabel="Справка" />
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-extrabold text-white">
                <Briefcase className="h-4 w-4 text-blue-300" />
                Показывать сначала важное для моего профиля
              </div>
              <span className="text-[11px] font-medium text-slate-500">
                Без регистрации: выбор хранится только в вашем браузере
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PROFILES.map((profile) => {
                const Icon = profile.icon;
                const selected = selectedProfiles.includes(profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleProfile(profile.id)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-extrabold transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                      selected
                        ? 'border-accent bg-accent text-white shadow-lg shadow-accent/25'
                        : 'border-white/15 bg-white/6 text-slate-200 hover:border-accent/60 hover:bg-accent/15'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {profile.label}
                    {selected && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-blue-200">
                <Banknote className="h-4 w-4" />
                Российские рынки и официальные курсы
              </div>
              <span className="ml-auto rounded-full border border-blue-300/25 bg-blue-400/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-blue-100">
                Российский контур
              </span>
            </div>
            {insightsLoading && indicators.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
                ))}
              </div>
            ) : indicators.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {indicators.map((indicator) => (
                  <MarketTile key={indicator.id} indicator={indicator} />
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                Российские источники временно недоступны. Сайт не подставляет выдуманные значения вместо курсов и индексов.
              </div>
            )}
          </div>

          <div className="mt-7 mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-blue-200">
              <Landmark className="h-4 w-4" />
              Каналы влияния на российский бизнес
            </div>
            <span className="text-xs font-medium text-slate-400">
              Вывод по российским индикаторам и внешним драйверам ниже
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {channels.map((channel) => (
              <ChannelCard key={channel.title} {...channel} />
            ))}
          </div>
        </div>
      </div>

      {globalMarkets}

      <div className="overflow-hidden rounded-[28px] border border-accent/25 bg-linear-to-br from-[#102747] via-bg-card to-[#281722] shadow-2xl">
        <div className="p-5 sm:p-7 lg:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
            <span className="rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-blue-100">
              Российский блок · продолжение
            </span>
            <div>
              <h3 className="text-lg font-extrabold text-white">Причины: события и российские первоисточники</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                Сначала выше вы увидели российские факты и внешний фон. Ниже — события, которые могут объяснять движение каналов.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-blue-300" />
                <h3 className="text-lg font-extrabold text-white">Главное по каналам влияния</h3>
              </div>
              {newsLoading && topEvents.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                  Загружаем и отбираем события по важности, свежести и каналам влияния…
                </div>
              ) : topEvents.length > 0 ? (
                <div className="space-y-3">
                  {topEvents.map((entry) => (
                    <EventCard key={entry.item.id} scored={entry} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-relaxed text-slate-300">
                  Сейчас нет событий, которые одновременно проходят порог важности и имеют понятный канал влияния на российский бизнес.
                  Это лучше, чем заполнять блок случайными заголовками.
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-blue-300" />
                <h3 className="text-lg font-extrabold text-white">Российские деловые источники</h3>
              </div>
              {insights.headlines.length > 0 ? (
                <div className="space-y-2">
                  {insights.headlines.slice(0, 8).map((headline) => (
                    <HeadlineRow key={headline.id} headline={headline} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                  {insightsLoading ? 'Загружаем российские заголовки…' : 'Российские ленты временно недоступны.'}
                </div>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Это прямая лента заголовков «Коммерсанта», «Ведомостей» и Frank Media со ссылками на первоисточники.
                Она отделена от ИИ-подборки слева: заголовок здесь ещё не означает подтверждённое влияние на рынок.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-2 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-slate-500 md:grid-cols-3">
            {insights.notes.map((note) => (
              <div key={note} className="flex items-start gap-1.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-300" />
                <span>{note}</span>
              </div>
            ))}
          </div>
          {insights.errors.length > 0 && (
            <div className="mt-3 text-[11px] font-medium text-amber-200/80">
              Часть источников не ответила при последнем обновлении: {insights.errors.length}. Остальные данные показаны как есть, без заполнения пробелов оценками.
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
