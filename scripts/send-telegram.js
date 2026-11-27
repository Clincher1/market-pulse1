#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function redactDiagnostic(value, token, chatId) {
  let text = String(value ?? '');
  for (const secret of [token, chatId]) {
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 500);
}

function escapeWorkflowCommand(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C');
}

export async function sendTelegramMessage({
  token = process.env.TELEGRAM_BOT_TOKEN ?? '',
  chatId = process.env.TELEGRAM_CHAT_ID ?? '',
  text = '',
  fetchImpl = fetch,
  logger = line => console.log(line),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
} = {}) {
  const missing = [];
  if (!token.trim()) missing.push('TELEGRAM_BOT_TOKEN');
  if (!chatId.trim()) missing.push('TELEGRAM_CHAT_ID');
  if (missing.length) {
    const message = `Missing required repository secret(s): ${missing.join(', ')}`;
    logger(`::error title=Telegram configuration::${escapeWorkflowCommand(message)}`);
    return { ok: false, status: null, attempts: 0, error: message };
  }
  if (!text.trim()) {
    const message = 'Telegram message text is empty.';
    logger(`::error title=Telegram delivery failed::${message}`);
    return { ok: false, status: null, attempts: 0, error: message };
  }

  token = token.trim();
  chatId = chatId.trim();
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  let lastResult = { ok: false, status: null, attempts: 0, error: 'No request attempted' };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    let body;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const responseText = await response.text();
      try {
        body = JSON.parse(responseText);
      } catch {
        body = null;
      }
    } catch (error) {
      const errorName = redactDiagnostic(error?.name ?? 'network error', token, chatId);
      lastResult = { ok: false, status: null, attempts: attempt, error: errorName };
      if (attempt < maxAttempts) {
        logger(`Telegram request attempt ${attempt}/${maxAttempts} failed before an HTTP response (${errorName}); retrying.`);
        await sleep(1000 * (2 ** (attempt - 1)));
        continue;
      }
      const diagnostic = `No HTTP response after ${attempt} attempt(s) (${errorName}).`;
      logger(`::error title=Telegram delivery failed::${escapeWorkflowCommand(diagnostic)}`);
      logger(`Telegram delivery failed: ${diagnostic}`);
      break;
    }

    const status = response.status;
    if (response.ok && body?.ok === true) {
      lastResult = { ok: true, status, attempts: attempt, error: null };
      const diagnostic = `HTTP ${status}; Telegram API ok=true; attempt ${attempt}/${maxAttempts}.`;
      logger(`::notice title=Telegram delivery confirmed::${escapeWorkflowCommand(diagnostic)}`);
      logger(`Telegram delivery confirmed: ${diagnostic}`);
      return lastResult;
    }

    const apiCode = Number.isInteger(body?.error_code) ? `; Telegram error ${body.error_code}` : '';
    const description = redactDiagnostic(body?.description ?? 'Telegram returned an invalid or unsuccessful response', token, chatId);
    const diagnostic = `HTTP ${status}${apiCode}; ${description}`;
    lastResult = { ok: false, status, attempts: attempt, error: diagnostic };
    const retryable = status === 429 || status >= 500;
    if (retryable && attempt < maxAttempts) {
      const retryAfterSeconds = Number(body?.parameters?.retry_after);
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, 15_000)
        : 1000 * (2 ** (attempt - 1));
      logger(`Telegram attempt ${attempt}/${maxAttempts}: ${diagnostic}; retrying after ${delayMs}ms.`);
      await sleep(delayMs);
      continue;
    }

    logger(`::error title=Telegram delivery failed::${escapeWorkflowCommand(diagnostic)}`);
    logger(`Telegram delivery failed: ${diagnostic}`);
    break;
  }

  return lastResult;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await sendTelegramMessage({ text: process.argv.slice(2).join(' ').trim() });
  if (!result.ok) process.exitCode = 1;
}
