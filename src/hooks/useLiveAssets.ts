import { useState, useEffect, useRef } from 'react';
import { AssetData, assets as fallbackAssets } from '@/data/mockData';
import { fetchLiveAssets } from '@/data/liveAssets';

/**
 * Собирает итоговый список активов: для каждого fallback-актива
 * берёт живые данные, если они валидны, иначе оставляет fallback.
 * Живые активы, которых нет в fallback, добавляются в конец.
 * Так карточка актива никогда не "пропадёт" из-за одной битой строки.
 */
function mergeWithFallback(live: AssetData[]): AssetData[] {
  const merged = fallbackAssets.map((fb) => {
    const liveItem = live.find((a) => a.id === fb.id);
    if (!liveItem || liveItem.price === '—' || !liveItem.sparkline?.length) {
      return fb;
    }
    return liveItem;
  });

  const extras = live.filter(
    (item) => !fallbackAssets.some((fb) => fb.id === item.id)
  );

  return [...merged, ...extras];
}

export function useLiveAssets(): {
  assets: AssetData[];
  loading: boolean;
  error: string | null;
} {
  const [assets, setAssets] = useState<AssetData[]>(fallbackAssets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const load = async () => {
      try {
        const live = await fetchLiveAssets();
        if (!isMounted.current) return;

        if (live.length === 0) {
          // Загрузка не удалась: НЕ затираем уже показанные данные
          // пустым массивом, а сообщаем об ошибке.
          setError('Не удалось загрузить живые цены');
          return;
        }

        setAssets(mergeWithFallback(live));
        setError(null);
      } catch (e) {
        if (!isMounted.current) return;
        setError(e instanceof Error ? e.message : 'Failed to load live assets');
      } finally {
        if (isMounted.current) setLoading(false);
      }
    };

    load();

    // Обновление раз в 5 минут — стабильно, без лимитов.
    const interval = setInterval(load, 300_000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { assets, loading, error };
}
