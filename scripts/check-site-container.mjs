// Read-only layout comparison; deterministic missing-data states, no source audit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '../.local/feature-browser/node_modules/playwright/index.mjs';
import binary from '../.local/feature-browser/node_modules/@sparticuz/chromium/build/index.js';
const origin=process.env.CONTAINER_ORIGIN||'http://127.0.0.1:5174';
const before=process.env.CONTAINER_BEFORE_ORIGIN;
const output=process.env.CONTAINER_OUTPUT||'.local/site-container';
const expected=process.env.CONTAINER_EXPECTED_ENTRY;
const paths=['/','/passport','/russia','/world','/brief','/news','/guide','/about','/status'];
const widths=process.env.CONTAINER_WIDTHS?.split(',').map(Number)||[360,768,1024,1440,1536,639,640,1023];
const selectors=['.site-header__inner','main','.site-footer','.site-footer__panel'];
const report={scope:'Shared container geometry; offline/missing-data layout, not live data or performance acceptance',origin,before,expected,cases:[],failures:[]};
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:await binary.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
try {
  for(const round of ['A','B']) for(const width of widths) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.route('**/*',route=>{
      const request=route.request();const url=new URL(request.url());
      if(!['GET','HEAD','OPTIONS'].includes(request.method())||url.pathname.startsWith('/api/')||![origin,before].filter(Boolean).some(host=>url.origin===host))return route.abort();
      return route.continue();
    });
    const page=await context.newPage();
    async function measure(host,path,checkEntry) {
      const response=await page.goto(host+path,{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      await page.locator('h1').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      if(checkEntry&&expected) assert.ok((await page.locator('script[type="module"][src]').first().getAttribute('src')).includes(expected));
      return page.evaluate(selectors=>({
        overflow:document.documentElement.scrollWidth>innerWidth,
        boxes:selectors.map(selector=>{
          const el=document.querySelector(selector);const box=el.getBoundingClientRect();const style=getComputedStyle(el);
          return {selector,x:box.x,width:box.width,paddingLeft:parseFloat(style.paddingLeft),paddingRight:parseFloat(style.paddingRight),marginLeft:parseFloat(style.marginLeft),marginRight:parseFloat(style.marginRight)};
        }),
      }),selectors);
    }
    for(const path of paths) {
      try {
        const baseline=before?await measure(before,path,false):null;
        const actual=await measure(origin,path,true);
        const gutter=width>=1024?40:width>=640?24:16;
        const outerWidth=Math.min(width,1400);const outerX=(width-outerWidth)/2;
        assert.equal(actual.overflow,false,`${path}: overflow`);
        for(const box of actual.boxes.slice(0,3)) {
          for(const [key,value] of Object.entries({x:outerX,width:outerWidth,paddingLeft:gutter,paddingRight:gutter})) assert.ok(Math.abs(box[key]-value)<.1,`${box.selector} ${key}: ${box[key]} != ${value}`);
        }
        const panel=actual.boxes[3];
        assert.ok(Math.abs(panel.x-(outerX+gutter))<.1,'Footer panel must align with main content edge');
        assert.ok(Math.abs(panel.width-(outerWidth-2*gutter))<.1,'Footer panel must retain its width');
        if(baseline) assert.deepEqual(actual,baseline,'Container geometry must match the preceding build exactly');
        report.cases.push({round,width,path,baseline,actual});
      } catch(error) { report.failures.push({round,width,path,message:error.message}); }
    }
    await context.close();
    await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
  }
} finally {await browser.close();}
assert.equal(report.cases.length+report.failures.length,paths.length*widths.length*2);
console.log(JSON.stringify({cases:report.cases.length,failures:report.failures}));
if(report.failures.length)process.exitCode=1;
