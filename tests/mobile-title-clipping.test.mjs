import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('src/brand-refresh.css', 'utf8');
const mainOffsets = [...css.matchAll(/\.site-shell > main\s*\{([^}]+)\}/g)].map(match => match[1]);
const lastOffset = mainOffsets.at(-1) ?? '';

test('390px section headings start below the fixed two-row header', () => {
  const mobileOffsetRule = css.match(/@media\s*\(max-width:\s*1279px\)\s*\{\s*\.site-shell > main\s*\{([^}]+)\}/);
  assert.ok(mobileOffsetRule, 'mobile fixed-header offset is defined');
  const padding = mobileOffsetRule[1].match(/padding-top:\s*calc\((\d+)px\s*\+\s*var\(--space-2\)\)/);
  assert.ok(padding, 'mobile top padding includes header clearance and breathing room');

  // The 390px header is 125px tall (brand row + one horizontal nav row);
  // --space-2 adds another 16px so the intro title cannot render under it.
  assert.ok(Number(padding[1]) >= 125, `header clearance ${padding[1]}px must cover the 125px header`);
  assert.match(lastOffset, /padding-top:\s*calc\(125px\s*\+\s*var\(--space-2\)\)/);
});

test('page intro title has no negative top offset or clipping of its content wrapper', () => {
  const titleRule = css.match(/\.page-signal-intro__title\s*\{([^}]+)\}/);
  assert.ok(titleRule, 'page title styles exist');
  assert.doesNotMatch(titleRule[1], /margin(?:-top|-block-start):\s*-/);
  const contentRule = css.match(/\.page-signal-intro__content\s*\{([^}]+)\}/);
  assert.ok(contentRule, 'page title content wrapper exists');
  assert.doesNotMatch(contentRule[1], /overflow:\s*(?:hidden|clip)/);
});
