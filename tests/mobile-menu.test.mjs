import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
const dir = new URL('../.local/mobile-menu-tests/', import.meta.url);
await mkdir(dir, {recursive:true});
const out = new URL('header.cjs',dir);
await build({entryPoints:['src/components/Header.tsx'],outfile:out.pathname,bundle:true,
  platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],alias:{'@':'./src'},logLevel:'silent',
  plugins:[{name:'no-animation',setup(b) {
    b.onResolve({filter:/^framer-motion$/},()=>({path:'motion',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`
      import React from 'react';
      const cache = {};
      export const m = new Proxy(cache, {get: (_,tag) => {
        return cache[tag] ??= ({initial,animate,transition,...props}) => React.createElement(tag,props);
      }});
      export const useReducedMotion=()=>true;
    `}));
  }}]});
const Header=createRequire(import.meta.url)(out.pathname).default;
after(()=>rm(dir,{recursive:true,force:true}));
test('mobile disclosure closes with Escape, outside press and link click; Escape restores focus',async()=>{
  const dom=new JSDOM('<div id="root"></div><button id="outside">Outside</button>',{url:'https://example.test/'});
  const previous=new Map();
  for(const key of ['window','document','Element','HTMLElement','Node','IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  }
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Header,{activeView:'dashboard'})));
    const opener=document.querySelector('.site-header__mobile-toggle');
    await act(async()=>opener.click());
    assert.equal(opener.getAttribute('aria-expanded'),'true');
    const menu=document.getElementById('mobile-navigation');
    assert.equal(menu.querySelectorAll('[role="group"]').length,2);
    for(const group of menu.querySelectorAll('[role="group"]')) assert.ok(group.querySelectorAll('a').length<=7);
    menu.querySelector('a').focus();
    await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(document.getElementById('mobile-navigation'),null);
    assert.equal(document.activeElement,opener);
    await act(async()=>opener.click());
    await act(async()=>document.getElementById('outside').dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true})));
    assert.equal(opener.getAttribute('aria-expanded'),'false');
    await act(async()=>opener.click());
    const link=document.querySelector('#mobile-navigation a');
    // Prevent JSDOM's unsupported full-document navigation; exercise the real click handler.
    link.addEventListener('click',event=>event.preventDefault());
    await act(async()=>link.click());
    assert.equal(document.getElementById('mobile-navigation'),null);
  } finally {
    await act(async()=>root.unmount());
    dom.window.close();
    for(const [key,descriptor] of previous) {
      if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
    }
  }
});
