import { useState, useEffect, useRef } from 'react';
import { AssetData, assets as fallbackAssets } from '@/data/mockData';
import { fetchLiveAssets } from '@/data/liveAssets';

function mergeWithFallback(live: AssetData[]): AssetData[] {
  return live.map((item) => {
    if (item.price === '—' || item.sparkline.length === 0) {
      const fb = fallbackAssets.find((a) => a.id === item.id);
      return fb ?? item;
    }
    return item;
  });
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

    const interval = setInterval(load, 120_000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { assets, loading, error };
}