import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { viewFromLocation, pathFromLegacyHash } from '../src/lib/routes.ts';
import { isInternalSlot } from '../src/lib/slotsView.ts';

test('old forecast URLs land on working public pages without rendering the archive', () => {
  for (const path of ['/memory', '/memory/']) {
    assert.equal(viewFromLocation(path, ''), 'dashboard');
    assert.equal(pathFromLegacyHash(path, ''), '/');
  }
  for (const hash of ['#market-memory', '#guide-memory']) {
    assert.equal(pathFromLegacyHash('/', hash), '/guide');
    assert.equal(pathFromLegacyHash('/guide', hash), '/guide');
  }
});

test('public navigation excludes the retired forecast section', () => {
  const source = readFileSync('src/components/sectionThemes.data.ts', 'utf8');
  const publicOrder = source.split('export const DASHBOARD_THEME_ORDER')[1];
  assert.doesNotMatch(publicOrder, /'memory'/);
  const about = readFileSync('src/components/AboutProject.tsx', 'utf8');
  assert.doesNotMatch(about, /остаются в архиве|результаты.*доступны/);
});

test('registry does not advertise withdrawn blocks as public slots', () => {
  for (const id of ['forecast.archive', 'snapshot.morning', 'memory.market']) {
    assert.equal(isInternalSlot(id), true, id);
  }
  for (const id of ['price.gold', 'russia.ofz']) assert.equal(isInternalSlot(id), false, id);
});

test('old forecast path has a server-side redirect, not only a hidden menu entry', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(config.trailingSlash, false, 'Slash-ending bookmarks must be canonicalized before routing');
  assert.deepEqual(config.redirects.find((item) => item.source === '/memory/:path*'), {
    source: '/memory/:path*', destination: '/', permanent: false,
  });
});

test('share previews, install description and loading states match the remaining site', () => {
  for (const path of ['index.html', 'public/site.webmanifest', 'public/og-image.svg', 'public/logo.svg']) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /паспорт дня|Память рынка|память исходов|сигнал|Tension|и архив/i, path);
  }
  assert.doesNotMatch(readFileSync('src/App.tsx', 'utf8'), /Загружаем.*память рынка/);
});
