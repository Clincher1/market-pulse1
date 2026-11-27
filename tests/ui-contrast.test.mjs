import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = await readFile('src/brand-refresh.css', 'utf8');
const design = await readFile('src/design-system.css', 'utf8');
const vectorArtwork = await Promise.all(['src/components/PulseOrbit.tsx', 'src/components/BrandMark.tsx', 'src/components/MarketHeatmap.tsx'].map(path => readFile(path, 'utf8')));
test('active routes retain section accent labels on a neutral surface without gradients', () => {
  for (const id of ['dashboard', 'brief', 'passport', 'russia', 'global', 'news']) {
    const block = css.match(new RegExp(`\\.desktop-navigation__link\\[data-theme='${id}'\\] \\{([^}]+)\\}`))?.[1];
    assert.ok(block, `missing ${id} theme`);
    assert.match(block, /--nav-color:\s*#[0-9a-f]{6}/i, `${id} section accent`);
  }
  assert.match(css, /\.desktop-navigation__link\.is-active\s*\{[^}]*color:\s*var\(--nav-color/);
  assert.match(css, /\.desktop-navigation__link\.is-active\s*\{[^}]*background-color:\s*var\(--bg-page\)/);
  const navFade = css.match(/\.desktop-navigation__scroll-wrap::after\s*\{[^}]*\}/)?.[0];
  assert.match(navFade ?? '', /linear-gradient/, 'mobile navigation has a right-edge scroll cue');
  const visualCss = navFade ? css.replace(navFade, '') : css;
  assert.doesNotMatch(`${visualCss}\n${design}\n${vectorArtwork.join('\n')}`, /linear-gradient|radial-gradient|<linearGradient|<radialGradient/);
});
test('small path label uses a readable neutral on white and the page surface', () => {
  const block = css.match(/\.page-signal-intro__path-label\s*\{([^}]+)\}/)?.[1];
  const color = block.match(/color:\s*(#[0-9a-f]{6})/)[1];
  const rgb = hex => hex.replace('#', '').match(/../g).map(c => parseInt(c, 16));
  const luminance = channels => {
    const [r, g, b] = channels.map(c => { const v = c / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  for (const background of ['#ffffff', '#fafaf7']) assert.ok(ratio(rgb(color), rgb(background)) >= 4.5);
});
