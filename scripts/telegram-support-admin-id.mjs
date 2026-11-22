// Prints only the Telegram user ID from the latest private /start update.
// The bot token and message contents are never printed.
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN in the local environment first.');

let response;
try {
  response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=0`, {
    signal: AbortSignal.timeout(10000),
  });
} catch {
  throw new Error('Telegram getUpdates request failed; check connectivity and the bot token.');
}

const payload = await response.json().catch(() => null);
if (!response.ok || payload?.ok !== true || !Array.isArray(payload.result)) {
  throw new Error('Telegram did not return updates. If a webhook is already set, remove it before setup.');
}
const starts = payload.result.filter(update => {
  const message = update?.message;
  return message?.chat?.type === 'private'
    && Number.isSafeInteger(message?.from?.id)
    && message.from.id > 0
    && typeof message.text === 'string'
    && /^\/start(?:\s|$)/.test(message.text);
});
const latest = starts.at(-1);
if (!latest) throw new Error('No private /start found. Open your new bot and press Start, then run this script again.');
console.log(String(latest.message.from.id));
