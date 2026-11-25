import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('mobile primary navigation remains in the header and the brand tagline stays descriptive', () => {
  const header = readFileSync('src/components/Header.tsx', 'utf8');
  assert.match(header, /aria-label="Основная навигация"/);
  assert.match(header, /className="desktop-navigation__links"/);
  assert.doesNotMatch(header, /mobile-quick-nav|mobile-navigation__link/);
  assert.doesNotMatch(header, /aria-label="Market Pulse — обзор"/);
});

test('orbit links reset old opposing absolute edges before new positions', () => {
  const css = readFileSync('src/brand-refresh.css', 'utf8');
  const link = css.match(/\.pulse-orbit__link \{([^}]+)\}/)?.[1];
  assert.ok(link);
  assert.match(link, /inset: auto;/);
  const width = Number(link.match(/width: min\((\d+)%, 245px\)/)?.[1]);
  assert.ok(width > 0 && width < 50, 'Both cards need a gap, not a hard-coded historical percentage');
});

test('secondary destinations are kept in More while existing primary pills stay unchanged', () => {
  const header = readFileSync('src/components/Header.tsx', 'utf8');
  const routes = readFileSync('src/lib/routes.ts', 'utf8');
  assert.match(header, /desktopPrimaryThemeIds: SectionThemeId\[\] = \['brief', 'passport', 'russia', 'global', 'news'\]/);
  assert.match(header, /'guide',[\s\S]*'about',[\s\S]*'status'/);
  assert.doesNotMatch(header, /'memory'/);
  assert.match(header, /desktopMoreLinks = navLinks\.filter/);
  assert.match(header, /desktop-navigation__menu-title">\{link\.fullLabel\}/);
  for (const path of ['/guide', '/about', '/status']) assert.ok(routes.includes(`'${path}'`));
  assert.ok(routes.includes("'/memory'"), 'the legacy route remains configured separately from navigation');
});
