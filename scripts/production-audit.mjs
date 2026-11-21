// Read-only production audit. No Edge Functions, writers, healing or snapshots are invoked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '../.local/production-browser/node_modules/playwright/index.mjs';
const origin = 'https://market-pulse1-eta.vercel.app';
import AxeBuilder from '../.local/production-browser/node_modules/@axe-core/playwright/dist/index.mjs';
const sb = 'https://hekzplfftannlzwvgwwm.supabase.co';
const clientSource = await fs.readFile('src/lib/supabase.ts', 'utf8');
const publicKey = clientSource.match(/'(sb_publishable_[^']+)'/)[1];
const headers = { apikey: publicKey };
async function readPublic(path) {
  const response = await fetch(`${sb}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, `${path.split('?')[0]} HTTP ${response.status}`);
  return response.json();
}
const output = '.local/production-audit';
await fs.mkdir(output, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const routes = ['/', '/passport', '/russia', '/world', '/brief', '/news', '/memory', '/guide', '/about', '/status', '/memory/', '/#market-memory', '/#guide-memory', '/memory/old'];
const browser = await chromium.launch({ headless: true });

const rounds = [];
try {
  for (const round of ['A', 'B']) {
    const result = { round, started: new Date().toISOString(), pages: [], failures: [], accessibility: [], consoleErrors: [], httpErrors: [], requestFailures: [] };
    rounds.push(result);
    const htmlResponse = await fetch(origin, { signal: AbortSignal.timeout(30000) });
    assert.ok(htmlResponse.ok);
    const html = await htmlResponse.text();
    assert.ok(html.includes('public-facts-1'), 'Old social metadata is deployed');
    assert.doesNotMatch(html, /паспорт дня и архив/);
    for (const path of ['site.webmanifest', 'og-image.svg', 'logo.svg', 'og-image.png']) {
      const response = await fetch(`${origin}/${path}?acceptance=${round}`, { signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200, path);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(bytes.equals(await fs.readFile(`public/${path}`)), `Stale or unexpected public asset: ${path}`);
      if (path === 'og-image.png') result.socialCard = {
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
      };
    }

    for (const width of [360, 768, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: round === 'A' ? 'reduce' : 'no-preference' });
      // Fail closed if a future UI refactor attempts a write during this audit.
      await context.route('**/*', (route) => {
        const request = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || request.url().includes('/functions/v1/')) {
          result.failures.push(`Blocked non-read request: ${request.method()} ${new URL(request.url()).pathname}`);
          return route.abort();
        }
        if (/\/rest\/v1\/market_memory|\/functions\/v1\/market-memory/.test(request.url())) {
          result.failures.push('Withdrawn forecast archive was queried');
          return route.abort();
        }
        if (request.url().includes('/rest/v1/daily_snapshots?')) {
          result.failures.push('Raw snapshot archive was queried');
          return route.abort();
        }
        if (request.url().includes('/rest/v1/daily_snapshots_public_v1')) {
          assert.ok(new URL(request.url()).searchParams.get('date')?.startsWith('eq.'), 'Historical passport fetch is still public');
        }
        return route.continue();
      });
      const page = await context.newPage();
      async function checkHistoryTable() {
        const region = page.getByRole('region', { name: /^Таблица наблюдений / }).first();
        await region.waitFor();
        assert.equal(await region.getAttribute('tabindex'), '0');
        await region.focus();
        await region.evaluate(n => { n.scrollTop = 0; });
        if (await region.evaluate(n => n.scrollHeight > n.clientHeight)) {
          await region.press('ArrowDown');
          await page.waitForTimeout(300);
          assert.ok(await region.evaluate(n => n.scrollTop > 0), 'History table did not scroll from keyboard');
        }
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        result.accessibility.push({ path: new URL(page.url()).pathname + ':expanded-history', width, violations: axe.violations });
        assert.deepEqual(axe.violations.map(v => v.id), [], 'Expanded table accessibility');
      }
      let navigationInProgress = false;
      async function navigate(url, options) {
        navigationInProgress = true;
        try { return await page.goto(url, options); }
        finally { navigationInProgress = false; }
      }
      page.on('console', (message) => { if (message.type() === 'error') result.consoleErrors.push(message.text().slice(0, 600)); });
      page.on('requestfailed', (request) => {
        const error = request.failure()?.errorText;
        result.requestFailures.push({ path: new URL(request.url()).pathname, error,
          expectedNavigationAbort: error === 'net::ERR_ABORTED' && navigationInProgress });
      });
      page.on('pageerror', (error) => result.failures.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400) result.httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
        if (response.status() >= 500) result.failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
      });
      for (const path of routes) {
        result.currentPage = { path, width };
        try {
        const target = new URL(path, origin);
        target.searchParams.set('acceptance', `${round}-${width}`);
        // A bookmark is a fresh document load. Hash-only navigation from the previous
        // redirected root can legitimately return null instead of an HTTP response.
        await navigate('about:blank');
        const response = await navigate(target.href, { waitUntil: 'networkidle', timeout: 90000 });
        assert.equal(response.status(), 200, path);
        const rawHtml = await response.text();
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
        assert.equal(await page.locator('a[href="/memory"]').count(), 0, 'Retired archive is still advertised');
        for (const text of ['Исходные проценты снимков', 'Неисправленные значения для аудита', 'Архив ·']) {
          assert.ok(!body.includes(text), `Withdrawn content visible: ${text}`);
        }
        assert.equal(await page.locator('#market-memory, #daily-passport').count(), 0, 'A retired public block remains');
        if (path === '/passport') {
          assert.ok(body.includes('Сводка дня') && body.includes('Деньги бизнеса'), 'Verified replacement summary missing');
        }
        if (path === '/memory' || path.startsWith('/memory/')) {
          assert.equal(new URL(page.url()).pathname, '/', 'Old archive URL did not redirect');
        }
        if (path.startsWith('/#')) {
          assert.equal(new URL(page.url()).pathname, '/guide', 'Legacy archive bookmark did not reach guide');
          assert.equal(new URL(page.url()).hash, '');
        }
        if (path === '/guide') assert.ok(body.includes('записи не публикуются'));
        if (path === '/news') {
          for (const [testId, count] of [['news-show-all', null], ['news-show-half', null], ['news-show-latest', 4]]) {
            await page.getByTestId(testId).click();
            const text = await page.getByTestId('news-visible-status').innerText();
            assert.match(text, /На экране \d+ из \d+/);
            if (count) assert.match(text, /На экране 4 из/);
          }
        }
        if (path === '/russia') {
          await page.locator('summary').filter({ hasText: /^Все \d+ значений ряда$/ }).click();
          await checkHistoryTable();
        }
        if (path === '/world') {
          const favorite = page.getByRole('group', { name: 'Выбрать избранные инструменты' }).getByRole('button', { name: 'Gold', exact: true });
          if (await favorite.getAttribute('aria-pressed') !== 'true') await favorite.click();
          navigationInProgress = true;
          await page.reload({ waitUntil: 'networkidle' });
          navigationInProgress = false;
          assert.equal(await favorite.getAttribute('aria-pressed'), 'true', 'Favorite did not persist');
          await page.locator('.desk-controls select').nth(1).selectOption('100');
          assert.ok((await page.locator('.desk-table').innerText()).includes('Индекс в конце'));
          await page.locator('.desk-controls select').nth(0).selectOption('500');
          const region = page.getByRole('region', { name: 'Результаты сравнения инструментов — прокручиваемая таблица' });
          assert.equal(await region.getAttribute('tabindex'), '0');
          await region.focus();
          if (await region.evaluate(n => n.scrollWidth > n.clientWidth)) {
            await region.press('ArrowRight');
            await page.waitForTimeout(300);
            assert.ok(await region.evaluate(n => n.scrollLeft > 0), 'Keyboard did not scroll comparison table');
          }
          const goldTile = page.locator('#heat-tile-gold');
          assert.ok(!(await goldTile.innerText()).includes('нет свежей цены'), 'Valid gold quote was hidden for missing history');
          await goldTile.click();
          const goldPanel = page.getByRole('region', { name: 'Подробно об активе Gold' });
          await goldPanel.waitFor();
          assert.ok((await goldPanel.innerText()).includes('gold-api.com'), 'Gold provider missing from details');
          assert.ok(!(await goldPanel.innerText()).includes('Twelve Data'), 'Restricted fallback leaked into gold details');
          if (width === 360) {
            await goldPanel.scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${output}/${round}-${width}-gold.png`, fullPage: false });
          }
          await page.getByRole('button', { name: 'Свернуть панель актива' }).click();
          await page.locator('#heat-tile-sp500').click();
          await page.locator('summary').filter({ hasText: 'Проверить данные' }).click();
          await checkHistoryTable();
          await page.getByRole('button', { name: 'Свернуть панель актива' }).click();
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        }
        if (['/passport', '/memory', '/brief', '/world', '/russia'].includes(path)) {
          await page.screenshot({ path: `${output}/${round}-${width}-${path.slice(1)}.png`, fullPage: false });
        }
        const extra = await page.evaluate(() => ({
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content,
          canonical: document.querySelector('link[rel="canonical"]')?.href,
          lang: document.documentElement.lang,
          h1: [...document.querySelectorAll('main h1')].map(n => n.textContent),
          timing: performance.getEntriesByType('navigation').map(n => ({ ttfb: n.responseStart - n.requestStart, domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd })),
          externalHosts: [...new Set(performance.getEntriesByType('resource').map(n => new URL(n.name).host))],
          brokenImages: [...document.images].filter(n => n.complete && n.naturalWidth === 0).map(n => n.getAttribute('src')),
          body: document.querySelector('main').innerText,
        }));
        assert.deepEqual(extra.brokenImages, [], 'Broken images');
        assert.equal(extra.canonical, origin + new URL(page.url()).pathname, 'Canonical does not match route');
        if (!path.includes('#') && !path.startsWith('/memory')) {
          assert.ok(rawHtml.includes(`rel="canonical" href="${origin + new URL(page.url()).pathname}"`), 'Canonical absent in raw HTML');
        }
        if (!path.includes('#') && !path.startsWith('/memory')) {
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
          if (axe.violations.length) result.failures.push(`Accessibility ${width} ${path}: ${axe.violations.map(v=>v.id).join(', ')}`);
          result.accessibility.push({ path, width, violations: axe.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })) })) });
        }
        result.pages.push({ path, width, ...metrics, ...extra });
        } catch (error) {
          result.failures.push(`${width} ${path}: ${error.message}`);
          await page.screenshot({ path: `${output}/${round}-${width}-error-${result.pages.length}.png` }).catch(() => {});
        }
      }
      if (width === 360) {
        await navigate(origin + '/world', { waitUntil: 'networkidle' });
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
        await page.getByRole('button', { name: 'Разделы — открыть меню', exact: true }).click();
        const nav = page.getByRole('navigation', { name: 'Мобильная навигация' });
        navigationInProgress = true;
        await nav.locator('a[href="/news"]').click();
        await page.waitForURL('**/news');
        await page.waitForLoadState('networkidle');
        navigationInProgress = false;
        assert.equal(await nav.count(), 0);
        assert.ok(await page.locator('a[aria-current="page"]:visible').count() > 0);
      }
      navigationInProgress = true;
      await context.close();
    }
    // Observe existing scheduled evidence only. selfcheck can heal/write despite GET.
    result.healthObserved = (await readPublic('site_health?select=checked_at,ok,trigger,checks&order=checked_at.desc&limit=1'))[0];
    result.assets = await readPublic('cached_assets?select=id,name,price,change,as_of,updated_at,spark_dates,sparkline');
    result.healthIsIndependentRun = false;
    const gold = result.assets.find(a => a.id === 'gold');
    assert.ok(gold, 'Gold quote is missing');
    assert.equal(gold.sparkline.length, gold.spark_dates.length);
    if (!gold.sparkline.length) assert.equal(gold.change, null, 'Missing history fabricated a percent');
    result.goldAccumulation = { points: gold.sparkline.length, change: gold.change };
    for (const error of result.httpErrors) result.failures.push(`Browser HTTP ${error.status} ${error.path}`);
    for (const error of result.consoleErrors) result.failures.push(`Console: ${error}`);
    for (const error of result.requestFailures.filter(e => !e.expectedNavigationAbort)) result.failures.push(`Request: ${error.path} ${error.error}`);
    try {
      execFileSync(process.execPath, ['scripts/audit-http.mjs'], {
        stdio: 'inherit', timeout: 240000,
        env: { ...process.env, AUDIT_HTTP_OUTPUT: `${output}/http-${round}.json` },
      });
      result.httpAudit = JSON.parse(await fs.readFile(`${output}/http-${round}.json`, 'utf8'));
    } catch (error) { result.failures.push(`HTTP/rights/math audit failed: ${error.message}`); }
    if (round === 'A') await pause(65000);
    result.finished = new Date().toISOString();
    await fs.writeFile(`${output}/round-${round}.json`, JSON.stringify(result, null, 2));
    console.log(`AUDIT round ${round}: ${result.pages.length} completed route/viewport pairs; failures=${result.failures.length}; observed health=${result.healthObserved?.checked_at}`);
  }
  if (rounds.some(r => r.failures.length)) process.exitCode = 1;
} catch (error) {
  const detail = `${error.stack || error} | page=${JSON.stringify(rounds.at(-1)?.currentPage)} | failures=${JSON.stringify(rounds.at(-1)?.failures)}`;
  console.error(`::error::${detail.replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D')}`);
  throw error;
} finally {
  await fs.writeFile(`${output}/summary.json`, JSON.stringify(rounds, null, 2));
  await browser.close();
}
