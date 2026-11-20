import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw, Star } from 'lucide-react';
import { useLiveAssets } from '@/hooks/useLiveAssets';
import { useFavorites } from '@/hooks/useFavorites';
import { fetchRussiaInsightsShared, type RussiaMarketIndicator } from '@/data/russiaInsights';
import type { AssetData } from '@/data/marketTypes';
import { assetObservations, compareAssets, dateLabel, DESK_ASSET_IDS, DESK_UNITS, deskValue, latestMove, validDate } from '@/lib/marketDesk';
import { formatPercent } from '@/lib/percent';
import { observationLabel, observationLagLabel } from '@/lib/asOf';
import { formatPriceText } from '@/lib/price';
import { niceTicks, formatTick, tickStep } from '@/lib/chartAxis';
import './market-desk.css';

const COLORS = ['#0369a1', '#a21caf', '#b45309', '#047857', '#be123c'];
const DASHES = ['none', '8 4', '3 3', '12 3 3 3', '2 5'];

function MinuteSummary({ assets }: { assets: AssetData[] }) {
  const [russia, setRussia] = useState<RussiaMarketIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const titleId = useId();
  useEffect(() => {
    let active = true;
    void fetchRussiaInsightsShared().then((data) => {
      if (active) { setRussia(data.markets); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  // Only price/index percentage changes: never rank a rate or monthly inflation
  // alongside a daily price movement. Dates remain explicit, not a 'today' claim.
  const russian = russia.filter((item) => ['imoex', 'rgbi', 'usd-rub'].includes(item.id)
    && Number.isFinite(item.value) && item.value > 0
    && typeof item.changePct === 'number' && Number.isFinite(item.changePct)
    && validDate(item.asOf?.slice(0, 10) ?? '') && validDate(item.previousDate?.slice(0, 10) ?? '')
    && item.previousDate!.slice(0, 10) < item.asOf.slice(0, 10))
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))[0];
  const world = assets.map(latestMove).filter((move) => move !== null)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  return <section className="market-desk" aria-labelledby={titleId}>
    <div className="market-desk__heading">
      <div><p className="market-desk__eyebrow">Сначала — суть</p><h2 id={titleId}>Главное за минуту</h2></div>
      <a href="/brief">Полный бриф <ArrowUpRight size={16} aria-hidden="true" /></a>
    </div>
    <p className="market-desk__muted">В каждом контуре — наибольшее по модулю доступное изменение: в России среди IMOEX, RGBI и USD/RUB, в мире среди пяти ориентиров сайта. Периоды могут различаться — смотрите даты. Это факты, не прогноз.</p>
    <div className="minute-grid">
      <article>
        <p className="market-desk__eyebrow">Российский контур</p>
        {russian ? <>
          <h3>{russian.name} <span>{formatPercent(russian.changePct)}</span></h3>
          <p className="market-desk__muted">Значение: {deskValue(russian.value)} {russian.unit} · изменение к указанной дате сравнения</p>
          <p>{dateLabel(russian.previousDate!.slice(0, 10))} → {dateLabel(russian.asOf.slice(0, 10))}</p>
          <p className="market-desk__muted">{russian.provider} · {russian.basis}</p>
        </> : <p role="status">{loading ? 'Загружаем российские ориентиры…' : 'Датированное изменение не получено. Значения не подставляем.'}</p>}
        <a href="/russia">Россия и источники <ArrowUpRight size={14} aria-hidden="true" /></a>
      </article>
      <article>
        <p className="market-desk__eyebrow">Мировой фон</p>
        {world ? <>
          <h3>{world.asset.name} <span>{formatPercent(world.change)}</span></h3>
          <p className="market-desk__muted">{deskValue(world.first)} → {deskValue(world.last)} {DESK_UNITS[world.asset.id]}</p>
          <p>{dateLabel(world.from)} → {dateLabel(world.till)}</p>
          <p className="market-desk__muted">{world.asset.sourceLabel || 'Источник не указан в кэше'} · два последних датированных наблюдения · (последнее / предыдущее − 1) × 100 %</p>
        </> : <p>Датированное изменение пока недоступно. Смотрите состояние загрузки ниже.</p>}
        <a href="/world">Котировки и сравнение <ArrowUpRight size={14} aria-hidden="true" /></a>
      </article>
    </div>
  </section>;
}

function Comparison({ assets }: { assets: AssetData[] }) {
  const [selected, setSelected] = useState(['sp500', 'gold', 'btc']);
  const chartRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    if (!chartRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width > 0) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const [limit, setLimit] = useState(10);
  const [base100, setBase100] = useState(false);
  const titleId = useId();
  const available = assets.filter((asset) => DESK_ASSET_IDS.some((id) => id === asset.id));
  const chosen = selected.map((id) => available.find((asset) => asset.id === id));
  const comparison = chosen.every((asset) => asset !== undefined) ? compareAssets(chosen, limit) : null;
  const allValues = comparison?.lines.flatMap((line) => line.values) ?? [0];
  const low = Math.min(0, ...allValues);
  const high = Math.max(0, ...allValues);
  const padding = Math.max((high - low) * 0.12, 0.1);
  const min = low - padding;
  const max = high + padding;
  const y = (value: number) => 20 + (max - value) / (max - min) * 190;
  const ticks = niceTicks(min + (base100 ? 100 : 0), max + (base100 ? 100 : 0));
  const x = (index: number) => {
    if (!comparison) return 65;
    const times = comparison.dates.map((date) => Date.parse(`${date}T00:00:00Z`));
    return 65 + (times[index] - times[0]) / (times[times.length - 1] - times[0]) * (width - 90);
  };
  return <section ref={chartRef} className="market-desk" aria-labelledby={titleId}>
    <div className="market-desk__heading"><div><p className="market-desk__eyebrow">Одна база · разные рынки</p><h2 id={titleId}>Сравнить динамику</h2></div></div>
    <p className="market-desk__muted">Выберите от двух инструментов. Сравниваем только общие даты из сохранённого окна котировок — без заполнения пропусков. Это не доходность портфеля: валюты, дивиденды и издержки не пересчитываются.</p>
    <fieldset className="desk-choices"><legend>Инструменты для сравнения</legend>
      {available.map((asset) => <label key={asset.id}>
        <input type="checkbox" checked={selected.includes(asset.id)} onChange={() => setSelected((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])} />
        {asset.name}{assetObservations(asset).length < 2 ? ' · нет дат' : ''}
      </label>)}
    </fieldset>
    <div className="desk-controls">
      <label>Окно сравнения <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
        <option value={5}>До 5 общих наблюдений</option><option value={10}>До 10 общих наблюдений</option><option value={500}>Все общие наблюдения</option>
      </select></label>
      <label>Шкала <select value={base100 ? '100' : 'percent'} onChange={(event) => setBase100(event.target.value === '100')}>
        <option value="percent">Изменение, %</option><option value="100">Начало = 100</option>
      </select></label>
    </div>
    {comparison ? <>
      <p className="desk-period">{dateLabel(comparison.dates[0])} — {dateLabel(comparison.dates[comparison.dates.length - 1])} · общих дат: {comparison.dates.length}</p>
      <svg className="desk-chart" viewBox={`0 0 ${width} 245`} role="img" aria-label={`Сравнение динамики с ${dateLabel(comparison.dates[0])}. Точные результаты и источники приведены в таблице ниже.`}>
        {ticks.map((tick) => {
          const value = tick - (base100 ? 100 : 0);
          return <g key={tick}><line x1="65" x2={width - 25} y1={y(value)} y2={y(value)} stroke="#cbd5e1" strokeDasharray="3 4" />
            <text x="57" y={y(value) + 4} textAnchor="end" fontSize="12" fill="#475569">{formatTick(tick, tickStep(ticks))}</text></g>;
        })}
        <line x1="65" x2={width - 25} y1={y(0)} y2={y(0)} stroke="#64748b" />
        {comparison.lines.map((line, index) => <polyline key={line.id} fill="none" stroke={COLORS[index]} strokeWidth="2.5" strokeDasharray={DASHES[index]} points={line.values.map((value, i) => `${x(i)},${y(value)}`).join(' ')} />)}
        <text x="65" y="236" fill="#475569" fontSize="12">{dateLabel(comparison.dates[0])}</text>
        <text x={width - 25} y="236" textAnchor="end" fill="#475569" fontSize="12">{dateLabel(comparison.dates[comparison.dates.length - 1])}</text>
      </svg>
      <div className="desk-table-wrap"><table className="desk-table">
        <caption>Результаты за общий период · {base100 ? 'начало = 100' : 'изменение в %'}</caption>
        <thead><tr><th scope="col">Инструмент / линия</th><th scope="col">{base100 ? 'Индекс в конце' : 'Изменение'}</th><th scope="col">Начало → конец, исходные единицы</th><th scope="col">Источник</th></tr></thead>
        <tbody>{comparison.lines.map((line, index) => <tr key={line.id}><th scope="row"><svg width="28" height="10" aria-hidden="true"><line x1="0" x2="28" y1="5" y2="5" stroke={COLORS[index]} strokeWidth="3" strokeDasharray={DASHES[index]} /></svg> {line.name}</th>
          <td>{base100 ? (100 + line.values[line.values.length - 1]).toFixed(2).replace('.', ',') : formatPercent(line.values[line.values.length - 1])}</td><td>{deskValue(line.rawValues[0])} → {deskValue(line.rawValues[line.rawValues.length - 1])}<br />{DESK_UNITS[line.id]}</td><td>{line.source || 'Не указан в кэше'}</td></tr>)}</tbody>
      </table></div>
      <p className="market-desk__muted">Частота — сохранённые дневные наблюдения. Ось X — календарные даты. Начальная точка у всех одна. Расчёт: (конечное / начальное − 1) × 100 %; для шкалы 100 к результату прибавляется 100. Внутридневное наблюдение может быть незавершённым; дата здесь не означает цену прямо сейчас. Линии соединяют только имеющиеся общие наблюдения.</p>
    </> : <p className="desk-empty" role="status">{selected.length < 2 ? 'Выберите хотя бы два инструмента для сравнения.' : 'Для выбранных инструментов нет двух общих дат с корректными ценами. Выберите другой набор или повторите загрузку котировок. Бездатые ряды и пропуски не достраиваем.'}</p>}
  </section>;
}

export default function MarketDesk({ summary = false }: { summary?: boolean }) {
  const { assets, loading, error, fallbackAssetIds, refresh, isRefreshing } = useLiveAssets();
  const { favorites, toggle, storageFailed } = useFavorites();
  const titleId = useId();
  const known = assets.filter((asset) => DESK_ASSET_IDS.some((id) => id === asset.id));
  const live = known.filter((asset) => !fallbackAssetIds.includes(asset.id));
  return <div className="market-desk-stack">
    {summary && <MinuteSummary assets={live} />}
    <section className="market-desk" aria-labelledby={titleId}>
      <div className="market-desk__heading"><div><p className="market-desk__eyebrow">Ваш короткий список</p><h2 id={titleId}>Мои ориентиры</h2></div>
        <button type="button" onClick={() => void refresh()} disabled={loading || isRefreshing}><RefreshCw size={15} aria-hidden="true" />{loading || isRefreshing ? 'Загрузка…' : 'Обновить'}</button>
      </div>
      <p className="market-desk__muted">Отметьте мировые инструменты. Выбор хранится только в этом браузере, без регистрации. Это список наблюдения, не инвестиционная рекомендация. Изменение считаем из двух последних датированных значений ряда: (последнее / предыдущее − 1) × 100 %. Текущая цена может отличаться от последней точки дневного ряда.</p>
      <div className="desk-favorites" role="group" aria-label="Выбрать избранные инструменты">
        {known.map((asset) => <button type="button" key={asset.id} aria-pressed={favorites.includes(asset.id)} onClick={() => toggle(asset.id)}>
          <Star size={15} fill={favorites.includes(asset.id) ? 'currentColor' : 'none'} aria-hidden="true" />{asset.name}
        </button>)}
      </div>
      {storageFailed && <p role="status" className="desk-warning">Браузер не разрешил сохранить выбор. В этой вкладке он работает, но после перезагрузки может исчезнуть.</p>}
      <div aria-live="polite">
        {loading && <p>Загружаем котировки…</p>}
        {error && <p className="desk-warning">Котировки не обновились. {live.length ? 'Ниже — последние загруженные данные с датами, не текущая цена.' : 'Числа не подставляем. Повторите загрузку.'} <a href="/status">Состояние источников</a></p>}
        {!loading && !error && fallbackAssetIds.length > 0 && <p className="desk-warning">Часть котировок недоступна. Для этих инструментов показан прочерк.</p>}
      </div>
      {favorites.length === 0 ? <p className="desk-empty">Пока ничего не выбрано. Нажмите на звезду у нужного инструмента выше.</p> : <div className="desk-watchlist">
        {favorites.map((id) => {
          const asset = known.find((item) => item.id === id);
          if (!asset) return null;
          const unavailable = fallbackAssetIds.includes(id);
          const move = unavailable ? null : latestMove(asset);
          return <article key={id}>
            <h3>{asset.name}</h3>
            <p className="desk-price">{unavailable ? '—' : formatPriceText(asset.price)}</p>
            {move ? <><strong>{formatPercent(move.change)}</strong><p className="market-desk__muted">Ряд: {deskValue(move.first)} → {deskValue(move.last)} {DESK_UNITS[id]}</p><p className="market-desk__muted">{dateLabel(move.from)} → {dateLabel(move.till)}</p></> : <p className="market-desk__muted">Датированное изменение недоступно</p>}
            <p className="market-desk__muted">{unavailable ? 'Котировка не получена' : `${asset.sourceLabel || 'Источник не указан'} · ${observationLabel(asset.asOf) || 'Дата цены неизвестна'}`}</p>
            {!unavailable && <p className="market-desk__muted">{observationLagLabel(asset.asOf)}</p>}
          </article>;
        })}
      </div>}
      {summary && <a className="desk-next" href="/world">Открыть графики и сравнить динамику <ArrowUpRight size={16} aria-hidden="true" /></a>}
    </section>
    {!summary && <Comparison assets={known.map((asset) => fallbackAssetIds.includes(asset.id) ? { ...asset, sparkline: [], sparkDates: null } : asset)} />}
  </div>;
}
