import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { createOriginServer } from '../server/origin.mjs';
import { addStaticDocument, origin } from '../scripts/static-document.mjs';

const root = new URL('../', import.meta.url);
const exec = promisify(execFile);
const read = path => readFile(new URL(path, root), 'utf8');
const snapshot = JSON.parse(await read('data/snapshot.json'));
const methodology = JSON.parse(await read('src/lib/methodology.json'));
const titles = JSON.parse(await read('src/lib/pageTitles.json'));

async function withBuild(check) {
  await mkdir(new URL('.local/', root), { recursive: true });
  const dir = await mkdtemp(new URL('.local/jury-test-', root));
  try {
    await mkdir(`${dir}/dist`);
    await writeFile(`${dir}/dist/index.html`, await read('index.html'));
    await exec(process.execPath, [new URL('scripts/build-pages.mjs', root).pathname], { cwd: dir });
    await check(`${dir}/dist`);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// No runScripts option: assertions inspect the original HTML, not React output.
test('home HTML has complete, consistent metadata, source labels and a visible disclaimer without JS', async () => {
  await withBuild(async dist => {
    const dom = new JSDOM(await readFile(`${dist}/index.html`, 'utf8'));
    const doc = dom.window.document;
    assert.equal(doc.documentElement.lang, 'ru');
    assert.equal(doc.title, titles.dashboard);
    const meta = selector => {
      assert.equal(doc.querySelectorAll(selector).length, 1, selector);
      return doc.querySelector(selector).content;
    };
    assert.ok(meta('meta[name="description"]').length > 80);
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) assert.equal(meta(selector), doc.title);
    for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(meta(selector), meta('meta[name="description"]'));
    assert.equal(doc.querySelectorAll('link[rel="canonical"]').length, 1);
    assert.equal(doc.querySelector('link[rel="canonical"]').href, `${origin}/`);
    assert.equal(meta('meta[property="og:url"]'), `${origin}/`);
    assert.equal(meta('meta[property="og:type"]'), 'website');
    assert.equal(meta('meta[property="og:locale"]'), 'ru_RU');
    assert.equal(meta('meta[name="twitter:card"]'), 'summary_large_image');
    const image = meta('meta[property="og:image"]');
    assert.ok(image.startsWith(`${origin}/`));
    assert.equal(meta('meta[name="twitter:image"]'), image);
    assert.ok(meta('meta[name="twitter:image:alt"]'));
    const png = await readFile(new URL(`public${new URL(image).pathname}`, root));
    assert.equal(png.readUInt32BE(16), Number(meta('meta[property="og:image:width"]')));
    assert.equal(png.readUInt32BE(20), Number(meta('meta[property="og:image:height"]')));
    for (const source of ['ECB', 'Yahoo Finance', 'gold-api.com']) assert.ok(doc.querySelector('main').textContent.includes(source));
    assert.match(doc.querySelector('footer').textContent, /не даёт инвестиционных рекомендаций/);
    assert.match(doc.querySelector('footer').textContent, /Данные могут поступать с задержкой/);
    for (const row of snapshot.items) assert.ok([...doc.querySelectorAll('tbody a')].some(a => a.href === row.source.url && a.textContent === row.source.name));
    dom.window.close();
  });
});

test('snapshot Dataset JSON-LD matches HTML exactly, with original decimal strings, observation dates and exportedAt', () => {
  const dom = new JSDOM(addStaticDocument('<html><head></head><body><div id="root"></div></body></html>', ''));
  const doc = dom.window.document;
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  const dataset = blocks.find(block => block['@type'] === 'Dataset');
  assert.equal(dataset['@context'], 'https://schema.org');
  assert.equal(dataset.dateModified, snapshot.exportedAt);
  assert.ok(dataset.description.includes('exportedAt'));
  assert.ok(dataset.description.includes('не инвестиционная рекомендация'));
  assert.equal(dataset.hasPart.length, snapshot.items.length);
  assert.equal(dataset.url, `${origin}/#static-snapshot-title`);
  assert.ok(doc.getElementById(new URL(dataset.url).hash.slice(1)));
  const rows = [...doc.querySelectorAll('tbody tr')];
  snapshot.items.forEach((row, i) => {
    const data = dataset.hasPart[i];
    assert.equal(data['@type'], 'Dataset');
    assert.equal(data.identifier, row.ticker);
    assert.equal(data.name, row.instrument);
    assert.equal(data.temporalCoverage, row.observedAt);
    assert.equal(data.measurementTechnique, row.basis);
    assert.equal(data.variableMeasured.value, row.value);
    assert.equal(typeof data.variableMeasured.value, 'string');
    assert.equal(data.variableMeasured.unitText, row.unit);
    assert.equal(data.citation.name, row.source.name);
    assert.equal(data.citation.url, row.source.url);
    assert.ok(rows[i].textContent.includes(data.variableMeasured.value));
    assert.equal(rows[i].querySelector('time').dateTime, data.temporalCoverage);
  });
  assert.equal(dataset.license, undefined, 'Do not invent a redistribution license for upstream data');
  dom.window.close();
});

test('about page contains the shared methodology in source HTML, not only in React', async () => {
  await withBuild(async dist => {
    const dom = new JSDOM(await readFile(`${dist}/about.html`, 'utf8'));
    const doc = dom.window.document;
    for (const section of methodology.sections) {
      const node = doc.querySelector(`[aria-labelledby="methodology-${section.id}"]`);
      assert.equal(node.querySelector('h2').textContent, section.title);
      for (const text of section.paragraphs) assert.ok(node.textContent.includes(text));
      for (const link of section.links) assert.ok([...node.querySelectorAll('a')].some(a => a.href === link.url && a.textContent === link.label));
    }
    assert.ok(doc.querySelector('main').textContent.includes('08:40 МСК (05:40 UTC)'));
    assert.ok(doc.querySelector('main').textContent.includes('(последнее значение / предыдущее значение − 1) × 100 %'));
    assert.ok(doc.querySelector('main').textContent.includes('exportedAt'));
    const react = await read('src/components/AboutProject.tsx');
    assert.match(react, /import methodology from '@\/lib\/methodology\.json'/);
    assert.match(react, /section\.paragraphs\.map/);
    dom.window.close();
  });
});

test('build emits crawlable robots/sitemap and a standalone noindex 404 with no dashboard startup', async () => {
  await withBuild(async dist => {
    const sitemap = new JSDOM(await readFile(`${dist}/sitemap.xml`, 'utf8'), { contentType: 'text/xml' });
    const urls = [...sitemap.window.document.querySelectorAll('loc')].map(n => n.textContent);
    assert.equal(urls.length, new Set(urls).size);
    assert.ok(urls.includes(`${origin}/about`));
    for (const url of urls) assert.ok(!/404|memory|api\//.test(url));
    const robots = await readFile(`${dist}/robots.txt`, 'utf8');
    assert.equal(robots, await read('public/robots.txt'));
    assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
    assert.ok(robots.includes('Allow: /'));
    const dom = new JSDOM(await readFile(`${dist}/404.html`, 'utf8'));
    const doc = dom.window.document;
    assert.match(doc.title, /^404/);
    assert.match(doc.querySelector('h1').textContent, /Страница не найдена/);
    assert.equal(doc.querySelector('meta[name="robots"]').content, 'noindex, follow');
    assert.equal(doc.querySelector('link[rel="canonical"]'), null);
    assert.equal(doc.querySelector('script'), null);
    assert.ok(doc.querySelector('a[href="/"]'));
    assert.ok(doc.querySelector('a[href="/about"]'));
    assert.equal(doc.querySelector('[data-initial-document="dashboard"]'), null);
    const config = JSON.parse(await read('vercel.json'));
    assert.ok(!config.rewrites.some(r => r.destination === '/index.html'), 'Do not shadow Vercel native 404 handling with SPA catchall');
    dom.window.close(); sitemap.window.close();
  });
});

test('origin serves real HTTP 404 for unknown URLs, supports HEAD, and does not cache page/robots/sitemap as immutable', async () => {
  await withBuild(async dist => {
    const server = createOriginServer({ rootDir: dist });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      for (const path of ['/not-a-real-page', '/nested/not-found', '/assets/missing.js']) {
        const response = await fetch(base + path);
        assert.equal(response.status, 404, path);
        assert.match(response.headers.get('content-type'), /text\/html/);
        assert.match(await response.text(), /404 — Страница не найдена/);
        const head = await fetch(base + path, { method: 'HEAD' });
        assert.equal(head.status, 404);
        assert.equal(await head.text(), '');
      }
      for (const [path, type] of [['/', 'text/html'], ['/about', 'text/html'], ['/robots.txt', 'text/plain'], ['/sitemap.xml', 'application/xml']]) {
        const response = await fetch(base + path);
        assert.equal(response.status, 200, path);
        assert.ok(response.headers.get('content-type').startsWith(type), path);
        assert.equal(response.headers.get('cache-control'), 'no-cache', path);
        await response.text();
      }
      const memory = await fetch(base + '/memory', { redirect: 'manual' });
      assert.equal(memory.status, 307);
      assert.equal(memory.headers.get('location'), '/');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
});
