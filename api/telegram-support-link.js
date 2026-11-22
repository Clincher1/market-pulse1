// Same-origin redirect keeps the external Telegram hostname out of the HTML and
// performs no request to Telegram until the visitor explicitly follows the link.
export default function telegramSupportLink(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader?.('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const username = process.env.TELEGRAM_SUPPORT_BOT_USERNAME?.trim().replace(/^@/, '');
  if (!username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    return res.status(404).end();
  }
  res.setHeader?.('Cache-Control', 'no-store');
  res.setHeader?.('Referrer-Policy', 'no-referrer');
  res.setHeader?.('Location', `https://t.me/${username}?start=support`);
  return res.status(302).end();
}
