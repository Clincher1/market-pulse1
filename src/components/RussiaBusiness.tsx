import { useEffect, useMemo, useState } from 'react';
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
  Minus,
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
import MoneySpreads from './MoneySpreads';
import OfzCurve from './OfzCurve';
import RussiaHistory from './RussiaHistory';
import { SectionThemeBadge } from './sectionThemes';
import { formatPercent as formatPercentShared } from '@/lib/percent';
import { formatPriceText } from '@/lib/price';
import { NewsItem } from '@/data/marketTypes';
import { useLiveNews } from '@/hooks/useLiveNews';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import { startPolling } from '@/lib/polling';
import { buildMoneySpreads } from '@/lib/spreads';
import {
  fetchRussiaInsights,
  RussiaHeadline,
  RussiaInsights,
  RussiaMarketIndicator,
} from '@/data/russiaInsights';

type ChannelId = 'currency' | 'rates' | 'commodities' | 'demand' | 'trade';
type Status = 'calm' | 'watch' | 'pressure' | 'unknown';

// Ставка и кривая ОФЗ — про стоимость денег, а не про курс. Держим их
// отдельной строкой, чтобы ряд из пяти курсовых плиток не разъезжался.
const MONEY_INDICATOR_IDS = ['key-rate', 'ruonia', 'ofz-10y', 'inflation'];
// Международные резервы — не стоимость денег и не рынок: это внешний буфер,
// у него отдельный блок и отдельное объяснение.
const RESERVE_INDICATOR_IDS = ['reserves'];

// Что должно быть в российском контуре. Если строка не пришла, сайт говорит
// об этом словами, а не оставляет дырку без объяснения.
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
    'ключев', 'ставк', 'инфляц', 'центробанк', 'банк россии', 'цб', 'фрс',
    'federal reserve', 'облигац', 'кредит', 'ипотек', 'доходност',
    // Общего слова «rate» здесь нет специально: оно ловит «container rates»
    // и «insurance rates» — это ставки за перевозку, а не стоимость денег.
    'interest rate', 'policy rate', 'fed', 'yield', 'bond', 'credit',
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
  'банк россии', 'центробанк', 'цб', 'минфин', 'кремл', 'ofz', 'офз',
];

// Одна фраза на канал: что именно затронуто и чего сайт по этой новости
// утверждать не станет. Раньше на каждой карточке висело по три строки,
// и главное — оговорка — тонуло в перечислении.
const CHANNEL_EXPLANATIONS: Record<ChannelId, string> = {
  currency:
    'Валютная выручка, импортные закупки и платежи. Один заголовок не задаёт курс: рубль по новости сайт не прогнозирует.',
  rates:
    'Стоимость кредитов и оценка активов. Из рядов канала на сайте есть ставка ЦБ, ОФЗ 10 лет, RGBI и инфляция Росстата; решения по ставке сайт не предугадывает — дата следующего заседания в заголовке не сообщается.',
  commodities:
    'Экспортная выручка и бюджетные доходы. Из рядов канала есть только Brent; внутренние цены на топливо не загружаются.',
  demand:
    'Выручка компаний и потребительская активность. Заголовок не равен изменению спроса: нужны статистика и подтверждения.',
  trade:
    'Поставки, таможенные издержки и доступ к рынкам. Перечень ограничений есть только в первоисточнике — в заголовке его нет.',
};

// «Смотреть дальше» указывает только на то, что на сайте действительно есть.
// Раньше здесь стояли инфляция, решения ЦБ, официальная статистика и документы —
// их на сайте нет, и указатель вёл в пустоту.
const CHANNEL_WATCH: Record<ChannelId, string> = {
  currency: 'USD/RUB, EUR/RUB и CNY/RUB на Мосбирже',
  rates: 'ключевую ставку, доходность ОФЗ и RGBI',
  commodities: 'Brent, валютные пары и IMOEX',
  demand: 'IMOEX и первоисточник события',
  trade: 'курсы валют и первоисточник события',
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

/**
 * Совпадает ли ключевое слово с текстом.
 *
 * Кириллические ключи — намеренно основы («валют», «ставк», «нефт»): они должны
 * находиться внутри слова «валютный», «ставка». Латинские ключи так проверять
 * нельзя: «rate» находится внутри «corporate», «cny» — внутри случайных букв, и
 * заголовок про отчётность попадал в канал валют. Латинские слова ищем только
 * целиком.
 */
function keywordMatches(text: string, keyword: string): boolean {
  if (/^[a-z0-9 ]+$/i.test(keyword)) {
    // Латинское слово — целиком, с простым множественным числом: «rate» не
    // должно находиться в «corporate», но «rates» в «interest rates» — должно.
    // Словосочетания («interest rate») ищутся так же, как единое целое.
    return new RegExp(`\\b${keyword}(?:s|es)?\\b`, 'i').test(text);
  }
  return text.includes(keyword);
}

function firstKeyword(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (keywordMatches(text, keyword.toLowerCase())) return keyword;
  }
  return null;
}

function classifyText(text: string): { channel: ChannelId; keyword: string }[] {
  const normalized = text.toLowerCase();
  return (Object.keys(CHANNEL_KEYWORDS) as ChannelId[])
    .map((channel) => {
      const keyword = firstKeyword(normalized, CHANNEL_KEYWORDS[channel]);
      return keyword ? { channel, keyword } : null;
    })
    .filter((value): value is { channel: ChannelId; keyword: string } => value !== null);
}

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
  // У ставок процент от процента читался бы как «ставка выросла на 0,36 %»,
  // поэтому для них показывается разница в процентных пунктах с датой
  // предыдущего опубликованного значения.
  const change = indicator.changePct ?? indicator.changeAbs ?? 0;
  const isIndex = indicator.id === 'imoex' || indicator.id === 'rgbi';
  // У золота база та же, что у индексов, — закрытие предыдущей сессии Мосбиржи,
  // и её дату тоже нужно печатать рядом: субботняя сделка иначе читалась бы
  // как движение за сутки.
  const hasCloseBase = isIndex || indicator.id === 'gold-moex';
  const changeClass = !hasCloseBase
    ? 'text-blue-200'
    : change > 0
      ? 'text-emerald-300'
      : change < 0
        ? 'text-red-300'
        : 'text-slate-300';
  // Стрелка вверх у нулевого изменения — тоже утверждение о движении,
  // которого не было: при 0,00 % рисуется горизонтальная черта.
  const Icon = change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;

  return (
    <a
      href={indicator.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col rounded-2xl border border-white/10 bg-black/20 p-4 shadow-lg transition-all hover:-translate-y-0.5 hover:border-accent/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
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
        {indicator.changePct !== null ? (
          <span
            className={`inline-flex items-center gap-1 text-sm font-extrabold tabular-nums ${changeClass}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {formatPercent(indicator.changePct)}
            {/* У индексов база — закрытие предыдущей сессии, и её дата
                печатается рядом: без неё «+0,16 %» у субботней сессии
                читалось бы как движение за сутки с нуля. */}
            {hasCloseBase && indicator.previousDate && (
              <span className="text-[10px] font-semibold text-slate-400">
                к {formatShortDate(indicator.previousDate)}
              </span>
            )}
          </span>
        ) : indicator.changeAbs !== null && indicator.changeAbs !== undefined ? (
          <span
            className={`inline-flex items-center gap-1 text-sm font-extrabold tabular-nums ${changeClass}`}
            title={`Разница с предыдущим опубликованным значением${
              indicator.previousDate ? ` за ${formatShortDate(indicator.previousDate)}` : ''
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {formatAbsChange(indicator.changeAbs, indicator.changeAbsUnit)}
            {indicator.previousLabel ? (
              // Месячный ряд: «к августу» вместо «к 31.08», иначе сравнение
              // месячных данных читается как сравнение с конкретным днём.
              <span className="text-[10px] font-semibold text-slate-400">
                к {indicator.previousLabel}
              </span>
            ) : (
              indicator.previousDate && (
                <span className="text-[10px] font-semibold text-slate-400">
                  к {formatShortDate(indicator.previousDate)}
                </span>
              )
            )}
          </span>
        ) : null}
      </div>
      <div className="mb-3 mt-3 border-t border-white/10 pt-2.5 text-[11px] leading-relaxed text-slate-400">
        <span className="font-bold text-slate-200">{indicator.provider}</span> · {formatAsOf(indicator)}
        <div className="mt-0.5">{indicator.basis}</div>
      </div>
      <span
        data-testid="russia-source-tile-hint"
        className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-blue-300/25 bg-blue-400/10 px-2.5 py-1.5 text-[11px] font-extrabold leading-none text-blue-100"
      >
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-300 opacity-50 [animation-duration:1.8s]" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-300" />
        </span>
        Открыть источник
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </span>
    </a>
  );
}

function ChannelCard({
  icon: Icon,
  title,
  status,
  basis,
  rule,
  note,
  detail,
}: {
  icon: typeof Wallet;
  title: string;
  status: Status;
  basis: string;
  /** Порог статуса одной строкой: без него «Спокойно» — просто мнение. */
  rule: string;
  /** Вывод из сегодняшних чисел, если он есть. */
  note?: string;
  /** Как считается: то, что не нужно каждый день, но должно быть проверяемо. */
  detail?: string;
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
      {note && <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{note}</p>}
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{rule}</p>
      {detail && (
        <details className="group mt-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
          <summary className="min-h-6 cursor-pointer select-none py-1 text-[11px] font-bold text-slate-400 transition-colors hover:text-slate-200">
            Как считается
          </summary>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{detail}</p>
        </details>
      )}
    </div>
  );
}

interface ScoredNews {
  item: NewsItem;
  channels: ChannelId[];
  /** Каким словом текст отнесён к каналу — чтобы отнесение можно было проверить. */
  matchedKeywords: Partial<Record<ChannelId, string>>;
  /** Каналы, добавленные не по тексту, а по разметке источника (impacts). */
  impactAssets: Partial<Record<ChannelId, string>>;
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
      const matches = classifyText(text);
      const matchedKeywords: Partial<Record<ChannelId, string>> = {};
      for (const match of matches) matchedKeywords[match.channel] = match.keyword;
      // Каналы из текста идут первыми: это видимая причина. Разметка источника
      // (impacts) добавляет каналы, которых в тексте нет, и подписывается
      // отдельно — иначе карточка выдавала бы чужое решение за своё.
      const textChannels = matches.map((match) => match.channel);
      const impactAssets: Partial<Record<ChannelId, string>> = {};
      for (const impact of item.impacts ?? []) {
        const asset = impact.asset.toLowerCase();
        if (asset.includes('brent') || asset.includes('oil')) {
          impactAssets.commodities ??= impact.asset;
        }
        if (asset.includes('usd') || asset.includes('eur')) {
          impactAssets.currency ??= impact.asset;
        }
      }
      const channelList = [...new Set<ChannelId>([...textChannels, ...(Object.keys(impactAssets) as ChannelId[])])];
      const directRussia = includesAny(text, RUSSIA_KEYWORDS);
      const ageHours = item.published_at
        ? Math.max(0, (now - new Date(item.published_at).getTime()) / 3_600_000)
        : 72;
      const freshness = ageHours <= 6 ? 1 : ageHours <= 24 ? 0.86 : ageHours <= 48 ? 0.68 : 0.45;
      const confidence = item.confidence ?? 0.5;
      const profileMatches = channelList.filter((channel) => profileChannels.has(channel)).length;
      // Вес канала из текста и канала из разметки разный: текст — доказательство,
      // разметка источника — подсказка. Иначе заголовок про ЕЦБ, помеченный в
      // разметке как «Brent», обгоняет новость про рубль и попадает в «главное».
      const score =
        item.importance * (0.55 + confidence * 0.45) * freshness +
        (directRussia ? 3 : 0) +
        textChannels.length * 0.6 +
        Object.keys(impactAssets).length * 0.2 +
        profileMatches * 1.4;
      const reasons: string[] = [];
      if (directRussia) reasons.push('прямая связь с Россией, рублём или российскими институтами');
      if (profileMatches) reasons.push('совпадает с вашим бизнес-профилем');
      reasons.push(`важность ${item.importance}/10 и уверенность классификации ${Math.round(confidence * 100)} %`);
      return { item, channels: channelList, matchedKeywords, impactAssets, directRussia, score, reasons };
    })
    .filter(
      (entry) =>
        entry.item.importance >= 5 &&
        (entry.item.confidence ?? 0.5) >= 0.4 &&
        // Раздел называется «главное по каналам влияния», поэтому в него идёт
        // только то, что отнесено к каналу по тексту или прямо касается России.
        // Заголовок, попавший в канал лишь по разметке источника, в главное не
        // поднимается: карточка объяснила бы канал, которого в тексте нет.
        (entry.directRussia || Object.keys(entry.matchedKeywords).length > 0),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function EventCard({ scored }: { scored: ScoredNews }) {
  const { item, channels, matchedKeywords, impactAssets, reasons } = scored;
  const primaryChannel = channels[0];
  const primaryKeyword = primaryChannel ? matchedKeywords[primaryChannel] : undefined;
  const primaryImpact = primaryChannel ? impactAssets[primaryChannel] : undefined;
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
        <span className="rounded-md bg-accent/20 px-2 py-1 text-blue-200">{item.source}</span>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          {formatMoscowDateTime(item.published_at)}
        </span>
        {channels.slice(0, 3).map((channel) => {
          // Разметку источника видно и в чипах: канал, найденный по слову в
          // тексте, — сплошная рамка, канал только из разметки — пунктир и
          // подсказка. Иначе второй и третий чип выглядят как доказательство,
          // хотя объяснение под карточкой дано лишь для первого канала.
          const markupOnly = !matchedKeywords[channel] && Boolean(impactAssets[channel]);
          return (
            <span
              key={channel}
              title={
                markupOnly
                  ? `Канал из разметки источника (${impactAssets[channel]}), в тексте его слов нет`
                  : `Канал найден по слову «${matchedKeywords[channel]}»`
              }
              className={`rounded-full border px-2 py-1 text-slate-200 ${
                markupOnly
                  ? 'border-dashed border-amber-300/40 bg-amber-400/5 text-amber-100'
                  : 'border-white/10 bg-white/6'
              }`}
            >
              {CHANNEL_LABELS[channel]}
            </span>
          );
        })}
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
            К какому каналу отнесён заголовок
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
            {CHANNEL_EXPLANATIONS[primaryChannel]}
          </p>
          {primaryKeyword && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-blue-100/80">
              Отнесено по слову «{primaryKeyword}» в заголовке, описании или теме.
            </p>
          )}
          {!primaryKeyword && primaryImpact && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-blue-100/80">
              В тексте заголовка ключевых слов канала нет: отнесение взято из разметки
              источника — актив «{primaryImpact}».
            </p>
          )}
          <p className="mt-2 inline-flex items-start gap-1.5 text-xs font-semibold text-blue-100">
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Смотреть дальше: {CHANNEL_WATCH[primaryChannel]}.
          </p>
        </div>
      )}

      <div className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Почему в подборке: {reasons.join('; ')}.
      </div>
    </article>
  );
}

function HeadlineRow({ headline }: { headline: RussiaHeadline }) {
  const channels = classifyText(
    `${headline.title} ${headline.categories.join(' ')}`,
  )
    .map((match) => match.channel)
    .slice(0, 2);
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
    const stopPolling = startPolling(() => void load());
    return () => {
      mounted = false;
      stopPolling();
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
    // Статус считается только когда есть оба числа: по одному RGBI нельзя
    // назвать рынок спокойным, не зная IMOEX.
    const marketStress =
      typeof imoex?.changePct === 'number' && typeof rgbi?.changePct === 'number'
        ? Math.max(Math.abs(imoex.changePct) / 1.5, Math.abs(rgbi.changePct) / 0.6)
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
        // Раньше здесь стояло «Среднее ниже — простое арифметическое»: никакого
        // среднего в этой карточке не выводится, подпись вела в пустоту.
        rule:
          fxAverage === null
            ? 'Правило появится вместе с курсами.'
            : 'До 0,4 % — «Спокойно», до 1 % — «Внимание», от 1 % — «Повышенное движение» (по самой большой по модулю паре).',
        detail:
          'Считается по худшей из трёх пар: падение и рост берутся по модулю, весов по объёму торгов нет. Пара, которая не пришла, в расчёт не входит и видна как «—».',
      },
      {
        icon: Percent,
        title: 'Рынок и стоимость денег',
        status: marketStatus,
        basis: [
          `IMOEX ${formatPercent(imoex?.changePct)}`,
          `RGBI ${formatPercent(rgbi?.changePct)}`,
          indicatorById.get('key-rate')
            ? `ставка ${formatIndicatorValue(indicatorById.get('key-rate')!)} %`
            : null,
          indicatorById.get('ofz-10y')
            ? `ОФЗ 10 лет ${formatIndicatorValue(indicatorById.get('ofz-10y')!)} %`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
        note:
          marketStress === null
            ? 'Статус не считается: нет IMOEX или RGBI — по половине данных нельзя назвать рынок спокойным.'
            : rgbi?.changePct === null || rgbi?.changePct === undefined
            ? 'RGBI временно недоступен, поэтому вывод о стоимости денег не делается.'
            : `${
                // Ноль — это не рост. Раньше подпись выбиралась по «>= 0», и при
                // RGBI 0,00 % сайт утверждал, что цены облигаций растут.
                // Порог «не изменились» привязан к точности печати (два знака):
                // при |x| < 0,005 на экране стоит 0,00 %, а при −0,006 уже −0,01 %,
                // и подпись «не изменились» рядом с «−0,01 %» спорила бы с числом.
                Math.abs(rgbi.changePct) < 0.005
                  ? 'Цены гособлигаций почти не изменились за наблюдение.'
                  : rgbi.changePct > 0
                    ? 'Цены гособлигаций растут; при прочих равных доходности снижаются.'
                    : 'Цены гособлигаций снижаются; при прочих равных доходности растут.'
              }`,
        rule: 'До 0,5 — «Спокойно», до 1 — «Внимание»: считается по большему из IMOEX/1,5 % и RGBI/0,6 %.',
        detail:
          'Оба числа — с последнего закрытия Мосбиржи. Ключевая ставка и доходность ОФЗ в статус не входят: это уровни, а не дневное движение.',
      },
      {
        icon: Fuel,
        title: 'Сырьё и экспорт',
        status: commodityStatus,
        basis: Brent ? `Brent ${formatPriceText(Brent.price)} · ${formatPercent(Brent.change)}` : 'Brent временно недоступна.',
        rule: 'До 1 % — «Спокойно», 1–2,5 % — «Внимание», от 2,5 % — «Повышенное движение».',
        detail:
          'Считается только по Brent: других сырьевых рядов на сайте нет, поэтому за всю сырьевую выручку карточка не отвечает.',
      },
      {
        icon: Globe,
        title: 'Глобальный риск',
        status: globalStatus,
        basis: `S&P 500 ${formatPercent(sp500?.change)} · Gold ${formatPercent(gold?.change)} · негативных среди трёх главных: ${negativeTop} из ${topEvents.length || 3}`,
        rule: 'До 0,45 — «Спокойно», до 0,85 — «Внимание» (S&P 500 к 1,5 % и доля негативных среди трёх главных событий).',
        detail:
          'Берётся большая из двух величин: изменение S&P 500 к порогу 1,5 % и число негативных к трём, где негативное — тональность ниже −0,3. Все три негативные — верх шкалы. Тональность ставит классификатор: это оценка текста, а не движение цены.',
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
              <SectionThemeBadge themeId="russia" />
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Пульс российского бизнеса
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Официальные курсы, Мосбиржа и заголовки с указанием канала. Кого именно затронет
                событие, сайт не вычисляет и не утверждает.
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
              <span className="text-[11px] font-medium text-slate-400">
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
                        ? 'border-accent-strong bg-accent-strong text-white shadow-lg shadow-accent/25'
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
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  {mainIndicators.map((indicator) => (
                    <MarketTile key={indicator.id} indicator={indicator} />
                  ))}
                </div>
                {missingIndicators.length > 0 && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-100">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
                    <div className="mt-5 mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                      Стоимость денег — ставка ЦБ, RUONIA, инфляция и кривая ОФЗ
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    <div className="mt-5 mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                      Внешний буфер — международные резервы ЦБ
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <MarketTile indicator={reserveIndicator} />
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-relaxed text-slate-300 md:col-span-2">
                        <p className="font-semibold text-slate-200">
                          Валютные активы и монетарное золото Банка России — то, чем он проводит
                          операции на валютном рынке и отвечает по внешним обязательствам.
                        </p>
                        <p className="mt-1.5">
                          Ряд недельный: отчётная дата — пятница, публикация — на следующей неделе.
                          Последняя точка поэтому всегда за прошлую пятницу.
                        </p>
                        <details className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
                          <summary className="min-h-6 cursor-pointer select-none py-1 text-[11px] font-bold text-slate-400 transition-colors hover:text-slate-200">
                            Почему в млрд $, а не в процентах
                          </summary>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
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
              Российские индикаторы и внешние драйверы; мировой блок идёт следующим разделом
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {channels.map((channel) => (
              <ChannelCard key={channel.title} {...channel} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-[28px] border border-accent/25 bg-linear-to-br from-[#102747] via-bg-card to-[#281722] shadow-2xl">
        <div className="p-5 sm:p-7 lg:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
            <span className="rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-blue-100">
              Российский блок · продолжение
            </span>
            <div>
              <h3 className="text-lg font-extrabold text-white">События и российские первоисточники</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                Заголовки, отнесённые к каналам выше, со ссылкой на первоисточник. Сайт не доказывает, что событие вызвало движение: он показывает, к какому каналу его отнесли и по какому правилу.
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
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                Это прямая лента заголовков «Коммерсанта», «Ведомостей» и Frank Media со ссылками на первоисточники.
                Она отделена от ИИ-подборки слева: заголовок здесь ещё не означает подтверждённое влияние на рынок.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-2 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-slate-400 md:grid-cols-3">
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
