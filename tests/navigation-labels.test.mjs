import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('mobile menu accessible name includes its visible label and brand does not override its tagline', () => {
  const header = readFileSync('src/components/Header.tsx', 'utf8');
  assert.match(header, /'Разделы — открыть меню'/);
  assert.doesNotMatch(header, /aria-label="Market Pulse — обзор"/);
});
