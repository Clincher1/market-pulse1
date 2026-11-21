// Типы данных приложения и пустые заготовки плиток.
//
// Файл раньше назывался mockData.ts, и это имя врало: никаких «мок-данных» с
// числами здесь нет и не должно быть. Есть только описание форм ответа и
// заготовки с прочерком на случай, когда живое значение ещё не пришло —
// выдуманная котировка на экране выглядит как настоящая, поэтому её тут нет.

export interface AssetData {
  id: string;
  name: string;
  price: string;
  change: number | null;
  sparkline: number[];
  /**
   * Даты наблюдений, по одной на значение sparkline. `null` — даты не
   * сохранены: ряд тогда бездатый, и подписывать значения календарём нельзя.
   */
  sparkDates?: string[] | null;
  /**
   * Момент, на который получена цена. Без него плитка показывает число без
   * времени, и заголовок «у каждого числа есть время» перестаёт быть правдой.
   */
  updatedAt?: string | null;
  /**
   * То, что сказал источник: дата закрытия у дневных рядов или
   * момент котировки у внутридневных. `updatedAt` — когда кэш сходил за
   * ценой, и это не одно и то же: в 08:45 в кэше может лежать закрытие
   * вчерашнего дня. Пока колонки `as_of` нет в базе, поля не будет.
   */
  asOf?: string | null;
  /**
   * Кто ответил за это число: «Coinbase», «Kraken», «ЕЦБ». Нужен потому, что
   * источник слота выбирается вручную: без подписи цена одной биржи выглядела
   * бы как цена другой. Пока колонки `source_label` нет в базе, поля не будет.
   */
  sourceLabel?: string | null;
}

/** Только исходные поля публикации, которые показываются в новостной ленте. */
export interface NewsHeadline {
  id: number;
  source: string;
  time?: string | null;
  title: string;
  url?: string;
  published_at?: string | null;
}

/**
 * Старая форма строки `cached_news`, оставлена для чтения legacy-утилит.
 * Модельные поля в публичную новостную ленту не запрашиваются и не выводятся.
 */
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
  /** Filled by the legacy duplicate grouper; not used by public news feeds. */
  duplicateCount?: number;
  duplicateSources?: string[];
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
  { id: 'brent', name: 'Brent (фьючерс)', price: '—', change: 0, sparkline: [] },
  { id: 'gold', name: 'Gold', price: '—', change: 0, sparkline: [] },
  { id: 'btc', name: 'BTC', price: '—', change: 0, sparkline: [] },
];
