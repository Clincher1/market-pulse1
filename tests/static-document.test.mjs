import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { act, createElement } from 'react';
import { addStaticDocument, routes, origin, websiteJsonLd } from '../scripts/static-document.mjs';
import { securityHeaders } from '../server/origin.mjs';

const exec = promisify(execFile);
const root = new URL('../', import.meta.url);

test('built pages expose useful, distinct semantic HTML and working links without running JS', async () => {
  await mkdir(new URL('.local/', root), { recursive: true });
  const dir = await mkdtemp(new URL('.local/static-document-', root));
  try {
    await mkdir(`${dir}/dist`);
    await writeFile(`${dir}/dist/index.html`, await readFile(new URL('index.html', root), 'utf8'));
    await exec(process.execPath, [new URL('scripts/build-pages.mjs', root).pathname], { cwd: dir });
    const sitemap = new JSDOM(await readFile(`${dir}/dist/sitemap.xml`, 'utf8'), { contentType: 'text/xml' });
    assert.deepEqual([...sitemap.window.document.querySelectorAll('loc')].map(n => n.textContent), Object.keys(routes).map(route => `${origin}/${route}`));
    sitemap.window.close();
    const headings = new Set();
    for (const [route, entry] of Object.entries(routes)) {
      const html = await readFile(`${dir}/dist/${route || 'index'}.html`, 'utf8');
      const dom = new JSDOM(html, { url: `${origin}/${route}` });
      const doc = dom.window.document;
      assert.equal(doc.querySelectorAll('h1').length, 1);
      assert.equal(doc.querySelector('h1').textContent, entry.title);
      assert.ok(!headings.has(entry.title)); headings.add(entry.title);
      for (const tag of ['main', 'header', 'footer']) assert.equal(doc.querySelectorAll(tag).length, 1);
      assert.equal(doc.querySelectorAll('nav[aria-label]').length, 1);
      assert.equal(doc.querySelector('[data-initial-document]').dataset.initialDocument, entry.key);
      if (route === 'status') {
        assert.equal(doc.querySelector('nav [aria-current="page"]'), null);
        assert.equal(doc.querySelector('footer a[href="/status"]').textContent, 'Состояние данных');
      } else {
        assert.equal(doc.querySelector('nav [aria-current="page"]').getAttribute('href'), `/${route}`);
      }
      assert.equal(doc.querySelectorAll('nav a').length, 8);
      assert.equal(doc.querySelectorAll('nav a[href="/status"]').length, 0);
      assert.equal(doc.querySelectorAll('h2').length, route === '' ? 3 : route === 'about' ? 6 : 2);
      assert.ok(doc.querySelector('main').textContent.trim().length > 500);
      assert.ok(doc.querySelector('main').textContent.includes('не обновляется автоматически'));
      assert.equal(doc.querySelectorAll('.initial-document__snapshot').length, route === '' ? 1 : 0);
      assert.equal(doc.querySelectorAll('.static-snapshot__chart').length, route === '' ? 3 : 0);
      for (const link of doc.querySelectorAll('a[href]')) {
        const href = link.getAttribute('href');
        if (href.startsWith('#')) assert.ok(doc.getElementById(href.slice(1)));
        else if (href.startsWith('/')) assert.ok(
          Object.hasOwn(routes, href.slice(1)) || href === '/api/telegram-support-link',
          `Unknown link: ${href}`,
        );
        else assert.equal(new URL(href).protocol, 'https:');
      }
      assert.equal(doc.querySelectorAll('script[type="application/ld+json"]').length, route === '' ? 2 : 1);
      assert.deepEqual(JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent), JSON.parse(websiteJsonLd));
      assert.equal(doc.querySelectorAll('script[type="module"][src]').length, 1);
      assert.equal(doc.querySelectorAll('script:not([src]):not([type="application/ld+json"])').length, 0);
      assert.equal(doc.querySelectorAll('[style], [hidden], noscript').length, 0);
      assert.equal(doc.querySelectorAll('time').length, route === '' ? 7 : 0);
      dom.window.close();
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('JSON-LD describes only the actual website and CSP permits its exact bytes, not executable inline scripts', async () => {
  const data = JSON.parse(websiteJsonLd);
  assert.equal(data['@type'], 'WebSite');
  assert.equal(data.url, `${origin}/`);
  assert.equal(data.name, 'Market Pulse');
  assert.equal(data.inLanguage, 'ru');
  for (const unsupported of ['aggregateRating', 'review', 'dateModified', 'potentialAction', 'author']) assert.equal(data[unsupported], undefined);
  const hash = `'sha256-${createHash('sha256').update(websiteJsonLd).digest('base64')}'`;
  const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  const vercelCsp = config.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
  for (const policy of [vercelCsp, securityHeaders()['Content-Security-Policy']]) {
    const scriptSrc = policy.split(';').find(p => p.trim().startsWith('script-src '));
    assert.equal(scriptSrc.trim(), `script-src 'self' ${hash}`);
    assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/);
  }
});

test('insertion fails closed on a changed or already populated React root', () => {
  assert.throws(() => addStaticDocument('<div id="root">existing</div>', ''), /empty React root/);
  assert.throws(() => addStaticDocument(addStaticDocument('<head></head><div id="root"></div>', ''), ''), /empty React root/);
  assert.throws(() => addStaticDocument('<head></head><div id="root"></div>', 'not-a-page'), /Unknown public route/);
});

test('the existing createRoot startup replaces the initial document instead of duplicating it', async () => {
  const dom = new JSDOM(addStaticDocument('<head></head><body><div id="root"></div></body>', ''), { url: origin });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  let reactRoot;
  try {
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const container = document.getElementById('root');
    assert.equal(container.querySelectorAll('h1').length, 1);
    reactRoot = createRoot(container);
    await act(async () => reactRoot.render(createElement('main', { id: 'main' }, createElement('h1', null, 'Interactive page'))));
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(document.querySelector('h1').textContent, 'Interactive page');
    assert.equal(document.querySelector('[data-initial-document]'), null);
    assert.equal(document.querySelectorAll('main').length, 1);
  } finally {
    if (reactRoot) await act(async () => reactRoot.unmount());
    dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  }
});
