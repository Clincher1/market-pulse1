import { supabase } from '@/lib/supabase';
import type { SlotSourceRow, SourceStateRow } from '@/lib/slotsView';

/**
 * Данные страницы «Слоты и источники».
 *
 * Читаются два представления базы, а не таблицы: `slot_sources_view` уже
 * соединяет реестр с выбором владельца, а `source_politeness_view` отдаёт
 * расход и паузы без текста последней ошибки. Обе доступны анонимному ключу —
 * ровно те поля, которые владелец и так должен видеть.
 */
export async function fetchSlotSources(): Promise<SlotSourceRow[]> {
  try {
    const { data, error } = await supabase
      .from('slot_sources_view')
      .select('number, slot_id, section, title, can_choose, source_id, chosen, priority, why')
      .order('number', { ascending: true });
    if (error || !data) return [];
    return data as SlotSourceRow[];
  } catch (e) {
    console.error('Ошибка загрузки слотов:', e);
    return [];
  }
}

export async function fetchSourceStates(): Promise<SourceStateRow[]> {
  try {
    const { data, error } = await supabase
      .from('source_politeness_view')
      .select('source_id, requests_today, last_status, last_ok_at, last_attempt_at, consecutive_failures, paused_until, verdict');
    if (error || !data) return [];
    return data as SourceStateRow[];
  } catch (e) {
    console.error('Ошибка загрузки состояния источников:', e);
    return [];
  }
}

/**
 * Бюджеты источников.
 *
 * Хранятся в коде функции, а не в базе, поэтому на странице их нет. Здесь
 * перечислены только те, что нужны для подписи «12 из 300»; если источник
 * появится в базе без бюджета, подпись честно покажет одно число, а не
 * придуманный потолок.
 */
export const SOURCE_BUDGETS: Record<string, number> = {
  yahoo: 300,
  kraken: 300,
  'gold-api': 300,
  coinbase: 300,
  binance: 300,
  twelve: 100,
  ecb: 24,
  frankfurter: 24,
};
