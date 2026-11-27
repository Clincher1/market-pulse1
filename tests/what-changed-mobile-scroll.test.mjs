import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/components/WhatChanged.tsx', 'utf8');

test('mobile week-comparison table shows horizontal-scroll instructions above and below', () => {
  const mobileCues = source.match(/aria-hidden="true" className="[^"]*md:hidden"/g) ?? [];
  assert.equal(mobileCues.length, 2, 'there should be a visible mobile hint on both sides of the table');
  assert.equal((source.match(/Проведите пальцем, чтобы увидеть все столбцы/g) ?? []).length, 2);
  assert.match(source, /overflow-x-auto[^"]*rounded-xl/);
  assert.match(source, /min-w-\[640px\]/);
});

test('week-comparison table exposes horizontal scrolling to assistive technology and keyboard users', () => {
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /role="group"/);
  assert.match(source, /aria-label="[^"]*Проведите пальцем влево или вправо[^"]*клавиши со стрелками[^"]*"/);
});
