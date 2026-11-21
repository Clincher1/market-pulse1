// Read-only UI measurements. No analytics SDK is shipped to the application.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '../.local/feature-browser/node_modules/playwright/index.mjs';
import binary from '../.local/feature-browser/node_modules/@sparticuz/chromium/build/index.js';
import AxeBuilder from '../.local/feature-browser/node_modules/@axe-core/playwright/dist/index.mjs';
const origin = process.env.UI_ORIGIN || 'https://market-pulse1-eta.vercel.app';
const output = process.env.UI_OUTPUT || '.local/ui-ux-audit';
const expected = process.env.UI_EXPECTED_ENTRY;
await fs.mkdir(output, { recursive: true });
const report = { scope: 'UI/UX measurements, not numeric-source or performance certification', cases: [], errors: [], links: [] };
const paths = ['/', '/passport', '/russia', '/world', '/brief', '/news', '/guide', '/about', '/status'];
const allLinks = new Set();
for (const width of [360, 768, 1024, 1440]) {
  const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(a => a !== '--single-process'), headless: true });
  try {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width <= 1024 });
    await context.route('**/*', route => {
      const req = route.request();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || req.url().includes('/functions/v1/')) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    for (const path of paths) {
      try {
        const response = await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 60000 });
        assert.equal(response.status(), 200);
        await page.locator('h1').waitFor();
        if (expected) assert.ok((await page.locator('script[type="module"][src]').first().getAttribute('src')).includes(expected));
        // Reveal content-visibility subtrees by actual scrolling before scanning.
        for (const section of await page.locator('main section').all()) {
          if (await section.isVisible()) await section.scrollIntoViewIfNeeded();
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metrics = await page.evaluate(() => {
          const visible = el => !el.closest('.sr-only,[aria-hidden="true"]') && el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) && el.getBoundingClientRect().width > 0;
          const box = el => { const b = el?.getBoundingClientRect(); return b ? { x: b.x, width: b.width, height: b.height } : null; };
          const selector = el => el.id ? `#${el.id}` : el.classList.length ? `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}` : el.tagName.toLowerCase();
          const controls = [...document.querySelectorAll('a[href],button,summary,select,input')].filter(visible).filter(el => !el.closest('details:not([open])') || el.tagName === 'SUMMARY');
          const small = controls.filter(el => {
            const r = el.getBoundingClientRect();
            return (r.width < 43.5 || r.height < 43.5) && !el.closest('p, td');
          }).map(el => ({ selector: selector(el), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 100), ...box(el), disabled: el.matches(':disabled') }));
          const smallText = [...document.querySelectorAll('main p,main summary,main button,.page-signal-intro__path-label,.page-signal-intro__art-caption')].filter(visible).filter(el => parseFloat(getComputedStyle(el).fontSize) < 12).slice(0, 35).map(el => ({ selector: selector(el), text: el.textContent.trim().slice(0, 85), fontSize: getComputedStyle(el).fontSize, color: getComputedStyle(el).color }));
          const bodyLines = [...document.querySelectorAll('main p')].filter(visible).filter(el => el.textContent.length > 120).map(el => ({ selector: selector(el), width: el.clientWidth, font: parseFloat(getComputedStyle(el).fontSize), lineHeight: getComputedStyle(el).lineHeight })).filter(el => el.width / el.font > 48);
          return {
            title: document.title, description: document.querySelector('meta[name="description"]')?.content,
            h1: [...document.querySelectorAll('h1')].map(el => el.textContent),
            overflow: document.documentElement.scrollWidth > innerWidth,
            header: box(document.querySelector('.site-header__inner')), main: box(document.querySelector('main')), footer: box(document.querySelector('.site-footer__panel')),
            heroCTA: box(document.querySelector('.overview-hero__primary-action')),
            font: getComputedStyle(document.body).fontFamily, smallTargets: small, smallText, longLines: bodyLines,
            links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
            imagesMissingAlt: [...document.images].filter(i => !i.hasAttribute('alt')).map(i => i.getAttribute('src')),
          };
        });
        metrics.links.forEach(href => { if (href.startsWith('/') && !href.startsWith('//')) allLinks.add(href); });
        delete metrics.links;
        const axe = await new AxeBuilder({ page }).withRules(['color-contrast', 'button-name', 'link-name', 'image-alt', 'label', 'heading-order', 'landmark-one-main']).analyze();
        const accessibility = axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
        const focus = [];
        for (const locator of [page.locator('button').filter({ hasText: 'Разделы' }), page.locator('.overview-hero__primary-action')]) {
          if (await locator.count() && await locator.first().isVisible()) {
            await locator.first().focus();
            focus.push(await locator.first().evaluate(el => ({ text: el.textContent.trim(), outline: getComputedStyle(el).outline, shadow: getComputedStyle(el).boxShadow })));
          }
        }
        let mobileEscape = null;
        const toggle = page.locator('.site-header__mobile-toggle');
        if (await toggle.isVisible()) {
          await toggle.click();
          await page.keyboard.press('Escape');
          mobileEscape = { closes: await toggle.getAttribute('aria-expanded') === 'false' };
          // Restore state without relying on the behavior under test.
          if (!mobileEscape.closes) await page.getByRole('button', { name: 'Закрыть меню', exact: true }).click();
        }
        report.cases.push({ path, width, ...metrics, accessibility, focus, mobileEscape });
        if ([360, 1440].includes(width) && ['/', '/world', '/guide'].includes(path)) await page.screenshot({ path: `${output}/${path === '/' ? 'home' : path.slice(1)}-${width}.png` });
      } catch (error) { report.errors.push({ path, width, message: error.message }); }
      await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
    }
    await context.close();
  } finally { await browser.close(); }
}
// Same-origin destinations and fragments only. Publisher link access is a
// separate audit: 403 cannot honestly be called a broken link.
for (const href of allLinks) {
  try {
    const url = new URL(href, origin);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    report.links.push({ href, status: response.status });
  } catch (error) { report.links.push({ href, error: error.message }); }
}
await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors, axe: report.cases.flatMap(c => c.accessibility.map(v => ({ path: c.path, width: c.width, ...v }))), smallTargets: report.cases.map(c => ({ path: c.path, width: c.width, count: c.smallTargets.length })), links: report.links }, null, 2));
if (report.errors.length) process.exitCode = 1;
