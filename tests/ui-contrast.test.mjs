import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = await readFile('src/brand-refresh.css', 'utf8');
const design = await readFile('src/design-system.css', 'utf8');
const visual = await readFile('src/visual-refresh.css', 'utf8');
const header = await readFile('src/components/Header.tsx', 'utf8');
const russiaBusiness = await readFile('src/components/RussiaBusiness.tsx', 'utf8');
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
  assert.match(header, /const mobileNavigationLinks = \[\s*\.\.\.desktopPrimaryLinks\.map[\s\S]*\.\.\.desktopMoreLinks\.map/,
    'mobile header exposes primary and More destinations together');
  assert.match(visual, /desktop-navigation__mobile-links[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/,
    'mobile navigation uses a visible icon grid instead of a clipped rail');
  assert.doesNotMatch(visual, /\[class\*="__card"\]/,
    'card surfaces must not style nested titles as pills');
});
test('Russia market values scale down on mobile and remain prominent on larger screens', () => {
  assert.match(russiaBusiness, /text-2xl font-extrabold tabular-nums text-text-primary sm:text-3xl lg:text-4xl/,
    'large market rates should not dominate a phone screen, while retaining desktop emphasis');
});
test('small path label keeps WCAG AA contrast on page and card surfaces', () => {
  const blocks = [...visual.matchAll(/#root\s+:where\(\.page-signal-intro__path-label\)\s*\{([^}]+)\}/g)];
  const color = blocks.at(-1)?.[1].match(/color:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(color, 'the light theme explicitly assigns the label a high-contrast color');
  const rgb = hex => hex.replace('#', '').match(/../g).map(c => parseInt(c, 16));
  const luminance = channels => {
    const [r, g, b] = channels.map(c => { const v = c / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  for (const background of ['#FAFAF7', '#FFFFFF']) assert.ok(ratio(rgb(color), rgb(background)) >= 4.5);

  for (const foreground of ['#172033', '#45566C', '#087A52', '#C42332', '#1D4ED8']) {
    for (const background of ['#FAFAF7', '#FFFFFF']) {
      assert.ok(ratio(rgb(foreground), rgb(background)) >= 4.5,
        `${foreground} on ${background} must meet WCAG 2.1 AA`);
    }
  }
  for (const background of ['#2452CC', '#1D4ED8']) {
    assert.ok(ratio(rgb('#FFFFFF'), rgb(background)) >= 4.5,
      `white text on ${background} must meet WCAG 2.1 AA`);
  }
  assert.match(visual, /#root a\.text-white\s*\{\s*color:\s*#FFFFFF !important;/,
    'inverse anchor labels must stay white over the blue accent');
});
