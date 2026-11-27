import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTelegramChannelDailySender } from '../api/telegram/channel/daily.js';

const validEnv = {
  CRON_SECRET: 'cron-secret-for-tests-only',
  TELEGRAM_BOT_TOKEN_DIGEST: 'digest-token-never-return-this',
  TELEGRAM_CHANNEL_ID: '@marketpulse001',
};
const now = () => new Date('2026-11-26T11:15:00+03:00');

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; return this; },
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function invoke(handler, { method = 'GET', authorization = 'Bearer cron-secret-for-tests-only' } = {}) {
  const res = response();
  await handler({ method, headers: { authorization } }, res);
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
      sendMessage: { message_id: 4321 },
    }[method];
    return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
  };
}

test('authorized daily cron verifies bot rights and publishes the daily digest once per invocation', async () => {
  const calls = [];
  const handler = createTelegramChannelDailySender({ env: validEnv, fetchImpl: successfulTelegramFetch(calls), now });
  const res = await invoke(handler);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    bot_username: '@pulsrynka_bot',
    status: 'administrator',
    can_post_messages: true,
    message_id: 4321,
    posted_at: now().toISOString(),
  });
  assert.deepEqual(calls.map((call) => call.method), ['getMe', 'getChatMember', 'sendMessage']);
  assert.deepEqual(calls[1].body, { chat_id: '@marketpulse001', user_id: 777 });
  assert.equal(calls[2].body.chat_id, '@marketpulse001');
  const postLines = calls[2].body.text.split('\n');
  assert.equal(postLines[0], '📊 Дайджест Market Pulse');
  assert.match(calls[2].body.text, /Brent/);
  assert.match(calls[2].body.text, /S&P 500/);
  assert.match(calls[2].body.text, /Золото XAU\/USD/);
  const snapshot = JSON.parse(fs.readFileSync(new URL('../data/snapshot.json', import.meta.url), 'utf8'));
  const normalizeSpaces = value => value.replace(/[\u00a0\u202f]/g, ' ');
  for (const [ticker, label] of [['BZ=F', 'Brent'], ['^GSPC', 'S&P 500'], ['XAU', 'Золото XAU/USD']]) {
    const value = Number(snapshot.items.find(item => item.ticker === ticker).value);
    const formatted = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    assert.ok(normalizeSpaces(calls[2].body.text).includes(`${label}: ${normalizeSpaces(formatted)}`));
  }
  assert.match(calls[2].body.text, /https:\/\/market-pulse1-eta\.vercel\.app\//);
  assert.match(calls[2].body.text, /Не является инвестиционной рекомендацией/);
  const brentIndex = postLines.findIndex((line) => line.includes('Brent:'));
  const sp500Index = postLines.findIndex((line) => line.includes('S&P 500:'));
  const goldIndex = postLines.findIndex((line) => line.includes('Золото XAU/USD:'));
  const siteIndex = postLines.findIndex((line) => line === 'https://market-pulse1-eta.vercel.app/');
  assert.ok(brentIndex > 0 && sp500Index > brentIndex && goldIndex > sp500Index && siteIndex > goldIndex);
  assert.doesNotMatch(JSON.stringify(res.body), /digest-token-never-return-this/);
  assert.equal(res.headers['Cache-Control'], 'no-store, no-cache, max-age=0');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});

test('missing or incorrect cron authorization is rejected without Telegram requests', async () => {
  let calls = 0;
  const handler = createTelegramChannelDailySender({ env: validEnv, fetchImpl: async () => { calls++; } });
  for (const authorization of [null, 'Bearer wrong-secret', 'Basic cron-secret-for-tests-only']) {
    const res = await invoke(handler, { authorization });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { ok: false, error: 'Unauthorized.' });
  }
  assert.equal(calls, 0);
});

test('missing cron secret is an explicit configuration error', async () => {
  let calls = 0;
  const handler = createTelegramChannelDailySender({
    env: { ...validEnv, CRON_SECRET: '' },
    fetchImpl: async () => { calls++; },
  });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /CRON_SECRET/);
  assert.equal(calls, 0);
});

test('sender stops when bot identity or posting rights do not match', async () => {
  const identityCalls = [];
  const wrongBot = createTelegramChannelDailySender({
    env: validEnv,
    fetchImpl: async (url) => {
      identityCalls.push(url.split('/').at(-1));
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { id: 777, username: 'other_bot' } }) };
    },
  });
  const identityRes = await invoke(wrongBot);
  assert.equal(identityRes.statusCode, 409);
  assert.deepEqual(identityCalls, ['getMe']);

  const permissionCalls = [];
  const noRights = createTelegramChannelDailySender({
    env: validEnv,
    fetchImpl: async (url) => {
      const method = url.split('/').at(-1);
      permissionCalls.push(method);
      const result = method === 'getMe'
        ? { id: 777, username: 'pulsrynka_bot' }
        : { status: 'administrator', can_post_messages: false };
      return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
    },
  });
  const permissionRes = await invoke(noRights);
  assert.equal(permissionRes.statusCode, 403);
  assert.deepEqual(permissionCalls, ['getMe', 'getChatMember']);
});

test('daily Telegram API errors redact the bot token in the returned error', async () => {
  const handler = createTelegramChannelDailySender({
    env: validEnv,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error_code: 401, description: `Unauthorized ${validEnv.TELEGRAM_BOT_TOKEN_DIGEST}` }),
    }),
  });
  const res = await invoke(handler);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.step, 'getMe');
  assert.equal(res.body.error, 'Unauthorized [redacted]');
  assert.doesNotMatch(JSON.stringify(res.body), /digest-token-never-return-this/);
});

test('only GET is accepted and Vercel cron is configured for 09:00 Moscow time daily', () => {
  const handler = createTelegramChannelDailySender({ env: validEnv });
  const res = response();
  handler({ method: 'POST', headers: { authorization: 'Bearer cron-secret-for-tests-only' } }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET');

  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons, [{ path: '/api/telegram/channel/daily', schedule: '0 6 * * *' }]);
});
