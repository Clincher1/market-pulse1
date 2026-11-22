import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('mobile menu accessible name includes its visible label and brand does not override its tagline', () => {
  const header = readFileSync('src/components/Header.tsx', 'utf8');
  assert.match(header, /'Разделы — открыть меню'/);
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

test('system status stays available in footer, not in primary desktop or mobile navigation', () => {
  const header = readFileSync('src/components/Header.tsx', 'utf8');
  const footer = readFileSync('src/components/Footer.tsx', 'utf8');
  assert.doesNotMatch(header, /PAGE_PATHS\.status|Состояние системы|Система/);
  assert.match(header, /activeView === 'status' \|\| mobileQuickLinks/);
  assert.match(footer, /href="\/status"[\s\S]*?Состояние данных/);
});
