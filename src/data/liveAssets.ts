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
 * as_of, spark_dates and source_label were added by separate migrations.
 * Code deploys independently from schema, and PostgREST rejects a query if
 * any requested column is absent, so try the richer projections first while
 * retaining fallbacks for older schemas.
 */
const COLUMN_SETS = [
  `${BASE_COLUMNS}, as_of, spark_dates, source_label`,
  `${BASE_COLUMNS}, as_of, spark_dates`,
  `${BASE_COLUMNS}, as_of, source_label`,
  `${BASE_COLUMNS}, as_of`,
  `${BASE_COLUMNS}, source_label`,
  BASE_COLUMNS,
];

async function selectAssets(): Promise<{ data: unknown[] | null; error: unknown }> {
  let last: { data: unknown[] | null; error: unknown } = { data: null, error: new Error('Нет попыток') };
  for (const columns of COLUMN_SETS) {
    last = await supabase.from('cached_assets').select(columns);
    if (!last.error) return last;
  }
  return last;
}

/**
 * Короткая память запроса.
 *
 * Полоса рынка и плитки грузятся с одной страницы и раньше делали два
 * одинаковых запроса в `cached_assets` подряд. Данные в кэше меняются раз в
 * 15 минут, поэтому окно в 15 секунд ничего не скрывает: оно схлопывает только
 * одновременные загрузки. Кнопка «обновить» идёт мимо памяти (force).
 */
const CACHE_TTL_MS = 15_000;
let lastResult: { at: number; assets: AssetData[] } | null = null;

/** Сбросить память запроса. Нужен тестам, чтобы прогоны не влияли друг на друга. */
export function resetAssetsRequestCache(): void {
  lastResult = null;
}

export async function fetchLiveAssets(options: { force?: boolean } = {}): Promise<AssetData[]> {
  if (!options.force && lastResult && Date.now() - lastResult.at < CACHE_TTL_MS) {
    return lastResult.assets;
  }
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

    const mapped = [...sorted, ...extras].map(mapAssetCacheRow);
    // Пустой ответ не запоминаем: иначе одна неудача на 15 секунд выглядела бы
    // как «данных нет» и во втором блоке тоже.
    if (mapped.length > 0) lastResult = { at: Date.now(), assets: mapped };
    return mapped;
  } catch (e) {
    console.error('Ошибка загрузки кэша активов:', e);
    return [];
  }
}
