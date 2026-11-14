import { supabase } from '@/lib/supabase';

export interface SnapshotAsset {
  id: string;
  name: string;
  price: string;
  change: number | null;
  last: number | null;
  updatedAt: string | null;
  /** Дата наблюдения от источника. Пусто — источник её не назвал. */
  asOf: string | null;
}

export interface SnapshotRussiaMarket {
  id: string;
  name: string;
  label: string;
  value: number | null;
  unit: string;
  changePct: number | null;
  asOf: string | null;
  provider: string;
}

export interface DailySnapshot {
  date: string;
  capturedAt: string;
  assets: SnapshotAsset[];
  russiaGeneratedAt: string | null;
  russiaMarkets: SnapshotRussiaMarket[];
}

export interface DailySnapshotResult {
  snapshot: DailySnapshot | null;
  error: boolean;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeAssets(value: unknown): SnapshotAsset[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((row) => ({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    price: String(row.price ?? ''),
    change: finiteNumber(row.change),
    last: finiteNumber(row.last),
    updatedAt: stringOrNull(row.updated_at),
    asOf: stringOrNull(row.as_of),
  })).filter((row) => row.id);
}

function normalizeRussia(value: unknown): {
  generatedAt: string | null;
  markets: SnapshotRussiaMarket[];
} {
  if (!isRecord(value) || !Array.isArray(value.markets)) {
    return { generatedAt: null, markets: [] };
  }
  return {
    generatedAt: stringOrNull(value.generated_at),
    markets: value.markets.filter(isRecord).map((row) => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      label: String(row.label ?? ''),
      value: finiteNumber(row.value),
      unit: String(row.unit ?? ''),
      changePct: finiteNumber(row.changePct),
      asOf: stringOrNull(row.asOf),
      provider: String(row.provider ?? ''),
    })).filter((row) => row.id),
  };
}

export function moscowDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Загружает только снимок текущего московского дня. Вчерашнюю строку
 * специально не подставляем: блок «Что изменилось» должен сравнивать
 * с сегодняшней зафиксированной точкой, а не молча менять базу.
 */
export async function fetchTodaySnapshot(): Promise<DailySnapshotResult> {
  try {
    const { data, error } = await supabase
      .from('daily_snapshots')
      .select('date, captured_at, assets, russia')
      .eq('date', moscowDateKey())
      .limit(1);

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { snapshot: null, error: false };

    const russia = normalizeRussia(row.russia);
    return {
      snapshot: {
        date: String(row.date),
        capturedAt: String(row.captured_at),
        assets: normalizeAssets(row.assets),
        russiaGeneratedAt: russia.generatedAt,
        russiaMarkets: russia.markets,
      },
      error: false,
    };
  } catch (error) {
    console.error('Ошибка загрузки дневного снимка:', error);
    return { snapshot: null, error: true };
  }
}
