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
  const shell = scroller.closest('.table-scroll-affordance');
  const hints = [...shell.querySelectorAll(':scope > .table-scroll-affordance__hint')];
  assert.ok(shell.classList.contains('table-scroll-affordance'));
  assert.equal(scroller.parentElement.className, 'table-scroll-affordance__frame');
  assert.equal(shell.dataset.scrollable, 'true');
  assert.equal(shell.dataset.moreRight, 'true');
  assert.equal(hints.length, 2);
  assert.deepEqual(hints.map(hint => hint.textContent), [
    '← таблица прокручивается вбок →', '← таблица прокручивается вбок →',
  ]);
  assert.equal(scroller.querySelector('td').textContent, 'unchanged cell');

  scroller.scrollLeft = 24;
  scroller.dispatchEvent(new dom.window.Event('scroll'));
  assert.ok(hints.every(hint => hint.dataset.dismissed === 'true'));
  assert.ok(hints.every(hint => hint.getAttribute('aria-hidden') === 'true'));
  assert.equal(shell.dataset.moreRight, 'true');

  scroller.scrollLeft = 360;
  scroller.dispatchEvent(new dom.window.Event('scroll'));
  assert.equal(shell.dataset.moreRight, 'false');
  stop();
  dom.window.close();
});

test('pre-rendered top and bottom hints are reused and dismissed together without nesting another shell', () => {
  const hint = '<p class="table-scroll-affordance__hint">← таблица прокручивается вбок →</p>';
  const dom = new JSDOM(`<!doctype html><body><div class="table-scroll-affordance" data-scrollable="true">${hint}<div class="table-scroll-affordance__frame"><div id="area" style="overflow-x:auto"><table><tbody><tr><td>cell</td></tr></tbody></table></div></div>${hint}</div></body>`);
  const { document } = dom.window;
  const scroller = document.querySelector('#area');
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, value: 360 },
    scrollWidth: { configurable: true, value: 720 },
  });
  const stop = installTableScrollAffordances(document);
  const shell = document.querySelector('.table-scroll-affordance');
  const hints = [...shell.querySelectorAll('.table-scroll-affordance__hint')];
  assert.equal(document.querySelectorAll('.table-scroll-affordance').length, 1);
  assert.equal(hints.length, 2);
  scroller.scrollLeft = 10;
  scroller.dispatchEvent(new dom.window.Event('scroll'));
  assert.ok(hints.every(item => item.dataset.dismissed === 'true'));
  stop();
  dom.window.close();
});

test('mobile CSS keeps readable scroll hints and a solid, non-interactive edge marker', async () => {
  const css = await readFile(new URL('../src/lib/table-scroll-affordance.css', import.meta.url), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  assert.match(css, /font-size:\s*0\.875rem/);
  assert.match(css, /font-weight:\s*700/);
  assert.match(css, /color:\s*#0e7490/);
  assert.match(css, /@keyframes\s+table-scroll-hint-pulse/);
  assert.match(css, /animation:\s*table-scroll-hint-pulse\s+3\.2s/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /background-color:\s*var\(--card-bg\)/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
  assert.match(css, /\.table-scroll-affordance\[data-more-right="true"\].*\.table-scroll-affordance__frame::after/);
  assert.match(css, /\.table-scroll-affordance\[data-scrollable="true"\].*\.table-scroll-affordance__hint/);
  assert.match(css, /\.table-scroll-affordance__hint\[data-dismissed="true"\]\s*\{[^}]*opacity:\s*0/s);
});
