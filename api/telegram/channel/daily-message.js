import snapshot from '../../../data/snapshot.json' with { type: 'json' };

const SITE_URL = 'https://market-pulse1-eta.vercel.app/';
const DISCLAIMER = 'Не является инвестиционной рекомендацией';
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

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

export function dailyPostText(now = new Date()) {
  return postText('📊 Дайджест Market Pulse', now);
}
