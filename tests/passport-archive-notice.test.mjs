import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditPassportGold } from '../src/lib/passportGold.ts';
const history = [{ date: '2026-11-18', value: 3723.72756 }, { date: '2026-11-19', value: 3666.8714 }];
const gold = { price: '$3,556.3', last: 3666.8714, change: -4.4976, as_of: '2026-11-20T03:54:35Z' };
test('legacy gold is corrected from that snapshot price, not a later ticker', () => {
  const before = structuredClone(gold);
  const audit = auditPassportGold(gold, history);
  assert.equal(audit.baseDate, '2026-11-19');
  assert.equal(audit.baseValue, 3666.8714);
  assert.equal(audit.change.toFixed(4), '-3.0154');
  assert.deepEqual(gold, before);
  assert.notEqual(audit.change.toFixed(4), gold.change.toFixed(4));
});
test('unknown, conflicting or missing gold evidence never reuses the old percent', () => {
  for (const [asset, rows] of [[gold, []], [{ ...gold, last: 999 }, history],
    [{ ...gold, last_date: '2026-11-18' }, history], [{ ...gold, as_of: null }, history],
    [{ ...gold, price: '' }, history], [gold, [...history, history[1]]],
    [{ ...gold, as_of: '2026-12-20' }, history]]) {
    assert.equal(auditPassportGold(asset, rows).change, null);
  }
});
test('dated gold closing price is compared with its previous close', () => {
  const result = auditPassportGold({ price: '$3,666.9', last: 3666.8714, as_of: '2026-11-19' }, history);
  assert.equal(result.baseDate, '2026-11-18');
  assert.equal(result.change.toFixed(2), '-1.53');
});
test('archive offers original numbers separately and excludes unverifiable gold leaders', async () => {
  const source = await readFile(new URL('../src/components/DailyPassport.tsx', import.meta.url), 'utf8');
  assert.match(source, /Исходные проценты снимков/);
  assert.match(source, /Исходные записи оставлены без изменений/);
  assert.match(source, /Золото исключено из выбора лидера/);
});

test('guide distinguishes immutable source percentages from the verified derived return', async () => {
  const source = await readFile(new URL('../src/components/AnalyticsGuide.tsx', import.meta.url), 'utf8');
  assert.match(source, /Производный процент золота проверяется отдельно/);
  assert.match(source, /Исходные проценты доступны/);
  assert.doesNotMatch(source, /через неделю видно ровно то/);
});
