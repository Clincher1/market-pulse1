import { NewsItem } from './mockData';

const PROXY_BASE = (import.meta.env.VITE_PROXY_BASE as string) || 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/proxy';

function proxyUrl(target: string): string {
  return `${PROXY_BASE}?url=${encodeURIComponent(target)}`;
}

// Функция для анализа текста через Groq
async function analyzeWithGroq(text: string): Promise<{ sentiment: number; importance: number; impacts: { asset: string; direction: 'up' | 'down' }[] }> {
  const prompt = `Ты — финансовый аналитик. Проанализируй эту новость и верни СТРОГО JSON без лишнего текста:
{
  "sentiment": число от -1 (очень негативно) до 1 (очень позитивно),
  "importance": число от 1 до 10 (насколько новость важна для рынка),
  "impacts": массив активов и направления их движения (asset: "S&P 500" | "Gold" | "Brent" | "USD" | "BTC", direction: "up" | "down")
}
Новость: "${text}"`;

  try {
    const res = await fetch(PROXY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // Прокси в Supabase сам добавит Authorization
      body: JSON.stringify({
        targetUrl: 'https://api.groq.com/openai/v1/chat/completions',
        payload: {
          model: 'openai/gpt-oss-120b', // <-- АКТУАЛЬНАЯ МОДЕЛЬ
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        },
      }),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);
    
    return {
      sentiment: parsed.sentiment ?? 0,
      importance: parsed.importance ?? 5,
      impacts: parsed.impacts ?? [],
    };
  } catch (e) {
    console.error('Groq analysis failed:', e);
    // Если ИИ не ответил, возвращаем заглушку
    return { sentiment: 0, importance: 5, impacts: [{ asset: 'S&P 500', direction: 'up' }] };
  }
}

// Парсер RSS с вызовом ИИ для каждой новости
async function parseRSS(xmlText: string, sourceName: string): Promise<NewsItem[]> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const items = xmlDoc.querySelectorAll("item");
  
  const news: NewsItem[] = [];
  const promises: Promise<void>[] = [];

  items.forEach((item, index) => {
    // Берем только 5 новостей, чтобы не превысить бесплатные лимиты Groq
    if (index >= 5) return; 

    const title = item.querySelector("title")?.textContent || "Без заголовка";
    const description = item.querySelector("description")?.textContent || "";
    const pubDateRaw = item.querySelector("pubDate")?.textContent || "";
    
    const cleanSummary = description.replace(/<[^>]*>?/gm, '').slice(0, 200) + '...';

    let timeStr = 'Недавно';
    if (pubDateRaw) {
      const diff = Date.now() - new Date(pubDateRaw).getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) timeStr = 'Меньше часа назад';
      else if (hours < 24) timeStr = `${hours} ч. назад`;
      else timeStr = `${Math.floor(hours / 24)} дн. назад`;
    }

    // Асинхронно отправляем текст в ИИ
    const p = analyzeWithGroq(`${title}. ${cleanSummary}`).then((analysis) => {
      news.push({
        id: Date.now() + index,
        source: sourceName,
        time: timeStr,
        title: title,
        summary: cleanSummary,
        impacts: analysis.impacts.length > 0 ? analysis.impacts : [{ asset: 'S&P 500', direction: 'up' }],
        sentiment: analysis.sentiment,
        importance: analysis.importance,
        topic: 'Экономика'
      });
    });
    promises.push(p);
  });

  // Ждем, пока ИИ проанализирует все новости
  await Promise.all(promises);
  
  // Сортируем, чтобы порядок был стабильным
  return news.sort((a, b) => a.id - b.id);
}

export async function fetchLiveNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(proxyUrl('https://feeds.bbci.co.uk/news/business/rss.xml'));
    if (!res.ok) throw new Error(`BBC ${res.status}`);
    
    const xmlText = await res.text();
    return await parseRSS(xmlText, 'BBC');
  } catch (error) {
    console.error('Ошибка загрузки новостей:', error);
    return [];
  }
}