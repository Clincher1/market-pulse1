import { useState, useEffect } from 'react';
import { NewsItem } from '@/data/mockData';
import { fetchRawNews, analyzeNewsWithGroq } from '@/data/liveNews';

export function useLiveNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        // 1. Мгновенно грузим заголовки новостей (без ИИ)
        const raw = await fetchRawNews();
        if (!isMounted) return;
        
        setNews(raw);
        setLoading(false); // Убираем лоадер, пользователь уже видит новости!

        // 2. В фоне запускаем ИИ для каждой новости
        raw.forEach(async (item, index) => {
          const analysis = await analyzeNewsWithGroq(`${item.title}. ${item.summary}`);
          
          if (!isMounted) return;
          
          setNews((prev) => {
            const copy = [...prev];
            if (copy[index]) {
              // Обновляем оценки для конкретной новости, когда ИИ ответил
              copy[index] = {
                ...copy[index],
                sentiment: analysis.sentiment,
                importance: analysis.importance,
                impacts: analysis.impacts.length > 0 ? analysis.impacts : copy[index].impacts,
              };
            }
            return copy;
          });
        });

      } catch (e) {
        console.error('Ошибка загрузки новостей:', e);
        if (isMounted) setLoading(false);
      }
    }

    load();

    // Обновляем новости каждые 5 минут
    const interval = setInterval(load, 300_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { news, loading };
}