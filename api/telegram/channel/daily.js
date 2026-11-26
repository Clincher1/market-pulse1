import { timingSafeEqual } from 'node:crypto';
import { dailyPostText } from './trigger.js';

const EXPECTED_BOT_USERNAME = '@pulsrynka_bot';

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

function isAuthorized(req, secret) {
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  return constantTimeEqual(authorization.slice('Bearer '.length), secret);
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

export function createTelegramChannelDailySender({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  let inFlight = false;

  return async function telegramChannelDailySender(req, res) {
    if (req.method !== 'GET') {
      res.setHeader?.('Allow', 'GET');
      return reply(res, 405, { ok: false, error: 'Method not allowed.' });
    }

    const cronSecret = env.CRON_SECRET;
    if (typeof cronSecret !== 'string' || !cronSecret) {
      return reply(res, 503, { ok: false, error: 'CRON_SECRET is not configured.' });
    }
    if (!isAuthorized(req, cronSecret)) {
      return reply(res, 401, { ok: false, error: 'Unauthorized.' });
    }

    const token = env.TELEGRAM_BOT_TOKEN_DIGEST;
    const channelId = env.TELEGRAM_CHANNEL_ID;
    if (typeof token !== 'string' || !token || typeof channelId !== 'string' || !channelId) {
      return reply(res, 503, { ok: false, error: 'Digest bot token or channel ID is not configured.' });
    }
    if (inFlight) {
      return reply(res, 409, { ok: false, error: 'A daily post is already in progress.' });
    }

    inFlight = true;
    try {
      const me = await telegramCall(fetchImpl, token, 'getMe', {});
      if (!me.ok) return reply(res, 502, { ok: false, step: 'getMe', error: me.error });
      const botId = me.result?.id;
      const username = typeof me.result?.username === 'string' ? `@${me.result.username}` : null;
      if (!Number.isSafeInteger(botId) || username?.toLowerCase() !== EXPECTED_BOT_USERNAME) {
        return reply(res, 409, {
          ok: false,
          step: 'getMe',
          bot_username: username,
          error: `Unexpected bot identity; expected ${EXPECTED_BOT_USERNAME}. No post was sent.`,
        });
      }

      const member = await telegramCall(fetchImpl, token, 'getChatMember', {
        chat_id: channelId,
        user_id: botId,
      });
      if (!member.ok) return reply(res, 502, { ok: false, step: 'getChatMember', bot_username: username, error: member.error });
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
        text: dailyPostText(now()),
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

      return reply(res, 200, {
        ok: true,
        bot_username: username,
        status,
        can_post_messages: canPostMessages,
        message_id: sent.result?.message_id ?? null,
        posted_at: now().toISOString(),
      });
    } finally {
      inFlight = false;
    }
  };
}

export default createTelegramChannelDailySender();
