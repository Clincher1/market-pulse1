/**
 * Строки «слот → источник» в человеческом виде.
 *
 * Страница состояния показывает не только «сайт жив», но и откуда взято
 * каждое число: номер слота, какой источник его кормит сейчас, сколько раз мы
 * к нему пришли за сутки и не на паузе ли он. Логика склейки живёт здесь, а не
 * в компоненте, чтобы её можно было проверить тестом без сети и без браузера.
 */

export type SourceVerdict = 'ok' | 'paused' | 'failing' | 'idle';

export interface SlotSourceRow {
  number: number;
  slot_id: string;
  section: string;
  title: string;
  can_choose: boolean;
  source_id: string;
  chosen: boolean;
  priority: number | null;
  why: string;
}

export interface SourceStateRow {
  source_id: string;
  requests_today: number | null;
  last_status: number | null;
  last_ok_at: string | null;
  last_attempt_at: string | null;
  consecutive_failures: number | null;
  paused_until: string | null;
  verdict: SourceVerdict;
}

export interface SlotView {
  number: number;
  slotId: string;
  section: string;
  title: string;
  canChoose: boolean;
  /** Источники в порядке, в котором их будет спрашивать писатель. */
  sources: Array<{
    id: string;
    chosen: boolean;
    why: string;
    priority: number | null;
    state: SourceStateRow | null;
  }>;
}

/**
 * Склейка двух представлений базы. Источник без строки состояния — это не
 * «всё хорошо», а «мы к нему ещё не ходили»: в отчёте он так и называется.
 */
export function groupSlotRows(rows: SlotSourceRow[], states: SourceStateRow[]): SlotView[] {
  const bySource = new Map(states.map((state) => [state.source_id, state]));
  const slots = new Map<number, SlotView>();
  for (const row of rows) {
    let slot = slots.get(row.number);
    if (!slot) {
      slot = {
        number: row.number,
        slotId: row.slot_id,
        section: row.section,
        title: row.title,
        canChoose: row.can_choose,
        sources: [],
      };
      slots.set(row.number, slot);
    }
    slot.sources.push({
      id: row.source_id,
      chosen: row.chosen,
      why: row.why,
      priority: row.priority,
      state: bySource.get(row.source_id) ?? null,
    });
  }
  for (const slot of slots.values()) {
    // Сервисный источник (внутренний счёт) идёт последним: он не «источник
    // данных», а наша дисциплина.
    slot.sources.sort((a, b) => Number(b.chosen) - Number(a.chosen)
      || (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id));
  }
  return [...slots.values()].sort((a, b) => a.number - b.number);
}

export function verdictLabel(verdict: SourceVerdict | null): string {
  switch (verdict) {
    case 'ok':
      return 'отвечает';
    case 'paused':
      return 'на паузе';
    case 'failing':
      return 'отказывает';
    case 'idle':
      return 'ещё не спрашивали';
    default:
      return 'нет записи';
  }
}

/**
 * Расход как «12 из 300» — с бюджетом, а не без него: «12 запросов» ничего не
 * говорит о том, далеко ли мы от блокировки.
 */
export function usageLabel(state: SourceStateRow | null, budget: number | null): string {
  if (!state) return '—';
  const used = Math.max(0, Math.trunc(Number(state.requests_today ?? 0)));
  return budget ? `${used} из ${budget}` : String(used);
}

/** Сколько ждать до конца паузы, словами. */
export function pauseLabel(now: Date, state: SourceStateRow | null): string | null {
  if (!state?.paused_until) return null;
  const until = Date.parse(state.paused_until);
  if (!Number.isFinite(until) || until <= now.getTime()) return null;
  const minutes = Math.ceil((until - now.getTime()) / 60_000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** Сколько слотов сейчас без источника — то, что нельзя показывать молча. */
export function slotsWithoutSource(slots: SlotView[]): number[] {
  return slots.filter((slot) => slot.sources.every((source) => !source.chosen)).map((slot) => slot.number);
}

/** These registry entries describe internal/legacy processes, not public blocks. */
export function isInternalSlot(slotId: string): boolean {
  return new Set(['news.tension', 'news.events', 'news.classify', 'news.digest',
    'memory.market', 'passport.delivery', 'forecast.archive', 'snapshot.morning']).has(slotId);
}
