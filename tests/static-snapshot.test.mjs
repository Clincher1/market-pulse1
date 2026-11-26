import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
import { staticDocument } from '../scripts/static-document.mjs';

const exec = promisify(execFile);
const root = new URL('../', import.meta.url);
const snapshot = JSON.parse(await readFile(new URL('data/snapshot.json', root), 'utf8'));

test('home snapshot preserves all supplied values, dates, units, source links and observation basis without JS', () => {
  const dom = new JSDOM(staticDocument(''));
  const doc = dom.window.document;
  const section = doc.querySelector('[aria-labelledby="static-snapshot-title"]');
  assert.equal(section.querySelector('h2').textContent, 'Статический снимок данных');
  assert.ok(section.textContent.includes('Данные актуальны на момент сборки'));
  assert.ok(section.textContent.includes(snapshot.exportedAt));
  const charts = [...section.querySelectorAll('.static-snapshot__chart')];
  assert.equal(charts.length, snapshot.items.filter(item => snapshot.series[item.ticker].length >= 3).length);
  assert.equal(charts.length, 3);
  charts.forEach((figure, index) => {
    const item = snapshot.items[index];
    assert.equal(figure.querySelector('img').getAttribute('src'), `/snapshot-charts/${['brent.svg', 'sp500.svg', 'gold.svg'][index]}`);
    assert.match(figure.querySelector('img').getAttribute('alt'), new RegExp(item.instrument));
    assert.ok(figure.textContent.includes(item.source.name));
    assert.ok(figure.textContent.includes(Number(item.value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  });
  assert.match(charts[2].textContent, /Период: .* наблюдений/);
  assert.equal(dom.window.document.querySelector('script'), null, 'the chart markup needs no client-side JavaScript');
  assert.equal(section.querySelectorAll('thead th[scope="col"]').length, 6);
  assert.ok(section.querySelector('caption').textContent.trim());
  const rows = [...section.querySelectorAll('tbody tr')];
  assert.equal(rows.length, snapshot.items.length);
  assert.ok(rows.length >= 3 && rows.length <= 5);
  snapshot.items.forEach((item, index) => {
    const row = rows[index];
    assert.equal(row.querySelector('th[scope="row"]').textContent, `${item.ticker} — ${item.instrument}`);
    const cells = row.querySelectorAll('td');
    assert.equal(cells[0].textContent, Number(item.value).toFixed(2));
    assert.equal(cells[1].textContent, item.unit);
    assert.equal(cells[2].querySelector('time').getAttribute('datetime'), item.observedAt);
    assert.equal(cells[2].textContent, item.observedAt);
    assert.equal(cells[3].querySelector('a').getAttribute('href'), item.source.url);
    assert.equal(cells[3].textContent, item.source.name);
    assert.equal(cells[4].textContent, item.basis);
  });
  const region = section.querySelector('[role="region"]');
  assert.equal(region.getAttribute('tabindex'), '0');
  assert.ok(region.getAttribute('aria-label'));
  dom.window.close();
});

test('snapshot table rounds displayed numeric values to two decimals without changing stored source precision', () => {
  const dom = new JSDOM(staticDocument(''));
  const values = [...dom.window.document.querySelectorAll('[aria-labelledby="static-snapshot-title"] tbody tr td:first-of-type')]
    .map(cell => cell.textContent);
  assert.deepEqual(values, snapshot.items.map(item => Number(item.value).toFixed(2)));
  assert.ok(snapshot.items.every(item => /^\d+\.\d{2,}$/.test(item.value)), 'source strings retain their full decimal precision');
  dom.window.close();
});

test('snapshot export contains 3 independently labelled observations no older than seven days at export', () => {
  const exported = Date.parse(snapshot.exportedAt);
  for (const item of snapshot.items) {
    const age = exported - Date.parse(item.observedAt);
    assert.ok(age >= 0 && age <= 7 * 86400000, `Observation age at export: ${item.ticker}`);
  }
  // Do not re-date daily rows as midnight UTC, or call the gold series an official close.
  for (const ticker of ['BZ=F', '^GSPC']) assert.match(snapshot.items.find(i => i.ticker === ticker).observedAt, /^\d{4}-\d{2}-\d{2}$/);
  const gold = snapshot.items.find(i => i.ticker === 'XAU');
  assert.match(gold.observedAt, /T.*Z$/);
  assert.match(gold.basis, /не официальный close/);
});

test('build fails closed for missing, malformed or invalid snapshot; supplied contract remains unchanged', async () => {
  await mkdir(new URL('.local/', root), { recursive: true });
  const dir = await mkdtemp(new URL('.local/snapshot-test-', root));
  try {
    for (const path of ['scripts', 'src/lib', 'data', 'dist', 'public']) await mkdir(`${dir}/${path}`, { recursive: true });
    for (const path of ['scripts/static-document.mjs', 'scripts/build-pages.mjs', 'src/lib/pageDescriptions.json', 'src/lib/methodology.json', 'src/lib/pageTitles.json', 'public/robots.txt']) {
      await copyFile(new URL(path, root), `${dir}/${path}`);
    }
    const originalHtml = await readFile(new URL('index.html', root), 'utf8');
    const variants = [
      ['missing file', undefined], ['malformed JSON', '{'], ['null', 'null'],
      ['wrong version', { ...snapshot, schemaVersion: 2 }],
      ['export date without time', { ...snapshot, exportedAt: '2026-11-22' }],
      ['bad export date', { ...snapshot, exportedAt: 'not-a-date' }],
      ['too few rows', { ...snapshot, items: snapshot.items.slice(0, 2) }],
      ['too many rows', { ...snapshot, items: [...snapshot.items, ...snapshot.items] }],
      ['duplicate tickers', { ...snapshot, items: [snapshot.items[0], snapshot.items[0], snapshot.items[2]] }],
    ];
    for (const [field, value] of [
      ['ticker', ''], ['instrument', ' '], ['unit', ''], ['basis', ''],
      ['value', 12], ['value', '0'], ['value', '-1'], ['value', 'NaN'], ['value', '1,234'], ['value', '9'.repeat(400)],
      ['observedAt', '2026-02-30'], ['observedAt', 'not-a-date'], ['observedAt', '2026-11-22T12:00:00'],
      ['source', { name: '', url: 'https://example.com/' }],
      ['source', { name: 'Source', url: 'javascript:alert(1)' }],
      ['source', { name: 'Source', url: 'http://example.com/' }],
      ['source', { name: 'Source', url: 'https://user:password@example.com/' }],
      ['source', null],
    ]) variants.push([`invalid ${field}: ${JSON.stringify(value)}`, { ...snapshot, items: [{ ...snapshot.items[0], [field]: value }, ...snapshot.items.slice(1)] }]);
    for (const date of [
      '2026-02-30', '2026-04-31', '2026-02-29', '1900-02-29',
      '2026-00-15', '2026-13-01', '2026-01-00', '2026-01-32',
    ]) {
      for (const suffix of ['', 'T12:00:00Z', 'T00:30:00.123+03:00', 'T23:30:00-05:00']) {
        const invalidDate = `${date}${suffix}`;
        variants.push([`nonexistent observation date: ${invalidDate}`, {
          ...snapshot,
          items: [{ ...snapshot.items[0], observedAt: invalidDate }, ...snapshot.items.slice(1)],
        }]);
        if (suffix) variants.push([`nonexistent export date: ${invalidDate}`, {
          ...snapshot, exportedAt: invalidDate,
        }]);
      }
    }
    for (const [label, value] of variants) {
      await writeFile(`${dir}/dist/index.html`, originalHtml);
      await rm(`${dir}/data/snapshot.json`, { force: true });
      if (value !== undefined) await writeFile(`${dir}/data/snapshot.json`, typeof value === 'string' ? value : JSON.stringify(value));
      await assert.rejects(exec(process.execPath, [`${dir}/scripts/build-pages.mjs`], { cwd: dir }), error => {
        assert.ok(error.code !== 0, label);
        assert.match(error.stderr, /(?:Cannot read|Invalid) data\/snapshot\.json/, label);
        return true;
      }, label);
      assert.equal(await readFile(`${dir}/dist/index.html`, 'utf8'), originalHtml, `Invalid snapshot must not overwrite the document: ${label}`);
    }
    // Leap years, fractional seconds and offsets crossing UTC dates stay valid.
    for (const observedAt of [
      '2000-02-29', '2024-02-29', '2026-04-30',
      '2000-02-29T12:00:00Z', '2024-02-29T00:30:00.123+03:00',
      '2024-02-29T23:30:00-05:00',
    ]) {
      const valid = {
        ...snapshot,
        exportedAt: observedAt.includes('T') ? observedAt : snapshot.exportedAt,
        items: [{ ...snapshot.items[0], observedAt }, ...snapshot.items.slice(1)],
        series: {
          ...snapshot.series,
          'BZ=F': [{ observedAt: observedAt.slice(0, 10), value: snapshot.items[0].value }],
        },
      };
      await writeFile(`${dir}/data/snapshot.json`, JSON.stringify(valid));
      await writeFile(`${dir}/dist/index.html`, originalHtml);
      await exec(process.execPath, [`${dir}/scripts/build-pages.mjs`], { cwd: dir });
      assert.ok((await readFile(`${dir}/dist/index.html`, 'utf8')).includes(`datetime="${observedAt}"`));
    }
    const escaped = structuredClone(snapshot);
    escaped.items[0].instrument = '<img src=x onerror=alert(1)> & "test"';
    escaped.items[0].basis = '</td><script>alert(1)</script>';
    escaped.items[0].value = '123.4567890123456789';
    escaped.series['BZ=F'].at(-1).value = escaped.items[0].value;
    escaped.exportedAt = '2026-11-23T03:00:01.123456Z';
    await writeFile(`${dir}/data/snapshot.json`, JSON.stringify(escaped));
    await writeFile(`${dir}/dist/index.html`, originalHtml);
    await exec(process.execPath, [`${dir}/scripts/build-pages.mjs`], { cwd: dir });
    const dom = new JSDOM(await readFile(`${dir}/dist/index.html`, 'utf8'));
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('tbody img, tbody script, [onerror]').length, 0);
    assert.ok(doc.querySelector('tbody').textContent.includes(escaped.items[0].instrument));
    assert.ok(doc.querySelector('tbody').textContent.includes(escaped.items[0].basis));
    const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    assert.equal(blocks.length, 2, 'Provider text must not terminate a JSON-LD data block');
    const dataset = blocks.map(node => JSON.parse(node.textContent)).find(data => data['@type'] === 'Dataset');
    assert.equal(dataset.hasPart[0].name, escaped.items[0].instrument);
    assert.equal(dataset.hasPart[0].description, escaped.items[0].basis);
    assert.equal(dataset.hasPart[0].variableMeasured.value, escaped.items[0].value);
    assert.equal(dataset.dateModified, escaped.exportedAt, 'Next snapshot regenerates JSON-LD without editing metadata');
    dom.window.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
