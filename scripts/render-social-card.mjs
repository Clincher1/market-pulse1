// Reproducible social card: local SVG and licensed bundled fonts, no network.
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
const svg = await readFile(new URL('../public/og-image.svg', import.meta.url), 'utf8');
const image = new Resvg(svg, { font: {
  loadSystemFonts: false,
  defaultFontFamily: 'Inter',
  fontFiles: ['Inter-Regular-subset.ttf', 'Inter-Bold-subset.ttf', 'Inter-ExtraBold-subset.ttf']
    .map((file) => new URL(`../api/assets/${file}`, import.meta.url).pathname),
} });
await writeFile(new URL('../public/og-image.png', import.meta.url), image.render().asPng());
