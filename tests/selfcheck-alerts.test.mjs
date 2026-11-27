import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selfcheckFailureDelta } from '../supabase/functions/_shared/selfcheck-alerts.mjs';

const green = { asset_quote_lag: { ok: true, detail: 'series includes completed session' } };
const red = { asset_quote_lag: { ok: false, detail: 'session 26 missing' } };

test('selfcheck alerts once for a new unresolved failure and suppresses exact repeats', () => {
  assert.equal(selfcheckFailureDelta(red, green).shouldNotify, true);
  assert.equal(selfcheckFailureDelta(red, red).shouldNotify, false);
  assert.equal(selfcheckFailureDelta(red, red).newOrChanged.length, 0);
});

test('selfcheck alerts when the same check fails with different content', () => {
  const changed = { asset_quote_lag: { ok: false, detail: 'session 27 missing' } };
  const delta = selfcheckFailureDelta(changed, red);
  assert.equal(delta.shouldNotify, true);
  assert.deepEqual(delta.newOrChanged.map(([name]) => name), ['asset_quote_lag']);
});

test('selfcheck always alerts on recovery, including when another failure remains unchanged', () => {
  const previous = {
    asset_quote_lag: { ok: false, detail: 'session 26 missing' },
    telegram_config: { ok: false, detail: 'token missing' },
  };
  const current = {
    asset_quote_lag: { ok: true, detail: 'series includes completed session' },
    telegram_config: { ok: false, detail: 'token missing' },
  };
  const delta = selfcheckFailureDelta(current, previous);
  assert.equal(delta.shouldNotify, true);
  assert.deepEqual(delta.recovered, ['asset_quote_lag']);
});

test('selfcheck notification path uses content-based dedup and states recovery', async () => {
  const source = await readFile(new URL('../supabase/functions/selfcheck/index.ts', import.meta.url), 'utf8');
  assert.match(source, /selfcheckFailureDelta\(results, previousChecks\)/);
  assert.match(source, /if \(!failureDelta\.shouldNotify && !backupTransition\) return/);
  assert.match(source, /for \(const name of failureDelta\.recovered\)/);
});
