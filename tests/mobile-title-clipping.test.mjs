import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('src/brand-refresh.css', 'utf8');
const visual = await readFile('src/visual-refresh.css', 'utf8');

test('page sections clear the fixed header at phone, tablet, and desktop breakpoints', () => {
  assert.match(css, /@media\s*\(max-width:\s*1279px\)\s*\{\s*\.site-shell > main\s*\{[^}]*padding-top:\s*calc\(125px\s*\+\s*var\(--space-2\)\)/,
    'tablet header clearance includes the 125px header plus a breathing gap');
  assert.match(visual, /#root \.site-shell > main\s*\{\s*padding-top:\s*calc\(223px\s*\+\s*var\(--space-2\)\)/,
    'two-row phone navigation reserves its full height');
  assert.match(visual, /@media\s*\(max-width:\s*359px\)\s*\{\s*#root \.site-shell > main\s*\{\s*padding-top:\s*calc\(295px\s*\+\s*var\(--space-2\)\)/,
    'three-row navigation on the narrowest phones reserves its full height');
});

test('page intro title has no negative top offset or clipping of its content wrapper', () => {
  const titleRule = css.match(/\.page-signal-intro__title\s*\{([^}]+)\}/);
  assert.ok(titleRule, 'page title styles exist');
  assert.doesNotMatch(titleRule[1], /margin(?:-top|-block-start):\s*-/);
  const contentRule = css.match(/\.page-signal-intro__content\s*\{([^}]+)\}/);
  assert.ok(contentRule, 'page title content wrapper exists');
  assert.doesNotMatch(contentRule[1], /overflow:\s*(?:hidden|clip)/);
});
