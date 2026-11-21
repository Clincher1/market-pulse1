// Build-time content only. No source requests, quotes, generated dates or runtime state.
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
        <section aria-labelledby="initial-sources">
          <h2 id="initial-sources">Откуда берутся данные?</h2>
          <p>Market Pulse показывает рыночные наблюдения по России и миру и исходные заголовки публикаций. Источник и время наблюдения указаны там, где они доступны. Рассчитанные изменения отделены от исходных значений.</p>
          <p>Правила чтения значений, расчётов и ограничений описаны в <a href="/guide">методологии</a>. Результаты технических проверок доступны на странице <a href="/status">состояния системы</a>.</p>
        </section>
        <section aria-labelledby="initial-live">
          <h2 id="initial-live">Как посмотреть текущие значения?</h2>
          <p>Котировки, графики и публикации загружаются с помощью JavaScript. Если расширенный интерфейс не появился, проверьте, разрешён ли JavaScript, и обновите страницу. В этой текстовой версии текущие значения не приводятся.</p>
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
