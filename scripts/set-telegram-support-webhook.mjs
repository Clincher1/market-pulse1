// Explicit setup helper. It has no side effects unless run manually.
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
if (!token || !secret || !webhookUrl) {
  throw new Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TELEGRAM_WEBHOOK_URL in the local environment.');
}
let target;
try {
  target = new URL(webhookUrl);
} catch {
  throw new Error('TELEGRAM_WEBHOOK_URL must be a valid HTTPS URL.');
}
if (target.protocol !== 'https:') throw new Error('TELEGRAM_WEBHOOK_URL must use HTTPS.');

let response;
try {
  response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: target.toString(),
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    }),
    signal: AbortSignal.timeout(10000),
  });
} catch {
  throw new Error('Telegram setWebhook request failed; check connectivity and the bot configuration.');
}
const payload = await response.json().catch(() => null);
if (!response.ok || payload?.ok !== true) {
  throw new Error('Telegram did not accept the webhook configuration. No response details were printed.');
}
console.log('Telegram support webhook configured.');
