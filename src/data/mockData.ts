// Типы данных приложения и резервные (fallback) значения.
// Резервные значения показываются только до первой успешной загрузки
// или если живые данные из Supabase недоступны (в этом случае UI
// честно показывает предупреждение — см. useLiveAssets / KeyAssets).

export interface TensionData {
  current: number;
  label: string;
  history: { day: string; value: number }[];
  newsCount: number;
  updatedAt?: string;
}

export interface AssetData {
  id: string;
  name: string;
  price: string;
  change: number;
  sparkline: number[];
}

export interface NewsItem {
  id: number;
  source: string;
  time: string;
  title: string;
  impacts: { asset: string; direction: 'up' | 'down' }[];
  sentiment: number;
  importance: number;
  confidence?: number;
  summary: string;
  topic: string;
  url?: string;
  published_at?: string;
  /** Filled by the frontend duplicate grouper; 1 means no collapsed copies. */
  duplicateCount?: number;
  duplicateSources?: string[];
}

export interface ForecastData {
  id: string;
  asset: string;
  direction: 'up' | 'down' | 'none';
  probability: number;
  time_window: string;
  confidence: 'Низкая' | 'Средняя' | 'Высокая';
  reason: string;
  updated_at?: string;
}

// --- Fallback-данные (не живые цены!) ---

export const tensionData: TensionData = {
  current: 67,
  label: 'Тепло',
  history: [
    { day: '6 окт', value: 54 },
    { day: '7 окт', value: 58 },
    { day: '8 окт', value: 61 },
    { day: '9 окт', value: 55 },
    { day: '10 окт', value: 63 },
    { day: '11 окт', value: 70 },
    { day: '12 окт', value: 67 },
  ],
  newsCount: 1247,
};

export const assets: AssetData[] = [
  {
    id: 'usd-eur',
    name: 'USD/EUR',
    price: '0.92',
    change: 0.3,
    sparkline: [0.914, 0.915, 0.917, 0.916, 0.918, 0.919, 0.92, 0.92, 0.92, 0.92, 0.92],
  },
  {
    id: 'sp500',
    name: 'S&P 500',
    price: '5,847',
    change: -0.8,
    sparkline: [5910, 5895, 5870, 5885, 5860, 5850, 5847, 5855, 5840, 5847, 5847],
  },
  {
    id: 'brent',
    name: 'Brent',
    price: '$78.40',
    change: 1.2,
    sparkline: [76.8, 77.0, 77.2, 77.5, 77.8, 78.0, 78.1, 78.3, 78.4, 78.4, 78.4],
  },
  {
    id: 'gold',
    name: 'Gold',
    price: '$2,645',
    change: 0.5,
    sparkline: [2620, 2625, 2628, 2630, 2635, 2638, 2640, 2642, 2645, 2645, 2645],
  },
  {
    id: 'btc',
    name: 'BTC',
    price: '$67,240',
    change: -2.1,
    sparkline: [69200, 68800, 68500, 68200, 67800, 67500, 67400, 67300, 67240, 67240, 67240],
  },
];
