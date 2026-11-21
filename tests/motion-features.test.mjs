import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

// domAnimation retains entrances, viewport reveals, exit, hover and tap; the
// unused drag/layout engine is intentionally excluded from the startup bundle.
test('all animated components use the lightweight factory under a strict domAnimation provider', () => {
  const main = readFileSync('src/main.tsx', 'utf8');
  assert.match(main, /<LazyMotion features=\{domAnimation\} strict>\s*<App \/>\s*<\/LazyMotion>/);
  for (const file of ['src/App.tsx', ...readdirSync('src/components').filter(name => name.endsWith('.tsx')).map(name => `src/components/${name}`)]) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes("from 'framer-motion'")) continue;
    assert.match(source, /\bm as motion\b/, file);
    assert.doesNotMatch(source, /\b(?:layout|layoutId|drag)\s*(?:=|\/?>)/, `${file}: domMax features require an explicit review`);
  }
});
