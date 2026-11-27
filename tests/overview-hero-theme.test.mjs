import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, app] = await Promise.all([
  readFile('src/visual-refresh.css', 'utf8'),
  readFile('src/App.tsx', 'utf8'),
]);

function rgb(hex) {
  return hex.slice(1).match(/../g).map(part => parseInt(part, 16));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('the midnight blue treatment carries from the dashboard hero across the site', () => {
  assert.match(css, /#root \.overview-hero\s*\{[^}]*background-color:\s*#0C1932 !important;[\s\S]*?linear-gradient\(128deg, #0B1830 0%, #102243 54%, #111D3C 100%\)/);
  assert.match(css, /#root \.overview-hero \.overview-hero__title span\s*\{[^}]*linear-gradient\(100deg, #6BE3E5 0%, #76CFF3 48%, #B2A0FF 100%\)/);
  assert.match(css, /#root \.overview-hero \.overview-hero__primary-action\s*\{[^}]*linear-gradient\(105deg, #73E4E1 0%, #76D4F0 47%, #A79AFF 100%\)/);
  assert.match(css, /#root \.overview-hero \.pulse-orbit__link\s*\{\s*width: min\(49%, 250px\)/,
    'desktop orbit labels get enough width to avoid awkwardly splitting names');
  assert.match(css, /#root \.overview-hero \.pulse-orbit__link--news \.pulse-orbit__link-title\s*\{[^}]*white-space: nowrap/,
    'the long Publications label remains a single word on tablet and desktop');
  assert.match(css, /background-size: 100% 100%, 100% 100% !important;\s*background-repeat: no-repeat !important;/,
    'the hero glow is a smooth wash, not a repeating stripe texture');
  assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?#root \.overview-hero \.pulse-orbit__mobile-scene\s*\{\s*display: block !important;/);
  assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1023px\)\s*\{\s*#root \.overview-hero \.overview-hero__visual \.pulse-orbit\s*\{\s*width: min\(100%, 320px\) !important;/,
    'tablet orbit has enough width for its three destination labels');
  assert.match(app, /<motion\.div className="overview-hero__visual"[^>]*>\s*<PulseOrbit \/>\s*<p className="page-signal-intro__route-legend">/,
    'the route legend sits with the orbit and does not collide with the hero copy');
  assert.match(css, /--bg-page:\s*#07162D;[\s\S]*?--card-bg:\s*#0D2140;/,
    'the site uses the same deep-navy palette as the dashboard hero');
  assert.match(app, /<OverviewTopics \/>\s*<StaticMarketSnapshot \/>/,
    'navigation cards appear immediately after the hero banner');
});

test('hero brand mark is centered, unclipped, and pulses in sync with the primary CTA', () => {
  assert.match(css, /#root \.overview-hero \.pulse-orbit__center\s*\{[\s\S]*?overflow: visible !important/);
  assert.match(css, /#root \.overview-hero \.pulse-orbit__brand\s*\{[\s\S]*?animation: hero-mark-breathe 3\.2s ease-in-out infinite/);
  assert.match(css, /#root \.overview-hero \.overview-hero__primary-action\s*\{\s*animation: hero-action-breathe 3\.2s ease-in-out infinite/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?#root \.overview-hero \.pulse-orbit__center\s*\{[^}]*left: 50% !important/);
});

test('hero body copy and CTA foregrounds retain WCAG AA contrast across their gradients', () => {
  for (const background of ['#0B1830', '#102243', '#111D3C']) {
    for (const foreground of ['#F5F8FF', '#C7D4E9']) {
      assert.ok(contrast(foreground, background) >= 4.5,
        `${foreground} on ${background} should meet WCAG AA`);
    }
  }
  for (const background of ['#73E4E1', '#76D4F0', '#A79AFF']) {
    assert.ok(contrast('#07182E', background) >= 4.5,
      `dark CTA label on ${background} should meet WCAG AA`);
  }
});
