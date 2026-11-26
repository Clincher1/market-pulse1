import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStaticCharts, renderSparkline } from '../scripts/build-static-market-charts.mjs';

const source = JSON.parse(await readFile(new URL('../data/snapshot.json', import.meta.url), 'utf8'));

test('static SVG sparklines show only sourced observations and mark their latest point', () => {
  const item = source.items[0];
  const svg = renderSparkline(item, source.series[item.ticker]);
  assert.match(svg, /<svg[^>]+viewBox="0 0 420 150"/);
  assert.match(svg, /<polyline[^>]+points="/);
  assert.match(svg, /r="8" fill="#0284c7"/);
  assert.match(svg, /25\.11/);
  assert.equal((svg.match(/<circle /g) ?? []).length, source.series[item.ticker].length + 1);
  assert.equal(renderSparkline(item, source.series[item.ticker].slice(-2)), null);
  for (const points of Object.values(source.series)) {
    assert.ok(points.every(point => point.observedAt >= '2026-11-20' && point.observedAt <= '2026-11-26'));
  }
  assert.equal(source.series['BZ=F'].length, 4);
  assert.equal(source.series['^GSPC'].length, 4);
  assert.equal(source.series.XAU.length, 6);
});

test('chart workflow writes SVGs for histories with at least three observations and removes unavailable charts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'market-snapshot-charts-'));
  try {
    const snapshotPath = join(dir, 'snapshot.json');
    const outputDir = join(dir, 'charts');
    await writeFile(snapshotPath, JSON.stringify(source));
    assert.deepEqual((await buildStaticCharts({ snapshotPath, outputDir })).sort(), ['brent.svg', 'gold.svg', 'sp500.svg']);
    const gold = await readFile(join(outputDir, 'gold.svg'), 'utf8');
    assert.match(gold, /Золото, спот XAU\/USD/);
    assert.match(gold.replaceAll('\u00a0', ' '), /3 570,00/);

    const outOfWindow = structuredClone(source);
    outOfWindow.series['BZ=F'].unshift({ observedAt: '2026-11-19', value: '90.0000000000' });
    await writeFile(snapshotPath, JSON.stringify(outOfWindow));
    await assert.rejects(buildStaticCharts({ snapshotPath, outputDir }), /out-of-window/);

    const sparse = structuredClone(source);
    sparse.series.XAU = sparse.series.XAU.slice(-2);
    await writeFile(snapshotPath, JSON.stringify(sparse));
    assert.deepEqual((await buildStaticCharts({ snapshotPath, outputDir })).sort(), ['brent.svg', 'sp500.svg']);
    assert.deepEqual((await readdir(outputDir)).sort(), ['brent.svg', 'sp500.svg']);
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
