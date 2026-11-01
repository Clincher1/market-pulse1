import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Landmark, Receipt, Ship, Wallet } from 'lucide-react';
import { fetchRussiaInsightsShared, type RussiaMarketIndicator } from '@/data/russiaInsights';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import { startPolling } from '@/lib/polling';
import { formatPriceText } from '@/lib/price';

/**
 * «Деньги бизнеса сегодня» — четыре ориентира, с которыми сверяются договоры
 * и платежи.
 *
 * Зачем блок: всё нужное на сайте было, но лежало ниже первого экрана, и
 * человек уходил, не поняв за пятнадцать секунд, зачем открывать сайт завтра.
 * Здесь только те числа, которые читатель может сверить со своим документом:
 * ставку по кредиту, цену поставки, валюту расчётов и буфер ЦБ.
 *
 * Правила те же, что и во всём остальном сайте:
 *   — нет данных — нет числа: вместо него прочерк, и рядом сказано почему;
 *   — у каждого числа дата и источник со ссылкой на первоисточник;
 *   — «что сверить» — указание на документ читателя, а не совет и не прогноз:
 *     сайт не знает ни его кредита, ни его контракта.
 */

interface Secondary {
  label: string;
  value: string;
  change?: string | null;
  changeTone?: 'up' | 'down' | 'flat';
  /** К какому моменту относится именно это число, если он отличается. */
  note?: string | null;
}

interface Fact {
  id: string;
  icon: typeof Wallet;
  title: string;
  value: string | null;
  unit: string;
  secondary?: Secondary | null;
  change: string | null;
  changeTone: 'up' | 'down' | 'flat';
  /** Дата наблюдения. Пусто — значит источник её не отдаёт, и сайт молчит. */
  asOf: string | null;
  provider: string;
  sourceUrl: string;
  check: string;
}

const MONTHS = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

/** 2026-10-30 → «30 окт.». Год не печатаем: рядом всегда свежая дата. */
function shortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1] ?? '';
  return `${Number(match[3])} ${month}.`;
}

function num(value: number, digits: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Проценты печатаются через toFixed, как во всех остальных плитках сайта.
 *
 * Intl.NumberFormat здесь давал другой ответ на том же числе: API отдаёт
 * changePct уже округлённым до трёх знаков (-0.235), и Intl округлял 0,235
 * вверх до 0,24, а toFixed — вниз до 0,23. На одной странице получались
 * «−0,24 %» сверху и «−0,23 %» ниже. Округлять дважды нельзя, поэтому
 * формат один на весь сайт.
 */
function pctText(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2).replace('.', ',')} %`;
}

function absText(value: number, unit: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const text = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${sign}${text} ${unit}`.trim();
}

function toneOf(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/**
 * Что показать в карточке нефти.
 *
 * Цена Brent приходит из Yahoo Finance (фьючерс ближайшего месяца BZ=F). В кэше рядом с
 * ценой нет даты наблюдения — только время, когда сайт сходил за ней. Поэтому
 * здесь не печатается ни «на 15:44 МСК», ни «за сегодня»: подставить время
 * загрузки вместо даты цены значило бы выдать вчерашнее закрытие за текущую
 * котировку.
 */
/**
 * Дата наблюдения у Brent — не «сегодня»: дневной бар закрывается в свои
 * часы, и цена за 27 октября могла стоять на плитке 31-го. Поэтому
 * дата берётся из источника, а когда её нет, плитка говорит об этом прямо:
 * молчание читалось бы как «цена сегодняшняя».
 */
function brentFact(
  asset: { price: string; change: number; asOf: string | null } | null,
): Fact {
  const observed = asset?.asOf ? shortDate(asset.asOf.slice(0, 10)) : null;
  return {
    id: 'brent',
    icon: Ship,
    title: 'Нефть',
    value: asset ? formatPriceText(asset.price) : null,
    unit: 'Brent (фьючерс), $ за баррель',
    secondary: null,
    change: asset ? pctText(asset.change) : null,
    changeTone: toneOf(asset?.change),
    asOf: observed ?? (asset ? 'дата наблюдения не сохранена' : null),
    provider: 'Yahoo Finance · фьючерс BZ=F',
    sourceUrl: 'https://finance.yahoo.com/quote/BZ%3DF',
    check: 'если продаёте сырьё или покупаете топливо — цена в договоре считается от такого ориентира',
  };
}

function factsFrom(
  markets: RussiaMarketIndicator[],
  brent: { price: string; change: number; asOf: string | null } | null,
): Fact[] {
  const byId = new Map(markets.map((market) => [market.id, market]));
  const usd = byId.get('usd-rub') ?? null;
  // Именно официальный курс ЦБ: он стоит рядом с официальным USD/RUB по той же
  // дате. Биржевое значение юаня на этой дате могло быть предыдущим закрытием
  // («сделок сегодня в потоке нет»), и на карточке «курс для расчётов» это
  // выглядело бы как текущая котировка.
  const cny = byId.get('cny-rub-cbr') ?? byId.get('cny-rub-moex') ?? null;
  const keyRate = byId.get('key-rate') ?? null;
  const ruonia = byId.get('ruonia') ?? null;
  const reserves = byId.get('reserves') ?? null;

  const ruoniaChange =
    ruonia?.changeAbs !== null && ruonia?.changeAbs !== undefined
      ? absText(ruonia.changeAbs, ruonia.changeAbsUnit ?? 'п.п.')
      : null;

  return [
    // Стоимость денег. Ключевая ставка — то, чем ЦБ задаёт уровень; RUONIA —
    // то, что реально стоит ночь денег на рынке. Изменение относится к RUONIA
    // и стоит рядом с ней, а не рядом с ключевой ставкой: она меняется
    // решением регулятора, а не каждый день.
    {
      id: 'money',
      icon: Landmark,
      title: 'Стоимость денег',
      value: keyRate ? `${num(keyRate.value, 2)} %` : ruonia ? `${num(ruonia.value, 2)} %` : null,
      unit: keyRate ? 'ключевая ставка ЦБ' : 'RUONIA',
      secondary: ruonia
        ? {
            label: 'RUONIA',
            value: `${num(ruonia.value, 2)} %`,
            change: ruoniaChange,
            changeTone: toneOf(ruonia.changeAbs),
            // Дата у RUONIA своя: ставка за 28.10, а плитка показывает
            // ключевую, действующую с 27.07. Одна дата на две разные ставки
            // приписывала бы свежесть той, которой у неё нет.
            note: shortDate(ruonia.asOf),
          }
        : null,
      change: null,
      changeTone: 'flat',
      asOf: keyRate ? `с ${shortDate(keyRate.asOf)}` : shortDate(ruonia?.asOf),
      provider: 'Банк России',
      sourceUrl: ruonia?.sourceUrl ?? keyRate?.sourceUrl ?? 'https://www.cbr.ru/hd_base/KeyRate/',
      check: 'если ставка в вашем кредите плавающая, она привязана к одной из этих двух',
    },

    {
      id: 'fx',
      icon: Wallet,
      title: 'Курс для расчётов',
      value: usd ? `${num(usd.value, 4)} ₽` : null,
      unit: 'USD/RUB, официальный курс ЦБ',
      secondary: cny
        ? { label: 'CNY/RUB', value: `${num(cny.value, 4)} ₽`, note: shortDate(cny.asOf) }
        : null,
      change:
        usd?.changePct !== null && usd?.changePct !== undefined ? pctText(usd.changePct) : null,
      changeTone: toneOf(usd?.changePct),
      asOf: shortDate(usd?.asOf),
      provider: usd?.provider ?? 'Банк России',
      sourceUrl: usd?.sourceUrl ?? 'https://www.cbr.ru/currency_base/daily/',
      check: 'сверьте валюту и дату фиксации курса в контракте на поставку',
    },

    brentFact(brent),

    // Резервы. На конкретный договор не влияют — и сайт это говорит прямо,
    // вместо намёка на связь, которой нет.
    {
      id: 'reserves',
      icon: Receipt,
      title: 'Буфер ЦБ',
      value: reserves ? num(reserves.value, 2) : null,
      unit: 'млрд $, международные резервы',
      secondary: null,
      change:
        reserves?.changeAbs !== null && reserves?.changeAbs !== undefined
          ? absText(reserves.changeAbs, reserves.changeAbsUnit ?? 'млрд $')
          : null,
      changeTone: toneOf(reserves?.changeAbs),
      asOf: shortDate(reserves?.asOf),
      provider: 'Банк России',
      sourceUrl: reserves?.sourceUrl ?? 'https://www.cbr.ru/hd_base/mrrf/mrrf_7d/',
      check: 'на ваш договор не влияет напрямую — это запас, из которого ЦБ действует на курсе',
    },
  ];
}

const TONE_CLASS: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-emerald-300',
  down: 'text-red-300',
  flat: 'text-slate-400',
};

export default function BusinessMoney() {
  const { assets, fallbackAssetIds } = useLiveAssets();
  const [markets, setMarkets] = useState<RussiaMarketIndicator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const data = await fetchRussiaInsightsShared();
      if (!mounted) return;
      if (data.markets.length > 0) setMarkets(data.markets);
      setLoading(false);
    }
    void load();
    const stop = startPolling(() => void load());
    return () => {
      mounted = false;
      stop();
    };
  }, []);

  const brent = useMemo(() => {
    const asset = assets.find((item) => item.id === 'brent');
    // Резервная заглушка («—», change 0) не является котировкой: показывать
    // её как «0,00 %» — значит утверждать, что цена не изменилась.
    if (!asset || fallbackAssetIds.includes('brent') || asset.price === '—') return null;
    return { price: asset.price, change: asset.change ?? 0, asOf: asset.asOf ?? null };
  }, [assets, fallbackAssetIds]);

  const facts = useMemo(() => factsFrom(markets, brent), [markets, brent]);

  if (loading && markets.length === 0) {
    return (
      <section aria-busy="true" aria-label="Деньги бизнеса сегодня" className="mb-10 scroll-mt-24">
        <div className="h-6 w-56 animate-pulse rounded bg-white/10" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
      </section>
    );
  }

  // Ни одного числа — ни одной карточки: пустые плитки с прочерками выглядели
  // бы как «сайт сломан», а не как «источник молчит».
  if (markets.length === 0) return null;

  return (
    <section
      id="business-money"
      data-testid="business-money"
      aria-labelledby="business-money-title"
      className="mb-10 scroll-mt-24"
    >
      <div className="mb-4 px-1">
        <h2
          id="business-money-title"
          className="text-xl font-extrabold tracking-tight text-text-primary sm:text-2xl"
        >
          Деньги бизнеса сегодня
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">
          Четыре ориентира, с которыми сверяются договоры и платежи. У каждого — дата и
          первоисточник: число можно открыть и проверить самому. Это не рекомендации и не прогноз.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            <a
              key={fact.id}
              href={fact.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`business-money-${fact.id}`}
              className="group flex flex-col rounded-2xl border border-white/10 bg-black/25 p-4 shadow-lg transition-all hover:-translate-y-0.5 hover:border-accent/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-blue-200">
                  {fact.title}
                </span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-blue-300" />
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-2xl font-extrabold tabular-nums text-white">
                  {fact.value ?? '—'}
                </span>
                {fact.change && (
                  <span
                    className={`text-sm font-extrabold tabular-nums ${TONE_CLASS[fact.changeTone]}`}
                  >
                    {fact.change}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-400">{fact.unit}</div>

              {fact.secondary && (
                <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-slate-300">
                  <span>{fact.secondary.label}:</span>
                  <span className="font-bold tabular-nums text-slate-100">
                    {fact.secondary.value}
                  </span>
                  {fact.secondary.change && (
                    <span
                      className={`font-bold tabular-nums ${
                        TONE_CLASS[fact.secondary.changeTone ?? 'flat']
                      }`}
                    >
                      {fact.secondary.change}
                    </span>
                  )}
                  {fact.secondary.note && (
                    <span className="text-slate-500">· {fact.secondary.note}</span>
                  )}
                </div>
              )}

              <div className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-snug text-slate-400">
                <span className="font-bold text-slate-200">{fact.provider}</span>
                {fact.asOf && <> · {fact.asOf}</>}
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                <span className="font-bold text-slate-100">Что сверить:</span> {fact.check}.
              </p>
            </a>
          );
        })}
      </div>
    </section>
  );
}
