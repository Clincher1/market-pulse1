import { supabase } from '@/lib/supabase';
import type { DailySnapshot } from './dailySnapshots';

/**
 * Архив дневных паспортов.
 *
 * Каждая строка `daily_snapshots` — это первая запись московского дня: функция
 * snapshot-morning пишет снимок с `resolution=ignore-duplicates`, поэтому
 * повторный запуск не перезаписывает утреннюю точку. Именно на этом держится
 * обещание «запись не меняется задним числом»: оно обеспечено не дисциплиной,
 * а ограничением вставки.
 *
 * Фронтенд читает только те поля, которые действительно нужны для паспорта.
 * Прогнозы из снимка сюда не попадают: в них лежит старая шкала вероятностей,
 * а у сайта теперь отдельный журнал проверок, и смешивать два разных счёта
 * нельзя.
 */

/**
 * Один мировой индикатор в том виде, в каком он попал в утренний снимок.
 *
 * `price` — строка источника, а не пересчитанное число: снимок хранит её как
 * есть, и паспорт обязан показывать ровно её, иначе «неизменяемая запись»
 * перестаёт быть неизменяемой.
 */
export interface PassportAsset {
  id: string;
  name: string;
  /** Цена так, как её напечатал источник. Пусто — цена не сохранилась. */
  price: string;
  change: number | null;
  /** Дата наблюдения от источника: в субботу это может быть пятница. */
  asOf: string | null;
}

export interface PassportDay {
  date: string;
  capturedAt: string;
  /**
   * Самое сильное дневное движение среди пяти мировых индикаторов.
   * `asOf` — дата наблюдения от источника: в субботу цена закрытия пятницы
   * остаётся прежней, и без даты паспорт приписывал бы движению сегодняшний день.
   */
  topMover: { name: string; change: number; asOf: string | null } | null;
  /**
   * Все индикаторы снимка, в порядке источника. Нужны, чтобы паспорт мог
   * показать утро целиком: пять цен на момент фиксации, а не только самое
   * сильное движение.
   */
  assets: PassportAsset[];
  /** Официальный курс доллара на утро, если он попал в снимок. */
  usdRub: number | null;
}

export interface PassportResult {
  days: PassportDay[];
  error: boolean;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeDay(row: Record<string, unknown>): PassportDay {
  const assets = Array.isArray(row.assets) ? row.assets.filter(isRecord) : [];
  const russia = isRecord(row.russia) ? row.russia : {};
  const markets = Array.isArray(russia.markets) ? russia.markets.filter(isRecord) : [];

  let topMover: PassportDay['topMover'] = null;
  for (const asset of assets) {
    const change = finiteNumber(asset.change);
    const name = typeof asset.name === 'string' ? asset.name : '';
    if (change === null || !name) continue;
    if (!topMover || Math.abs(change) > Math.abs(topMover.change)) {
      topMover = { name, change, asOf: typeof asset.as_of === 'string' && asset.as_of ? asset.as_of : null };
    }
  }

  const snapshotAssets: PassportAsset[] = [];
  for (const asset of assets) {
    const id = typeof asset.id === 'string' ? asset.id : '';
    const name = typeof asset.name === 'string' ? asset.name : '';
    if (!id || !name) continue;
    snapshotAssets.push({
      id,
      name,
      price: typeof asset.price === 'string' ? asset.price : '',
      change: finiteNumber(asset.change),
      asOf: typeof asset.as_of === 'string' && asset.as_of ? asset.as_of : null,
    });
  }

  const usdRubRow = markets.find((market) => market.id === 'usd-rub');

  return {
    date: String(row.date ?? ''),
    capturedAt: String(row.captured_at ?? ''),
    topMover,
    assets: snapshotAssets,
    usdRub: usdRubRow ? finiteNumber(usdRubRow.value) : null,
  };
}

/** Последние `limit` паспортов, от свежего к старому. */
export async function fetchDailyPassports(limit = 14): Promise<PassportResult> {
  try {
    const { data, error } = await supabase
      .from('daily_snapshots')
      .select('date, captured_at, assets, russia')
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    const rows = Array.isArray(data) ? data.filter(isRecord) : [];
    return { days: rows.map(normalizeDay), error: false };
  } catch (e) {
    console.error('Ошибка загрузки дневных паспортов:', e);
    return { days: [], error: true };
  }
}

/** Время фиксации по Москве: «07:00». */
export function moscowTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Дата паспорта: «29 октября 2026». */
export function passportDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Короткая дата для архива: «29.10». */
export function passportDateShort(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export type { DailySnapshot };
