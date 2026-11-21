import type { AssetData } from './marketTypes';

/**
 * Строка `cached_assets` → форма приложения.
 *
 * В базе колонки в snake_case (`spark_dates`, `as_of`, `updated_at`), в
 * приложении — в camelCase. Перевод вынесен в чистую функцию без импортов,
 * чтобы его можно было проверить тестом: ошибка здесь тихая — ряд просто
 * остаётся бездатым, и на глаз это неотличимо от «источник дат не отдал».
 */
export type AssetCacheRow = AssetData & {
  updated_at?: string | null;
  as_of?: string | null;
  source_label?: string | null;
  spark_dates?: unknown;
};

export function mapAssetCacheRow(row: AssetCacheRow): AssetData {
  const dates = Array.isArray(row.spark_dates)
    ? row.spark_dates.map((value) => String(value ?? ''))
    : null;
  return {
    ...row,
    change: row.change ?? null,
    sparkline: Array.isArray(row.sparkline) ? row.sparkline : [],
    updatedAt: row.updated_at ?? null,
    asOf: row.as_of ?? null,
    sourceLabel: row.source_label ?? null,
    // Пустой массив не равен «дат нет»: если длины не совпадают со значениями,
    // даты бесполезны, и честнее вернуть null, а не половину календаря.
    sparkDates: dates && dates.length === (row.sparkline?.length ?? 0) ? dates : null,
  };
}
