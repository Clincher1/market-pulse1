import { useCallback, useEffect, useRef, useState } from 'react';
import { AssetData, assetPlaceholders as fallbackAssets } from '@/data/marketTypes';
import { fetchLiveAssets } from '@/data/liveAssets';
import { startPolling } from '@/lib/polling';

function isUsableLiveAsset(asset: AssetData | undefined): asset is AssetData {
  return Boolean(asset && asset.price !== '—' && (asset.id === 'gold' || asset.sparkline?.length));
}

/**
 * Собирает итоговый список активов и отдельно сообщает, какие плитки
 * остались на резервных значениях. Это важно для честности UI: fallback
 * нельзя визуально выдавать за только что полученную живую котировку.
 */
function mergeWithFallback(live: AssetData[]): {
  assets: AssetData[];
  fallbackAssetIds: string[];
} {
  const fallbackAssetIds: string[] = [];

  const merged = fallbackAssets.map((fb) => {
    const liveItem = live.find((a) => a.id === fb.id);
    if (!isUsableLiveAsset(liveItem)) {
      fallbackAssetIds.push(fb.id);
      return fb;
    }
    return liveItem;
  });

  const extras = live.filter(
    (item) =>
      isUsableLiveAsset(item) &&
      !fallbackAssets.some((fb) => fb.id === item.id),
  );

  return { assets: [...merged, ...extras], fallbackAssetIds };
}

export function useLiveAssets(): {
  assets: AssetData[];
  loading: boolean;
  error: string | null;
  hasLiveData: boolean;
  fallbackAssetIds: string[];
  refresh: () => Promise<void>;
  isRefreshing: boolean;
} {
  const [assets, setAssets] = useState<AssetData[]>(fallbackAssets);
  const [fallbackAssetIds, setFallbackAssetIds] = useState<string[]>(
    fallbackAssets.map((asset) => asset.id),
  );
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLiveData, setHasLiveData] = useState(false);
  const isMounted = useRef(true);
  const hasLiveDataRef = useRef(false);

  const load = useCallback(async () => {
    if (hasLiveDataRef.current) setIsRefreshing(true);

    try {
      // force при повторной загрузке: «обновить» не должен отдавать данные
      // из 15-секундной памяти запроса.
      const live = await fetchLiveAssets({ force: hasLiveDataRef.current });
      if (!isMounted.current) return;

      if (live.length === 0) {
        // Не затираем уже показанные значения. UI различает два случая:
        // живых данных ещё не было (fallback) и обновление не удалось
        // после успешной загрузки (устаревший живой снимок).
        setError('Не удалось загрузить живые цены');
        return;
      }

      const merged = mergeWithFallback(live);
      hasLiveDataRef.current = true;
      setHasLiveData(true);
      setAssets(merged.assets);
      setFallbackAssetIds(merged.fallbackAssetIds);
      setError(null);
    } catch (e) {
      if (!isMounted.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load live assets');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void load();

    // Обновление раз в 5 минут — стабильно, без лимитов.
    const stopPolling = startPolling(() => void load());

    return () => {
      isMounted.current = false;
      stopPolling();
    };
  }, [load]);

  return {
    assets,
    loading,
    error,
    hasLiveData,
    fallbackAssetIds,
    refresh: load,
    isRefreshing,
  };
}
