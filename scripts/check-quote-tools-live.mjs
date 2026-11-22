// Narrow, read-only post-publication smoke test. Not the full facts/TBT audit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '../.local/production-browser/node_modules/playwright/index.mjs';
const origin = 'https://market-pulse1-eta.vercel.app';
const output = 'docs/audit-evidence/quote-tools';
await fs.mkdir(output, { recursive: true });
const report = { scope: 'Live quote-copy and visible-chart CSV only. Does not certify all sources, all pages or mobile TBT.', cases: [], failures: [] };
function parseCsv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (ch === ';' && !quoted) { row.push(value); value = ''; }
    else if (ch === '\r' && text[i + 1] === '\n' && !quoted) { row.push(value); rows.push(row); row = []; value = ''; i++; }
    else value += ch;
  }
  assert.equal(quoted, false);
  return rows;
}
try {
  for (const round of ['A', 'B']) for (const width of [360, 1280]) {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
      await context.route('**/*', route => {
        const req = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || req.url().includes('/functions/v1/')) {
          report.failures.push(`Blocked write/function: ${req.method()} ${new URL(req.url()).pathname}`);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/world', { waitUntil: 'networkidle', timeout: 60000 });
      const entryBundle = await page.locator('script[type="module"][src]').first().getAttribute('src');
      assert.ok(entryBundle.includes('index-COHLqNDo.js'), `Unexpected publication: ${entryBundle}`);
      for (const id of ['usd-eur', 'sp500', 'brent', 'gold', 'btc']) {
        const tile = page.locator(`#heat-tile-${id}`);
        await tile.scrollIntoViewIfNeeded();
        await tile.click();
        const panel = page.locator('#asset-panel');
        const name = await panel.locator('h4').innerText();
        const displayedPrice = await panel.locator('p').first().locator('span').first().innerText();
        const copy = panel.getByRole('button', { name: 'Копировать котировку', exact: true });
        assert.ok(await copy.isEnabled(), `${id}: no copyable live quote`);
        const dataRequests = [];
        const track = req => { if (/\/rest\/|\/api\//.test(req.url())) dataRequests.push(new URL(req.url()).pathname); };
        page.on('request', track);
        await copy.click();
        await panel.getByText('Котировка с датой и источником скопирована.', { exact: true }).waitFor();
        const quote = await page.evaluate(() => navigator.clipboard.readText());
        assert.ok(quote.includes(name));
        assert.ok(quote.includes(`Значение: ${displayedPrice}`));
        assert.match(quote, /Дата наблюдения[^\n]*: \d{4}-\d{2}-\d{2}/);
        assert.match(quote, /Единица: .+/);
        assert.match(quote, /Источник: .+/);
        assert.match(quote, /Ссылка источника: https:\/\//);
        // History effect is already loading independently of copy; do not
        // count that existing request as a newly introduced provider fetch.
        page.off('request', track);
        const csvCases = [];
        await page.waitForFunction(() => !document.querySelector('#asset-panel')?.textContent.includes('Загружаем датированную историю'));
        const download = panel.getByRole('button', { name: 'Скачать точки графика · CSV', exact: true });
        if (await download.count() === 0) {
          assert.equal(id, 'gold', `${id}: public dated history unavailable`);
          csvCases.push({ unavailable: 'No dated graph yet; no CSV offered.' });
        } else for (const days of [30, 90, 180]) {
          const newRequests = [];
          const observe = req => { if (/\/rest\/|\/api\//.test(req.url())) newRequests.push(req.url()); };
          page.on('request', observe);
          await panel.locator(`#asset-history-range-${days}`).click();
          assert.ok(await download.isEnabled());
          const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
          const bytes = await fs.readFile(await file.path());
          assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
          const rows = parseCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''));
          const count = Number((await panel.locator('summary').innerText()).match(/·\s*(\d+)/)?.[1]);
          assert.equal(rows.length - 1, count);
          assert.ok(count >= 2);
          assert.equal(file.suggestedFilename(), `market-pulse-${id}-${rows[1][0]}-${rows.at(-1)[0]}.csv`);
          for (const [i, row] of rows.slice(1).entries()) {
            assert.match(row[0], /^\d{4}-\d{2}-\d{2}$/);
            assert.ok(Number(row[1].replace(',', '.')) > 0);
            assert.equal(row[3], name);
            assert.ok(row[2] && row[4] && row[5]);
            assert.match(row[7], /^https:\/\//);
            if (i) assert.ok(rows[i][0] < row[0]);
          }
          page.off('request', observe);
          assert.deepEqual(newRequests, [], 'Range/download introduced a data request');
          csvCases.push({ days, points: count, first: rows[1][0], last: rows.at(-1)[0] });
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
        if (id === 'brent' && round === 'B') await panel.screenshot({ path: `${output}/live-panel-${width}.png` });
        report.cases.push({ round, width, id, entryBundle, quote, csv: csvCases });
      }
      assert.deepEqual(errors, []);
      await context.close();
    } finally { await browser.close(); }
  }
} catch (error) { report.failures.push(error.stack); process.exitCode = 1; }
await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
