import { timingSafeEqual } from 'node:crypto';

const WEBHOOK_URL = 'https://market-pulse1-eta.vercel.app/api/telegram-support';

const PAGE = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <title>Подключение Telegram-поддержки · Market Pulse</title>
  <style>
    body { margin: 0; padding: 24px; color: #172033; background: #f1f7fc; font: 16px/1.55 system-ui, sans-serif; }
    main { box-sizing: border-box; max-width: 520px; margin: 8vh auto; padding: 24px; border: 1px solid #d7e1eb; border-radius: 20px; background: #fff; }
    h1 { font-size: 1.45rem; line-height: 1.25; }
    input, button { box-sizing: border-box; width: 100%; min-height: 48px; margin-top: 10px; padding: 10px 12px; border: 1px solid #aab8c7; border-radius: 12px; font: inherit; }
    button { border-color: #146f66; color: #fff; background: #146f66; font-weight: 700; }
    :focus-visible { outline: 3px solid #2463eb; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <h1>Подключение Telegram-поддержки</h1>
    <p>Введите секрет вебхука, который вы сохранили в Vercel. Он будет передан только этому сайту по HTTPS и не появится в ответе или журнале приложения.</p>
    <form method="post" action="/api/telegram-support-setup" autocomplete="off">
      <label for="secret">TELEGRAM_WEBHOOK_SECRET</label><br>
      <input id="secret" name="secret" type="password" autocomplete="off" required maxlength="256">
      <button type="submit">Зарегистрировать webhook</button>
    </form>
    <p>Токен бота вводить здесь не нужно. Никогда не отправляйте его в чат.</p>
  </main>
</body>
</html>`;

function html(res, status, content) {
  res.setHeader?.('Content-Type', 'text/html; charset=utf-8');
  res.setHeader?.('Cache-Control', 'no-store');
  res.setHeader?.('Referrer-Policy', 'no-referrer');
  return res.status(status).send(content);
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function submittedSecret(req) {
  const body = req.body;
  if (typeof body === 'string') {
    const contentType = String(req.headers?.['content-type'] ?? '');
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return new URLSearchParams(body).get('secret') ?? '';
    }
    try {
      const parsed = JSON.parse(body);
      return typeof parsed?.secret === 'string' ? parsed.secret : '';
    } catch {
      return '';
    }
  }
  return typeof body?.secret === 'string' ? body.secret : '';
}

export function createTelegramSupportSetupHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function telegramSupportSetup(req, res) {
    if (req.method === 'GET') return html(res, 200, PAGE);
    if (req.method !== 'POST') {
      res.setHeader?.('Allow', 'GET, POST');
      return html(res, 405, '<!doctype html><html lang="ru"><title>Метод не поддерживается</title><h1>Используйте форму настройки.</h1></html>');
    }

    // Do not rely on Origin headers: mobile browsers and Vercel domain aliases can
    // send a valid same-site POST with a different origin serialization. The
    // high-entropy webhook secret below authenticates the action, and the target
    // webhook URL is fixed (not supplied by the request).
    const token = env.TELEGRAM_BOT_TOKEN;
    const adminId = env.TELEGRAM_SUPPORT_ADMIN_ID;
    const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
    if (!token || !/^[1-9]\d{4,19}$/.test(adminId ?? '')
      || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret ?? '')) {
      return html(res, 503, '<!doctype html><html lang="ru"><title>Настройка не завершена</title><h1>В Vercel ещё не заданы все переменные Telegram-поддержки.</h1></html>');
    }

    const supplied = submittedSecret(req);
    if (!supplied || supplied.length > 256 || !safeEqual(supplied, webhookSecret)) {
      return html(res, 403, '<!doctype html><html lang="ru"><title>Проверка не пройдена</title><h1>Секрет не принят. Проверьте значение в Vercel и попробуйте снова.</h1></html>');
    }

    let result;
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          secret_token: webhookSecret,
          allowed_updates: ['message'],
          drop_pending_updates: false,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        return html(res, 502, '<!doctype html><html lang="ru"><title>Не удалось подключить</title><h1>Telegram не подтвердил регистрацию webhook. Проверьте токен бота в Vercel.</h1></html>');
      }
      result = await response.json().catch(() => null);
    } catch {
      return html(res, 502, '<!doctype html><html lang="ru"><title>Не удалось подключить</title><h1>Запрос к Telegram не завершился. Попробуйте позже.</h1></html>');
    }

    if (result?.ok !== true) {
      return html(res, 502, '<!doctype html><html lang="ru"><title>Не удалось подключить</title><h1>Telegram не подтвердил регистрацию webhook. Проверьте токен бота в Vercel.</h1></html>');
    }
    return html(res, 200, '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>Поддержка подключена</title></head><body><main><h1>Telegram-поддержка подключена</h1><p>Webhook зарегистрирован. Теперь можно проверить бота, отправив ему тестовое сообщение.</p><p><a href="/">Вернуться на Market Pulse</a></p></main></body></html>');
  };
}

export default createTelegramSupportSetupHandler();
