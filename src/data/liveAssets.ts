import { AssetData } from './mockData';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hekzplfftannlzwvgwwm.supabase.co';
const supabaseKey = 'sb_publishable_FPAh2Z30aCCKpbfDdDrM_g_urRwk8r-'; // <-- Замени это

const supabase = createClient(supabaseUrl, supabaseKey);

export async function fetchLiveAssets(): Promise<AssetData[]> {
  try {
    const { data, error } = await supabase
      .from('cached_assets')
      .select('*');

    if (error || !data || data.length === 0) {
      throw new Error('Нет данных в кэше');
    }

    const order = ['usd-eur', 'sp500', 'brent', 'gold', 'btc'];
    return order
      .map(id => data.find(d => d.id === id))
      .filter(Boolean) as AssetData[];
  } catch (e) {
    console.error('Ошибка загрузки кэша:', e);
    return [];
  }
}