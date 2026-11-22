import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

test('repeated market renders reuse bounded native locale formatters without changing precision or dates', async () => {
  const result = await build({
    stdin: { contents: `export { moscowClock, observationLabel, observationLagDays } from './src/lib/asOf.ts'; export { formatPriceText } from './src/lib/price.ts'; export { deskValue } from './src/lib/marketDesk.ts';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
  });
  let dates = 0, numbers = 0;
  const sandbox = {
    module: { exports: {} },
    Intl: {
      DateTimeFormat: class extends Intl.DateTimeFormat { constructor(...args) { super(...args); dates++; } },
      NumberFormat: class extends Intl.NumberFormat { constructor(...args) { super(...args); numbers++; } },
    },
  };
  vm.runInNewContext(result.outputFiles[0].text, sandbox);
  const helpers = sandbox.module.exports;
  const render = () => {
    assert.equal(helpers.moscowClock('2026-10-28T09:02:00Z'), '12:02');
    assert.match(helpers.observationLabel('2026-10-27'), /^за 27 окт/);
    assert.equal(helpers.observationLagDays('2026-10-27', new Date('2026-10-28T10:00:00Z')), 1);
    assert.equal(helpers.formatPriceText('$123.10'), '$123,10');
    assert.equal(helpers.deskValue(0.123456), '0,123456');
  };
  render();
  assert.equal(dates, 3);
  assert.equal(numbers, 2);
  for (let i = 0; i < 100; i++) render();
  assert.equal(dates, 3, 'fixed date formats are constructed only once');
  assert.equal(numbers, 2, 'repeated prices/desk cells do not reconstruct ICU formatters');
  assert.equal(helpers.formatPriceText('$123'), '$123');
  assert.equal(helpers.formatPriceText('$123.10'), '$123,10');
  assert.equal(numbers, 3, 'a new precision has a separate cached formatter');
  assert.equal(helpers.formatPriceText('—'), '—');
  assert.equal(helpers.observationLabel('not-a-date'), '');
  assert.equal(dates, 3);
  assert.equal(numbers, 3);
});
