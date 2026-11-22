// Build-time content only. Snapshot values come from a separately maintained file.
import { readFileSync } from 'node:fs';
import descriptions from '../src/lib/pageDescriptions.json' with { type: 'json' };

export const origin = 'https://market-pulse1-eta.vercel.app';
export const routes = {
  '': { title: 'Рынки в движении. Факты — на виду.', label: 'Обзор', key: 'dashboard' },
  passport: { title: 'Сводка дня', label: 'Сводка дня', key: 'passport' },
  russia: { title: 'Россия и бизнес', label: 'Россия', key: 'russia' },
  world: { title: 'Мировые рынки', label: 'Мир', key: 'global' },
  brief: { title: 'Коротко о рынке', label: 'Бриф за 60 секунд', key: 'brief' },
  news: { title: 'Новости', label: 'Новости', key: 'news' },
  guide: { title: 'Как читать сайт', label: 'Методология', key: 'guide' },
  about: { title: 'О проекте', label: 'О проекте', key: 'about' },
  status: { title: 'Состояние системы', label: 'Состояние системы', key: 'status' },
};

// Identical on all pages: one exact CSP hash, no unsafe-inline script permission.
export const websiteJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${origin}/#website`,
  url: `${origin}/`,
  name: 'Market Pulse',
  description: descriptions.dashboard,
  inLanguage: 'ru',
});

const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function validDate(value) {
  if (typeof value !== 'string') return false;
  // Validate the written calendar date before parsing any time-zone offset.
  // Date.parse normalizes e.g. February 30 in timestamps instead of rejecting it.
  const calendarDate = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) return false;
  const date = new Date(calendarDate);
  if (!Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== calendarDate) return false;
  if (value === calendarDate) return true;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function renderSnapshot() {
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(
      new URL('../data/snapshot.json', import.meta.url), 'utf8',
    ));
  } catch (error) {
    throw new Error(`Cannot read data/snapshot.json: ${error.message}`, { cause: error });
  }
  const nonempty = value =>
    typeof value === 'string' && value.trim().length > 0;
  const validRow = row => {
    if (!row || typeof row !== 'object') return false;
    if (![
      row.ticker, row.instrument, row.unit, row.basis, row.source?.name,
    ].every(nonempty)) return false;
    if (typeof row.value !== 'string'
      || !/^\d+(?:\.\d+)?$/.test(row.value)
      || !Number.isFinite(Number(row.value))
      || Number(row.value) <= 0
      || !validDate(row.observedAt)) return false;
    try {
      const url = new URL(row.source.url);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  if (snapshot?.schemaVersion !== 1
    || !validDate(snapshot.exportedAt)
    || !snapshot.exportedAt.includes('T')
    || !Array.isArray(snapshot.items)
    || snapshot.items.length < 3
    || snapshot.items.length > 5
    || !snapshot.items.every(validRow)
    || new Set(snapshot.items.map(row => row.ticker)).size
      !== snapshot.items.length) {
    throw new Error('Invalid data/snapshot.json: expected 3–5 complete observations');
  }
  const rows = snapshot.items.map(row => `
              <tr>
                <th scope="row">${escape(row.ticker)} — ${escape(row.instrument)}</th>
                <td>${escape(row.value)}</td>
                <td>${escape(row.unit)}</td>
                <td><time datetime="${escape(row.observedAt)}">${escape(row.observedAt)}</time></td>
                <td><a href="${escape(row.source.url)}">${escape(row.source.name)}</a></td>
                <td>${escape(row.basis)}</td>
              </tr>`).join('');
  return `
        <section aria-labelledby="static-snapshot-title">
          <h2 id="static-snapshot-title">Статический снимок данных</h2>
          <p>Данные актуальны на момент сборки. Это сохранённый снимок доступных данных,
          а не котировки в реальном времени; даты наблюдений указаны отдельно.</p>
          <p>Снимок выгружен:
            <time datetime="${escape(snapshot.exportedAt)}">${escape(snapshot.exportedAt)}</time>.
            Данные могут поступать с задержкой.</p>
          <div class="initial-document__snapshot"
            role="region" aria-label="Таблица статического снимка" tabindex="0">
            <table>
              <caption>Рыночные наблюдения из сохранённого снимка</caption>
              <thead>
                <tr>
                  <th scope="col">Тикер и инструмент</th>
                  <th scope="col">Значение</th>
                  <th scope="col">Единица</th>
                  <th scope="col">Дата наблюдения</th>
                  <th scope="col">Источник</th>
                  <th scope="col">Основание значения</th>
                </tr>
              </thead>
              <tbody>${rows}
              </tbody>
            </table>
          </div>
        </section>`;
}

export function staticDocument(route) {
  const page = routes[route];
  if (!page) throw new Error(`Unknown public route: ${route}`);
  const links = Object.entries(routes).map(([path, entry]) =>
    `<a href="/${path}"${path === route ? ' aria-current="page"' : ''}>${escape(entry.label)}</a>`
  ).join('\n          ');
  return `<div class="initial-document" data-initial-document="${page.key}">
      <a class="initial-document__skip" href="#main">Перейти к содержанию</a>
      <header>
        <a class="initial-document__brand" href="/">Market Pulse</a>
        <nav aria-label="Основная навигация">${links}</nav>
      </header>
      <main id="main" tabindex="-1">
        <h1>${escape(page.title)}</h1>
        <p>${escape(descriptions[page.key])}</p>
        ${route === '' ? renderSnapshot() : ''}
        <section aria-labelledby="initial-sources">
          <h2 id="initial-sources">Откуда берутся данные?</h2>
          <p>Market Pulse показывает рыночные наблюдения по России и миру и исходные заголовки публикаций. Источник и время наблюдения указаны там, где они доступны. Рассчитанные изменения отделены от исходных значений.</p>
          <p>Правила чтения значений, расчётов и ограничений описаны в <a href="/guide">методологии</a>. Результаты технических проверок доступны на странице <a href="/status">состояния системы</a>.</p>
        </section>
        <section aria-labelledby="initial-live">
          <h2 id="initial-live">Как посмотреть текущие значения?</h2>
          <p>Интерактивные котировки, графики и публикации загружаются с помощью JavaScript. Если расширенный интерфейс не появился, проверьте, разрешён ли JavaScript, и обновите страницу. Статический снимок, если он показан выше, не обновляется автоматически.</p>
        </section>
      </main>
      <footer>
        <p>Market Pulse не выпускает новые прогнозы и не даёт инвестиционных рекомендаций.</p>
        <a href="/about">О проекте и ограничениях данных</a>
      </footer>
    </div>`;
}

export function addStaticDocument(html, route) {
  if (!/<div id="root"><\/div>/.test(html)) {
    throw new Error('Expected one empty React root before inserting the initial document');
  }
  return html.replace('<div id="root"></div>', () => `<div id="root">${staticDocument(route)}</div>`)
    .replace('</head>', () => `  <script type="application/ld+json">${websiteJsonLd}</script>\n  </head>`);
}
