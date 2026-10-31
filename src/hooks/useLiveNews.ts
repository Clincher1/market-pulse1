import { useCallback, useEffect, useRef, useState } from 'react';
import { NewsItem } from '@/data/marketTypes';
import { fetchRawNews } from '@/data/liveNews';
import { startPolling } from '@/lib/polling';

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
    const stopPolling = startPolling(() => void load());
    return () => {
      isMounted.current = false;
      stopPolling();
    };
  }, [load]);

  return { news, loading, error, refresh: load, isRefreshing, lastUpdatedAt };
}
