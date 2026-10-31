import { AssetData } from './marketTypes';
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
const BASE_COLUMNS = 'id, name, price, change, sparkline, updated_at';

/**
 * as_of приходит из миграции 20261030120000. Код выкатывается отдельно от
 * миграции, поэтому запрос с колонкой может упасть — тогда читаем без неё,
 * и плитка честно покажет только время записи в кэш.
 */
async function selectAssets(): Promise<{ data: unknown[] | null; error: unknown }> {
  const withAsOf = await supabase.from('cached_assets').select(`${BASE_COLUMNS}, as_of`);
  if (!withAsOf.error) return { data: withAsOf.data, error: null };
  const fallback = await supabase.from('cached_assets').select(BASE_COLUMNS);
  return { data: fallback.data, error: fallback.error };
}

export async function fetchLiveAssets(): Promise<AssetData[]> {
  try {
    const { data, error } = await selectAssets();

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
      asOf: (asset as AssetData & { as_of?: string | null }).as_of ?? null,
    }));
  } catch (e) {
    console.error('Ошибка загрузки кэша активов:', e);
    return [];
  }
}
