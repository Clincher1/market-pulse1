// Responsive layout regression, deterministic missing-data states, no provider
// writes or live-data claims. Run a dev/preview server at LAYOUT_ORIGIN first.
// Isolated browser tooling: .local/feature-browser (not application dependencies).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '../.local/feature-browser/node_modules/playwright/index.mjs';
import binary from '../.local/feature-browser/node_modules/@sparticuz/chromium/build/index.js';
const origin = process.env.LAYOUT_ORIGIN || 'http://localhost:5173';
const output = process.env.LAYOUT_OUTPUT || '.local/layout-review';
const live = process.env.LAYOUT_LIVE === '1';
await fs.mkdir(output, { recursive: true });
const report = { scope: live ? 'Live responsive layout only; not source or performance acceptance.' : 'Responsive layout with unavailable-data states; not live source or performance acceptance.', cases: [], failures: [], clipping: [] };
const paths = process.env.LAYOUT_PATHS?.split(',') || ['/', '/passport', '/russia', '/world', '/brief', '/news', '/guide', '/about', '/status'];
for (const round of ['A', 'B']) {
    for (const width of [320, 360, 639, 768, 900, 1024, 1280, 1536]) {
      const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(arg => arg !== '--single-process'), headless: true });
      try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: round === 'A' ? 'reduce' : 'no-preference' });
      await context.route('**/*', route => {
        const request = route.request();
        const url = request.url();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || url.includes('/functions/v1/')) return route.abort();
        return live || url.startsWith(origin) || url.startsWith('ws:') ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      for (const path of paths) {
        try {
          await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
          await page.locator('h1').waitFor();
          if (process.env.LAYOUT_EXPECTED_ENTRY) {
            const entry = await page.locator('script[type="module"][src]').first().getAttribute('src');
            assert.ok(entry.includes(process.env.LAYOUT_EXPECTED_ENTRY), `Unexpected deployed entry: ${entry}`);
          }
          await page.waitForTimeout(round === 'A' ? 120 : 650);
          const layout = await page.evaluate(() => {
            const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
            const contains = (a, b) => a.left <= b.left + 1 && a.right >= b.right - 1 && a.top <= b.top + 1 && a.bottom >= b.bottom - 1;
            const header = document.querySelector('.page-signal-intro');
            const art = document.querySelector('.page-signal-intro__art');
            const content = document.querySelector('.page-signal-intro__content');
            const caption = document.querySelector('.page-signal-intro__art-caption');
            const logo = document.querySelector('.pulse-orbit');
            const intro = header ? { header: box(header), art: box(art), drawing: box(art.querySelector('svg')), drawingOverflow: getComputedStyle(art.querySelector('svg')).overflow, content: box(content), caption: box(caption), captionVisible: getComputedStyle(caption).display !== 'none' && contains(box(header), box(caption)), separate: box(art).left >= box(content).right - 1 || box(art).top >= box(content).bottom - 1 } : null;
            const clipped = [];
            const walk = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walk.nextNode())) {
              const text = node.textContent.trim();
              if (!text || node.parentElement.closest('[aria-hidden="true"],svg,script,style,[hidden]')) continue;
              const range = document.createRange(); range.selectNodeContents(node);
              for (const r of range.getClientRects()) {
                if (r.width < 1 || r.height < 1) continue;
                for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
                  const s = getComputedStyle(p), b = p.getBoundingClientRect();
                  if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' && Number(s.webkitLineClamp) > 0) break;
                  const x = ['hidden', 'clip'].includes(s.overflowX) && (r.left < b.left - 2 || r.right > b.right + 2);
                  const y = ['hidden', 'clip'].includes(s.overflowY) && (r.top < b.top - 2 || r.bottom > b.bottom + 2);
                  if (x || y) { clipped.push({ text: text.slice(0, 100), element: node.parentElement.className, ancestor: p.className, x, y }); break; }
                }
              }
            }
            return { overflow: document.documentElement.scrollWidth > innerWidth, intro, logo: logo ? box(logo) : null, clipped };
          });
          assert.equal(layout.overflow, false, 'Page horizontal overflow');
          if (layout.intro) {
            assert.equal(layout.intro.captionVisible, true, 'Caption clipped/hidden');
            assert.equal(layout.intro.separate, true, 'Artwork overlaps heading text');
            assert.ok(layout.intro.caption.top >= layout.intro.drawing.bottom, 'Caption intrudes into drawing');
            assert.equal(layout.intro.drawingOverflow, 'hidden', 'Animated orbit can escape into caption');
          }
          if (layout.logo) assert.ok(layout.logo.width <= (width < 640 ? 280 : width < 1024 ? 400 : 420) + 1, 'Oversized overview artwork');
          report.cases.push({ round, width, path, intro: layout.intro, logo: layout.logo });
          for (const clip of layout.clipped) report.clipping.push({ round, width, path, ...clip });
          if (round === 'A' && [360, 768, 1280].includes(width) && (!live || ['/', '/world', '/guide'].includes(path))) await page.screenshot({ path: `${output}/after-${path === '/' ? 'home' : path.slice(1)}-${width}.png` });
          await fs.writeFile(`${output}/layout-report.json`, JSON.stringify(report, null, 2));
        } catch (error) { report.failures.push({ round, width, path, error: error.message }); }
      }
      await context.close();
      } finally { await browser.close(); }
    }
}
await fs.writeFile(`${output}/layout-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ cases: report.cases.length, failures: report.failures, clipping: [...new Map(report.clipping.map(x => [JSON.stringify([x.width,x.path,x.text,x.ancestor]),x])).values()] }, null, 2));
if (report.failures.length || report.clipping.length) process.exitCode = 1;
