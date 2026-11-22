import test from 'node:test';
import assert from 'node:assert/strict';
import setup, { createTelegramSupportSetupHandler } from '../api/telegram-support-setup.js';

const secret = 'localGeneratedSecret_0123456789_ABCDEFG';
const env = {
  TELEGRAM_BOT_TOKEN: 'fake-token-not-real',
  TELEGRAM_SUPPORT_ADMIN_ID: '123456789',
  TELEGRAM_WEBHOOK_SECRET: secret,
};

function response() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

async function invoke(handler, { method = 'GET', body = {}, headers = {} } = {}) {
  const res = response();
  await handler({ method, body, headers }, res);
  return res;
}

test('GET serves a no-store mobile form and never includes configured secrets', async () => {
  const res = await invoke(setup);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
  assert.match(res.body, /method="post"/);
  assert.match(res.body, /type="password"/);
  assert.match(res.body, /Токен бота вводить здесь не нужно/);
  assert.doesNotMatch(res.body, /fake-token-not-real|localGeneratedSecret/);
});

test('POST rejects missing configuration and a wrong secret regardless of Origin', async () => {
  const calls = [];
  const fetchImpl = async (...args) => { calls.push(args); return { ok: true, json: async () => ({ ok: true }) }; };
  assert.equal((await invoke(createTelegramSupportSetupHandler({ env: {}, fetchImpl }), { method: 'POST', body: { secret } })).statusCode, 503);
  assert.equal((await invoke(createTelegramSupportSetupHandler({ env, fetchImpl }), { method: 'POST', body: { secret: 'wrong' } })).statusCode, 403);
  assert.equal((await invoke(createTelegramSupportSetupHandler({ env, fetchImpl }), {
    method: 'POST', body: { secret: 'wrong' }, headers: { origin: 'https://attacker.example' },
  })).statusCode, 403);
  assert.equal(calls.length, 0);
});

test('valid secret registers only the fixed production webhook and does not echo secret or token', async () => {
  let request;
  const handler = createTelegramSupportSetupHandler({
    env,
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ ok: true, result: true }) };
    },
  });
  const res = await invoke(handler, {
    method: 'POST', body: { secret }, headers: { origin: 'https://market-pulse1-eta.vercel.app' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(request.url, 'https://api.telegram.org/botfake-token-not-real/setWebhook');
  assert.equal(request.body.url, 'https://market-pulse1-eta.vercel.app/api/telegram-support');
  assert.equal(request.body.secret_token, secret);
  assert.deepEqual(request.body.allowed_updates, ['message']);
  assert.equal(request.body.drop_pending_updates, false);
  assert.match(res.body, /Telegram-поддержка подключена/);
  assert.doesNotMatch(res.body, /fake-token-not-real|localGeneratedSecret/);
});

test('Telegram API failures return a generic error without leaking its response', async () => {
  const handler = createTelegramSupportSetupHandler({
    env,
    fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, description: 'sensitive remote detail' }) }),
  });
  const res = await invoke(handler, { method: 'POST', body: { secret } });
  assert.equal(res.statusCode, 502);
  assert.match(res.body, /Telegram не подтвердил/);
  assert.doesNotMatch(res.body, /sensitive remote detail|fake-token-not-real|localGeneratedSecret/);
});
