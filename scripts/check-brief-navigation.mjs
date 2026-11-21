// Header-only read-only checks. No API writes, telemetry or quote certification.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../.local/feature-browser/node_modules/playwright/index.mjs';
import binary from '../.local/feature-browser/node_modules/@sparticuz/chromium/build/index.js';
const origin=process.env.NAV_ORIGIN||'http://127.0.0.1:5174';
const output=process.env.NAV_OUTPUT||'.local/brief-navigation';
const expected=process.env.NAV_EXPECTED_ENTRY;
const report={scope:'Brief discoverability and header geometry only; API requests blocked',origin,expected,cases:[],failures:[]};
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:await binary.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
try {
  for(const round of ['A','B']) for(const width of [360,768,1024,1440]) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.route('**/*',route=>{
      const req=route.request();const url=new URL(req.url());
      return url.origin===origin&&!url.pathname.startsWith('/api/')&&['GET','HEAD','OPTIONS'].includes(req.method())?route.continue():route.abort();
    });
    const page=await context.newPage();
    for(const path of ['/','/passport','/russia','/world','/brief','/news','/guide','/about','/status']) {
      try {
        assert.equal((await page.goto(origin+path,{waitUntil:'networkidle'})).status(),200);
        await page.locator('h1').waitFor();await page.evaluate(()=>document.fonts.ready);
        if(expected)assert.ok((await page.locator('script[type="module"][src]').first().getAttribute('src')).includes(expected));
        const metrics=await page.evaluate(()=>{
          const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height};};
          const desktop=innerWidth>=1024;
          const nav=document.querySelector(desktop?'.desktop-navigation':'.mobile-quick-nav');
          const links=[...nav.querySelectorAll(':scope > a')];
          const brief=links[1];const header=document.querySelector('.site-header__inner');
          const padding=parseFloat(getComputedStyle(header).paddingRight);
          return {desktop,links:links.map(a=>({href:a.getAttribute('href'),text:a.textContent.trim(),...box(a)})),
            briefHref:brief.getAttribute('href'),briefName:brief.getAttribute('aria-label')||brief.textContent.trim(),briefActive:brief.getAttribute('aria-current'),
            nav:box(nav),brand:box(document.querySelector('.site-brand')),header:box(header),padding,
            duplicateInMore:!!document.querySelector('.desktop-navigation details a[href="/brief"]'),
            overflow:document.documentElement.scrollWidth>innerWidth};
        });
        assert.equal(metrics.links[0].href,'/');assert.equal(metrics.briefHref,'/brief');
        assert.equal(metrics.briefName,'Бриф за 60 секунд');assert.equal(metrics.duplicateInMore,false);
        assert.equal(metrics.briefActive,path==='/brief'?'page':null);
        assert.equal(metrics.overflow,false);
        for(const link of metrics.links) {
          assert.ok(link.width>=43.5&&link.height>=43.5,`Undersized ${link.text}`);
          assert.ok(link.x>=metrics.nav.x-.5&&link.right<=metrics.nav.right+.5,`Clipped ${link.text}`);
        }
        if(metrics.desktop) {
          assert.equal(metrics.links[1].text,'Бриф за 60 секунд');
          assert.ok(metrics.brand.right+8<=metrics.nav.x,'Navigation overlaps logo');
          assert.ok(metrics.nav.right<=metrics.header.right-metrics.padding+.5,'Navigation escapes content gutter');
        }
        report.cases.push({round,width,path,...metrics});
        if(round==='A'&&path==='/'&&[360,1024,1440].includes(width))await page.screenshot({path:`${output}/header-${width}.png`});
      } catch(error) {report.failures.push({round,width,path,message:error.message});}
    }
    await context.close();await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
  }
}finally{await browser.close();}
console.log(JSON.stringify({cases:report.cases.length,failures:report.failures}));
if(report.failures.length||report.cases.length!==72)process.exitCode=1;
