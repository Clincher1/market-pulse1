import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
const exec = promisify(execFile);
const root = new URL('../', import.meta.url);
const descriptions = JSON.parse(await readFile(new URL('src/lib/pageDescriptions.json', root), 'utf8'));
test('all public routes get distinct static, Open Graph and Twitter descriptions without JavaScript', async () => {
  await mkdir(new URL('.local/',root),{recursive:true});
  const dir=await mkdtemp(new URL('.local/metadata-',root));
  try {
    await mkdir(`${dir}/dist`);
    const {writeFile}=await import('node:fs/promises');
    await writeFile(`${dir}/dist/index.html`,await readFile(new URL('index.html',root),'utf8'));
    await exec(process.execPath,[new URL('scripts/build-pages.mjs',root).pathname],{cwd:dir});
    const seen=new Set();
    for(const route of ['index','passport','russia','world','brief','news','guide','about','status']) {
      const dom=new JSDOM(await readFile(`${dir}/dist/${route}.html`,'utf8'));
      const doc=dom.window.document;
      const description=doc.querySelector('meta[name="description"]').content;
      assert.equal(description,descriptions[route==='index'?'dashboard':route==='world'?'global':route]);
      assert.equal(doc.querySelector('meta[property="og:description"]').content,description);
      assert.equal(doc.querySelector('meta[name="twitter:description"]').content,description);
      assert.ok(!seen.has(description),`duplicate on ${route}`);seen.add(description);
      assert.ok(doc.querySelector('link[rel="canonical"]').href.endsWith(route==='index'?'/':`/${route}`));
      dom.window.close();
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
