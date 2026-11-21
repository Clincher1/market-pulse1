import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
test('OFZ source links point to the same official ISS dataset that supplies the curve', () => {
  const api = readFileSync('api/russia-insights.js', 'utf8');
  const ui = readFileSync('src/components/OfzCurve.tsx', 'utf8');
  const source = 'https://iss.moex.com/iss/engines/stock/zcyc.json?iss.meta=off';
  assert.ok(api.includes(`sourceUrl: '${source}'`));
  assert.ok(ui.includes(`href="${source}"`));
  for (const code of [api, ui]) assert.ok(!code.includes('marketdata/indices/state/gcurve'));
});
