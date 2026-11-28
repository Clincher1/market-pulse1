import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchBrentDaily, isStooqBrentDailyUrl, parseStooqDaily, stooqBrentDailyUrl } from '../supabase/functions/_shared/stooq-daily.mjs';
import { buildSnapshot } from '../scripts/update-static-snapshot.mjs';

const sampleCsv = [
  'Date,Open,High,Low,Close,Volume',
  '2026-10-26,115.00,116.00,114.00,115.50,100',
  '2026-10-27,115.50,117.00,115.00,116.25,120',
  'bad-date,1,2,1,1.5,2',
  '2026-10-28,116.25,118.00,116.00,0,80',
].join('\n');

test('Stooq QA.F CSV parser accepts dated NYMEX daily closes and rejects invalid rows', () => {
  const points = parseStooqDaily(sampleCsv);
  assert.deepEqual(points.map(({ date, value }) => ({ date, value })), [
    { date: '2026-10-26', value: 115.5 },
    { date: '2026-10-27', value: 116.25 },
  ]);
  assert.equal(isStooqBrentDailyUrl(stooqBrentDailyUrl('2026-10-01', '2026-10-31')), true);
  assert.throws(() => parseStooqDaily('No data'), /date\/close columns/);
});

test('Brent uses Stooq only after Yahoo fails and tags the selected source as fallback', async () => {
  let yahooCalls = 0;
  let stooqCalls = 0;
  const result = await fetchBrentDaily({
    fetchYahoo: async () => { yahooCalls++; throw new Error('Yahoo HTTP 503'); },
    fetchStooq: async () => { stooqCalls++; return parseStooqDaily(sampleCsv); },
  });
  assert.equal(yahooCalls, 1);
  assert.equal(stooqCalls, 1);
  assert.equal(result.provider, 'Stooq (fallback)');
  assert.equal(result.sourceRole, 'fallback');
  assert.deepEqual(result.sourceOutcomes, { yahoo: 'error', stooq: 'ok' });

  const primary = await fetchBrentDaily({
    fetchYahoo: async () => ({ points: [{ date: '2026-10-27', value: 116.25 }] }),
    fetchStooq: async () => { throw new Error('must not query fallback'); },
  });
  assert.equal(primary.provider, 'Yahoo Finance');
  assert.equal(primary.sourceRole, 'primary');

  await assert.rejects(fetchBrentDaily({
    fetchYahoo: async () => { throw new Error('Yahoo HTTP 503'); },
    fetchStooq: async () => { throw new Error('Stooq HTTP 503'); },
  }), error => {
    assert.deepEqual(error.sourceOutcomes, { yahoo: 'error', stooq: 'error' });
    return /Stooq fallback failed/.test(error.message);
  });
});

test('static snapshot records Stooq as an explicit fallback source for Brent', async () => {
  const previous = JSON.parse(await readFile(new URL('../data/snapshot.json', import.meta.url), 'utf8'));
  const now = new Date(previous.exportedAt);
  const yahooClose = Number(previous.items[0].value);
  const fallbackPriceWithinOnePercent = (yahooClose * 1.005).toFixed(10);
  const rows = [
    { id: 'brent_yahoo_bzf', symbol: 'BZ=F', provider: 'Yahoo Finance', instrumentType: 'commodity_future', unit: 'usd_per_barrel', currency: 'USD', frequency: 'daily', value: fallbackPriceWithinOnePercent, observationDate: previous.items[0].observedAt, priceTimestamp: null, sourceUrl: stooqBrentDailyUrl('2026-01-01', previous.exportedAt.slice(0, 10)) },
    { id: 'sp500_yahoo_gspc', symbol: '^GSPC', provider: 'Yahoo Finance', instrumentType: 'cash_index', unit: 'index_points', currency: 'USD', frequency: 'daily', value: previous.items[1].value, observationDate: previous.items[1].observedAt, priceTimestamp: null, sourceUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1y&interval=1d' },
    { id: 'gold_api_xau_observed_daily', symbol: 'XAU', provider: 'gold-api.com', instrumentType: 'commodity_spot', unit: 'usd_per_troy_ounce', currency: 'USD', frequency: 'daily', value: previous.items[2].value, observationDate: previous.items[2].observedAt.slice(0, 10), priceTimestamp: previous.items[2].observedAt, sourceUrl: 'https://api.gold-api.com/price/XAU' },
  ];
  const snapshot = buildSnapshot({ exportedAt: previous.exportedAt, rows }, previous, now);
  assert.equal(snapshot.items[0].source.name, 'Stooq (fallback)');
  assert.equal(snapshot.items[0].source.role, 'fallback');
  assert.equal(snapshot.items[0].source.url, rows[0].sourceUrl);
  assert.ok(Math.abs(Number(snapshot.items[0].value) / yahooClose - 1) < 0.01, 'fallback price is within 1% of the previous Yahoo close');
});
