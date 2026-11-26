import test from 'node:test';
import assert from 'node:assert/strict';
import trigger, { createTelegramChannelTrigger, testPostText } from '../api/telegram/channel/trigger.js';

const now = () => new Date('2026-11-26T11:15:00+03:00');
const validEnv = {
  ADMIN_TRIGGER_KEY: 'test-admin-key-123456789',
  TELEGRAM_BOT_TOKEN_DIGEST: 'digest-token-never-return-this',
  TELEGRAM_CHANNEL_ID: '@marketpulse001',
};

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; return this; },
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function invoke(handler, { method = 'GET', key = 'test-admin-key-123456789', query = {} } = {}) {
  const res = response();
  await handler({ method, query: { key, ...query }, url: `/api/telegram/channel/trigger?key=${encodeURIComponent(key)}` }, res);
  return res;
}

function successfulTelegramFetch(calls) {
  return async (url, init) => {
    const method = url.split('/').at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body, url });
    const result = {
      getMe: { id: 777, username: 'pulsrynka_bot', is_bot: true },
      getChatMember: { status: 'administrator', can_post_messages: true },
      sendMessage: { message_id: 1234 },
    }[method];
    return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
  };
}

test('protected trigger checks identity and channel rights before sending one test message', async () => {
  const calls = [];
  const handler = createTelegramChannelTrigger({ env: validEnv, fetchImpl: successfulTelegramFetch(calls), now });
  const res = await invoke(handler);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    bot_username: '@pulsrynka_bot',
    status: 'administrator',
    can_post_messages: true,
    message_id: 1234,
    posted_at: now().toISOString(),
  });
  assert.deepEqual(calls.map((call) => call.method), ['getMe', 'getChatMember', 'sendMessage']);
  assert.deepEqual(calls[1].body, { chat_id: '@marketpulse001', user_id: 777 });
  assert.equal(calls[2].body.chat_id, '@marketpulse001');
  assert.match(calls[2].body.text, /Здравствуйте!/);
  assert.match(calls[2].body.text, /Brent/);
  assert.match(calls[2].body.text, /S&P 500/);
  assert.match(calls[2].body.text, /Золото XAU\/USD/);
  assert.match(calls[2].body.text, /https:\/\/market-pulse1-eta\.vercel\.app\//);
  assert.match(calls[2].body.text, /Не является инвестиционной рекомендацией/);
  assert.deepEqual(calls.map((call) => call.url.split('/').at(-1)), ['getMe', 'getChatMember', 'sendMessage']);
  assert.doesNotMatch(JSON.stringify(res.body), /digest-token-never-return-this/);
  assert.equal(res.headers['Cache-Control'], 'no-store, no-cache, max-age=0');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');

  const repeated = await invoke(handler);
  assert.equal(repeated.statusCode, 409);
  assert.equal(calls.length, 3, 'a repeated invocation must not send a second message');
});

test('wrong key returns 403 and does not call Telegram', async () => {
  let calls = 0;
  const handler = createTelegramChannelTrigger({ env: validEnv, fetchImpl: async () => { calls++; } });
  const res = await invoke(handler, { key: 'wrong-key' });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { ok: false, error: 'Forbidden.' });
  assert.equal(calls, 0);
});

test('missing admin key returns 503 without calling Telegram', async () => {
  let calls = 0;
  const handler = createTelegramChannelTrigger({ env: { ...validEnv, ADMIN_TRIGGER_KEY: '' }, fetchImpl: async () => { calls++; } });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /ADMIN_TRIGGER_KEY/);
  assert.equal(calls, 0);
});

test('wrong bot username stops before channel lookup and posting', async () => {
  const calls = [];
  const handler = createTelegramChannelTrigger({
    env: validEnv,
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { id: 777, username: 'another_bot' } }) };
    },
  });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.bot_username, '@another_bot');
  assert.equal(calls.length, 1);
  assert.match(res.body.error, /expected @pulsrynka_bot/);
  assert.equal(JSON.stringify(res.body).includes(validEnv.TELEGRAM_BOT_TOKEN_DIGEST), false);
});

test('missing admin posting permission stops before sendMessage', async () => {
  const calls = [];
  const handler = createTelegramChannelTrigger({
    env: validEnv,
    fetchImpl: async (url) => {
      const method = url.split('/').at(-1);
      calls.push(method);
      const result = method === 'getMe'
        ? { id: 777, username: 'pulsrynka_bot' }
        : { status: 'administrator', can_post_messages: false };
      return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
    },
  });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.status, 'administrator');
  assert.equal(res.body.can_post_messages, false);
  assert.deepEqual(calls, ['getMe', 'getChatMember']);
});

test('Telegram API error description is returned without token leakage', async () => {
  const handler = createTelegramChannelTrigger({
    env: validEnv,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error_code: 401, description: 'Unauthorized digest-token-never-return-this' }),
    }),
  });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.step, 'getMe');
  assert.equal(res.body.error, 'Unauthorized [redacted]');
  assert.doesNotMatch(JSON.stringify(res.body), /digest-token-never-return-this/);
});

test('test post contains current snapshot figures when available', () => {
  const text = testPostText(now());
  assert.match(text, /Brent: 94,61/);
  assert.match(text, /S&P 500: 7\s?182,78/);
  assert.match(text, /Золото XAU\/USD: 3\s?570,00/);
  assert.match(text, /Не является инвестиционной рекомендацией/);
});

test('only GET is accepted', async () => {
  const handler = createTelegramChannelTrigger({ env: validEnv });
  const res = await invoke(handler, { method: 'POST' });
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.headers.Allow, 'GET');
});

test('deployed default uses configured environment without exposing token', async () => {
  const res = await invoke(trigger, { key: 'not-a-valid-configured-key' });
  // The default handler remains inert without a valid admin trigger secret.
  assert.notEqual(res.statusCode, 200);
  assert.doesNotMatch(JSON.stringify(res.body), /TELEGRAM_BOT_TOKEN_DIGEST/);
});
