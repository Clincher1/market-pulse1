// Отчёты об ошибках функций.
//
// Проверяется настоящий код из `_shared/observability.ts`: обёртка функции
// перехватывает и брошенную ошибку, и ответ 5xx, который функция поймала сама.
// Ничего не подделано — подменён только сетевой вызов, потому что проверять
// отправку в Sentry иначе можно было бы лишь ожиданием настоящего сбоя.
import test from 'node:test';
import assert from 'node:assert/strict';

// Модуль рассчитан на рантайм Supabase Edge; в node достаточно дать ему
// окружение. DSN здесь фиктивный: проверяется адрес, который из него строится,
// и содержимое конверта, а не настоящая доставка.
const DSN = 'https://pubkey123@o999.ingest.sentry.io/4567';
globalThis.Deno = {
  env: { get: (name) => (name === 'SENTRY_DSN' ? DSN : undefined) },
};

const { withErrorReporting } = await import('../supabase/functions/_shared/observability.ts');

const sent = [];
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: String(init?.body ?? '') });
  return new Response('{"id":"abc"}', { status: 200, headers: { 'content-type': 'application/json' } });
};

// Отправка намеренно не ждёт ответа посетителя, поэтому тесту нужно дать тик.
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

function request(path = '/functions/v1/demo') {
  return new Request(`https://hekzplfftannlzwvgwwm.supabase.co${path}`, { method: 'POST' });
}

test('пойманный отказ 5xx уходит в Sentry', async () => {
  sent.length = 0;
  const handler = async () =>
    Response.json({ success: false, error: 'источник не ответил' }, { status: 500 });
  const wrapped = withErrorReporting('demo-caught', handler);
  const response = await wrapped(request());
  await settle();

  assert.equal(response.status, 500, 'посетитель получает тот же ответ, что и раньше');
  assert.equal(sent.length, 1, 'должен уйти ровно один отчёт');
  assert.match(sent[0].url, /\/api\/4567\/envelope\//, 'адрес собран из DSN');
  assert.match(sent[0].url, /sentry_key=pubkey123/);
  assert.match(sent[0].body, /FunctionFailure/);
  assert.match(sent[0].body, /источник не ответил/);
  assert.match(sent[0].body, /"status":"500"/);
});

test('успешный ответ не репортится', async () => {
  sent.length = 0;
  const wrapped = withErrorReporting('demo-ok', async () => Response.json({ success: true }));
  const response = await wrapped(request());
  await settle();

  assert.equal(response.status, 200);
  assert.equal(sent.length, 0, 'на успех отчётов быть не должно');
});

test('ответ 4xx — отказ посетителю, а не поломка, и не репортится', async () => {
  sent.length = 0;
  const wrapped = withErrorReporting('demo-401', async () =>
    Response.json({ success: false, error: 'unauthorized' }, { status: 401 }),
  );
  await wrapped(request());
  await settle();

  assert.equal(sent.length, 0);
});

test('брошенная ошибка уходит в Sentry и остаётся брошенной', async () => {
  sent.length = 0;
  const wrapped = withErrorReporting('demo-throw', async () => {
    throw new Error('база недоступна');
  });
  await assert.rejects(() => wrapped(request()), /база недоступна/);
  await settle();

  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /база недоступна/);
  assert.match(sent[0].body, /"function":"demo-throw"/);
});

test('один и тот же отказ не отправляется каждые 15 минут', async () => {
  sent.length = 0;
  const handler = async () =>
    Response.json({ success: false, error: 'лента отдала 503' }, { status: 500 });
  const wrapped = withErrorReporting('demo-repeat', handler);

  await wrapped(request());
  await wrapped(request());
  await wrapped(request());
  await settle();

  assert.equal(sent.length, 1, 'повтор того же отказа гасится, первое событие уходит');
});

test('разные отказы одной функции не гасят друг друга', async () => {
  sent.length = 0;
  const first = withErrorReporting('demo-distinct', async () =>
    Response.json({ success: false, error: 'нет ключа' }, { status: 500 }),
  );
  const second = withErrorReporting('demo-distinct', async () =>
    Response.json({ success: false, error: 'нет базы' }, { status: 503 }),
  );

  await first(request());
  await second(request());
  await settle();

  assert.equal(sent.length, 2);
});
