export interface RussiaMarketIndicator {
  id: string;
  name: string;
  label: string;
  value: number;
  unit: string;
  changePct: number | null;
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
