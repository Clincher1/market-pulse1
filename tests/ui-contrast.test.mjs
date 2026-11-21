import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = await readFile('src/brand-refresh.css', 'utf8');
const rgb = hex => hex.replace('#', '').match(/../g).map(c => parseInt(c, 16));
function luminance(channels) {
  const [r,g,b] = channels.map(c => { const v=c/255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; });
  return .2126*r+.7152*g+.0722*b;
}
const ratio = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
function checkGradient(from, to, ink, label) {
  for (let i=0;i<=20;i++) {
    const background = rgb(from).map((v,c) => v+(rgb(to)[c]-v)*i/20);
    assert.ok(ratio(rgb(ink),background)>=4.5, `${label}: stop ${i}/20 has insufficient contrast`);
  }
}
test('active route gradients, including both ends and intermediate stops, meet AA for small text', () => {
  for (const id of ['dashboard','brief','passport','russia','global','news']) {
    const block=css.match(new RegExp(`\\.desktop-navigation__link\\[data-theme='${id}'\\] \\{([^}]+)\\}`))?.[1];
    assert.ok(block);
    const variable = key => block.match(new RegExp(`--${key}:\\s*(#[0-9a-f]{6})`))?.[1];
    checkGradient(variable('nav-main'),variable('nav-alt'),variable('nav-active-ink')||'#ffffff',id);
  }
  const more = css.match(/\.desktop-navigation__more\[open\] > \.desktop-navigation__more-trigger\s*\{([^}]+)\}/)?.[1];
  const stops = more?.match(/linear-gradient\(120deg,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/);
  assert.ok(stops, 'More hover/open gradient must be included in contrast checks');
  checkGradient(stops[1],stops[2],'#ffffff','More menu hover');
  assert.match(css,/\.desktop-navigation__link\.is-active\s*\{\s*color: var\(--nav-active-ink, #fff\)/);
});
test('small path label uses a readable neutral on white and page background', () => {
  const block=css.match(/\.page-signal-intro__path-label\s*\{([^}]+)\}/)?.[1];
  const color=block.match(/color:\s*(#[0-9a-f]{6})/)[1];
  for (const background of ['#ffffff','#f4f7fb']) assert.ok(ratio(rgb(color),rgb(background))>=4.5);
});
