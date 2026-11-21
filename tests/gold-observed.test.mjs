import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { goldQuote, goldHistory, GOLD_OBSERVED_INSTRUMENT as instrument_id } from '../supabase/functions/_shared/gold-observed.ts';
const now = '2026-10-28T12:00:00Z';
const quote = {symbol:'XAU',currency:'USD',price:3500,updatedAt:now};
test('gold quote validates instrument/unit, price and future/stale timestamps', () => {
 assert.equal(goldQuote(quote,now).price,3500);
 for(const patch of [{symbol:'GC=F'},{currency:'EUR'},{price:0},{price:NaN},{price:'3500'},
  {updatedAt:'2026-10-29T12:00:00Z'},{updatedAt:'2026-10-24T12:00:00Z'},{updatedAt:'bad'}]) {
  assert.throws(()=>goldQuote({...quote,...patch},now));
 }
 assert.throws(()=>goldQuote(null,now));
});
test('new daily gold history never includes another provider, forming/future days or invalid prices', () => {
 const row=(date,price=3500)=>({instrument_id,observation_date:date,price});
 assert.deepEqual(goldHistory([row('2026-10-28'),row('2026-10-29'),row('2026-10-27'),
  row('2026-10-26',0),row('2026-02-30'),{...row('2026-10-25'),instrument_id:'gold_twelve_xauusd_daily'}],now,now),
 [{date:'2026-10-27',value:3500}]);
 assert.deepEqual(goldHistory([],now,now),[]);
});
test('gold history respects quote date even when fetched on a later day', () => {
 assert.deepEqual(goldHistory([{instrument_id,observation_date:'2026-10-28',price:3500}],
  '2026-10-28T21:00:00Z','2026-10-29T01:00:00Z'),[]);
});
test('gold migration preserves old data, closes legacy snapshots and records monotonic observations', () => {
 const sql=readFileSync('supabase/migrations/20261121063921_gold_observed_series.sql','utf8');
 assert.match(sql,/CREATE TABLE public\.legacy_gold_cache/);
 assert.doesNotMatch(sql,/DELETE FROM|TRUNCATE/i);
 assert.match(sql,/old\.price_timestamp < EXCLUDED\.price_timestamp/);
 assert.match(sql,/REVOKE ALL ON FUNCTION.*FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/a->>'id' <> 'gold'/);
 assert.match(sql,/sparkline='\[\]'::jsonb.*change=NULL/);
});
test('expanded panel and current row use the same new gold instrument', () => {
 const panel=readFileSync('src/data/assetPriceHistory.ts','utf8');
 assert.match(panel,/gold: 'gold_api_xau_observed_daily'/);
 assert.doesNotMatch(panel,/gold: 'gold_twelve/);
});

test('monitoring distinguishes bounded gold accumulation from missing/broken data', async()=>{
 const {goldAccumulating,GOLD_OBSERVED_LABEL}=await import('../supabase/functions/_shared/gold-observed.ts');
 const row={id:'gold',source_label:GOLD_OBSERVED_LABEL,change:null,sparkline:[],spark_dates:[],as_of:now};
 assert.equal(goldAccumulating(row,now,now),true);
 assert.equal(goldAccumulating({...row,change:0},now,now),false);
 assert.equal(goldAccumulating({...row,source_label:'Twelve Data'},now,now),false);
 assert.equal(goldAccumulating({...row,spark_dates:['2026-10-27']},now,now),false);
 assert.equal(goldAccumulating(row,'2026-10-24T00:00:00Z',now),false);
 assert.equal(goldAccumulating(row,'2026-10-29T00:00:00Z',now),false);
});
