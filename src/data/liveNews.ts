import { NewsItem } from './mockData';

const PROXY_BASE = (import.meta.env.VITE_PROXY_BASE as string) || 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/proxy';

function proxyUrl(target: string): string {
  return `${PROXY_BASE}?url=${encodeURIComponent(target)}`;
}

// Простейший парсер XML для браузера (без внешних библиотек)
function parseRSS(xmlText: string, sourceName: string): NewsItem[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const items = xmlDoc.querySelectorAll("item");
  
  const news: NewsItem[] = [];

  items.forEach((item, index) => {
    // Ограничимся 5 новостями с каждого источника
    if (index >= 5) return;

    const title = item.querySelector("title")?.textContent || "Без заголовка";
    const description = item.querySelector("description")?.textContent || "";
    
    // Очищаем описание от HTML-тегов (часто в RSS они есть)
    const cleanSummary = description.replace(/<[^>]*>?/gm, '').slice(0, 200) + '...';

    // Пока ставим заглушки для ИИ-параметров (тональность 0, важность 5)
    // В следующем шаге мы заменим это на реальный вызов Groq
    news.push({
      id: Date.now() + index, // Уникальный ID на основе времени
      source: sourceName,
      time: 'Только что', // Позже сделаем парсинг даты
      title: title,
      summary: cleanSummary,
      impacts: [{ asset: 'S&P 500', direction: 'up' }], // Заглушка
      sentiment: 0,
      importance: 5,
      topic: 'Экономика' // Заглушка
    });
  });

  return news;
}

export async function fetchLiveNews(): Promise<NewsItem[]> {
  try {
    // Запрашиваем новости BBC Business через наш прокси
    const res = await fetch(proxyUrl('https://feeds.bbci.co.uk/news/business/rss.xml'));
    if (!res.ok) throw new Error(`BBC ${res.status}`);
    
    const xmlText = await res.text();
    const bbcNews = parseRSS(xmlText, 'BBC');

    // Можно добавить другие источники, используя Promise.all
    // Но для начала хватит и одного
    
    return bbcNews;
  } catch (error) {
    console.error('Ошибка загрузки новостей:', error);
    return [];
  }
}