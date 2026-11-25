import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dir = new URL('../.local/mobile-menu-tests/', import.meta.url);
await mkdir(dir, { recursive: true });
const out = new URL('header.cjs', dir);
await build({
  entryPoints: ['src/components/Header.tsx'],
  outfile: out.pathname,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  alias: { '@': './src' },
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
const Header = createRequire(import.meta.url)(out.pathname).default;
after(() => rm(dir, { recursive: true, force: true }));

test('header keeps primary routes in a compact top rail and secondary routes in More', async () => {
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
    await act(async () => root.render(React.createElement(Header, { activeView: 'dashboard' })));

    const nav = document.querySelector('[aria-label="Основная навигация"]');
    const primary = [...nav.querySelectorAll('.desktop-navigation__links > a')];
    assert.deepEqual(primary.map((link) => link.getAttribute('href')), [
      '/', '/brief', '/passport', '/russia', '/world', '/news',
    ]);
    assert.equal(primary[1].textContent.trim(), 'Бриф за 60 секунд');

    const more = nav.querySelector('details.desktop-navigation__more');
    assert.ok(more, 'the secondary menu remains available');
    const moreLinks = [...more.querySelectorAll('.desktop-navigation__menu-item')];
    assert.deepEqual(moreLinks.map((link) => link.getAttribute('href')), [
      '/memory', '/guide', '/about', '/status',
    ]);
    assert.equal(moreLinks.find((link) => link.href.endsWith('/guide')).textContent.includes('Как читать сайт'), true);
    assert.equal(moreLinks.find((link) => link.href.endsWith('/about')).textContent.includes('О проекте'), true);
    assert.equal(moreLinks.find((link) => link.href.endsWith('/status')).textContent.includes('Состояние системы'), true);

    assert.equal(document.querySelector('.mobile-quick-nav'), null, 'no fixed bottom navigation is rendered');
    assert.equal(document.getElementById('mobile-navigation'), null, 'mobile quick links are in the top rail');

    const summary = more.querySelector('summary');
    await act(async () => summary.click());
    assert.equal(more.open, true);
    summary.focus();
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(more.open, false);
    assert.equal(document.activeElement, summary, 'Escape closes More and restores focus');

    const css = readFileSync(new URL('../src/brand-refresh.css', import.meta.url), 'utf8');
    assert.match(css, /@media \(max-width: 1279px\)[\s\S]*?\.desktop-navigation__links \{[\s\S]*?overflow-x: auto/);
    assert.doesNotMatch(css, /grid-template-columns:\s*repeat\([35],\s*minmax\(0,\s*1fr\)\)/);
    assert.match(readFileSync('src/index.css', 'utf8'), /@media \(min-width: 1280px\)/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
