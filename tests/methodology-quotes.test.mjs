import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const methodology = JSON.parse(await readFile(new URL('../src/lib/methodology.json', import.meta.url), 'utf8'));
const paragraphs = methodology.sections.flatMap(section => section.paragraphs);

test('/about documents same-series live-price percentages and the Brent example', () => {
  const text = paragraphs.join('\n');
  assert.match(text, /последней закрытой дневной точке того же инструмента/);
  assert.match(text, /Brent \$86,58 к пятничному закрытию \$92,57 — около −6,5 %/);
  assert.match(text, /\$92,57 к \$91,98 — около \+0,64 %/);
});

test('/about documents the four daily snapshot schedule and publish-only-on-change behavior', () => {
  const text = paragraphs.join('\n');
  assert.match(text, /00:10, 06:10, 12:10 и 18:10 UTC/);
  assert.match(text, /03:10, 09:10, 15:10 и 21:10 МСК/);
  assert.match(text, /публикуется только при наличии изменений/);
});

test('/about documents provisional Brent versions, BTC quote mode and XAU retrieval timestamps', () => {
  const text = paragraphs.join('\n');
  assert.match(text, /Котировки и дневные значения Brent могут пересматриваться/);
  assert.match(text, /live-котировка последней сделки/);
  assert.match(text, /first_retrieved_at — первой выгрузки/);
  assert.match(text, /текущая незавершённая свеча не выдаётся за закрытие/);
});
