import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const chartSpecs = [
  { ticker: 'BZ=F', file: 'brent.svg', color: '#0284c7' },
  { ticker: '^GSPC', file: 'sp500.svg', color: '#7c3aed' },
  { ticker: 'XAU', file: 'gold.svg', color: '#b7791f' },
];
const numberFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAY = 86400000;

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function dateLabel(value) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
}

function validateSeries(item, observations, exportDay) {
  if (!item || typeof item.instrument !== 'string' || typeof item.value !== 'string'
    || !/^\d+(?:\.\d+)?$/.test(item.value) || !Array.isArray(observations)
    || observations.length > 7) throw new Error('Invalid static snapshot chart contract');
  const windowStart = exportDay
    ? new Date(Date.parse(`${exportDay}T00:00:00Z`) - 6 * DAY).toISOString().slice(0, 10)
    : null;
  let previous = '';
  for (const point of observations) {
    const date = typeof point?.observedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(point.observedAt)
      ? new Date(`${point.observedAt}T00:00:00Z`) : null;
    if (!point || typeof point.value !== 'string' || !/^\d+(?:\.\d+)?$/.test(point.value)
      || !Number.isFinite(Number(point.value)) || Number(point.value) <= 0
      || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== point.observedAt
      || point.observedAt <= previous
      || (windowStart && (point.observedAt < windowStart || point.observedAt > exportDay))) {
      throw new Error(`${item.ticker}: invalid, unordered, or out-of-window chart observations`);
    }
    previous = point.observedAt;
  }
  const latestDate = item.observedAt.slice(0, 10);
  if (observations.length && (observations.at(-1).observedAt !== latestDate
    || observations.at(-1).value !== item.value)) {
    throw new Error(`${item.ticker}: chart endpoint differs from the current validated snapshot`);
  }
}

export function renderSparkline(item, observations, color = '#0284c7') {
  validateSeries(item, observations);
  if (observations.length < 3) return null;

  const width = 420;
  const height = 150;
  const pad = { left: 16, right: 16, top: 14, bottom: 26 };
  const values = observations.map(point => Number(point.value));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || Math.max(Math.abs(high) * 0.02, 1);
  const min = low - spread * 0.12;
  const max = high + spread * 0.12;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const points = values.map((value, index) => ({
    x: pad.left + (observations.length === 1 ? plotWidth / 2 : index / (values.length - 1) * plotWidth),
    y: pad.top + (max - value) / (max - min) * plotHeight,
  }));
  const polyline = points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const latest = observations.at(-1);
  const period = `${dateLabel(observations[0].observedAt)} — ${dateLabel(latest.observedAt)}`;
  const accessibleTitle = `${item.instrument}: ${numberFormat.format(Number(item.value))}, наблюдение ${dateLabel(latest.observedAt)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc">
  <title id="chart-title">${escapeXml(accessibleTitle)}</title>
  <desc id="chart-desc">Линейный график ${observations.length} фактических наблюдений за период ${escapeXml(period)}. Последняя точка выделена.</desc>
  <line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" stroke="#cbd5e1" stroke-width="1" />
  <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
  ${points.slice(0, -1).map(point => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.5" fill="white" stroke="${color}" stroke-width="2" />`).join('\n  ')}
  <circle cx="${points.at(-1).x.toFixed(2)}" cy="${points.at(-1).y.toFixed(2)}" r="8" fill="${color}" fill-opacity=".18" />
  <circle cx="${points.at(-1).x.toFixed(2)}" cy="${points.at(-1).y.toFixed(2)}" r="4.5" fill="${color}" stroke="white" stroke-width="2" />
  <text x="${pad.left}" y="${height - 7}" fill="#475569" font-family="Arial, sans-serif" font-size="12">${escapeXml(dateLabel(observations[0].observedAt))}</text>
  <text x="${width - pad.right}" y="${height - 7}" text-anchor="end" fill="#475569" font-family="Arial, sans-serif" font-size="12">${escapeXml(dateLabel(latest.observedAt))}</text>
</svg>\n`;
}

export async function buildStaticCharts({ snapshotPath = resolve(root, 'data/snapshot.json'), outputDir = resolve(root, 'public/snapshot-charts') } = {}) {
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.items) || !snapshot.series) {
    throw new Error('Static snapshot is missing validated daily chart history');
  }
  await mkdir(outputDir, { recursive: true });
  const output = [];
  for (const spec of chartSpecs) {
    const item = snapshot.items.find(row => row.ticker === spec.ticker);
    const observations = snapshot.series[spec.ticker];
    validateSeries(item, observations, snapshot.exportedAt.slice(0, 10));
    const svg = renderSparkline(item, observations, spec.color);
    const path = resolve(outputDir, spec.file);
    if (svg) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, svg, 'utf8');
      output.push(spec.file);
    } else {
      await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  return output;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const files = await buildStaticCharts();
    console.log(`Static market charts generated: ${files.join(', ') || 'no histories with at least three observations'}`);
  } catch (error) {
    console.error(`Static market chart generation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
