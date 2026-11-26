import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const directory = new URL('../.local/table-scroll-affordance-tests/', import.meta.url);
await mkdir(directory, { recursive: true });
const output = new URL('table-scroll-affordance.cjs', directory).pathname;
await build({
  entryPoints: ['src/lib/table-scroll-affordance.ts'], outfile: output,
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
});
const { installTableScrollAffordances } = createRequire(import.meta.url)(output);

test('horizontal table wrappers get the fade/hint, and the hint dismisses on first horizontal scroll', () => {
  const dom = new JSDOM('<!doctype html><body><div id="area" style="overflow-x:auto"><table><tbody><tr><td>unchanged cell</td></tr></tbody></table></div></body>');
  const { document } = dom.window;
  const scroller = document.querySelector('#area');
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, value: 360 },
    scrollWidth: { configurable: true, value: 720 },
  });
  const stop = installTableScrollAffordances(document);
  const shell = scroller.parentElement;
  const hint = shell.querySelector('.table-scroll-affordance__hint');
  assert.ok(shell.classList.contains('table-scroll-affordance'));
  assert.equal(shell.dataset.scrollable, 'true');
  assert.equal(shell.dataset.moreRight, 'true');
  assert.equal(hint.textContent, '← таблица прокручивается вбок →');
  assert.equal(scroller.querySelector('td').textContent, 'unchanged cell');

  scroller.scrollLeft = 24;
  scroller.dispatchEvent(new dom.window.Event('scroll'));
  assert.equal(hint.dataset.dismissed, 'true');
  assert.equal(hint.getAttribute('aria-hidden'), 'true');
  assert.equal(shell.dataset.moreRight, 'true');

  scroller.scrollLeft = 360;
  scroller.dispatchEvent(new dom.window.Event('scroll'));
  assert.equal(shell.dataset.moreRight, 'false');
  stop();
  dom.window.close();
});

test('only mobile CSS shows the subtle non-interactive edge fade and muted hint', async () => {
  const css = await readFile(new URL('../src/lib/table-scroll-affordance.css', import.meta.url), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /linear-gradient\(90deg/);
  assert.match(css, /\.table-scroll-affordance\[data-more-right="true"\]::after/);
  assert.match(css, /\.table-scroll-affordance\[data-scrollable="true"\].*\.table-scroll-affordance__hint/);
  assert.match(css, /\.table-scroll-affordance__hint\[data-dismissed="true"\]\s*\{[^}]*opacity:\s*0/s);
});
