// Типы данных приложения и резервные (fallback) значения.
// Резервные значения показываются только до первой успешной загрузки
// или если живые данные из Supabase недоступны (в этом случае UI
// честно показывает предупреждение — см. useLiveAssets / KeyAssets).

/**
 * Распределение дневной истории шкалы напряжённости относительно
 * текущего значения. Считается в Postgres по tension_history и лежит
 * в cached_tension.history_stats. belowDays — дни со значением ниже
 * текущего, aboveDays — выше текущего.
 */
export interface TensionHistoryStats {
  days: number;
  belowDays: number;
  aboveDays: number;
  equalDays: number;
  median: number | null;
  min: number | null;
  max: number | null;
  firstDate?: string;
  lastDate?: string;
}

export interface TensionData {
  current: number;
  label: string;
  history: { day: string; value: number }[];
  newsCount: number;
  updatedAt?: string;
  historyStats?: TensionHistoryStats | null;
  /**
   * Время самого свежего материала в выборке индекса. Отличается от updatedAt:
   * пересчёт идёт каждые 15 минут даже тогда, когда новых новостей нет, и окно
   * просто держит старые материалы. По этому полю видно, идёт ли поток на самом
   * деле. Отсутствует — значит карточка ничего о свежести не утверждает.
   */
  sampleNewest?: string;
  /**
   * Сколько материалов за последние 24 часа дал каждый источник. Показывает,
   * насколько широк взгляд шкалы: если одна лента молчит, это видно сразу.
   */
  sourceMix?: { name: string; count: number }[] | null;
}

export interface AssetData {
  id: string;
  name: string;
  price: string;
  change: number;
  sparkline: number[];
  /**
   * Момент, на который получена цена. Без него плитка показывает число без
   * времени, и заголовок «у каждого числа есть время» перестаёт быть правдой.
   */
  updatedAt?: string | null;
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

// --- Заготовки плиток без чисел ---

/**
 * До первой успешной загрузки плитки рисуются сразу, но без цен: показывать
 * нечего, а выдуманное число на экране выглядит как котировка, даже если рядом
 * написано «нет свежей цены». Резервные значения убраны совсем — Brent $78.40
 * при реальных $123.10 не украшение, а дезинформация.
 */
export const assetPlaceholders: AssetData[] = [
  { id: 'usd-eur', name: 'USD/EUR', price: '—', change: 0, sparkline: [] },
  { id: 'sp500', name: 'S&P 500', price: '—', change: 0, sparkline: [] },
  { id: 'brent', name: 'Brent', price: '—', change: 0, sparkline: [] },
  { id: 'gold', name: 'Gold', price: '—', change: 0, sparkline: [] },
  { id: 'btc', name: 'BTC', price: '—', change: 0, sparkline: [] },
];
