import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTelegramMessage } from '../scripts/send-telegram.js';

const token = '123456:private-bot-token';
const chatId = '-1009988776655';
const okResponse = () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { message_id: 42 } }) });

test('Telegram success logs an HTTP 200 delivery confirmation without credentials', async () => {
  const logs = [];
  let request;
  const result = await sendTelegramMessage({
    token,
    chatId,
    text: 'Test notification',
    fetchImpl: async (...args) => { request = args; return okResponse(); },
    logger: line => logs.push(line),
    sleep: async () => assert.fail('successful request must not retry'),
  });

  assert.deepEqual(result, { ok: true, status: 200, attempts: 1, error: null });
  assert.equal(request[1].method, 'POST');
  assert.equal(JSON.parse(request[1].body).chat_id, chatId);
  assert.equal(request[1].signal instanceof AbortSignal, true);
  assert.ok(logs.some(line => line.includes('::notice') && line.includes('HTTP 200') && line.includes('ok=true')));
  assert.ok(logs.every(line => !line.includes(token) && !line.includes(chatId)));
});

test('Telegram retries rate limits according to retry_after and then confirms delivery', async () => {
  const logs = [];
  const delays = [];
  let attempts = 0;
  const result = await sendTelegramMessage({
    token,
    chatId,
    text: 'Test notification',
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 429, text: async () => JSON.stringify({ ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3 } }) };
      return okResponse();
    },
    sleep: async ms => delays.push(ms),
    logger: line => logs.push(line),
  });

  assert.deepEqual(result, { ok: true, status: 200, attempts: 2, error: null });
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [3000]);
  assert.ok(logs.some(line => line.includes('HTTP 429')));
  assert.ok(logs.some(line => line.includes('HTTP 200') && line.includes('ok=true')));
});

test('Telegram permanent API errors report status and safe description, redact credentials', async () => {
  const logs = [];
  const result = await sendTelegramMessage({
    token,
    chatId,
    text: 'Test notification',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ ok: false, error_code: 400, description: `Bad Request ${token} ${chatId}` }),
    }),
    sleep: async () => assert.fail('permanent 400 must not retry'),
    logger: line => logs.push(line),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.attempts, 1);
  assert.ok(logs.some(line => line.includes('HTTP 400') && line.includes('Bad Request')));
  assert.ok(logs.every(line => !line.includes(token) && !line.includes(chatId)));
});

test('Telegram transport failures retry with bounded backoff and keep endpoint private', async () => {
  const logs = [];
  const delays = [];
  const result = await sendTelegramMessage({
    token,
    chatId,
    text: 'Test notification',
    fetchImpl: async () => { throw new TypeError(`fetch failed ${token} ${chatId}`); },
    sleep: async ms => delays.push(ms),
    logger: line => logs.push(line),
  });

  assert.deepEqual(result, { ok: false, status: null, attempts: 3, error: 'TypeError' });
  assert.deepEqual(delays, [1000, 2000]);
  assert.ok(logs.at(-1).includes('No HTTP response after 3 attempt(s)'));
  assert.ok(logs.every(line => !line.includes(token) && !line.includes(chatId)));
});

test('Telegram refuses to request when token or chat ID secrets are absent', async () => {
  const logs = [];
  let called = false;
  const result = await sendTelegramMessage({
    token: '',
    chatId: '',
    text: 'Test notification',
    fetchImpl: async () => { called = true; },
    logger: line => logs.push(line),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.equal(called, false);
  assert.match(logs[0], /TELEGRAM_BOT_TOKEN.*TELEGRAM_CHAT_ID/);
});
