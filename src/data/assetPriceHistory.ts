import { supabase } from '@/lib/supabase';

export interface AssetHistoryPoint {
  date: string;
  value: number;
}

export interface AssetPriceHistory {
  assetId: string;
  instrumentId: string;
  provider: string;
  providerSymbol: string;
  points: AssetHistoryPoint[];
  /**
   * Сегодняшняя точка исключена, потому что день ещё не закрыт.
   *
   * Дневной ряд обновляется в течение дня, поэтому последняя точка за сегодня
   * — это незавершённая свеча. На графике она выглядела бы как закрытие дня и
   * не совпадала бы с живой ценой на плитке: у BTC расхождение доходило до
   * 0,73 %. Завершённые дни не двигаются, незавершённый — двигается.
   */
  unfinishedDayExcluded: boolean;
}

/**
 * The expanded asset panel must use the same provider series as the tile.
 * This is intentionally an explicit allowlist rather than `is_primary`:
 * shadow primary flags belong to Market Memory evaluation, while the public
 * tiles use Yahoo Finance for S&P 500 and Brent (с 01.11.2026, когда CSV у
 * FRED стал требовать ключ и отвечал 404 всплесками), ECB for the FX tile,
 * Kraken for BTC and Twelve spot for gold. In particular, the FRED/Nasdaq gold
 * index must never be presented as the XAU/USD spot series, and спот Brent не
 * подменяется фьючерсом внутри одной линии.
 */
const HISTORY_INSTRUMENT_BY_ASSET: Record<string, string> = {
  'usd-eur': 'eurusd_ecb_daily',
  sp500: 'sp500_yahoo_gspc',
  brent: 'brent_yahoo_bzf',
  gold: 'gold_twelve_xauusd_daily',
  btc: 'btc_kraken_xbtusd_daily',
};

interface AssetPriceHistoryRow {
  frontend_asset_id: string;
  instrument_id: string;
  provider: string;
  provider_symbol: string;
  observation_date: string;
  price: number | string;
  close: number | string | null;
  updated_at: string;
}

function positiveNumber(value: number | string | null | undefined): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Loads the newest dated daily observations for one explicitly mapped
 * instrument from the sanitized public view. Rows are requested newest
 * first and capped, so long-term accumulation in the shadow table cannot
 * eventually push recent observations out of the response.
 *
 * Returns null on any failure/insufficient data; the panel then keeps the
 * honest undated cached sparkline fallback instead of inventing dates.
 */
export async function fetchAssetPriceHistory(
  assetId: string,
): Promise<AssetPriceHistory | null> {
  const instrumentId = HISTORY_INSTRUMENT_BY_ASSET[assetId];
  if (!instrumentId) return null;

  try {
    const { data, error } = await supabase
      .from('asset_price_history_v1')
      .select(
        'frontend_asset_id, instrument_id, provider, provider_symbol, observation_date, price, close, updated_at',
      )
      .eq('frontend_asset_id', assetId)
      .eq('instrument_id', instrumentId)
      .order('observation_date', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error || !data) throw error ?? new Error('Нет датированной истории');

    const rows = data as AssetPriceHistoryRow[];
    const byDate = new Map<string, AssetHistoryPoint>();

    // Rows arrive newest-update first for each date, so the first valid row
    // for a calendar date is the one to keep if a provider ever emits two
    // daily bars that slice to the same date.
    for (const row of rows) {
      const date = String(row.observation_date ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || byDate.has(date)) continue;

      const rawValue = positiveNumber(row.close) ?? positiveNumber(row.price);
      if (rawValue === null) continue;

      // ECB stores market-convention EURUSD (USD per 1 EUR). The public
      // tile is USD/EUR, so the displayed dated series is explicitly
      // inverted here and only here.
      const value = assetId === 'usd-eur' ? 1 / rawValue : rawValue;
      if (!Number.isFinite(value) || value <= 0) continue;

      byDate.set(date, { date, value });
    }

    const allPoints = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    // Сегодняшний день ещё формируется: убираем его из графика, чтобы последняя
    // точка была закрытием, а не промежуточным значением.
    const todayIso = new Date().toISOString().slice(0, 10);
    const unfinishedDayExcluded =
      allPoints.length > 1 && allPoints[allPoints.length - 1].date === todayIso;
    const points = unfinishedDayExcluded ? allPoints.slice(0, -1) : allPoints;
    if (points.length < 2) return null;

    const latestRow = rows.find((row) => row.instrument_id === instrumentId);
    return {
      assetId,
      instrumentId,
      provider: latestRow?.provider ?? '',
      providerSymbol: latestRow?.provider_symbol ?? '',
      points,
      unfinishedDayExcluded,
    };
  } catch (error) {
    console.error('Ошибка загрузки датированной истории актива:', error);
    return null;
  }
}
