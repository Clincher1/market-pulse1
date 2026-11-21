import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const css = await readFile('src/index.css','utf8');
test('page shell owns one shared maximum width and responsive gutter system',()=>{
  assert.match(css,/:root\s*\{\s*--layout-max-width: 1400px;\s*--layout-gutter: 16px;/);
  for (const [breakpoint,gutter] of [[640,24],[1024,40]]) {
    assert.match(css,new RegExp(`@media \\(min-width: ${breakpoint}px\\)\\s*\\{\\s*:root\\s*\\{ --layout-gutter: ${gutter}px; \\}`));
  }
  const rule=css.match(/\.site-container\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  for (const declaration of ['width: 100%','max-width: var(--layout-max-width)','margin-inline: auto','padding-inline: var(--layout-gutter)']) assert.ok(rule.includes(declaration));
});
test('header, main and footer use the shared shell without local horizontal overrides',async()=>{
  for(const [path,pattern] of [
    ['src/App.tsx',/<main\b[\s\S]*?className="([^"]+)"/],
    ['src/components/Header.tsx',/className="(site-header__inner[^"]+)"/],
    ['src/components/Footer.tsx',/<footer\b[^>]*className="([^"]+)"/],
  ]) {
    const source=await readFile(path,'utf8');
    const classes=source.match(pattern)?.[1];
    assert.ok(classes,path);
    assert.ok(classes.split(' ').includes('site-container'),path);
    assert.doesNotMatch(classes,/(?:^|\s)(?:\w+:)*(?:max-w-|px-|pl-|pr-|mx-)/,path);
  }
});
