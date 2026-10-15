import { AssetData, assets as fallbackAssets } from './mockData';

// ── Utilities ──────────────────────────────────────────────────────────

function calcChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  const raw = ((current - previous) / previous) * 100;
  return Math.round(raw * 10) / 10; // округление до 1 знака
}

function formatPrice(value: number, type: 'currency' | 'index' | 'rate'): string {
  if (type === 'rate') {
    return value.toFixed(2);
  }
  if (type === 'index') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  // currency
  if (value >= 1000) {
    return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return '$' + value.toFixed(2);
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function emptyAsset(id: string): AssetData {
  const fb = fallbackAssets.find((a) => a.id === id);
  return {
    id,
    name: fb?.name ?? id,
    price: '—',
    change: 0,
    sparkline: [],
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolate(points: number, from: number, to: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < points; i++) {
    result.push(lerp(from, to, i / (points - 1)));
  }
  return result;
}

function lastN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  return arr.slice(arr.length - n);
}

// ── Per-asset fetchers ─────────────────────────────────────────────────

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
    const sparkline = lastN(prices, 11).map((p) => Math.round(p));
    return {
      id: 'btc',
      name: 'BTC',
      price: formatPrice(current, 'currency'),
      change: calcChange(current, weekAgo),
      sparkline,
    };
  } catch {
    return emptyAsset('btc');
  }
}

async function fetchUsdEur(): Promise<AssetData> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = await res.json();
    const current = data.rates.EUR;

    const histRes = await fetch(
      `https://api.frankfurter.app/${dateStr(7)}..?from=USD&to=EUR`
    );
    if (!histRes.ok) throw new Error(`Frankfurter hist ${histRes.status}`);
    const histData = await histRes.json();
    const histEntries = Object.entries(histData.rates) as [string, { EUR: number }][];
    if (histEntries.length === 0) throw new Error('no history');
    histEntries.sort((a, b) => a[0].localeCompare(b[0]));
    const weekAgo = histEntries[0][1].EUR;

    return {
      id: 'usd-eur',
      name: 'USD/EUR',
      price: formatPrice(current, 'rate'),
      change: calcChange(current, weekAgo),
      sparkline: interpolate(11, weekAgo, current),
    };
  } catch {
    return emptyAsset('usd-eur');
  }
}

function parseStooqCsv(csv: string): { closes: number[] } {
  const lines = csv.trim().split('\n');
  const closes: number[] = [];
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length >= 5) {
      const close = parseFloat(cols[4]);
      if (!isNaN(close)) closes.push(close);
    }
  }
  return { closes };
}

async function fetchSp500(): Promise<AssetData> {
  try {
    const res = await fetch('https://stooq.com/q/d/l/?s=^spx&i=d');
    if (!res.ok) throw new Error(`Stooq SPX ${res.status}`);
    const csv = await res.text();
    const { closes } = parseStooqCsv(csv);
    if (closes.length === 0) throw new Error('no SPX data');
    const current = closes[closes.length - 1];
    const weekAgo = closes[Math.max(0, closes.length - 8)];
    return {
      id: 'sp500',
      name: 'S&P 500',
      price: formatPrice(current, 'index'),
      change: calcChange(current, weekAgo),
      sparkline: lastN(closes, 11).map((v) => Math.round(v)),
    };
  } catch {
    return emptyAsset('sp500');
  }
}

async function fetchBrent(): Promise<AssetData> {
  try {
    const res = await fetch('https://stooq.com/q/d/l/?s=cb.f&i=d');
    if (!res.ok) throw new Error(`Stooq Brent ${res.status}`);
    const csv = await res.text();
    const { closes } = parseStooqCsv(csv);
    if (closes.length === 0) throw new Error('no Brent data');
    const current = closes[closes.length - 1];
    const weekAgo = closes[Math.max(0, closes.length - 8)];
    return {
      id: 'brent',
      name: 'Brent',
      price: formatPrice(current, 'currency'),
      change: calcChange(current, weekAgo),
      sparkline: lastN(closes, 11).map((v) => Math.round(v * 100) / 100),
    };
  } catch {
    return emptyAsset('brent');
  }
}

async function fetchGold(): Promise<AssetData> {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU');
    if (!res.ok) throw new Error(`Gold API ${res.status}`);
    const data = await res.json();
    const current = data.price;
    if (typeof current !== 'number' || isNaN(current)) throw new Error('invalid gold price');
    const sparkline: number[] = [];
    for (let i = 0; i < 11; i++) {
      sparkline.push(Math.round(current * (0.99 + (i / 10) * 0.01) * 100) / 100);
    }
    return {
      id: 'gold',
      name: 'Gold',
      price: formatPrice(current, 'currency'),
      change: 0.5,
      sparkline,
    };
  } catch {
    return emptyAsset('gold');
  }
}

// ── Main export ────────────────────────────────────────────────────────

export async function fetchLiveAssets(): Promise<AssetData[]> {
  const [usdEur, sp500, brent, gold, btc] = await Promise.all([
    fetchUsdEur(),
    fetchSp500(),
    fetchBrent(),
    fetchGold(),
    fetchBTC(),
  ]);
  return [usdEur, sp500, brent, gold, btc];
}
