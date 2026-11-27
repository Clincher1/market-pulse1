import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const chartSpecs = [
  { ticker: 'BZ=F', file: 'brent.svg' },
  { ticker: '^GSPC', file: 'sp500.svg' },
  { ticker: 'XAU', file: 'gold.svg' },
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

export function renderSparkline(item, observations, color = '#16C784') {
  validateSeries(item, observations);
  if (observations.length < 3) return null;

  const width = 420;
  const height = 150;
  // Reserve enough room for readable mobile axis labels and a direct latest-value callout.
  const pad = { left: 96, right: 18, top: 18, bottom: 32 };
  const values = observations.map(point => Number(point.value));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || Math.max(Math.abs(high) * 0.02, 1);
  const min = low - spread * 0.12;
  const max = high + spread * 0.12;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const plotBottom = height - pad.bottom;
  const points = values.map((value, index) => ({
    x: pad.left + index / (values.length - 1) * plotWidth,
    y: pad.top + (max - value) / (max - min) * plotHeight,
  }));
  const polyline = points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const area = `${pad.left},${plotBottom} ${polyline} ${width - pad.right},${plotBottom}`;
  const ticks = [0, 0.5, 1].map(fraction => ({
    y: pad.top + fraction * plotHeight,
    value: max - fraction * (max - min),
  }));
  const latest = observations.at(-1);
  const latestPoint = points.at(-1);
  const latestValue = numberFormat.format(Number(latest.value));
  const period = `${dateLabel(observations[0].observedAt)} — ${dateLabel(latest.observedAt)}`;
  const accessibleTitle = `${item.instrument}: ${latestValue}, наблюдение ${dateLabel(latest.observedAt)}`;
  const gradientId = `area-${String(item.ticker).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc">
  <title id="chart-title">${escapeXml(accessibleTitle)}</title>
  <desc id="chart-desc">Линейный график ${observations.length} фактических наблюдений за период ${escapeXml(period)}. Подписаны шкалы значений и дат; последняя точка показывает ${escapeXml(latestValue)}.</desc>
  <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".38"/><stop offset="100%" stop-color="${color}" stop-opacity=".025"/></linearGradient></defs>
  ${ticks.map(tick => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${tick.y.toFixed(2)}" y2="${tick.y.toFixed(2)}" stroke="#536174" stroke-width="1"/><text x="${pad.left - 8}" y="${(tick.y + 5).toFixed(2)}" text-anchor="end" fill="#C1CAD4" font-family="Arial, sans-serif" font-size="20">${escapeXml(numberFormat.format(tick.value))}</text>`).join('\n  ')}
  <line x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${plotBottom}" stroke="#64748B" stroke-width="1.5" />
  <line x1="${pad.left}" x2="${width - pad.right}" y1="${plotBottom}" y2="${plotBottom}" stroke="#64748B" stroke-width="1.5" />
  <polygon points="${area}" fill="url(#${gradientId})" />
  <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
  ${points.slice(0, -1).map(point => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.5" fill="#151B23" stroke="${color}" stroke-width="2" />`).join('\n  ')}
  <circle cx="${latestPoint.x.toFixed(2)}" cy="${latestPoint.y.toFixed(2)}" r="8" fill="${color}" fill-opacity=".18" />
  <circle cx="${latestPoint.x.toFixed(2)}" cy="${latestPoint.y.toFixed(2)}" r="4.5" fill="${color}" stroke="#F0F6FC" stroke-width="2" />
  <text x="${width - pad.right}" y="${Math.max(pad.top + 2, latestPoint.y - 10).toFixed(2)}" text-anchor="end" fill="${color}" font-family="Arial, sans-serif" font-size="20" font-weight="700">${escapeXml(latestValue)}</text>
  <text x="${pad.left}" y="${height - 7}" fill="#C1CAD4" font-family="Arial, sans-serif" font-size="20">${escapeXml(dateLabel(observations[0].observedAt))}</text>
  <text x="${width - pad.right}" y="${height - 7}" text-anchor="end" fill="#C1CAD4" font-family="Arial, sans-serif" font-size="20">${escapeXml(dateLabel(latest.observedAt))}</text>
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
    const trendColor = Number(observations.at(-1).value) >= Number(observations[0].value)
      ? '#16C784' : '#EA3943';
    const svg = renderSparkline(item, observations, trendColor);
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
