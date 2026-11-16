import assert from 'node:assert/strict';
import test from 'node:test';

import { removeStoredUrlCandidates } from '../supabase/functions/_shared/cached-news-dedupe.ts';

test('stored URLs are filtered before analysis while fresh candidate order is preserved', () => {
  const candidates = [
    { url: 'https://example.com/fresh-a', title: 'Fresh A' },
    { url: 'https://example.com/known', title: 'Already stored' },
    { url: 'https://example.com/fresh-b', title: 'Fresh B' },
    { url: 'https://example.com/known', title: 'Repeated feed entry' },
  ];
  const result = removeStoredUrlCandidates(
    candidates,
    new Set(['https://example.com/known']),
  );

  assert.deepEqual(result, {
    fresh: [candidates[0], candidates[2]],
    duplicates: 2,
  });
  assert.equal(candidates.length, 4, 'the input queue is not mutated');
});

test('an empty stored-url set leaves every candidate available', () => {
  const candidates = [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }];
  assert.deepEqual(removeStoredUrlCandidates(candidates, new Set()), {
    fresh: candidates,
    duplicates: 0,
  });
});
