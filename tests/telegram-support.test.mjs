import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { createTelegramSupportHandler } from '../api/telegram-support.js';
import telegramSupportLink from '../api/telegram-support-link.js';

const ENV = {
  TELEGRAM_BOT_TOKEN: 'test-token-not-real',
  TELEGRAM_SUPPORT_ADMIN_ID: '123456789',
  TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret-12345678901234567890',
};

function createResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function invoke(fn, { method = 'POST', body = {}, headers = {} } = {}) {
  const res = createResponse();
  await fn({ method, body, headers }, res);
  return res;
}

function telegramFetch(outbound, implementation = async () => ({ ok: true, json: async () => ({ ok: true }) })) {
  return async (url, options) => {
    outbound.push({ url, options, body: JSON.parse(options.body) });
    return implementation(url, options);
  };
}

const authorized = { 'x-telegram-bot-api-secret-token': ENV.TELEGRAM_WEBHOOK_SECRET };

test('endpoint is inert unless configured, authenticates Telegram and accepts POST only', async () => {
  assert.equal((await invoke(handler, { method: 'GET' })).statusCode, 405);
  assert.equal((await invoke(createTelegramSupportHandler({ env: {} }))).statusCode, 503);
  assert.equal((await invoke(createTelegramSupportHandler({ env: ENV }))).statusCode, 401);

  const badJson = await invoke(createTelegramSupportHandler({ env: ENV }), {
    body: '{not-json', headers: authorized,
  });
  assert.equal(badJson.statusCode, 400);
});

test('user /start explains how support works and clearly discloses the non-secret chat', async () => {
  const outbound = [];
  const fn = createTelegramSupportHandler({ env: ENV, fetchImpl: telegramFetch(outbound) });
  const res = await invoke(fn, {
    headers: authorized,
    body: { update_id: 1, message: { chat: { id: 555123, type: 'private' }, from: { id: 555123 }, text: '/start support' } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(outbound.length, 1);
  assert.equal(outbound[0].body.chat_id, '555123');
  assert.match(outbound[0].body.text, /ответ придёт в этот чат от бота/);
  assert.match(outbound[0].body.text, /не является секретным сквозно зашифрованным чатом/);
});

test('visitor text is sent to the private admin inbox with a private reply ticket, not a profile', async () => {
  const outbound = [];
  const fn = createTelegramSupportHandler({ env: ENV, fetchImpl: telegramFetch(outbound) });
  await invoke(fn, {
    headers: authorized,
    body: { message: {
      chat: { id: 555123, type: 'private' },
      from: { id: 555123, username: 'visitor_profile' },
      text: 'Проверьте страницу рынков',
    } },
  });
  assert.equal(outbound.length, 2);
  assert.equal(outbound[0].body.chat_id, ENV.TELEGRAM_SUPPORT_ADMIN_ID);
  assert.match(outbound[0].body.text, /^Новое обращение\nID: 555123/);
  assert.match(outbound[0].body.text, /Проверьте страницу рынков/);
  assert.doesNotMatch(outbound[0].body.text, /visitor_profile/);
  assert.equal(outbound[1].body.chat_id, '555123');
  assert.match(outbound[1].body.text, /передано в поддержку/);
});

test('admin reply to an inbox card is delivered to the visitor from the bot', async () => {
  const outbound = [];
  const fn = createTelegramSupportHandler({ env: ENV, fetchImpl: telegramFetch(outbound) });
  await invoke(fn, {
    headers: authorized,
    body: { message: {
      chat: { id: 123456789, type: 'private' },
      from: { id: 123456789 },
      text: 'Понял, проверю.',
      reply_to_message: { text: 'Новое обращение\nID: 555123\n\nНужна помощь' },
    } },
  });
  assert.equal(outbound[0].body.chat_id, '555123');
  assert.equal(outbound[0].body.text, 'Ответ от поддержки Market Pulse:\n\nПонял, проверю.');
  assert.equal(outbound[1].body.chat_id, ENV.TELEGRAM_SUPPORT_ADMIN_ID);
  assert.match(outbound[1].body.text, /от имени бота/);
});

test('only the configured admin can send replies; explicit reply command also works', async () => {
  const outbound = [];
  const fn = createTelegramSupportHandler({ env: ENV, fetchImpl: telegramFetch(outbound) });
  await invoke(fn, {
    headers: authorized,
    body: { message: {
      chat: { id: 999888, type: 'private' }, from: { id: 999888 },
      text: '/reply 555123 Неавторизованный ответ',
    } },
  });
  assert.equal(outbound[0].body.chat_id, ENV.TELEGRAM_SUPPORT_ADMIN_ID);
  assert.match(outbound[0].body.text, /^Новое обращение/);

  outbound.length = 0;
  await invoke(fn, {
    headers: authorized,
    body: { message: {
      chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
      text: '/reply 555123 Ответ через команду',
    } },
  });
  assert.equal(outbound[0].body.chat_id, '555123');
  assert.match(outbound[0].body.text, /Ответ через команду/);
});

test('non-private updates are ignored and oversized messages are not relayed', async () => {
  const outbound = [];
  const fn = createTelegramSupportHandler({ env: ENV, fetchImpl: telegramFetch(outbound) });
  await invoke(fn, { headers: authorized, body: { message: { chat: { id: -100123, type: 'channel' }, text: 'ignore' } } });
  await invoke(fn, {
    headers: authorized,
    body: { message: { chat: { id: 555123, type: 'private' }, from: { id: 555123 }, text: 'x'.repeat(3501) } },
  });
  assert.equal(outbound.length, 1);
  assert.equal(outbound[0].body.chat_id, '555123');
  assert.match(outbound[0].body.text, /слишком длинное/);
});

test('Telegram API failure is contained without exposing response details', async () => {
  const outbound = [];
  const fn = createTelegramSupportHandler({
    env: ENV,
    fetchImpl: telegramFetch(outbound, async () => { throw new Error('private Telegram error body'); }),
  });
  const res = await invoke(fn, {
    headers: authorized,
    body: { message: { chat: { id: 555123, type: 'private' }, from: { id: 555123 }, text: 'Вопрос' } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(outbound.length, 2);
  assert.equal(outbound[1].body.chat_id, '555123');
  assert.match(outbound[1].body.text, /Не удалось передать/);
  assert.doesNotMatch(JSON.stringify(res.body), /private Telegram error body|test-token/);
});

test('same-origin support-link endpoint redirects only to the configured Telegram bot', () => {
  const original = process.env.TELEGRAM_SUPPORT_BOT_USERNAME;
  const response = createResponse();
  response.end = function end() { return this; };
  try {
    delete process.env.TELEGRAM_SUPPORT_BOT_USERNAME;
    telegramSupportLink({ method: 'GET' }, response);
    assert.equal(response.statusCode, 404);

    process.env.TELEGRAM_SUPPORT_BOT_USERNAME = '@MarketPulseHelpBot';
    const configured = createResponse();
    configured.end = function end() { return this; };
    telegramSupportLink({ method: 'GET' }, configured);
    assert.equal(configured.statusCode, 302);
    assert.equal(configured.headers.Location, 'https://t.me/MarketPulseHelpBot?start=support');
    assert.equal(configured.headers['Referrer-Policy'], 'no-referrer');

    process.env.TELEGRAM_SUPPORT_BOT_USERNAME = 'invalid username';
    const invalid = createResponse();
    invalid.end = function end() { return this; };
    telegramSupportLink({ method: 'GET' }, invalid);
    assert.equal(invalid.statusCode, 404);
  } finally {
    if (original === undefined) delete process.env.TELEGRAM_SUPPORT_BOT_USERNAME;
    else process.env.TELEGRAM_SUPPORT_BOT_USERNAME = original;
  }
});

test('telegram username is opt-in, validated and disclosed in static documents', async () => {
  const { staticDocument } = await import('../scripts/static-document.mjs');
  const original = process.env.VITE_TELEGRAM_SUPPORT_BOT_USERNAME;
  try {
    delete process.env.VITE_TELEGRAM_SUPPORT_BOT_USERNAME;
    assert.doesNotMatch(staticDocument(''), /\/api\/telegram-support-link/);
    process.env.VITE_TELEGRAM_SUPPORT_BOT_USERNAME = '@MarketPulseHelpBot';
    const html = staticDocument('');
    assert.match(html, /href="\/api\/telegram-support-link"/);
    assert.doesNotMatch(html, /t\.me\//);
    assert.match(html, /Telegram получает текст сообщения и Telegram ID/);
    process.env.VITE_TELEGRAM_SUPPORT_BOT_USERNAME = 'bad username';
    assert.doesNotMatch(staticDocument(''), /\/api\/telegram-support-link/);
  } finally {
    if (original === undefined) delete process.env.VITE_TELEGRAM_SUPPORT_BOT_USERNAME;
    else process.env.VITE_TELEGRAM_SUPPORT_BOT_USERNAME = original;
  }
});
