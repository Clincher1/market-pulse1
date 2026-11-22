import { timingSafeEqual } from 'node:crypto';

const MAX_MESSAGE_LENGTH = 3500;
const SUPPORT_PREFIX = 'Новое обращение\nID: ';

function reply(res, status, body) {
  res.setHeader?.('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function textLength(value) {
  return Array.from(value).length;
}

function supportTicket(chatId, text) {
  return `${SUPPORT_PREFIX}${chatId}\n\n${text}\n\nОтветьте на это сообщение, чтобы ответить посетителю.`;
}

function ticketFromReply(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^Новое обращение\nID: ([1-9]\d{4,19})(?:\n|$)/);
  return match?.[1] ?? null;
}

function parseAdminReply(message) {
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  if (!text) return null;

  const command = text.match(/^\/reply(?:@[A-Za-z0-9_]+)?\s+([1-9]\d{4,19})\s+([\s\S]+)$/i);
  if (command) return { chatId: command[1], text: command[2].trim() };

  const chatId = ticketFromReply(message.reply_to_message?.text);
  return chatId ? { chatId, text } : null;
}

export function createTelegramSupportHandler({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  async function sendMessage(token, chatId, text) {
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) return false;
      const result = await response.json().catch(() => null);
      return result?.ok === true;
    } catch {
      // Never log the message, Telegram response or bot token.
      return false;
    }
  }

  return async function telegramSupport(req, res) {
    if (req.method !== 'POST') {
      res.setHeader?.('Allow', 'POST');
      return reply(res, 405, { ok: false });
    }

    const token = env.TELEGRAM_BOT_TOKEN;
    const adminId = env.TELEGRAM_SUPPORT_ADMIN_ID;
    const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
    if (!token || !/^[1-9]\d{4,19}$/.test(adminId ?? '') || !webhookSecret) {
      return reply(res, 503, { ok: false });
    }

    const providedSecret = req.headers?.['x-telegram-bot-api-secret-token'];
    if (typeof providedSecret !== 'string' || !safeEqual(providedSecret, webhookSecret)) {
      return reply(res, 401, { ok: false });
    }

    let update = req.body;
    if (typeof update === 'string') {
      try {
        update = JSON.parse(update);
      } catch {
        return reply(res, 400, { ok: false });
      }
    }
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      return reply(res, 400, { ok: false });
    }

    const message = update.message;
    const chat = message?.chat;
    const sender = message?.from;
    if (!chat || chat.type !== 'private' || !Number.isSafeInteger(chat.id) || chat.id < 1) {
      return reply(res, 200, { ok: true });
    }

    const chatId = String(chat.id);
    const senderId = Number.isSafeInteger(sender?.id) ? String(sender.id) : '';
    const messageText = typeof message.text === 'string' ? message.text.trim() : '';

    if (chatId === adminId && senderId === adminId) {
      if (/^\/(start|help)(?:\s|$)/i.test(messageText)) {
        await sendMessage(token, adminId,
          'Чтобы ответить посетителю, ответьте в Telegram на карточку обращения или используйте /reply ID текст. Ответ посетитель получит от имени бота.');
        return reply(res, 200, { ok: true });
      }

      const adminReply = parseAdminReply(message);
      if (!adminReply || !adminReply.text || textLength(adminReply.text) > MAX_MESSAGE_LENGTH) {
        await sendMessage(token, adminId,
          'Для ответа используйте «Ответить» на карточку обращения или команду /reply ID текст. Принимаются текстовые сообщения до 3500 символов.');
        return reply(res, 200, { ok: true });
      }

      const sent = await sendMessage(token, adminReply.chatId,
        `Ответ от поддержки Market Pulse:\n\n${adminReply.text}`);
      await sendMessage(token, adminId, sent
        ? 'Ответ отправлен посетителю от имени бота.'
        : 'Не удалось доставить ответ. Проверьте номер обращения и попробуйте ещё раз.');
      return reply(res, 200, { ok: true });
    }

    if (messageText === '/start' || messageText.startsWith('/start ')
      || messageText === '/help') {
      await sendMessage(token, chatId,
        'Здравствуйте! Это поддержка Market Pulse. Напишите сюда текстовое сообщение — оно будет передано команде поддержки, а ответ придёт в этот чат от бота. Не отправляйте пароли и платёжные данные. Важно: чат с ботом не является секретным сквозно зашифрованным чатом.');
      return reply(res, 200, { ok: true });
    }

    if (!messageText) {
      await sendMessage(token, chatId, 'Пока принимаются только текстовые сообщения. Напишите вопрос текстом.');
      return reply(res, 200, { ok: true });
    }
    if (textLength(messageText) > MAX_MESSAGE_LENGTH) {
      await sendMessage(token, chatId, 'Сообщение слишком длинное. Пожалуйста, отправьте текст до 3500 символов.');
      return reply(res, 200, { ok: true });
    }

    const delivered = await sendMessage(token, adminId, supportTicket(chatId, messageText));
    await sendMessage(token, chatId, delivered
      ? 'Сообщение передано в поддержку. Ответ придёт сюда от имени бота.'
      : 'Не удалось передать сообщение в поддержку. Пожалуйста, попробуйте позже.');
    return reply(res, 200, { ok: true });
  };
}

export default createTelegramSupportHandler();
