import { useCallback, useEffect, useRef, useState } from 'react';
import { NewsItem } from '@/data/mockData';
import { fetchRawNews } from '@/data/liveNews';

export function useLiveNews(): {
  news: NewsItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  lastUpdatedAt: Date | null;
} {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const isMounted = useRef(true);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    if (hasLoaded.current) setIsRefreshing(true);

    const raw = await fetchRawNews();
    if (!isMounted.current) return;

    if (raw.length > 0) {
      hasLoaded.current = true;
      setNews(raw);
      setError(null);
      setLastUpdatedAt(new Date());
    } else {
      // Пустой результат = ошибка загрузки (fetchRawNews так сигналит).
      // Уже показанные новости не затираем: UI пометит их как последние
      // успешно загруженные, а не как свежие.
      setError('Не удалось загрузить новости из базы');
    }

    setLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void load();
    const interval = setInterval(() => void load(), 300_000); // каждые 5 минут
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [load]);

  return { news, loading, error, refresh: load, isRefreshing, lastUpdatedAt };
}
