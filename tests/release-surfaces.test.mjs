import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routes} from '../scripts/static-document.mjs';
test('withdrawn API views revoke per-column privileges as well as table privileges',()=>{
 const s=readFileSync('supabase/migrations/20261121063759_close_withdrawn_archive.sql','utf8');
 assert.match(s,/market_memory_forecasts_v1/);assert.match(s,/market_memory_stats_v1/);
 assert.match(s,/REVOKE SELECT \(%s\)/);assert.match(s,/PUBLIC, anon, authenticated/);
 assert.doesNotMatch(s,/\b(?:DROP|DELETE|TRUNCATE)\b/i);
});
test('brief and share image read the sanitized snapshot, not the raw archive',()=>{
 for(const p of ['src/data/dailySnapshots.ts','api/brief-image.js']){
  const s=readFileSync(p,'utf8'); assert.match(s,/daily_snapshots_public_v1/);
 }
});
test('static route builder covers active rewrites and sitemap excludes retired memory',()=>{
 const config=JSON.parse(readFileSync('vercel.json','utf8'));
 for(const {source,destination} of config.rewrites){
  assert.equal(destination,`${source}.html`);assert.ok(Object.hasOwn(routes,source.slice(1)));
 }
 assert.ok(!Object.hasOwn(routes,'memory'));
 assert.match(readFileSync('public/robots.txt','utf8'),/Sitemap: https:\/\/market-pulse1-eta.vercel.app\/sitemap.xml/);
});
