import { useState, useEffect } from 'react';
import { NewsItem } from '@/data/mockData';
import { fetchLiveNews } from '@/data/liveNews';

export function useLiveNews() {
  // Изначально пустой массив (или можно загрузить mock, пока идет запрос)
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const liveData = await fetchLiveNews();
        if (isMounted) {
          setNews(liveData);
          setError(null);
        }
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        }
      } finally {
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

  return { news, loading, error };
}