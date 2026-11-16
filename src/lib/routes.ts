export type AppView =
  | 'dashboard'
  | 'passport'
  | 'russia'
  | 'global'
  | 'brief'
  | 'news'
  | 'memory'
  | 'guide'
  | 'about'
  | 'status';

/**
 * Each topic has its own URL. The root path is intentionally the short overview;
 * Vercel and Vite serve the same SPA entry point for these client-rendered pages.
 */
export const PAGE_PATHS: Record<AppView, string> = {
  dashboard: '/',
  passport: '/passport',
  russia: '/russia',
  global: '/world',
  brief: '/brief',
  news: '/news',
  memory: '/memory',
  guide: '/guide',
  about: '/about',
  status: '/status',
};

const VIEW_BY_PATH = new Map(
  Object.entries(PAGE_PATHS).map(([view, path]) => [path, view as AppView]),
);

// Previously shared links used in-page fragments. Keep them working and move
// them to their new page URL on load so old bookmarks do not break.
const VIEW_BY_LEGACY_HASH = new Map<string, AppView>([
  ['#dashboard', 'dashboard'],
  ['#daily-passport', 'passport'],
  ['#russia-business', 'russia'],
  ['#global-economy', 'global'],
  ['#brief', 'brief'],
  ['#news', 'news'],
  ['#market-memory', 'memory'],
  ['#guide', 'guide'],
  ['#about', 'about'],
  ['#status', 'status'],
]);

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '');
}

export function viewFromLocation(pathname: string, hash: string): AppView {
  const pathView = VIEW_BY_PATH.get(normalizePath(pathname));
  if (pathView) return pathView;
  if (hash.startsWith('#guide-')) return 'guide';
  return VIEW_BY_LEGACY_HASH.get(hash) ?? 'dashboard';
}

/** Return a replacement URL only for old root-level route fragments. */
export function pathFromLegacyHash(pathname: string, hash: string): string | null {
  if (normalizePath(pathname) !== '/' || !hash) return null;

  const view = hash.startsWith('#guide-')
    ? 'guide'
    : VIEW_BY_LEGACY_HASH.get(hash);
  if (!view || view === 'dashboard') return null;

  const guideAnchor = view === 'guide' && hash.startsWith('#guide-') ? hash : '';
  return `${PAGE_PATHS[view]}${guideAnchor}`;
}
