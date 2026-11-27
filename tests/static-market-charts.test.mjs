import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStaticCharts, renderSparkline } from '../scripts/build-static-market-charts.mjs';

const source = JSON.parse(await readFile(new URL('../data/snapshot.json', import.meta.url), 'utf8'));
const chartFileByTicker = { 'BZ=F': 'brent.svg', '^GSPC': 'sp500.svg', XAU: 'gold.svg' };
const chartFilesFor = snapshot => snapshot.items
  .filter(item => chartFileByTicker[item.ticker] && snapshot.series[item.ticker]?.length >= 3)
  .map(item => chartFileByTicker[item.ticker]).sort();

test('static SVG sparklines show only sourced observations and mark their latest point', () => {
  const exportDay = source.exportedAt.slice(0, 10);
  const windowStart = new Date(Date.parse(`${exportDay}T00:00:00Z`) - 6 * 86400000)
    .toISOString().slice(0, 10);
  for (const item of source.items) {
    const observations = source.series[item.ticker];
    assert.ok(Array.isArray(observations), `${item.ticker} has a source history array`);
    assert.ok(observations.length <= 7, `${item.ticker} stays within the exported seven-day window`);
    let previous = '';
    for (const point of observations) {
      assert.match(point.observedAt, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(point.observedAt >= windowStart && point.observedAt <= exportDay,
        `${item.ticker} observation ${point.observedAt} is inside the rolling export window`);
      assert.ok(point.observedAt > previous, `${item.ticker} source dates are strictly ordered`);
      previous = point.observedAt;
    }
    if (observations.length) {
      assert.equal(observations.at(-1).observedAt, item.observedAt.slice(0, 10));
      assert.equal(observations.at(-1).value, item.value);
    }
  }

  const item = source.items.find(row => source.series[row.ticker].length >= 3);
  if (!item) return; // Sparse source histories intentionally have no SVG sparkline.
  const observations = source.series[item.ticker];
  const svg = renderSparkline(item, observations);
  assert.match(svg, /<svg[^>]+viewBox="0 0 420 150"/);
  const path = svg.match(/<polyline[^>]+points="([^"]+)"/);
  assert.ok(path, 'SVG contains the observed series path');
  assert.equal(path[1].trim().split(/\s+/).length, observations.length,
    'the path has exactly one point per supplied source observation');
  assert.match(svg, /r="8" fill="#0284c7"/);
  const latestDate = observations.at(-1).observedAt;
  const latestLabel = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', timeZone: 'UTC',
  }).format(new Date(`${latestDate}T12:00:00Z`));
  assert.ok(svg.includes(latestLabel), 'SVG labels the actual latest sourced point');
  assert.equal(renderSparkline(item, observations.slice(-2)), null);
});

test('sparkline renderer places exactly one path point per sourced observation and marks the latest', () => {
  const item = { ticker: 'test', instrument: 'Test instrument', value: '13', observedAt: '2026-12-02' };
  const observations = [
    { observedAt: '2026-11-30', value: '11' },
    { observedAt: '2026-12-01', value: '12' },
    { observedAt: '2026-12-02', value: '13' },
  ];
  const svg = renderSparkline(item, observations);
  const points = svg.match(/<polyline[^>]+points="([^"]+)"/)[1].trim().split(/\s+/);
  assert.equal(points.length, observations.length);
  assert.equal((svg.match(/<circle /g) ?? []).length, observations.length + 1);
  assert.match(svg, /r="8" fill="#0284c7"/);
  assert.match(svg, /02\.12/);
});

test('chart workflow writes SVGs for histories with at least three observations and removes unavailable charts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'market-snapshot-charts-'));
  try {
    const snapshotPath = join(dir, 'snapshot.json');
    const outputDir = join(dir, 'charts');
    await writeFile(snapshotPath, JSON.stringify(source));
    assert.deepEqual((await buildStaticCharts({ snapshotPath, outputDir })).sort(), chartFilesFor(source));
    if (chartFilesFor(source).includes('gold.svg')) {
      const gold = await readFile(join(outputDir, 'gold.svg'), 'utf8');
      assert.match(gold, /Золото, спот XAU\/USD/);
      const goldValue = Number(source.items.find(item => item.ticker === 'XAU').value);
      const expectedGold = new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(goldValue).replaceAll('\u00a0', ' ');
      assert.ok(gold.replaceAll('\u00a0', ' ').includes(expectedGold), `expected chart to show current snapshot gold value ${expectedGold}`);
    }

    const outOfWindow = structuredClone(source);
    const outsideDate = new Date(Date.parse(`${source.exportedAt.slice(0, 10)}T00:00:00Z`) - 7 * 86400000)
      .toISOString().slice(0, 10);
    outOfWindow.series['BZ=F'].unshift({ observedAt: outsideDate, value: '90.0000000000' });
    await writeFile(snapshotPath, JSON.stringify(outOfWindow));
    await assert.rejects(buildStaticCharts({ snapshotPath, outputDir }), /out-of-window/);

    const sparse = structuredClone(source);
    sparse.series.XAU = sparse.series.XAU.slice(-2);
    await writeFile(snapshotPath, JSON.stringify(sparse));
    const expectedSparseFiles = chartFilesFor(sparse);
    assert.deepEqual((await buildStaticCharts({ snapshotPath, outputDir })).sort(), expectedSparseFiles);
    assert.deepEqual((await readdir(outputDir)).sort(), expectedSparseFiles);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('chart generator rejects missing or altered latest observations instead of guessing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'market-snapshot-invalid-chart-'));
  try {
    const snapshotPath = join(dir, 'snapshot.json');
    const invalid = structuredClone(source);
    invalid.series['^GSPC'].at(-1).value = '1';
    await writeFile(snapshotPath, JSON.stringify(invalid));
    await assert.rejects(buildStaticCharts({ snapshotPath, outputDir: join(dir, 'charts') }), /endpoint differs/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
