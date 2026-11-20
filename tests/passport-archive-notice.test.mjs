import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('immutable snapshots disclose known legacy gold calculation limitations', async () => {
  const source = await readFile(new URL('../src/components/DailyPassport.tsx', import.meta.url), 'utf8');
  assert.match(source, /Сильнейшее движение в исходной записи/);
  assert.match(source, /Такие проценты и лидер снимка могут быть неверны/);
  assert.match(source, /записи оставлены без изменений/);
});
