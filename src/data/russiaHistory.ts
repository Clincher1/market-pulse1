export interface HistoryPoint {
  date: string;
  value: number;
  /** Дата вступления в силу для ступенчатых рядов (ключевая ставка). */
  since?: string;
}

export interface HistorySeries {
  id: string;
  name: string;
  unit: string;
  kind: 'line' | 'step';
  provider: string;
  sourceUrl: string;
  note: string;
  points: HistoryPoint[];
  truncated: boolean;
}

export interface RussiaHistory {
  generatedAt: string;
  window: { from: string; till: string; days: number };
  series: HistorySeries[];
  errors: string[];
  notes: string[];
}

/**
 * История рядов собирается на сервере из первоисточников (Мосбиржа ISS, ЦБ).
 * Браузер не ходит к ним напрямую: у ЦБ нет CORS, а ответ должен быть один.
 */
export async function fetchRussiaHistory(): Promise<RussiaHistory> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch('/api/russia-history', {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as Partial<RussiaHistory>;
    return {
      generatedAt: payload.generatedAt ?? '',
      window: payload.window ?? { from: '', till: '', days: 0 },
      series: Array.isArray(payload.series) ? payload.series : [],
      errors: Array.isArray(payload.errors) ? payload.errors : [],
      notes: Array.isArray(payload.notes) ? payload.notes : [],
    };
  } catch (error) {
    console.error('Не удалось загрузить историю рядов:', error);
    return {
      generatedAt: '',
      window: { from: '', till: '', days: 0 },
      series: [],
      errors: ['История не загрузилась: сервер истории не ответил. Значения не подставляются.'],
      notes: [],
    };
  } finally {
    window.clearTimeout(timer);
  }
}
