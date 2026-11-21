import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

test('the comparison desk is a separate dynamic entry, not part of the synchronous application module', async () => {
  const result = await build({
    entryPoints: ['src/App.tsx'], outdir: '.local/startup-splitting-tests',
    bundle: true, splitting: true, format: 'esm', platform: 'browser', packages: 'external',
    jsx: 'automatic', alias: { '@': './src' }, loader: { '.css': 'empty' },
    write: false, metafile: true, logLevel: 'silent',
  });
  const outputs = Object.values(result.metafile.outputs);
  const app = outputs.find(output => output.entryPoint === 'src/App.tsx');
  const desk = outputs.find(output => output.entryPoint === 'src/components/MarketDesk.tsx');
  assert.ok(desk, 'desk has its own asynchronously requested module');
  assert.ok(!app.inputs['src/components/MarketDesk.tsx']);
  assert.ok(app.imports.some(item => item.kind === 'dynamic-import' && item.path.includes('MarketDesk')));
  const source = await readFile('src/App.tsx', 'utf8');
  assert.match(source, /<Suspense fallback=\{<SectionFallback[^\n]+min-h-\[520px\][^\n]+\n\s*<MarketDesk summary \/>/);
  assert.match(source, /<Suspense fallback=\{<SectionFallback[^\n]+min-h-\[600px\][^\n]+\n\s*<MarketDesk \/>/);
});
