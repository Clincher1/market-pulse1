import { AssetData } from './mockData';
import { supabase } from '@/lib/supabase';

const ASSET_ORDER = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'];

/**
 * Загружает активы из кэша Supabase (таблица cached_assets).
 *
 * ВАЖНО: цены показываются ровно так, как они лежат в базе.
 * Никакого умножения на фронте быть не должно: если источник цен
 * отдаёт значение в другом масштабе, это исправляется на стороне
 * бэкенда, который заполняет cached_assets, а не здесь.
 *
 * При ошибке возвращает пустой массив — вызывающий код (useLiveAssets)
 * в этом случае сохраняет fallback-активы и показывает предупреждение.
 */
export async function fetchLiveAssets(): Promise<AssetData[]> {
  try {
    const { data, error } = await supabase
      .from('cached_assets')
      .select('id, name, price, change, sparkline, updated_at');

    if (error || !data || data.length === 0) {
      throw new Error('Нет данных в кэше');
    }

    const rows = data as AssetData[];

    const sorted = ASSET_ORDER
      .map((id) => rows.find((d) => d.id === id))
      .filter((row): row is AssetData => Boolean(row));

    // Активы, которых нет в ASSET_ORDER, не теряем — добавляем в конец.
    const extras = rows.filter((row) => !ASSET_ORDER.includes(row.id));

    return [...sorted, ...extras].map((asset) => ({
      ...asset,
      change: asset.change ?? 0,
      sparkline: asset.sparkline ?? [],
      updatedAt: (asset as AssetData & { updated_at?: string | null }).updated_at ?? null,
    }));
  } catch (e) {
    console.error('Ошибка загрузки кэша активов:', e);
    return [];
  }
}
