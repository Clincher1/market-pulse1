import snapshot from '../../data/snapshot.json';
import { formatObservationTimestamp } from '@/lib/dateDisplay.mjs';

const chartFiles: Record<string, string> = {
  'BZ=F': 'brent.svg',
  '^GSPC': 'sp500.svg',
  XAU: 'gold.svg',
};
const valueFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow',
});

function dateLabel(value: string) {
  return dateFormat.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

export default function StaticMarketSnapshot() {
  return <section className="static-snapshot" aria-labelledby="static-snapshot-title">
    <div className="static-snapshot__intro">
      <p className="market-desk__eyebrow">Датированные наблюдения</p>
      <h2 id="static-snapshot-title">Статический снимок данных</h2>
      <p>Данные актуальны на момент сборки; это сохранённый снимок, а не котировки в реальном времени. Источник и дата наблюдения указаны отдельно.</p>
      <p className="static-snapshot__updated">Снимок выгружен: <time dateTime={snapshot.exportedAt}>{formatObservationTimestamp(snapshot.exportedAt)}</time></p>
    </div>
    <div className="static-snapshot__charts" aria-label="Динамика последних дневных наблюдений">
      {snapshot.items.map(item => {
        const observations = (snapshot.series as Record<string, Array<{ observedAt: string; value: string }>>)[item.ticker] ?? [];
        const chartFile = chartFiles[item.ticker];
        const hasChart = Boolean(chartFile && observations.length >= 3);
        const firstDate = observations[0]?.observedAt;
        const lastDate = observations[observations.length - 1]?.observedAt;
        return hasChart ? <figure className="static-snapshot__chart" key={item.ticker}>
          <img
            src={`/snapshot-charts/${chartFile}`}
            width="420"
            height="150"
            loading="eager"
            alt={`${item.instrument}. ${valueFormat.format(Number(item.value))} ${item.unit}, наблюдение ${dateLabel(item.observedAt)}. Выделенная точка — последнее наблюдение.`}
          />
          <figcaption>
            <strong>{item.instrument}</strong>
            <span className="static-snapshot__latest">{valueFormat.format(Number(item.value))} {item.unit}</span>
            <span>Наблюдение: <time dateTime={item.observedAt}>{dateLabel(item.observedAt)}</time></span>
            <span>Источник: <a href={item.source.url} rel="noreferrer">{item.source.name}</a></span>
            {observations.length < 7 && firstDate && lastDate
              ? <span className="static-snapshot__coverage">Период: {dateLabel(firstDate)} — {dateLabel(lastDate)} · {observations.length} наблюдений</span>
              : null}
          </figcaption>
        </figure> : null;
      })}
    </div>
    <div className="table-scroll-affordance" data-scrollable="true" data-more-right="true">
      <div className="initial-document__snapshot table-scroll-affordance__scroller" role="region" aria-label="Таблица статического снимка" tabIndex={0}>
        <table>
        <caption>Рыночные наблюдения из сохранённого снимка</caption>
        <thead><tr>
          <th scope="col">Тикер и инструмент</th>
          <th scope="col">Значение</th>
          <th scope="col">Единица</th>
          <th scope="col">Дата наблюдения</th>
          <th scope="col">Источник</th>
          <th scope="col">Основание значения</th>
        </tr></thead>
        <tbody>{snapshot.items.map(item => <tr key={item.ticker}>
          <th scope="row">{item.ticker} — {item.instrument}</th>
          <td>{Number(item.value).toFixed(2)}</td>
          <td>{item.unit}</td>
          <td className="static-snapshot__date"><time dateTime={item.observedAt}>{formatObservationTimestamp(item.observedAt)}</time></td>
          <td><a href={item.source.url} rel="noreferrer">{item.source.name}</a></td>
          <td>{item.basis}</td>
        </tr>)}</tbody>
        </table>
      </div>
      <p className="table-scroll-affordance__hint">← таблица прокручивается вбок →</p>
    </div>
    <p className="static-snapshot__disclaimer">Значения могут поступать с задержкой. Проверяйте первоисточник и дату наблюдения. Не является инвестиционной рекомендацией.</p>
  </section>;
}
