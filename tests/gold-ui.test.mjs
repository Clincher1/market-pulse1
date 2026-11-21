import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
const directory=new URL('../.local/gold-ui-tests/',import.meta.url);
await mkdir(directory,{recursive:true});
const output=new URL('heatmap.cjs',directory);
await build({entryPoints:['src/components/MarketHeatmap.tsx'],outfile:output.pathname,bundle:true,
 platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],alias:{'@':'./src'},logLevel:'silent',
 plugins:[{name:'no-network',setup(b){b.onResolve({filter:/data\/assetPriceHistory$/},()=>({path:'history',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function fetchAssetPriceHistory() { throw new Error("Gold must use its cache, not another series"); }'}));}}]});
const Component=createRequire(import.meta.url)(output.pathname).default;
after(()=>rm(directory,{recursive:true,force:true}));
test('gold displays a live quote with empty history, no fake 0%, and an accumulation state',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.test'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>{root.render(React.createElement(Component,{assets:[{id:'gold',name:'Gold',price:'$3,500.0',change:null,sparkline:[],sparkDates:[],asOf:'2026-10-28T12:00:00Z'}],loading:false,fallbackAssetIds:[]}));});
  const tile=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Gold'));
  assert.ok(tile);assert.match(tile.textContent,/3[\s\u00a0\u202f]?500/);
  assert.doesNotMatch(tile.textContent,/0,00|нет свежей цены/);
  await act(async()=>{tile.click();});
  assert.match(document.body.textContent,/История gold-api.com накапливается/);
  assert.match(document.body.textContent,/не официальный close/);
  assert.doesNotMatch(document.body.textContent,/Twelve Data/);
 }finally{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;}
});
