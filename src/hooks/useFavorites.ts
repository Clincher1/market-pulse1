import { useCallback, useEffect, useState } from 'react';
import { DESK_ASSET_IDS, FAVORITES_KEY, parseFavorites } from '@/lib/marketDesk';

function readFavorites(): string[] {
  try { return parseFavorites(window.localStorage.getItem(FAVORITES_KEY)); }
  catch { return []; }
}

/** Storage is optional: private mode/quota errors must not break the dashboard. */
export function useFavorites() {
  const [favorites, setFavorites] = useState(readFavorites);
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === FAVORITES_KEY || event.key === null) setFavorites(readFavorites());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const toggle = useCallback((id: string) => {
    if (!DESK_ASSET_IDS.some((known) => known === id)) return;
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    setFavorites(next);
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      setStorageFailed(false);
    } catch { setStorageFailed(true); }
  }, [favorites]);
  return { favorites, toggle, storageFailed };
}
