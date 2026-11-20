// Read-only, release-specific acceptance audit. No writer/snapshot endpoints are called.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '../.local/production-browser/node_modules/playwright/index.mjs';
const origin = 'https://market-pulse1-eta.vercel.app';
const selfcheck = 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/selfcheck';
const output = '.local/production-audit';
await fs.mkdir(output, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const routes = ['/', '/passport', '/russia', '/world', '/brief', '/news', '/memory', '/guide', '/about', '/status'];
const browser = await chromium.launch({ headless: true });
let previousCheckAt = 0;
const rounds = [];
try {
  for (const round of ['A', 'B']) {
    const result = { round, started: new Date().toISOString(), pages: [], failures: [] };
    rounds.push(result);
    for (const width of [360, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: round === 'A' ? 'reduce' : 'no-preference' });
      // Fail closed if a future UI refactor attempts a write during this audit.
      await context.route('**/*', (route) => {
        const request = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || request.url().includes('/snapshot-morning')) {
          result.failures.push(`Blocked non-read request: ${request.method()} ${new URL(request.url()).pathname}`);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => result.failures.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 500) result.failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
      });
      for (const path of routes) {
        result.currentPage = { path, width };
        const response = await page.goto(origin + path + `?acceptance=${round}-${width}`, { waitUntil: 'networkidle', timeout: 90000 });
        assert.equal(response.status(), 200, path);
        await page.locator('main').waitFor();
        await page.waitForTimeout(1200);
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          overflowNodes: [...document.querySelectorAll('main *')].map((n) => ({tag:n.tagName,cls:n.getAttribute('class'),text:n.textContent.slice(0,100),right:Math.round(n.getBoundingClientRect().right),width:Math.round(n.getBoundingClientRect().width)})).filter((n) => n.right > innerWidth + 1).slice(-15),
          text: document.querySelector('main').innerText.length,
          headings: document.querySelectorAll('main h1,main h2').length,
        }));
        assert.equal(metrics.overflow, false, `${width} ${path}: horizontal overflow ${JSON.stringify(metrics.overflowNodes)}`);
        assert.ok(metrics.text > 80 && metrics.headings > 0, `${path}: empty main`);
        const body = await page.locator('main').innerText();
        if (path === '/passport') {
          assert.ok(body.includes('−3,02 %') && body.includes('2026-11-19'), 'Verified snapshot Gold return/base missing');
          assert.ok(body.includes('$3,556.3'), 'Stored morning price changed');
          await page.getByText('Исходные проценты снимков · до проверки золота', { exact: true }).click();
          assert.ok((await page.locator('main').innerText()).includes('−4,50 %'), 'Original Gold percentage unavailable');
        }
        if (path === '/memory') {
          for (const text of ['150', '106', '44', 'нет достаточной истории исходного инструмента', 'FRED DCOILBRENTEU', 'FRED SP500']) assert.ok(body.includes(text), `Missing archive fact: ${text}`);
          assert.ok(!body.includes('Торговый горизонт завершился'), 'Unavailable history is incorrectly still pending');
        }
        if (path === '/guide') assert.ok(body.includes('Производный процент золота проверяется отдельно'));
        if (path === '/news') {
          for (const [testId, count] of [['news-show-all', null], ['news-show-half', null], ['news-show-latest', 4]]) {
            await page.getByTestId(testId).click();
            const text = await page.getByTestId('news-visible-status').innerText();
            assert.match(text, /На экране \d+ из \d+/);
            if (count) assert.match(text, /На экране 4 из/);
          }
        }
        if (path === '/world') {
          const favorite = page.getByRole('group', { name: 'Выбрать избранные инструменты' }).getByRole('button', { name: 'Gold', exact: true });
          if (await favorite.getAttribute('aria-pressed') !== 'true') await favorite.click();
          await page.reload({ waitUntil: 'networkidle' });
          assert.equal(await favorite.getAttribute('aria-pressed'), 'true', 'Favorite did not persist');
          await page.locator('.desk-controls select').nth(1).selectOption('100');
          assert.ok((await page.locator('.desk-table').innerText()).includes('Индекс в конце'));
          await page.locator('.desk-controls select').nth(0).selectOption('500');
        }
        if (['/passport', '/memory', '/brief', '/world', '/russia'].includes(path)) {
          await page.screenshot({ path: `${output}/${round}-${width}-${path.slice(1)}.png`, fullPage: false });
        }
        result.pages.push({ path, width, ...metrics });
      }
      if (width === 360) {
        await page.goto(origin + '/world', { waitUntil: 'networkidle' });
        const active = page.locator('.mobile-quick-nav__link[aria-current="page"]');
        const animation = await active.evaluate((node) => getComputedStyle(node).animationName);
        assert.ok(round === 'A' ? animation === 'none' : animation.includes('mobile-quick-route-pulse'), `Wrong reduced-motion pulse: ${animation}`);
        const box = await active.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(200);
        assert.ok((await active.evaluate((node) => getComputedStyle(node).filter)).includes('brightness(1.17)'), 'Tap does not brighten');
        await page.mouse.up();
        await page.waitForTimeout(400);
        await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
        const nav = page.getByRole('navigation', { name: 'Мобильная навигация' });
        await nav.locator('a[href="/news"]').click();
        await page.waitForURL('**/news');
        assert.equal(await nav.count(), 0);
        assert.ok(await page.locator('a[aria-current="page"]:visible').count() > 0);
      }
      await context.close();
    }
    assert.deepEqual(result.failures, [], 'Live page/runtime errors');
    // Respect the production five-minute limiter, including a run already in progress.
    await pause(Math.max(0, previousCheckAt + 305000 - Date.now()));
    let healthResponse = await fetch(selfcheck);
    assert.ok(healthResponse.ok, `Selfcheck HTTP ${healthResponse.status}`);
    let health = await healthResponse.json();
    if (health.skipped) {
      await pause(Math.max(1000, Date.parse(health.checked_at) + 305000 - Date.now()));
      healthResponse = await fetch(selfcheck);
      assert.ok(healthResponse.ok);
      health = await healthResponse.json();
    }
    assert.ok(!health.skipped && health.ok, 'A cached result is not an independent selfcheck');
    assert.ok(Object.values(health.checks).every((check) => check.ok));
    previousCheckAt = Date.parse(health.checked_at);
    result.health = health;
    result.finished = new Date().toISOString();
    await fs.writeFile(`${output}/round-${round}.json`, JSON.stringify(result, null, 2));
    console.log(`PASS round ${round}: ${result.pages.length} live route/viewport pairs; selfcheck ${health.checked_at}; ${Object.keys(health.checks).length} checks`);
  }
} catch (error) {
  const detail = `${error.stack || error} | page=${JSON.stringify(rounds.at(-1)?.currentPage)} | failures=${JSON.stringify(rounds.at(-1)?.failures)}`;
  console.error(`::error::${detail.replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D')}`);
  throw error;
} finally {
  await fs.writeFile(`${output}/summary.json`, JSON.stringify(rounds, null, 2));
  await browser.close();
}
