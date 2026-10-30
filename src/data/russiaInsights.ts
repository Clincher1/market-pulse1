export interface RussiaMarketIndicator {
  id: string;
  name: string;
  label: string;
  value: number;
  unit: string;
  changePct: number | null;
  /**
   * Изменение в абсолютных единицах — там, где процент от процента читался бы
   * неверно (ставки) или просто не нужен (резервы). Единица рядом: п.п. или
   * млрд $, чтобы плитка не подписывала разницу чужими единицами.
   */
  changeAbs?: number | null;
  changeAbsUnit?: string | null;
  asOf: string;
  previousDate?: string | null;
  provider: string;
  basis: string;
  sourceUrl: string;
  /** Точки кривой доходности ОФЗ по срокам, если источник их отдал. */
  curve?: Array<{ period: number; value: number }> | null;
  curveAsOf?: string | null;
}

export interface RussiaHeadline {
  id: string;
  source: string;
  section: string;
  title: string;
  url: string;
  publishedAt: string;
  categories: string[];
}

export interface RussiaInsights {
  generatedAt: string;
  markets: RussiaMarketIndicator[];
  headlines: RussiaHeadline[];
  errors: string[];
  notes: string[];
}

const EMPTY: RussiaInsights = {
  generatedAt: '',
  markets: [],
  headlines: [],
  errors: [],
  notes: [],
};

/**
 * Российские индикаторы и заголовки собираются серверной функцией Vercel.
 * Так браузер не зависит от CORS Банка России, а все источники получают
 * единый формат, время и подпись базиса значения.
 */
export async function fetchRussiaInsights(): Promise<RussiaInsights> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch('/api/russia-insights', {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as Partial<RussiaInsights>;
    return {
      generatedAt: payload.generatedAt ?? '',
      markets: Array.isArray(payload.markets) ? payload.markets : [],
      headlines: Array.isArray(payload.headlines) ? payload.headlines : [],
      errors: Array.isArray(payload.errors) ? payload.errors : [],
      notes: Array.isArray(payload.notes) ? payload.notes : [],
    };
  } catch (error) {
    console.error('Не удалось загрузить российский блок:', error);
    return EMPTY;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Один сетевой запрос на страницу вместо одного на компонент.
 *
 * Российские индикаторы нужны двум блокам: «Пульс российского бизнеса» и
 * верхней сводке про деньги. Дёргать `/api/russia-insights` дважды ради одних
 * и тех же чисел — лишний запрос на каждом открытии. Здесь общий промис и
 * короткий кэш: пока ответ свежий, второй блок берёт его же.
 *
 * Кэшируется только непустой успешный ответ: пустышку нельзя запомнить,
 * иначе блок так и будет показывать «источник не ответил» после того, как
 * источник ожил.
 */
const SHARED_TTL_MS = 120_000;
let sharedCache: { at: number; data: RussiaInsights } | null = null;
let sharedInflight: Promise<RussiaInsights> | null = null;

export function fetchRussiaInsightsShared(): Promise<RussiaInsights> {
  const now = Date.now();
  if (sharedCache && now - sharedCache.at < SHARED_TTL_MS) {
    return Promise.resolve(sharedCache.data);
  }
  if (sharedInflight) return sharedInflight;

  sharedInflight = fetchRussiaInsights()
    .then((data) => {
      if (data.markets.length > 0) sharedCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      sharedInflight = null;
    });

  return sharedInflight;
}
