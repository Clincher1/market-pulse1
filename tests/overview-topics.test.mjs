import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dir = new URL('../.local/overview-topics-tests/', import.meta.url);
await mkdir(dir, { recursive: true });
const out = new URL('overview-topics.cjs', dir);
await build({
  entryPoints: ['src/components/OverviewTopics.tsx'],
  outfile: out.pathname,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  logLevel: 'silent',
  plugins: [{
    name: 'no-animation',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^framer-motion$/ }, () => ({ path: 'motion', namespace: 'fixture' }));
      buildApi.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        import React from 'react';
        const cache = {};
        export const m = new Proxy(cache, {get: (_,tag) => {
          return cache[tag] ??= ({initial,animate,transition,whileHover,whileTap,...props}) => React.createElement(tag,props);
        }});
        export const useReducedMotion=()=>true;
      ` }));
    },
  }],
});
const OverviewTopics = createRequire(import.meta.url)(out.pathname).default;
after(() => rm(dir, { recursive: true, force: true }));

test('overview renders all eight section destinations with their existing routes and titles', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'Element', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
    });
  }
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(OverviewTopics)));
    const section = document.querySelector('section[aria-labelledby="page-links-title"]');
    assert.ok(section);
    assert.equal(section.querySelector('h2').textContent, 'С чего начнём?');
    const links = [...section.querySelectorAll('.overview-topics__grid > a')];
    assert.deepEqual(links.map((link) => [link.getAttribute('href'), link.querySelector('.overview-topic-card__title').textContent]), [
      ['/passport', 'Сводка дня'],
      ['/russia', 'Россия и бизнес'],
      ['/world', 'Глобальная экономика'],
      ['/brief', 'Бриф за 60 секунд'],
      ['/news', 'Глобальные новости'],
      ['/guide', 'Как читать сайт'],
      ['/about', 'О проекте'],
      ['/status', 'Состояние системы'],
    ]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('the topic grid precedes MarketDesk and uses compact desktop/mobile layouts', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  const topicsAt = app.indexOf('<OverviewTopics />');
  const marketDeskAt = app.indexOf('<MarketDesk summary />');
  assert.ok(topicsAt >= 0 && marketDeskAt > topicsAt, 'the directory must render before the market desk');

  const css = readFileSync('src/brand-refresh.css', 'utf8');
  assert.match(css, /overview-hero\.overview-hero--compact\s*\{[^}]*min-height:\s*clamp\(350px,\s*45vh,\s*380px\)/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*?\.overview-topics--compact \.overview-topics__grid\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*?\.overview-topics--compact \.overview-topics__grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.overview-topics--compact \.overview-topic-card__description\s*\{\s*display: none;/);
});
