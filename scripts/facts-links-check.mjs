// Read-only production audit. Never calls writers, selfcheck or Edge Functions.
// Source-date comparisons are exact; different-time quotes are observations, not errors.
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { chromium } from '../.local/production-browser/node_modules/playwright/index.mjs';
const origin = 'https://market-pulse1-eta.vercel.app';
const sb = 'https://hekzplfftannlzwvgwwm.supabase.co';
const key = (await fs.readFile('src/lib/supabase.ts', 'utf8')).match(/'(sb_publishable_[^']+)'/)[1];
const output = process.env.FACTS_LINKS_OUTPUT || '.local/facts-links-audit';
await fs.mkdir(output, { recursive: true });
const window = new JSDOM('').window;
const xml = text => new window.DOMParser().parseFromString(text, 'text/xml');
const numeric = value => Number(String(value).replace(/[^\d.\-]/g, ''));
const iso = value => new Date(value).toISOString().slice(0, 10);
const report = { started: new Date().toISOString(), pages: [], links: [], sources: [], news: [], findings: [], unverified: [] };
const links = new Map();
function addLink(url, from) {
  try {
    const parsed = new URL(url, origin);
    if (!['https:', 'http:'].includes(parsed.protocol)) return;
    if (!links.has(parsed.href)) links.set(parsed.href, new Set());
    links.get(parsed.href).add(from);
  } catch { report.findings.push({ type: 'invalid-link', url, from }); }
}
async function get(url, init = {}) {
  return fetch(url, { ...init, headers: { 'user-agent': 'MarketPulse-ReadOnly-Audit/1.0', ...init.headers }, signal: AbortSignal.timeout(20000) });
}
async function json(url, publicData = false) {
  const r = await get(url, publicData ? { headers: { apikey: key } } : {});
  if (!r.ok) throw new Error(`HTTP ${r.status} ${new URL(url).pathname}`);
  return r.json();
}
async function source(name, url, check, init = {}) {
  try {
    const r = await get(url, init);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const observations = await check(text);
    report.sources.push({ name, url, observedAt: new Date().toISOString(), observations });
  } catch (e) { report.unverified.push({ name, url, reason: e.message }); }
}
function compare(name, date, actual, expected, tolerance = 0.00001) {
  const agrees = Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
  const entry = { name, date, site: actual, source: expected, tolerance, agrees };
  if (!agrees) report.findings.push({ type: 'same-date-value-mismatch', ...entry });
  return entry;
}
if (process.env.AUDIT_VERIFY_LOCAL_BUILD === '1') {
  const expected = (await fs.readFile('dist/index.html', 'utf8')).match(/src="([^"]+\/index-[^"]+\.js)"/)?.[1];
  const html = await (await get(origin)).text();
  report.artifact = { expectedBundle: expected, matchesProduction: !!expected && html.includes(expected) };
  if (!report.artifact.matchesProduction) report.findings.push({ type: 'unexpected-production-bundle', ...report.artifact });
}
const assets = await json(sb + '/rest/v1/cached_assets?select=id,name,price,change,as_of,updated_at,source_label,sparkline,spark_dates', true);
const news = await json(sb + '/rest/v1/cached_news?select=id,source,title,url,published_at&order=published_at.desc.nullslast&limit=80', true);
const russia = await json(origin + '/api/russia-insights');
report.assets = assets;
report.russia = russia;
for (const n of news) addLink(n.url, 'cached_news');
for (const n of russia.headlines || []) addLink(n.url, 'russia-headlines');
for (const m of russia.markets || []) addLink(m.sourceUrl, `russia:${m.id}`);

// Read every configured route, expand all news and collect every rendered anchor.
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const req = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || req.url().includes('/functions/v1/')) return route.abort();
    return route.continue();
  });
  for (const path of ['/', '/passport', '/russia', '/world', '/brief', '/news', '/guide', '/about', '/status', '/memory', '/memory/', '/memory/old']) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      const response = await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 60000 });
      await page.locator('main').waitFor();
      if (path === '/news') {
        const all = page.getByTestId('news-show-all');
        if (await all.count()) await all.click();
      }
      await page.waitForTimeout(1500);
      // Full-page captures alone do not trigger lazy in-view sections.
      // Scroll like a reader before collecting links, text and screenshots.
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 650) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await page.waitForTimeout(500);
      if (path === '/world') {
        // Page-level overflow misses labels clipped by an overflow-hidden ancestor.
        for (const width of [360, 390, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          const clipped = await page.locator('[data-testid="heat-tile-change-scale"] > span').evaluateAll(nodes => nodes.filter(node => {
            const tile = node.closest('button').getBoundingClientRect();
            const label = node.getBoundingClientRect();
            return label.left < tile.left || label.right > tile.right || node.scrollWidth > node.clientWidth + 1;
          }).map(node => ({ tile: node.closest('button').id, text: node.textContent })));
          if (clipped.length) report.findings.push({ type: 'clipped-heatmap-label', width, clipped });
        }
        await page.setViewportSize({ width: 390, height: 900 });
        for (const id of ['usd-eur', 'sp500', 'brent', 'gold', 'btc']) {
          await page.locator(`#heat-tile-${id}`).click();
          await page.getByRole('region', { name: /^Подробно об активе / }).waitFor();
          for (const url of await page.locator('a[href]').evaluateAll(nodes => nodes.map(n => n.href))) addLink(url, `/world:expanded-${id}`);
          await page.getByRole('button', { name: 'Свернуть панель актива' }).click();
        }
      }
      const data = await page.evaluate(() => ({
        title: document.title, finalUrl: location.href,
        entryBundle: [...document.querySelectorAll('script[type="module"][src]')].map(node => new URL(node.src).pathname).find(path => /\/index-[^/]+\.js$/.test(path)),
        text: document.querySelector('main').innerText,
        links: [...document.querySelectorAll('a[href]')].map(a => ({ url: a.href, text: a.innerText })),
        buttons: [...document.querySelectorAll('main button')].map(b => ({ name: b.innerText || b.getAttribute('aria-label'), disabled: b.disabled })),
        brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      report.pages.push({ path, status: response.status(), ...data, errors });
      if (report.artifact && data.entryBundle !== report.artifact.expectedBundle) report.findings.push({ type: 'page-build-mismatch', path, expected: report.artifact.expectedBundle, actual: data.entryBundle });
      if (response.status() !== 200 || errors.length || data.brokenImages.length || data.overflow) report.findings.push({ type: 'page', path, status: response.status(), errors, brokenImages: data.brokenImages, overflow: data.overflow });
      for (const a of data.links) addLink(a.url, path);
      await page.screenshot({ path: `${output}/${path.replaceAll('/', '') || 'home'}.png`, fullPage: true });
    } catch (e) { report.findings.push({ type: 'page', path, reason: e.message }); }
    finally { await page.close(); }
  }
  // All same-site fragment targets, including links from the guide to another route.
  const fragmentPages = new Map();
  for (const url of links.keys()) {
    const u = new URL(url);
    if (u.origin !== origin || !u.hash) continue;
    const base = u.origin + u.pathname + u.search;
    if (!fragmentPages.has(base)) fragmentPages.set(base, []);
    fragmentPages.get(base).push(u.hash);
  }
  for (const [base, hashes] of fragmentPages) {
    const page = await context.newPage();
    try {
      await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
      for (const hash of hashes) {
        const found = await page.evaluate(h => !!document.getElementById(decodeURIComponent(h.slice(1))) || !!document.getElementsByName(decodeURIComponent(h.slice(1))).length, hash);
        if (!found) report.findings.push({ type: 'missing-anchor', url: base + hash });
      }
    } finally { await page.close(); }
  }
} finally { await browser.close(); }

// Independent parsing of original raw series, not the app's parser or a second cache.
await source('ECB official USD per EUR', 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml', text => {
  const points = new Map([...xml(text).querySelectorAll('Cube[time]')].map(c => [c.getAttribute('time'), 1 / Number(c.querySelector('Cube[currency="USD"]')?.getAttribute('rate'))]));
  const a = assets.find(a => a.id === 'usd-eur');
  return a.spark_dates.map((date, i) => compare('USD/EUR inverse ECB', date, a.sparkline[i], points.get(date), 1e-8));
});
for (const [id, symbol] of [['brent', 'BZ=F'], ['sp500', '^GSPC']]) {
  await source(`Yahoo original ${symbol}`, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`, text => {
    const result = JSON.parse(text).chart.result[0];
    const points = new Map(result.timestamp.map((t, i) => [iso(t * 1000), result.indicators.quote[0].close[i]]));
    const a = assets.find(a => a.id === id);
    return a.spark_dates.map((date, i) => compare(id, date, a.sparkline[i], points.get(date), 0.000001));
  });
}
await source('Kraken original XBT/USD daily OHLC', 'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440', text => {
  const data = JSON.parse(text).result;
  const candles = data[Object.keys(data).find(k => k !== 'last')];
  const points = new Map(candles.map(c => [iso(c[0] * 1000), Number(c[4])]));
  const a = assets.find(a => a.id === 'btc');
  return a.spark_dates.map((date, i) => compare('Kraken BTC closed day', date, a.sparkline[i], points.get(date), 0.00001));
});
await source('Kraken live last trade (different observation time)', 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD', text => {
  const data = JSON.parse(text).result;
  const current = Number(Object.values(data)[0].c[0]);
  const a = assets.find(a => a.id === 'btc');
  return { site: numeric(a.price), siteAsOf: a.as_of, sourceNow: current, note: 'Different observation times; price difference is NOT a fabricated-data finding.' };
});
await source('gold-api XAU spot (different observation time)', 'https://api.gold-api.com/price/XAU', text => {
  const quote = JSON.parse(text), a = assets.find(a => a.id === 'gold');
  return { site: numeric(a.price), siteAsOf: a.as_of, sourceNow: quote.price, sourceTime: quote.updatedAt, historyPoints: a.sparkline.length, change: a.change, note: 'No substitute futures or backfilled history. Different quote times are not compared for equality.' };
});
for (const [id, code] of [['usd-rub','R01235'], ['eur-rub','R01239'], ['cny-rub-cbr','R01375']]) {
  const m = russia.markets.find(m => m.id === id);
  if (!m) { report.unverified.push({ name: id, reason: 'Missing from current API response' }); continue; }
  const date = new Date(m.asOf);
  const from = new Date(date.getTime() - 20 * 86400000);
  const fmt = d => `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  await source(`CBR original ${id}`, `https://www.cbr.ru/scripts/XML_dynamic.asp?date_req1=${fmt(from)}&date_req2=${fmt(date)}&VAL_NM_RQ=${code}`, text => {
    const records = [...xml(text).querySelectorAll('Record')].map(r => ({ date: r.getAttribute('Date').split('.').reverse().join('-'), value: Number(r.querySelector('Value').textContent.replace(',', '.')) / Number(r.querySelector('Nominal').textContent) }));
    return compare(id, m.asOf.slice(0,10), m.value, records.find(r => r.date === m.asOf.slice(0,10))?.value, 0.00006);
  });
}
for (const [id, method, rowTag, valueTag] of [['ruonia','RuoniaXML','ro','ruo'], ['reserves','mrrf7DXML','mr','val'], ['key-rate','KeyRateXML','KR','Rate']]) {
  const m = russia.markets.find(m => m.id === id);
  if (!m) { report.unverified.push({ name: id, reason: 'Missing from current API response' }); continue; }
  const end = new Date(report.started).toISOString().slice(0,10);
  const from = new Date(new Date(end).getTime() - 420 * 86400000).toISOString().slice(0,10);
  const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="http://web.cbr.ru/"><fromDate>${from}</fromDate><ToDate>${end}</ToDate></${method}></soap:Body></soap:Envelope>`;
  await source(`CBR original ${id}`, 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx', text => {
    const records = [...xml(text).querySelectorAll(rowTag)].map(r => ({ date: r.querySelector('D0,DT')?.textContent.slice(0,10), value: Number(r.querySelector(valueTag)?.textContent.replace(',', '.')) }));
    if (!records.length) throw new Error('No parseable original rows; not a value mismatch');
    const original = records.find(r => r.date === m.asOf.slice(0,10)) ?? (id === 'key-rate' ? records.sort((a,b) => a.date.localeCompare(b.date)).at(-1) : null);
    return compare(id, m.asOf.slice(0,10), m.value, original?.value, 0.00001);
  }, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8', soapaction: `http://web.cbr.ru/${method}` }, body });
}
// No false comparison of a live intraday MOEX quote to a previous daily close.
for (const [id, secid, market] of [['imoex','IMOEX','stock/markets/index'], ['rgbi','RGBI','stock/markets/index'], ['gold-moex','GLDRUB_TOM','currency/markets/selt'], ['cny-rub-moex','CNYRUB_TOM','currency/markets/selt']]) {
  const m = russia.markets.find(m => m.id === id);
  if (!m) continue;
  await source(`MOEX original ${secid} (observation may advance)`, `https://iss.moex.com/iss/engines/${market}/securities/${secid}.json?iss.meta=off`, text => {
    const payload = JSON.parse(text), block = payload.marketdata;
    const records = block.data.map(row => Object.fromEntries(block.columns.map((c,i) => [c,row[i]])));
    return { site: m.value, siteAsOf: m.asOf, originalMarketdata: records, note: 'Observation times can differ; no automatic equality assertion on live quotes.' };
  });
}
await source('MOEX original yield curve', 'https://iss.moex.com/iss/engines/stock/zcyc.json?iss.meta=off', text => {
  const payload = JSON.parse(text), block = payload.yearyields;
  const rows = block.data.map(row => Object.fromEntries(block.columns.map((c,i) => [c,row[i]])));
  const market = russia.markets.find(m => m.id === 'ofz-10y');
  const comparisons = [];
  for (const point of market?.curve || []) {
    const original = rows.find(row => row.period === point.period && `${row.tradedate} ${row.tradetime}` === market.curveAsOf);
    // The public ISS observation may advance between independent requests.
    if (original) comparisons.push(compare(`OFZ curve ${point.period} years`, market.curveAsOf, point.value, original.value, 0.00501));
  }
  return { site: market, original: rows, comparisons, note: 'Compare only identical observation instants; site rounds yields to two decimal places.' };
});

// Independent DOM extraction of the already configured official HTML table.
// Do not pass a binary XLSX export to the application's HTML parser.
await source('CBR original monthly inflation table', 'https://www.cbr.ru/hd_base/infl/', text => {
  const doc = new window.DOMParser().parseFromString(text, 'text/html');
  const m = russia.markets.find(m => m.id === 'inflation');
  const month = m?.asOf?.slice(0, 7);
  const expectedLabel = month ? month.slice(5) + '.' + month.slice(0, 4) : null;
  const rows = [...doc.querySelectorAll('tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent.trim()));
  const row = rows.find(cells => cells[0] === expectedLabel);
  if (!row) throw new Error('Observation month not found in original table; not independently verified');
  return compare('inflation year over year', month, m.value, Number(row[2].replace(',', '.')), 0.00001);
});

// Public publisher RSS only; do not scrape article bodies or bypass paywalls.
const feeds = [
  'https://feeds.bbci.co.uk/news/business/rss.xml', 'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.bloomberg.com/feeds/economics/news.rss', 'https://www.bloomberg.com/feeds/markets/news.rss', 'https://www.bloomberg.com/feeds/politics/news.rss',
  'https://www.cnbc.com/id/20910258/device/rss/rss.html', 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
  'https://www.coindesk.com/arc/outboundfeeds/rss/', 'https://www.federalreserve.gov/feeds/press_all.xml',
  'https://frankmedia.ru/feed', 'https://www.ft.com/markets?format=rss', 'https://www.interfax.ru/rss.asp',
  'https://www.kommersant.ru/rss/section-business.xml', 'https://www.kommersant.ru/rss/section-economics.xml',
  'https://oilprice.com/rss/main', 'https://www.vedomosti.ru/rss/rubric/economics', 'https://www.vedomosti.ru/rss/rubric/finance',
  'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews',
];
const writerSource = await fs.readFile('supabase/functions/update-news-v2/index.ts', 'utf8');
const publicFeedSection = writerSource.split('const SOURCES = [')[1].split('];')[0];
for (const match of publicFeedSection.matchAll(/url: '([^']+)'/g)) feeds.push(match[1]);
const originals = new Map();
for (const feed of new Set(feeds)) await source('Publisher RSS', feed, text => {
  const doc = xml(text);
  const entries = [...doc.querySelectorAll('item, entry')].map(item => ({ title: item.querySelector('title')?.textContent?.trim(), url: item.querySelector('link')?.getAttribute('href') || item.querySelector('link')?.textContent?.trim(), date: item.querySelector('pubDate, published, updated')?.textContent }));
  for (const e of entries) if (e.url) originals.set(e.url.replace(/#.*$/, ''), e);
  if (!entries.length) throw new Error('No feed entries parsed');
  return { entries: entries.length };
});
const norm = s => { const area = window.document.createElement('textarea'); area.innerHTML = s; return area.value.replace(/\s+/g,' ').trim(); };
for (const item of [...news, ...(russia.headlines || [])]) {
  const original = originals.get(item.url?.replace(/#.*$/, ''));
  const entry = { title: item.title, url: item.url, source: item.source, publishedAt: item.published_at || item.publishedAt, corroboratedInCurrentRSS: !!original };
  if (original) {
    entry.original = original;
    entry.sameTitle = norm(item.title) === norm(original.title);
    const siteTime = Date.parse(entry.publishedAt), sourceTime = Date.parse(original.date);
    entry.samePublicationInstant = Number.isFinite(siteTime) && Number.isFinite(sourceTime) && siteTime === sourceTime;
    if (Number.isFinite(siteTime) && Number.isFinite(sourceTime) && siteTime !== sourceTime) report.unverified.push({ name: 'publisher date differs; revision or ingestion needs inspection', ...entry, differenceSeconds: (siteTime - sourceTime) / 1000 });
    if (!entry.sameTitle) report.unverified.push({ name: 'headline changed or parser mismatch', ...entry });
  }
  // An article can leave a rolling RSS feed; absence is not evidence of fabrication.
  report.news.push(entry);
}

// Open every unique rendered/cache link. HTTP denial is unverified, not a broken URL.
const pending = [...links.entries()];
let index = 0;
const activeHosts = new Map();
async function worker() {
  while (index < pending.length) {
    const [url, from] = pending[index++];
    const u = new URL(url);
    if (u.pathname.includes('/functions/v1/')) { report.unverified.push({ url, reason: 'Writer/function endpoint deliberately not invoked' }); continue; }
    while ((activeHosts.get(u.hostname) || 0) >= 2) await new Promise(r => setTimeout(r, 100));
    activeHosts.set(u.hostname, (activeHosts.get(u.hostname) || 0) + 1);
    const entry = { url, from: [...from] };
    try {
      const r = await get(url);
      entry.status = r.status; entry.finalUrl = r.url;
      entry.type = r.headers.get('content-type');
      await r.body?.cancel();
      entry.verdict = r.ok ? 'reachable' : [404,410].includes(r.status) ? 'not-found-candidate' : 'unverified-access';
      if (entry.verdict === 'not-found-candidate') report.findings.push({ ...entry, kind: 'link-not-found-candidate' });
      if (entry.verdict === 'unverified-access') report.unverified.push(entry);
    } catch (e) { entry.verdict = 'unverified-network'; entry.error = e.message; report.unverified.push(entry); }
    finally { activeHosts.set(u.hostname, activeHosts.get(u.hostname) - 1); }
    report.links.push(entry);
  }
}
await Promise.all(Array.from({length: 4}, worker));
report.finished = new Date().toISOString();
report.summary = { pages: report.pages.length, links: report.links.length, reachable: report.links.filter(l => l.verdict === 'reachable').length, sources: report.sources.length, news: report.news.length, corroboratedNews: report.news.filter(n => n.corroboratedInCurrentRSS && n.sameTitle).length, findings: report.findings.length, unverified: report.unverified.length };
await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ summary: report.summary, findings: report.findings, unverified: report.unverified }, null, 2));
if (report.findings.length) process.exitCode = 1;
window.close();
