import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('expanded history tables expose named keyboard-scrollable regions', () => {
  for (const path of ['src/components/MarketHeatmap.tsx', 'src/components/RussiaHistory.tsx']) {
    assert.match(readFileSync(path, 'utf8'), /<div className="mt-\[var\(--space-\d\)\] max-h-\d+ overflow-auto[^\"]*" tabIndex=\{0\} role="region" aria-label=\{`Таблица наблюдений/);
  }
});
