import { timingSafeEqual } from 'node:crypto';
import snapshot from '../../../data/snapshot.json' with { type: 'json' };

const EXPECTED_BOT_USERNAME = 'pulsrynka_bot';
const SITE_URL = 'https://market-pulse1-eta.vercel.app/';
const DISCLAIMER = 'Не является инвестиционной рекомендацией';
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

function reply(res, status, body) {
  res.setHeader?.('Cache-Control', 'no-store, no-cache, max-age=0');
  res.setHeader?.('Referrer-Policy', 'no-referrer');
  return res.status(status).json(body);
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function queryKey(req) {
  const value = req.query?.key;
  if (typeof value === 'string') return value;
  try {
    return new URL(req.url ?? '/', 'https://market-pulse1-eta.vercel.app').searchParams.get('key') ?? '';
  } catch {
    return '';
  }
}

function figureLines(now = new Date()) {
  const labels = {
    'BZ=F': ['Brent', 'USD/барр.'],
    '^GSPC': ['S&P 500', 'пункта'],
    XAU: ['Золото XAU/USD', 'USD/тр. унцию'],
  };
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const lines = [];
  for (const ticker of ['BZ=F', '^GSPC', 'XAU']) {
    const item = items.find((candidate) => candidate?.ticker === ticker);
    if (!item || typeof item.value !== 'string' || !item.observedAt) continue;
    const observedAt = new Date(item.observedAt.length === 10
      ? `${item.observedAt}T12:00:00Z`
      : item.observedAt);
    if (Number.isNaN(observedAt.getTime()) || now.getTime() - observedAt.getTime() > MAX_AGE_MS) continue;
    const value = Number(item.value);
    if (!Number.isFinite(value)) continue;
    const [name, unit] = labels[ticker];
    const formatted = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    const date = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Europe/Moscow',
    }).format(observedAt);
    lines.push(`• ${name}: ${formatted} ${unit} (${date})`);
  }
  return lines;
}

function postText(greeting, now = new Date()) {
  const figures = figureLines(now);
  return [
    greeting,
    ...(figures.length ? ['Ключевые значения из последнего снимка:', ...figures] : ['Актуальный снимок с ключевыми значениями пока недоступен.']),
    SITE_URL,
    DISCLAIMER,
  ].join('\n');
}

export function testPostText(now = new Date()) {
  return postText('Здравствуйте! Это тестовая публикация Market Pulse.', now);
}

export function dailyPostText(now = new Date()) {
  return postText('📊 Дайджест Market Pulse', now);
}

async function telegramCall(fetchImpl, token, method, body) {
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, error: 'Request to Telegram API failed before receiving a response.' };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: `Telegram API returned invalid JSON (HTTP ${response.status}).` };
  }
  if (!response.ok || payload?.ok !== true) {
    return {
      ok: false,
      error: typeof payload?.description === 'string'
        ? payload.description.replaceAll(token, '[redacted]')
        : `Telegram API request failed (HTTP ${response.status}).`,
    };
  }
  return { ok: true, result: payload.result };
}

export function createTelegramChannelTrigger({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  let triggerConsumed = false;
  let triggerInFlight = false;

  return async function telegramChannelTrigger(req, res) {
    if (req.method !== 'GET') {
      res.setHeader?.('Allow', 'GET');
      return reply(res, 405, { ok: false, error: 'Method not allowed.' });
    }

    const adminKey = env.ADMIN_TRIGGER_KEY;
    if (typeof adminKey !== 'string' || !adminKey) {
      return reply(res, 503, { ok: false, error: 'ADMIN_TRIGGER_KEY is not configured.' });
    }
    const providedKey = queryKey(req);
    if (!providedKey || !constantTimeEqual(providedKey, adminKey)) {
      return reply(res, 403, { ok: false, error: 'Forbidden.' });
    }

    const token = env.TELEGRAM_BOT_TOKEN_DIGEST;
    const channelId = env.TELEGRAM_CHANNEL_ID;
    if (typeof token !== 'string' || !token || typeof channelId !== 'string' || !channelId) {
      return reply(res, 503, { ok: false, error: 'Digest bot token or channel ID is not configured.' });
    }
    if (triggerConsumed || triggerInFlight) {
      return reply(res, 409, { ok: false, error: 'This trigger has already been used or is in progress.' });
    }

    triggerInFlight = true;
    try {
      const me = await telegramCall(fetchImpl, token, 'getMe', {});
      if (!me.ok) return reply(res, 502, { ok: false, step: 'getMe', error: me.error });
      const botId = me.result?.id;
      const username = typeof me.result?.username === 'string' ? `@${me.result.username}` : null;
      if (!Number.isSafeInteger(botId) || !username) {
        return reply(res, 502, { ok: false, step: 'getMe', error: 'Telegram getMe returned no usable bot ID or username.' });
      }
      if (username.toLowerCase() !== `@${EXPECTED_BOT_USERNAME}`) {
        return reply(res, 409, {
          ok: false,
          step: 'getMe',
          bot_username: username,
          error: `Unexpected bot username; expected @${EXPECTED_BOT_USERNAME}. No post was sent.`,
        });
      }

      const member = await telegramCall(fetchImpl, token, 'getChatMember', {
        chat_id: channelId,
        user_id: botId,
      });
      if (!member.ok) {
        return reply(res, 502, {
          ok: false,
          step: 'getChatMember',
          bot_username: username,
          error: member.error,
        });
      }
      const status = member.result?.status ?? null;
      const canPostMessages = status === 'creator' || member.result?.can_post_messages === true;
      if (!['administrator', 'creator'].includes(status) || !canPostMessages) {
        return reply(res, 403, {
          ok: false,
          step: 'getChatMember',
          bot_username: username,
          status,
          can_post_messages: canPostMessages,
          error: 'Bot must be an administrator with can_post_messages=true. No post was sent.',
        });
      }

      const sent = await telegramCall(fetchImpl, token, 'sendMessage', {
        chat_id: channelId,
        text: testPostText(now()),
        disable_web_page_preview: true,
      });
      if (!sent.ok) {
        return reply(res, 502, {
          ok: false,
          step: 'sendMessage',
          bot_username: username,
          status,
          can_post_messages: canPostMessages,
          error: sent.error,
        });
      }

      triggerConsumed = true;
      return reply(res, 200, {
        ok: true,
        bot_username: username,
        status,
        can_post_messages: canPostMessages,
        message_id: sent.result?.message_id ?? null,
        posted_at: now().toISOString(),
      });
    } finally {
      triggerInFlight = false;
    }
  };
}

export default createTelegramChannelTrigger();
