/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * `/sb` (или `1`) — браузер ходит в базу через свой домен, а не напрямую в
   * `*.supabase.co`. Нужно там, где часть операторов не пропускает домен
   * Supabase: иначе страница откроется без данных.
   */
  readonly VITE_SUPABASE_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
