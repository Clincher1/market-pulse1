// Очередь задач по слотам: связь документа с реестром.
//
// Очередь — это не список пожеланий. Если номер слота в ней разойдётся с
// реестром в коде, разговор «слот 14» начнёт означать разное у владельца и у
// писателя. Поэтому документ проверяется тестом: 33 номера, допустимые
// статусы, совпадение ключей, и статус не врёт о том, есть ли у слота выбор.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SLOTS, slotByNumber } from '../supabase/functions/_shared/slots.ts';

const ALLOWED = new Set(['готов', 'в очереди', 'нужно решение', 'нельзя', 'наблюдаем']);

async function queueRows() {
  const text = await readFile(new URL('../docs/SLOT-QUEUE.md', import.meta.url), 'utf8');
  const start = text.indexOf('<!-- SLOT-QUEUE:START -->');
  const end = text.indexOf('<!-- SLOT-QUEUE:END -->');
  assert.ok(start >= 0 && end > start, 'в документе нет размеченного блока очереди');
  const block = text.slice(start, end);
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      return {
        number: Number(cells[0]),
        id: cells[1].replace(/`/g, ''),
        status: cells[2],
        next: cells[3] ?? '',
      };
    });
}

test('в очереди ровно 33 слота, каждый по одному разу', async () => {
  const rows = await queueRows();
  assert.equal(rows.length, SLOTS.length, `строк в очереди ${rows.length}, слотов ${SLOTS.length}`);
  const numbers = rows.map((row) => row.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, SLOTS.map((slot) => slot.number), 'номера в очереди не совпадают с реестром');
});

test('ключи и статусы совпадают с реестром, посторонних статусов нет', async () => {
  for (const row of await queueRows()) {
    const slot = slotByNumber(row.number);
    assert.ok(slot, `слота ${row.number} нет в реестре`);
    assert.equal(row.id, slot.id, `слот ${row.number}: в очереди ${row.id}, в реестре ${slot.id}`);
    assert.ok(ALLOWED.has(row.status), `слот ${row.number}: неизвестный статус «${row.status}»`);
    assert.ok(row.next.length > 10, `слот ${row.number}: не сказано, что дальше`);
  }
});

test('«готов» не ставится слоту без описанного источника, а «нельзя» — слоту с выбором', async () => {
  for (const row of await queueRows()) {
    const slot = slotByNumber(row.number);
    if (row.status === 'готов') {
      assert.ok(slot.sources.length >= 1, `слот ${row.number}: «готов» без источника`);
      // Готовый слот обязан объяснить свой источник — иначе «готов» означает
      // «мы не смотрели», а не «проверено».
      assert.ok(slot.note.length > 40, `слот ${row.number}: готов, но не объяснено, почему так`);
    }
    if (row.status === 'нельзя') {
      assert.equal(slot.canChoose, false, `слот ${row.number}: «нельзя», но выбор включён`);
    }
  }
});

test('очередь не обещает выбора там, где его нет', async () => {
  // Статус «нужно решение» имеет смысл только у слота, которому действительно
  // можно назначить другой источник. Иначе владелец ждёт кнопку, которой не
  // будет, — это тот же обман, что и заглушка.
  for (const row of await queueRows()) {
    if (row.status !== 'нужно решение') continue;
    const slot = slotByNumber(row.number);
    assert.equal(slot.canChoose, true, `слот ${row.number}: «нужно решение», но выбор запрещён`);
  }
});

test('документ объясняет, как ставить задачу, и не обещает скрытых шагов', async () => {
  const text = await readFile(new URL('../docs/SLOT-QUEUE.md', import.meta.url), 'utf8');
  assert.match(text, /Слот <номер>: что сделать/, 'нет шаблона постановки задачи');
  assert.match(text, /нет квоты — нет источника/, 'не назван главный барьер конвейера');
  // «Готово» обязано опираться на проверяемое, а не на слово.
  for (const proof of ['коммит', 'реестр', 'расход', 'проверк']) {
    assert.ok(text.toLowerCase().includes(proof), `в разделе «чем доказывается готово» нет «${proof}»`);
  }
});
