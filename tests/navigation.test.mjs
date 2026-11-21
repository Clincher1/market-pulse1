import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ROUTES = readFileSync(join(ROOT, 'src/lib/routes.ts'), 'utf8');
const THEMES = readFileSync(join(ROOT, 'src/components/sectionThemes.data.ts'), 'utf8');
const APP = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
const VERCEL = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));

const pathsBlock = ROUTES.match(/export const PAGE_PATHS:[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
assert.ok(pathsBlock, 'PAGE_PATHS must stay a simple, auditable route table');
const pagePaths = new Map(
  [...pathsBlock[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map(([, view, path]) => [view, path]),
);

test('каждая тема имеет самостоятельный адрес, а главная остаётся обзором', () => {
  const expected = new Map([
    ['dashboard', '/'],
    ['passport', '/passport'],
    ['russia', '/russia'],
    ['global', '/world'],
    ['brief', '/brief'],
    ['news', '/news'],
    ['memory', '/memory'],
    ['guide', '/guide'],
    ['about', '/about'],
    ['status', '/status'],
  ]);
  assert.deepEqual(pagePaths, expected);

  const themeHrefs = [...THEMES.matchAll(/href:\s*'([^']+)'/g)].map(([, href]) => href);
  for (const href of themeHrefs) {
    assert.ok([...pagePaths.values()].includes(href), `тема ссылается на неизвестную страницу ${href}`);
  }
});

test('каждая тематическая страница отрисовывается отдельной веткой', () => {
  const pageViews = [...APP.matchAll(/^\s+case '(passport|russia|global|brief|news|memory|about)':/gm)].map(([, view]) => view);
  assert.deepEqual(pageViews.sort(), ['about', 'brief', 'global', 'memory', 'news', 'passport', 'russia']);
  assert.match(ROUTES, /if \(hash\.startsWith\('#guide-'\)\) return 'guide';/);
  assert.match(ROUTES, /pathFromLegacyHash\(pathname: string, hash: string\)/);
});

test('прямые адреса страниц переписываются Vercel на SPA entry point', () => {
  const rewrites = new Map((VERCEL.rewrites ?? []).map(({ source, destination }) => [source, destination]));
  for (const path of pagePaths.values()) {
    if (path === '/' || path === '/memory') continue;
    assert.equal(rewrites.get(path), `${path}.html`, `${path} должен открываться напрямую после перезагрузки`);
  }
});
