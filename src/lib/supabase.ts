import { createClient } from '@supabase/supabase-js';

/**
 * Единый клиент Supabase для всего приложения.
 *
 * Значения по умолчанию ниже — это публичный (publishable/anon) ключ проекта.
 * Такой ключ допустимо использовать в клиентском коде ТОЛЬКО если в Supabase
 * включён RLS и анонимным пользователям разрешено только чтение (SELECT)
 * таблиц cached_*.
 *
 * В StackBlitz / Vercel значения можно переопределить через переменные
 * окружения (см. .env.example):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://hekzplfftannlzwvgwwm.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_FPAh2Z30aCCKpbfDdDrM_g_urRwk8r-';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
