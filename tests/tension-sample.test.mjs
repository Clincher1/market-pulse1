import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  calculateTensionIndex,
  selectTensionNews,
  tensionNewsQueryParams,
} from '../supabase/functions/_shared/tension-sample.mjs';

test('shared tension query uses the writer rolling window and future allowance', () => {
  const now = new Date('2026-11-25T14:05:36.617Z');
  const params = tensionNewsQueryParams(now);

  assert.equal(params.get('order'), 'published_at.desc');
  assert.equal(params.get('limit'), '400');
  assert.match(params.get('select'), /title,url/);
  assert.deepEqual(params.getAll('published_at'), [
    'gte.2026-11-24T14:05:36.617Z',
    'lte.2026-11-25T14:20:36.617Z',
  ]);
});

test('shared sample applies writer filters and URL/title/near-title deduplication', () => {
  const raw = [
    {
      source: 'Reuters',
      title: 'Central bank raises rates sharply amid inflation concerns',
      url: 'https://Example.com/news/story/?utm_source=mail#top',
      sentiment: -0.8,
      importance: 5,
      confidence: 0.8,
      published_at: '2026-11-25T14:00:00.000Z',
    },
    {
      source: 'Reuters',
      title: 'Republished copy with a different headline',
      url: 'https://example.com/news/story?gclid=tracking',
      sentiment: 0.9,
      importance: 5,
      confidence: 0.8,
      published_at: '2026-11-25T13:59:00.000Z',
    },
    {
      source: 'AP',
      title: 'Central bank raises rates sharply amid inflation concerns on Monday',
      url: 'https://ap.example/news/rates',
      sentiment: 0.8,
      importance: 5,
      confidence: 0.8,
      published_at: '2026-11-25T13:58:00.000Z',
    },
    {
      source: 'BBC',
      title: 'UPDATE: Central bank raises rates sharply amid inflation concerns',
      url: 'https://bbc.example/news/rates',
      sentiment: 0.8,
      importance: 5,
      confidence: 0.8,
      published_at: '2026-11-25T13:57:00.000Z',
    },
    {
      source: 'Bloomberg',
      title: 'Oil supply shock pushes crude prices higher across global markets',
      url: 'https://bloomberg.example/oil',
      sentiment: 0.2,
      importance: 4,
      confidence: 0.5,
      published_at: '2026-11-25T14:02:00.000Z',
    },
    {
      source: 'GDELT',
      title: 'Blocked source story with negative sentiment',
      url: 'https://gdelt.example/story',
      sentiment: -1,
      importance: 10,
      confidence: 1,
      published_at: '2026-11-25T14:01:00.000Z',
    },
    {
      source: 'Reuters',
      title: 'Below importance threshold',
      url: 'https://reuters.example/low-importance',
      sentiment: -1,
      importance: 2,
      confidence: 1,
      published_at: '2026-11-25T14:00:00.000Z',
    },
    {
      source: 'Reuters',
      title: 'Invalid sentiment is excluded by the writer',
      url: 'https://reuters.example/invalid-sentiment',
      sentiment: 1.2,
      importance: 5,
      confidence: 1,
      published_at: '2026-11-25T13:56:00.000Z',
    },
  ];

  const selected = selectTensionNews(raw);
  assert.deepEqual(selected.map((item) => item.url), [raw[0].url, raw[4].url]);

  const result = calculateTensionIndex(selected);
  assert.equal(result.newsCount, 2);
  assert.equal(result.rawIndex, (3.2 / 6) * 100);
  assert.equal(result.index, 53);
  assert.equal(result.sampleNewest, '2026-11-25T14:02:00.000Z');
});

test('tension_matches anchors the shared window to cached_tension.updated_at', async () => {
  const selfcheck = await readFile(
    new URL('../supabase/functions/selfcheck/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(selfcheck, /cached_tension\?select=value,news_count,updated_at&id=eq\.1/);
  assert.match(selfcheck, /const writerRunAt = new Date\(String\(published\[0\]\?\.updated_at \?\? ''\)\)/);
  assert.match(selfcheck, /tensionNewsQueryParams\(writerRunAt\)/);
});

test('writer and tension_matches both call the same query, selection, and calculation helpers', async () => {
  const [writer, selfcheck] = await Promise.all([
    readFile(new URL('../supabase/functions/update-tension/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/selfcheck/index.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(writer, /tensionNewsQueryParams\(now\)/);
  assert.match(selfcheck, /tensionNewsQueryParams\(writerRunAt\)/);
  for (const source of [writer, selfcheck]) {
    assert.match(source, /selectTensionNews\(rawNews\)/);
    assert.match(source, /calculateTensionIndex\((?:news|rows)\)/);
  }
});
