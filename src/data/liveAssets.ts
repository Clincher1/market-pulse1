import { mapAssetCacheRow, type AssetCacheRow } from './assetCacheRow';
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
 * as_of пришёл миграцией 20261030120000, spark_dates — 20261031193000.
 * Код выкатывается отдельно от миграций, поэтому колонок может ещё не быть.
 * PostgREST отклоняет весь запрос, если хотя бы одной колонки нет, — поэтому
 * пробуем наборы от полного к базовому: без дат плитка честно покажет только
 * время записи в кэш, а ряд останется бездатым.
 */
const COLUMN_SETS = [`${BASE_COLUMNS}, as_of, spark_dates`, `${BASE_COLUMNS}, as_of`, BASE_COLUMNS];

async function selectAssets(): Promise<{ data: unknown[] | null; error: unknown }> {
  let last: { data: unknown[] | null; error: unknown } = { data: null, error: new Error('Нет попыток') };
  for (const columns of COLUMN_SETS) {
    last = await supabase.from('cached_assets').select(columns);
    if (!last.error) return last;
  }
  return last;
}

export async function fetchLiveAssets(): Promise<AssetData[]> {
  try {
    const { data, error } = await selectAssets();

    if (error || !data || data.length === 0) {
      throw new Error('Нет данных в кэше');
    }

    const rows = data as AssetCacheRow[];

    const sorted = ASSET_ORDER
      .map((id) => rows.find((d) => d.id === id))
      .filter((row): row is AssetCacheRow => Boolean(row));

    // Активы, которых нет в ASSET_ORDER, не теряем — добавляем в конец.
    const extras = rows.filter((row) => !ASSET_ORDER.includes(row.id));

    return [...sorted, ...extras].map(mapAssetCacheRow);
  } catch (e) {
    console.error('Ошибка загрузки кэша активов:', e);
    return [];
  }
}
