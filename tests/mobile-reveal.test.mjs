import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('src/brand-refresh.css', 'utf8');
const main = await readFile('src/main.tsx', 'utf8');
const files = await Promise.all([
  'src/App.tsx',
  'src/components/Header.tsx',
  'src/components/PulseOrbit.tsx',
  'src/components/OverviewTopics.tsx',
  'src/components/KeyAssets.tsx',
  'src/components/RussiaBusiness.tsx',
  'src/components/MarketMemory.tsx',
  'src/components/NewsFeed.tsx',
  'src/components/AnalyticsGuide.tsx',
  'src/components/AboutProject.tsx',
  'src/components/SystemStatus.tsx',
].map(path => readFile(path, 'utf8')));

test('mobile reveal copy is opaque in CSS and motion never starts reveal content transparent', () => {
  const visibleState = css.match(/\.overview-hero__eyebrow,[\s\S]*?#news\s*\{\s*opacity:\s*1;/);
  assert.ok(visibleState, 'hero, orbit links, topics and revealed sections have an opaque CSS base state');
  for (const source of files) {
    assert.doesNotMatch(source, /initial=\{\{\s*opacity:\s*0/);
    assert.doesNotMatch(source, /whileInView=\{\{\s*opacity:/);
  }
});

test('reduced motion is respected globally and absent IntersectionObserver leaves reveal content visible', () => {
  assert.match(main, /<MotionConfig reducedMotion="user">/);
  assert.match(files[0], /typeof IntersectionObserver !== 'undefined'/);
  assert.match(files[2], /initial=\{false\}/);
});

test('mobile primary navigation scrolls horizontally and displays a right-edge fade cue', () => {
  const header = files[1];
  assert.match(header, /desktop-navigation__scroll-wrap/);
  assert.match(css, /\.desktop-navigation__links\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.desktop-navigation__scroll-wrap::after\s*\{[^}]*linear-gradient/s);
});
