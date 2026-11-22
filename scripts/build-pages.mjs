// Route-specific metadata and a useful initial document, even without JavaScript.
import { readFile, writeFile } from 'node:fs/promises';
import descriptions from '../src/lib/pageDescriptions.json' with { type: 'json' };
import { addStaticDocument, origin, routes } from './static-document.mjs';
const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const withDescription = (html, description) => html.replace(
  /(<meta\s+(?:name="(?:description|twitter:description)"|property="og:description")\s+content=")[^"]*("\s*\/?>)/g,
  (_, before, after) => `${before}${escapeAttribute(description)}${after}`,
);
// Always derive each page from the empty root, never nest a previous page's content.
const html = await readFile('dist/index.html', 'utf8');
for (const [route, page] of Object.entries(routes)) {
  let output = withDescription(html, descriptions[page.key])
    .replace(/(<link rel="canonical" href=")[^"]+("\s*\/?>)/, `$1${origin}/${route}$2`)
    .replace(/(<meta property="og:url" content=")[^"]+("\s*\/?>)/, `$1${origin}/${route}$2`);
  if (route) {
    output = output.replace(/<title>[^<]+<\/title>/, `<title>${page.title} — Market Pulse</title>`)
      .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]+("\s*\/?>)/g, `$1${page.title} — Market Pulse$2`);
  }
  await writeFile(`dist/${route || 'index'}.html`, addStaticDocument(output, route));
}
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(routes).map(route => `  <url><loc>${origin}/${route}</loc></url>`).join('\n')}\n</urlset>\n`);
