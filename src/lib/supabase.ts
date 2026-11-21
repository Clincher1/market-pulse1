import { PostgrestClient } from '@supabase/postgrest-js';
import { FunctionsClient } from '@supabase/functions-js';

/**
 * Единый клиент базы для всего приложения.
 *
 * Адрес базы здесь не константа, потому что у сайта два способа доставки:
 *
 * 1. **Прямой** (как на Vercel): браузер обращается к `*.supabase.co`.
 *    Публичный (publishable/anon) ключ допустим в клиентском коде только
 *    потому, что в Supabase включён RLS и анониму разрешено читать лишь
 *    таблицы `cached_*` и представления `*_v1`.
 *
 * 2. **Через свой домен** (`VITE_SUPABASE_PROXY=/sb`): браузер ходит на тот же
 *    адрес, что и за страницей, а сервер (`server/origin.mjs`) пересылает
 *    запрос в Supabase. Это нужно там, где часть операторов не пропускает
 *    `*.supabase.co`: без прокси страница откроется, а данных не будет.
 *    В браузере в этом режиме не остаётся ни одного чужого адреса — это же
 *    требование проверяет `no_third_party` в самопроверке.
 *
 * Значения по умолчанию ниже — публичный ключ проекта. Он же уходит в сборку
 * на Vercel; переопределяется переменными окружения (см. .env.example):
 *   VITE_SUPABASE_URL    — полный адрес проекта,
 *   VITE_SUPABASE_PROXY  — `/sb` (или 1), чтобы ходить через свой домен,
 *   VITE_SUPABASE_ANON_KEY — публичный ключ.
 */
const explicitUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const proxyFlag = (import.meta.env.VITE_SUPABASE_PROXY as string | undefined)?.trim();

const DEFAULT_PROJECT_URL = 'https://hekzplfftannlzwvgwwm.supabase.co';

/**
 * Абсолютный адрес API. `supabase-js` требует схему и хост, поэтому
 * относительный `/sb` разворачивается в `${location.origin}/sb`.
 * Если по какой-то причине `location` недоступен (SSR, сборка), остаётся
 * прямой адрес проекта — молча ломать клиент нельзя.
 */
function resolveSupabaseUrl(): string {
  if (proxyFlag) {
    const path = proxyFlag.startsWith('/') ? proxyFlag : '/sb';
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
  }
  return explicitUrl || DEFAULT_PROJECT_URL;
}

const supabaseUrl = resolveSupabaseUrl();

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_FPAh2Z30aCCKpbfDdDrM_g_urRwk8r-';

// Use the same official query/invoke implementations without shipping Auth,
// Realtime or Storage. There are no user sessions, cookies or browser storage.
// Preserve the public headers used by supabase-js (including legacy anon JWTs).
const headers = { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` };
const rest = new PostgrestClient(`${supabaseUrl.replace(/\/$/, '')}/rest/v1`, { headers });
export const supabase = {
  from: rest.from.bind(rest),
  functions: new FunctionsClient(`${supabaseUrl.replace(/\/$/, '')}/functions/v1`, { headers }),
};

/**
 * Куда именно ходит браузер — видно в сборке и в отладке. Не секрет:
 * публичный адрес проекта и так известен.
 */
export const supabaseEndpoint = supabaseUrl;
