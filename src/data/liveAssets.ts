import { AssetData, assets as fallbackAssets } from './mockData';

const TWELVE_KEY = '8ca1f1f0bbb7485e86c954e04bdfb70f';
const PROXY_BASE = 'https://hekzplfftannlzwvgwwm.supabase.co/functions/v1/proxy';

function proxyUrl(target: string): string {
  return `${PROXY_BASE}?url=${encodeURIComponent(target)}`;
}

function calcChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  const raw = ((current - previous) / previous) * 100;
  return Number(raw.toFixed(1));
}

function formatPrice(value: number, type: 'currency' | 'index' | 'rate'): string {
  if (type === 'rate') return value.toFixed(2);
  if (type === 'index') return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 1000) return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + value.toFixed(2);
}

function emptyAsset(id: string): AssetData {
  const fb = fallbackAssets.find((a) => a.id === id);
  return { id, name: fb?.name ?? id, price: '—', change: 0, sparkline: [] };
}

function lastN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  return arr.slice(arr.length - n);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTwelve(
  symbol: string,
  id: string,
  name: string,
  type: 'currency' | 'index' | 'rate'
): Promise<AssetData> {
  try {
    const target = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol
    )}&interval=1day&outputsize=8&apikey=${TWELVE_KEY}`;
    const res = await fetch(proxyUrl(target));
    if (!res.ok) throw new Error(`Twelve ${res.status}`);
    const data = await res.json();

    if (data.status === 'error') throw new Error(data.message || 'Twelve error');
    if (!data.values || data.values.length === 0) throw new Error('no values');

    const values = data.values as { datetime: string; close: string }[];
    const latest = parseFloat(values[0].close);
    const weekAgo = parseFloat(values[values.length - 1].close);
    const sparkline = values
      .slice()
      .reverse()
      .map((v) => parseFloat(v.close));

    return {
      id,
      name,
      price: formatPrice(latest, type),
      change: calcChange(latest, weekAgo),
      sparkline,
    };
  } catch {
    return emptyAsset(id);
  }
}

async function fetchUsdEur(): Promise<AssetData> {
  try {
    const res = await fetch(
      proxyUrl('https://api.frankfurter.app/latest?from=USD&to=EUR')
    );
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = await res.json();
    const current = data.rates.EUR as number;

    const d = new Date();
    d.setDate(d.getDate() - 7);
    const dateStr = d.toISOString().slice(0, 10);

    const histRes = await fetch(
      proxyUrl(`https://api.frankfurter.app/${dateStr}..?from=USD&to=EUR`)
    );
    const histData = await histRes.json();
    const entries = Object.entries(histData.rates) as [string, { EUR: number }][];
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const weekAgo = entries.length ? entries[0][1].EUR : current;

    const sparkline: number[] = [];
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      sparkline.push(Number((weekAgo + (current - weekAgo) * t).toFixed(4)));
    }

    return {
      id: 'usd-eur',
      name: 'USD/EUR',
      price: formatPrice(current, 'rate'),
      change: calcChange(current, weekAgo),
      sparkline,
    };
  } catch {
    return emptyAsset('usd-eur');
  }
}

async function fetchBTC(): Promise<AssetData> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=daily'
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    const prices: number[] = data.prices.map((p: [number, number]) => p[1]);
    if (prices.length === 0) throw new Error('no prices');
    const current = prices[prices.length - 1];
    const weekAgo = prices[0];
    return {
      id: 'btc',
      name: 'BTC',
      price: formatPrice(current, 'currency'),
      change: calcChange(current, weekAgo),
      sparkline: lastN(prices, 11).map((p) => Math.round(p)),
    };
  } catch {
    return emptyAsset('btc');
  }
}

export async function fetchLiveAssets(): Promise<AssetData[]> {
  // СТРАТЕГИЯ: медленно, но стабильно.
  // USD/EUR и BTC — от разных API, без лимитов.
  // SPY, USO, GLD — Twelve Data, между ними пауза 15 сек (лимит 8/мин).

  const usdEur = await fetchUsdEur();
  const btc = await fetchBTC();

  const sp500 = await fetchTwelve('SPY', 'sp500', 'S&P 500', 'index');
  await sleep(15000);

  const brent = await fetchTwelve('USO', 'brent', 'Brent', 'currency');
  await sleep(15000);

  const gold = await fetchTwelve('GLD', 'gold', 'Gold', 'currency');

  return [usdEur, sp500, brent, gold, btc];
}