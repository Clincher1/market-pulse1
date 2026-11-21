import { useSyncExternalStore } from 'react';
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

interface AssetSnapshot {
  assets: AssetData[];
  loading: boolean;
  error: string | null;
  hasLiveData: boolean;
  fallbackAssetIds: string[];
  isRefreshing: boolean;
}

const initialSnapshot: AssetSnapshot = {
  assets: fallbackAssets,
  loading: true,
  error: null,
  hasLiveData: false,
  fallbackAssetIds: fallbackAssets.map(asset => asset.id),
  isRefreshing: false,
};
let snapshot = initialSnapshot;
const listeners = new Set<() => void>();
let pending: Promise<void> | null = null;
let stopPolling: (() => void) | null = null;
let generation = 0;

function publish(next: AssetSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** One in-flight read and one published snapshot for ticker, tiles, desk and brief. */
function refresh(): Promise<void> {
  if (pending) return pending;
  const requestGeneration = generation;
  const force = snapshot.hasLiveData;
  publish({ ...snapshot, isRefreshing: force });
  pending = (async () => {
    try {
      const live = await fetchLiveAssets({ force });
      if (requestGeneration !== generation) return;
      if (!live.length) throw new Error('Не удалось загрузить живые цены');
      publish({ ...mergeWithFallback(live), loading: false, isRefreshing: false,
        hasLiveData: true, error: null });
    } catch (error) {
      if (requestGeneration !== generation) return;
      // Keep the same last successful snapshot in every block; never fabricate values.
      publish({ ...snapshot, loading: false, isRefreshing: false,
        error: error instanceof Error ? error.message : 'Не удалось загрузить живые цены' });
    } finally {
      if (requestGeneration === generation) pending = null;
    }
  })();
  return pending;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    stopPolling = startPolling(() => void refresh());
    void refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopPolling?.();
      stopPolling = null;
      // An unmounted page's response must not overwrite a later page's read.
      generation++;
      pending = null;
      snapshot = initialSnapshot;
    }
  };
}
const getSnapshot = () => snapshot;
const getServerSnapshot = () => initialSnapshot;

export function useLiveAssets(): AssetSnapshot & { refresh: () => Promise<void> } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...current, refresh };
}
