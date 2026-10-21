import { useState, useEffect } from 'react';
import { NewsItem } from '@/data/mockData';
import { fetchRawNews } from '@/data/liveNews';

export function useLiveNews(): {
  news: NewsItem[];
  loading: boolean;
  error: string | null;
} {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const raw = await fetchRawNews();
      if (!isMounted) return;

      if (raw.length > 0) {
        setNews(raw);
        setError(null);
      } else {
        // Пустой результат = ошибка загрузки (fetchRawNews так сигналит).
        // Уже показанные новости не затираем.
        setError('Не удалось загрузить новости из базы');
      }
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 300_000); // обновление каждые 5 минут
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { news, loading, error };
}
