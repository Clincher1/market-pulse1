import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { publicationTimestamp } from '../supabase/functions/_shared/news-publication.ts';

test('missing or invalid publisher date never becomes the current time', () => {
  for (const value of [null, undefined, '', '   ', 'not a date', 0, {}, 'Недавно']) {
    assert.equal(publicationTimestamp(value), null);
  }
});
test('RSS offset and ISO timestamps retain the exact publisher instant', () => {
  assert.equal(publicationTimestamp('Sat, 21 Nov 2026 13:00:00 +0300'), '2026-11-21T10:00:00.000Z');
  assert.equal(publicationTimestamp('2026-11-20T22:05:00-05:00'), '2026-11-21T03:05:00.000Z');
});
test('news writer rejects undated entries before model calls and writes only source time', () => {
  const writer = readFileSync('supabase/functions/update-news-v2/index.ts', 'utf8');
  assert.ok(writer.includes('const publishedAt = publicationTimestamp(dateRaw)'));
  assert.ok(writer.includes('if (publishedAt === null)'));
  assert.ok(writer.indexOf('if (publishedAt === null)') < writer.indexOf('const outcome = await analyzeWithProviders'));
  assert.ok(writer.includes('published_at: candidate.publishedAt'));
  assert.doesNotMatch(writer, /published_at:\s*[^\n,]*(?:new Date|Date\.now)/);
  assert.doesNotMatch(writer, /candidate\.dateRaw/);
});
