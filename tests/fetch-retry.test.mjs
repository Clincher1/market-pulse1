import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isTransientError, withRetry } from '../api/_shared/fetchRetry.js';

/**
 * Повтор появился потому, что самопроверка дважды за сутки ловила красное
 * «Блок Россия наполнен»: Мосбиржа и SOAP-сервис ЦБ изредка не укладывались в
 * таймаут, индикатор выпадал из снимка, а через час всё было зелено.
 *
 * Повтор обязан быть узким. Если он начнёт глотать ошибки разбора, сайт будет
 * показывать старые числа, считая, что «источник просто задумался» — это уже
 * не устойчивость, а тихая ложь.
 */

const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

test('таймаут повторяется один раз и со второго раза проходит', async () => {
  let calls = 0;
  const value = await withRetry(async () => {
    calls += 1;
    if (calls === 1) throw abortError();
    return 'ok';
  });
  assert.equal(value, 'ok');
  assert.equal(calls, 2);
});

test('вторая неудача поднимается наверх, а не превращается в пустое значение', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls += 1;
        throw abortError();
      }),
    /aborted/,
  );
  assert.equal(calls, 2, 'должно быть ровно две попытки, а не бесконечный цикл');
});

test('ошибка разбора не повторяется: второй такой же ответ ничего не изменит', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls += 1;
        throw new SyntaxError('Unexpected token < in JSON');
      }),
    /Unexpected token/,
  );
  assert.equal(calls, 1);
});

test('HTTP 5xx и 429 считаются временными, 404 — нет', async () => {
  assert.equal(isTransientError(new Error('HTTP 503')), true);
  assert.equal(isTransientError(new Error('HTTP 429')), true);
  assert.equal(isTransientError(new Error('HTTP 404')), false);
});

test('сетевой сбой повторяется, а логическая ошибка — нет', async () => {
  let networkCalls = 0;
  const fetchFailed = Object.assign(new Error('fetch failed'), { name: 'TypeError' });
  await assert.rejects(() =>
    withRetry(async () => {
      networkCalls += 1;
      throw fetchFailed;
    }),
  );
  assert.equal(networkCalls, 2);

  let logicalCalls = 0;
  await assert.rejects(() =>
    withRetry(async () => {
      logicalCalls += 1;
      throw new Error('в окне нет ни одной ступени ставки');
    }),
  );
  assert.equal(logicalCalls, 1);
});

test('успех с первой попытки не ждёт и не повторяется', async () => {
  let calls = 0;
  const started = Date.now();
  const value = await withRetry(async () => {
    calls += 1;
    return 42;
  });
  assert.equal(value, 42);
  assert.equal(calls, 1);
  assert.ok(Date.now() - started < 100, 'без ошибки паузы быть не должно');
});
