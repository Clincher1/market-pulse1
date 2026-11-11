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

test('Retry-After источника важнее нашего бэкоффа', async () => {
  const { retryDelayMs, retryAfterMs, MAX_WAIT_MS } = await import('../api/_shared/fetchRetry.js');
  const error = Object.assign(new Error('HTTP 429 retry-after=2'), { retryAfterMs: 2000 });
  assert.equal(retryAfterMs(error), 2000);
  // Пауза не короче сказанной источником, даже если наш бэкофф меньше.
  assert.ok(retryDelayMs(1, error, () => 0) >= 2000);
  assert.equal(MAX_WAIT_MS, 5000);
});

test('пауза перед повтором раскидывается случайно, но не короче базовой', async () => {
  const { retryDelayMs } = await import('../api/_shared/fetchRetry.js');
  const fast = retryDelayMs(1, new Error('HTTP 503'), () => 0);
  const slow = retryDelayMs(1, new Error('HTTP 503'), () => 1);
  assert.ok(fast >= 180, `слишком короткая пауза: ${fast}`);
  assert.notEqual(fast, slow, 'нет разброса — повторы пойдут синхронным залпом');
});

test('источник, попросивший паузу дольше бюджета запуска, не повторяется', async () => {
  let calls = 0;
  const error = new Error('HTTP 429 retry-after=120');
  error.retryAfterMs = 120000;
  await assert.rejects(
    () =>
      withRetry(async () => {
        calls += 1;
        throw error;
      }),
    /retry-after/,
  );
  assert.equal(calls, 1, 'повтор раньше просьбы источника — это и есть блокировка');
});

test('очередь по хосту не пускает второй запрос к тому же адресу', async () => {
  const { hostQueue } = await import('../api/_shared/fetchRetry.js');
  const runOnHost = hostQueue({ limit: 1 });
  // Считаем отдельно по каждому адресу: у разных изданий запросы идут
  // параллельно, это нормально. Залп недопустим внутри одного адреса.
  const active = new Map();
  const peak = new Map();
  const job = (url) =>
    runOnHost(url, async () => {
      const host = new URL(url).host;
      active.set(host, (active.get(host) || 0) + 1);
      peak.set(host, Math.max(peak.get(host) || 0, active.get(host)));
      await new Promise((resolve) => setTimeout(resolve, 20));
      active.set(host, active.get(host) - 1);
      return url;
    });
  const results = await Promise.all([
    job('https://www.kommersant.ru/rss/section-economics.xml'),
    job('https://www.kommersant.ru/rss/section-business.xml'),
    job('https://www.vedomosti.ru/rss/rubric/economics'),
  ]);
  assert.equal(results.length, 3);
  assert.equal(peak.get('www.kommersant.ru'), 1, `к Коммерсанту ушло ${peak.get('www.kommersant.ru')} запроса одновременно`);
  assert.equal(peak.get('www.vedomosti.ru'), 1);
  // Слот освобождается после отказа: упавшая задача не блокирует очередь.
  const after = await runOnHost('https://www.kommersant.ru/x', async () => 'ok');
  assert.equal(after, 'ok');
});

test('запуск не висит дольше срока, но частный отказ не рушит снимок', async () => {
  const { withinDeadline } = await import('../api/_shared/fetchRetry.js');
  const stuck = new Promise((resolve) => setTimeout(() => resolve('поздно'), 200));
  await assert.rejects(() => withinDeadline(stuck, Date.now() + 30, 'Мосбиржа'), /срок запуска/);
  const quick = withinDeadline(Promise.resolve('ok'), Date.now() + 1000, 'ЦБ');
  assert.equal(await quick, 'ok');
});

test('таймаут ленты не повторяется, а 503 — повторяется', async () => {
  // Повтор таймаута удваивал ожидание страницы и не спасал данные: лента,
  // не ответившая за 4 секунды, не ответит и за восемь. Проверка 11.11
  // поймала это числом — 8329 мс на снимок.
  let timeoutCalls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          timeoutCalls += 1;
          throw abortError();
        },
        { retryTimeouts: false },
      ),
    /aborted/,
  );
  assert.equal(timeoutCalls, 1);

  let busyCalls = 0;
  const value = await withRetry(
    async () => {
      busyCalls += 1;
      if (busyCalls === 1) throw new Error('HTTP 503');
      return 'ok';
    },
    { retryTimeouts: false, delayMs: 1 },
  );
  assert.equal(value, 'ok');
  assert.equal(busyCalls, 2);
});
