const configuredUsername = (import.meta.env.VITE_TELEGRAM_SUPPORT_BOT_USERNAME as string | undefined)
  ?.trim()
  .replace(/^@/, '');

export const telegramSupportUrl = configuredUsername && /^[A-Za-z0-9_]{5,32}$/.test(configuredUsername)
  ? '/api/telegram-support-link'
  : null;
