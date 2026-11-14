import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { setBrowserNoStore, setVercelCdnCache } from '../api/_shared/responseCache.js';

function responseHeaders() {
  const values = new Map();
  return {
    setHeader(name, value) {
      values.set(name.toLowerCase(), value);
    },
    get(name) {
      return values.get(name.toLowerCase());
    },
  };
}

test('API cache policy disables browser storage but keeps an independent Vercel edge TTL', () => {
  const response = responseHeaders();
  setBrowserNoStore(response);
  setVercelCdnCache(response, 's-maxage=300, stale-while-revalidate=900');

  assert.equal(response.get('Cache-Control'), 'no-store');
  assert.equal(response.get('Vercel-CDN-Cache-Control'), 's-maxage=300, stale-while-revalidate=900');
});

test('empty edge policy does not create an accidental Vercel cache rule', () => {
  const response = responseHeaders();
  setBrowserNoStore(response);
  setVercelCdnCache(response, '   ');

  assert.equal(response.get('Cache-Control'), 'no-store');
  assert.equal(response.get('Vercel-CDN-Cache-Control'), undefined);
});

test('all browser-facing API handlers set no-store and retain their existing edge cache durations', async () => {
  const cases = [
    ['russia-insights', /s-maxage=300, stale-while-revalidate=900/, /s-maxage=60, stale-while-revalidate=120/],
    ['russia-history', /s-maxage=1800, stale-while-revalidate=900/],
    ['brief-image', /s-maxage=60, stale-while-revalidate=300/],
  ];

  for (const [name, ...policies] of cases) {
    const source = await readFile(new URL(`../api/${name}.js`, import.meta.url), 'utf8');
    assert.match(source, /setBrowserNoStore\(res\)/, `${name} must disable browser caching`);
    for (const policy of policies) assert.match(source, policy, `${name} edge TTL changed unexpectedly`);
  }
});
