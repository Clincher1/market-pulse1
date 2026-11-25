#!/usr/bin/env node

const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const chatId = process.env.TELEGRAM_CHAT_ID ?? '';
const text = process.argv.slice(2).join(' ').trim();

if (!text) {
  console.error('Telegram notification text is empty.');
  process.exit(2);
}

try {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  const responseText = await response.text();
  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    body = null;
  }

  if (!response.ok || body?.ok !== true) {
    console.error('Telegram delivery failed; full Telegram response follows:');
    console.error(responseText || '(empty response body)');
    process.exitCode = 1;
  }
} catch {
  // Do not print the fetch exception: runtimes may include the request URL, and
  // that URL contains the bot token. There is no Telegram response to log here.
  console.error('Telegram request failed before an HTTP response was received.');
  process.exitCode = 1;
}
