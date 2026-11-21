// Guard explicit target-size utilities; actual geometry is measured separately
// by scripts/ui-ux-audit.mjs on all four requested viewports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('active page controls do not reintroduce explicit 24–40px minimums',async()=>{
  for(const name of ['Header','Footer','GuideLink','AnalyticsGuide','RussiaHistory','RussiaBusiness',
    'DailyBrief','DailyPassport','MarketHeatmap','KeyAssets','NewsFeed','HowWeKnow',
    'SystemStatus','SectionFallback','SectionBoundary','OfzCurve']) {
    const source=await readFile(`src/components/${name}.tsx`,'utf8');
    assert.doesNotMatch(source,/\bmin-h-(?:6|7|8|9|10)\b/,`${name}: independent controls must be at least 44px`);
  }
  const css=await readFile('src/components/market-desk.css','utf8');
  assert.match(css,/\.desk-choices label\s*\{[^}]*min-height: 44px/);
  assert.match(css,/\.market-desk a\s*\{[^}]*min-height: 44px/);
});
