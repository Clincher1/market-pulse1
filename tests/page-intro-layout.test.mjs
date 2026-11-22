import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = await readFile('src/brand-refresh.css', 'utf8');
function rules(selector) {
  return [...css.matchAll(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}', 'g'))].map(match => match[1]);
}
test('inner-page artwork participates in layout; caption stays outside clipped animated SVG', () => {
  const art = rules('.page-signal-intro__art');
  assert.match(art[0], /position:\s*relative/);
  assert.match(art[0], /display:\s*grid/);
  for (const rule of art) assert.doesNotMatch(rule, /position:\s*absolute|transform:|(?:^|[;\n])\s*(?:top|right):/);
  const svg = rules('.page-signal-intro__art svg')[0];
  assert.match(svg, /height:\s*auto/);
  assert.match(svg, /overflow:\s*hidden/);
  for (const caption of rules('.page-signal-intro__art-caption')) {
    assert.doesNotMatch(caption, /position:\s*absolute|display:\s*none|white-space:\s*nowrap/);
  }
});
test('overview orbit is capped at compact sizes without truncating link labels', () => {
  const widths = rules('.pulse-orbit').map(rule => rule.match(/width:\s*min\(100%,\s*(\d+)px\)/)?.[1]);
  assert.deepEqual(widths, ['420', '400', '280']);
  assert.match(css, /\.pulse-orbit__link-title,\s*\.pulse-orbit__link-detail\s*\{[^}]*white-space:\s*normal/);
  assert.ok(rules('.pulse-orbit__center-caption').some(rule => /max-width:\s*88%/.test(rule)));
});
