import { useState, useEffect } from 'react';
import { NewsItem } from '@/data/mockData';
import { fetchRawNews, analyzeNewsWithGroq } from '@/data/liveNews';

export function useLiveNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      // 1. Мгновенно грузим заголовки
      const raw = await fetchRawNews();
      if (!isMounted) return;
      setNews(raw);
      setLoading(false); // Снимаем лоадер! Пользователь уже видит новости.

      // 2. В фоне запускаем ИИ для каждой новости
      raw.forEach(async (item, index) => {
        const analysis = await analyzeNewsWithGroq(`${item.title}. ${item.summary}`);
        
        if (!isMounted) return;
        setNews((prev) => {
          const copy = [...prev];
          if (copy[index]) {
            copy[index].sentiment = analysis.sentiment;
            copy[index].importance = analysis.importance;
            copy[index].impacts = analysis.impacts;
          }
          return copy;
        });
      });
    }

    load();
  }, []);

  return { news, loading };
}