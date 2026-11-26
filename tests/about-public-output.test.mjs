import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';

const outputDirectory = new URL('../.local/about-public-output-tests/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
const output = new URL('AboutProject.cjs', outputDirectory).pathname;
await build({
  entryPoints: ['src/components/AboutProject.tsx'],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'framer-motion'],
  alias: { '@': './src' },
  logLevel: 'silent',
});
const AboutProject = createRequire(import.meta.url)(output).default;

test('rendered About page keeps Methodology and contains no project GitHub URL', () => {
  const html = renderToStaticMarkup(React.createElement(AboutProject));
  assert.match(html, /href="\/guide"[^>]*>[\s\S]*?Методология/);
  assert.doesNotMatch(html, /https:\/\/github\.com\/Clincher1\/market-pulse1/i);
});
