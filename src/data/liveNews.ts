import { NewsItem } from './mockData';

const PROXY_BASE = (import.meta.env.VITE_PROXY_BASE as string) || 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/proxy';

function proxyUrl(target: string): string {
  return `${PROXY_BASE}?url=${encodeURIComponent(target)}`;
}

// 1. Быстрая загрузка заголовков (без ИИ)
export async function fetchRawNews(): Promise<NewsItem[]> {
  const sources = [
    { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
    { name: 'CNBC', url: 'https://search.cnbc.com/rs/cache/partner/rss/top_news/rss.xml' },
  ];

  try {
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const res = await fetch(proxyUrl(source.url));
          if (!res.ok) throw new Error(`${source.name} ${res.status}`);
          const xmlText = await res.text();
          
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");
          const items = xmlDoc.querySelectorAll("item");
          const news: NewsItem[] = [];

          items.forEach((item, index) => {
            if (index >= 3) return;
            const title = item.querySelector("title")?.textContent || "Без заголовка";
            const description = item.querySelector("description")?.textContent || "";
            const cleanSummary = description.replace(/<[^>]*>?/gm, '').slice(0, 150) + '...';

            news.push({
              id: Date.now() + index + Math.random(),
              source: source.name,
              time: 'Недавно',
              title,
              summary: cleanSummary,
              impacts: [{ asset: 'S&P 500', direction: 'up' }], // Заглушка
              sentiment: 0,   // Заглушка
              importance: 5,  // Заглушка
              topic: 'Экономика'
            });
          });
          return news;
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  } catch {
    return [];
  }
}

// 2. Анализ через ИИ (вызывается отдельно)
export async function analyzeNewsWithGroq(text: string): Promise<{ sentiment: number; importance: number; impacts: { asset: string; direction: 'up' | 'down' }[] }> {
  const prompt = `Ты — финансовый аналитик. Проанализируй эту новость и верни СТРОГО JSON без лишнего текста:
{
  "sentiment": число от -1 до 1,
  "importance": число от 1 до 10,
  "impacts": массив активов (asset: "S&P 500" | "Gold" | "Brent" | "USD" | "BTC", direction: "up" | "down")
}
Новость: "${text}"`;

  try {
    const res = await fetch(PROXY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: 'https://api.groq.com/openai/v1/chat/completions',
        payload: {
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        },
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return { sentiment: 0, importance: 5, impacts: [{ asset: 'S&P 500', direction: 'up' }] };
  }
}