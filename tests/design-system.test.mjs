import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [tokens, styles, main, heatmap, intro, dashboard] = await Promise.all([
  readFile('src/index.css', 'utf8'),
  readFile('src/design-system.css', 'utf8'),
  readFile('src/main.tsx', 'utf8'),
  readFile('src/components/MarketHeatmap.tsx', 'utf8'),
  readFile('src/components/PageSignalIntro.tsx', 'utf8'),
  readFile('src/App.tsx', 'utf8'),
]);

test('shared visual tokens define one radius and the 8px spacing scale', () => {
  assert.match(tokens, /--radius:\s*16px/);
  for (const [index, px] of [8, 16, 24, 32, 40, 48].entries()) {
    assert.match(tokens, new RegExp(`--space-${index + 1}:\\s*${px}px`));
  }
  assert.match(styles, /\[class\*="rounded"\]\s*\{\s*border-radius:\s*var\(--radius\) !important/);
  assert.match(main, /import '\.\/design-system\.css'/);
  assert.match(styles, /font-variant-numeric:\s*tabular-nums/);
});

test('live quote effect is an opacity-only 200ms animation and respects reduced motion', () => {
  assert.match(styles, /\.live-quote-value\.is-changing\s*\{\s*animation:\s*live-value-fade 200ms ease-out/);
  assert.match(styles, /@keyframes live-value-fade\s*\{\s*from\s*\{\s*opacity:\s*0\.4;\s*\}\s*to\s*\{\s*opacity:\s*1;/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*?\.live-quote-value\s*\{\s*animation:\s*none/s);
  assert.match(heatmap, /assetId === 'gold' \|\| assetId === 'btc'/);
  assert.match(heatmap, /key=\{value\}/);
});

test('readability styles soften dense weights and preserve the pale heatmap fill', async () => {
  const visual = await readFile('src/visual-refresh.css', 'utf8');
  assert.match(visual, /#root \.font-extrabold,[\s\S]*?font-weight:\s*650 !important/);
  assert.match(visual, /#root \.font-bold\s*\{\s*font-weight:\s*600 !important/);
  assert.match(visual, /\.market-heatmap \.heat-tile[\s\S]*?background-color:\s*var\(--heat-tile-bg, #FFFFFF\) !important/);
  assert.match(visual, /\.heat-tile__price[\s\S]*?font-size:\s*clamp\(1\.5rem, 5vw, 2rem\)/);
});

test('route legend and period-basis note use existing displayed history endpoints', () => {
  const legend = 'Цвет маршрута — цвет раздела. Заполненный узел — вы здесь.';
  assert.ok(intro.includes(legend));
  assert.ok(dashboard.includes(legend));
  assert.match(intro, /<title>Вы здесь<\/title>/);
  assert.match(heatmap, /Процент периода считается по последним датированным точкам ряда/);
  assert.match(heatmap, /function tileColor\(change: number, cap: number, paletteId: PaletteId\)/);
  assert.match(heatmap, /Цвет показывает направление и силу изменения; процент — точное значение/);
  assert.match(heatmap, /formatDateLong\(firstVisibleHistoryPoint\.date\).*formatDateLong\(lastVisibleHistoryPoint\.date\)/s);
  assert.match(heatmap, /history && firstVisibleHistoryPoint && lastVisibleHistoryPoint/);
});
