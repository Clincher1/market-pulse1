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

export interface PassportDay {
  date: string;
  capturedAt: string;
  tensionValue: number | null;
  tensionLabel: string;
  tensionNewsCount: number | null;
  /** Самое сильное дневное движение среди пяти мировых индикаторов. */
  topMover: { name: string; change: number } | null;
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
  const tension = isRecord(row.tension) ? row.tension : {};
  const assets = Array.isArray(row.assets) ? row.assets.filter(isRecord) : [];
  const russia = isRecord(row.russia) ? row.russia : {};
  const markets = Array.isArray(russia.markets) ? russia.markets.filter(isRecord) : [];

  let topMover: PassportDay['topMover'] = null;
  for (const asset of assets) {
    const change = finiteNumber(asset.change);
    const name = typeof asset.name === 'string' ? asset.name : '';
    if (change === null || !name) continue;
    if (!topMover || Math.abs(change) > Math.abs(topMover.change)) {
      topMover = { name, change };
    }
  }

  const usdRubRow = markets.find((market) => market.id === 'usd-rub');

  return {
    date: String(row.date ?? ''),
    capturedAt: String(row.captured_at ?? ''),
    tensionValue: finiteNumber(tension.value),
    tensionLabel: typeof tension.label === 'string' ? tension.label : '',
    tensionNewsCount: finiteNumber(tension.news_count),
    topMover,
    usdRub: usdRubRow ? finiteNumber(usdRubRow.value) : null,
  };
}

/** Последние `limit` паспортов, от свежего к старому. */
export async function fetchDailyPassports(limit = 14): Promise<PassportResult> {
  try {
    const { data, error } = await supabase
      .from('daily_snapshots')
      .select('date, captured_at, tension, assets, russia')
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
