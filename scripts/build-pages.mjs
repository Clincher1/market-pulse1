// Static, route-specific metadata is visible even to crawlers without JavaScript.
import { readFile, writeFile } from 'node:fs/promises';
import descriptions from '../src/lib/pageDescriptions.json' with { type: 'json' };
const origin = 'https://market-pulse1-eta.vercel.app';
const titles = {
  passport: 'Сводка дня', russia: 'Россия и бизнес', world: 'Мировые рынки',
  brief: 'Коротко о рынке', news: 'Новости', guide: 'Как читать сайт',
  about: 'О проекте', status: 'Состояние системы',
};
const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const withDescription = (html, description) => html.replace(
  /(<meta\s+(?:name="(?:description|twitter:description)"|property="og:description")\s+content=")[^"]*("\s*\/?>)/g,
  (_, before, after) => `${before}${escapeAttribute(description)}${after}`,
);
const html = withDescription(await readFile('dist/index.html', 'utf8'), descriptions.dashboard);
await writeFile('dist/index.html', html);
for (const [route, title] of Object.entries(titles)) {
  const page = withDescription(html, descriptions[route === 'world' ? 'global' : route])
    .replace(/(<link rel="canonical" href=")[^"]+("\s*\/?>)/, `$1${origin}/${route}$2`)
    .replace(/(<meta property="og:url" content=")[^"]+("\s*\/?>)/, `$1${origin}/${route}$2`)
    .replace(/<title>[^<]+<\/title>/, `<title>${title} — Market Pulse</title>`)
    .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]+("\s*\/?>)/g, `$1${title} — Market Pulse$2`);
  await writeFile(`dist/${route}.html`, page);
}
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', ...Object.keys(titles)].map(route => `  <url><loc>${origin}/${route}</loc></url>`).join('\n')}\n</urlset>\n`);
