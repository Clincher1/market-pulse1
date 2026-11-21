import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('market explanations and spread formulas do not shrink back to 11px',async()=>{
  for(const name of ['BusinessMoney','MoneySpreads','RussiaBusiness','DailyBrief','DailyPassport','SystemStatus','MarketHeatmap','WhatChanged']) {
    const source=await readFile(`src/components/${name}.tsx`,'utf8');
    for(const paragraph of source.matchAll(/<p\b[^>]*className="[^"]*/g)) {
      assert.doesNotMatch(paragraph[0],/text-\[11px\]/,`${name}: prose must be at least 12px`);
    }
    if(name==='MoneySpreads') assert.doesNotMatch(source,/text-\[11px\]/,'spread formula, basis and meaning must remain legible');
  }
});
