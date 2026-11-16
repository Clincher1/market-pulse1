import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, HeartPulse, LayoutDashboard, Menu, X } from 'lucide-react';
import BrandMark from './BrandMark';
import {
  DASHBOARD_THEME_ORDER,
  SECTION_THEMES,
  type SectionThemeId,
} from './sectionThemes.data';
import { PAGE_PATHS, type AppView } from '@/lib/routes';

const navLinks = DASHBOARD_THEME_ORDER.map((themeId) => {
  const theme = SECTION_THEMES[themeId];
  return {
    themeId,
    label: theme.navLabel,
    fullLabel: theme.label,
    href: theme.href,
    description: theme.description,
    icon: theme.icon,
    theme,
  };
});

// The bottom bar keeps the most-used destinations one tap away. Less frequent
// pages remain available from the full menu and the overview page.
const mobileThemeIds: SectionThemeId[] = ['passport', 'russia', 'global', 'news'];

const mobileQuickLinks = [
  {
    label: 'Обзор',
    href: PAGE_PATHS.dashboard,
    icon: LayoutDashboard,
    theme: null,
    page: 'dashboard' as AppView,
  },
  ...mobileThemeIds.map((themeId) => {
    const theme = SECTION_THEMES[themeId];
    return {
      label: theme.navLabel,
      href: theme.href,
      icon: theme.icon,
      theme,
      page: themeId as AppView,
    };
  }),
];

type HeaderProps = {
  activeView: AppView;
};

export default function Header({ activeView }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActiveLink = (themeId: SectionThemeId) => activeView === themeId;

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled || menuOpen
            ? 'border-b border-slate-200/90 bg-bg-primary/90 shadow-[0_10px_30px_rgba(15,23,42,0.09)] backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
          <a
            href={PAGE_PATHS.dashboard}
            onClick={() => setMenuOpen(false)}
            className="group flex shrink-0 items-center gap-2.5 rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
            aria-label="Market Pulse — обзор"
            aria-current={activeView === 'dashboard' ? 'page' : undefined}
          >
            <BrandMark className="h-10 w-10 drop-shadow-[0_8px_18px_rgba(37,99,235,0.18)] transition-transform duration-200 group-hover:scale-[1.03]" />
            <span className="text-lg font-extrabold tracking-tight text-text-primary">
              Market Pulse
            </span>
          </a>

          <nav
            aria-label="Основная навигация"
            className="hidden items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.07)] backdrop-blur-md lg:flex"
          >
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = isActiveLink(link.themeId);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  data-testid={`header-nav-${link.themeId}`}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-2.5 py-2 text-[13px] font-extrabold transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary xl:gap-2 xl:px-3 xl:text-sm ${
                    isActive
                      ? link.theme.activeClass
                      : `${link.theme.cardClass} text-text-primary`
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      isActive ? 'bg-current' : link.theme.dotClass
                    }`}
                    aria-hidden="true"
                  />
                  <Icon
                    className={`hidden h-4 w-4 shrink-0 xl:block ${
                      isActive ? 'text-current' : link.theme.textClass
                    }`}
                    aria-hidden="true"
                  />
                  {link.label}
                </a>
              );
            })}
          </nav>

          <button
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-extrabold text-text-primary shadow-sm transition-all hover:border-accent/40 hover:bg-blue-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-[0.97] lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            <span>{menuOpen ? 'Закрыть' : 'Разделы'}</span>
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        {menuOpen && (
          <motion.nav
            id="mobile-navigation"
            aria-label="Мобильная навигация"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain border-t border-slate-200 bg-slate-50 shadow-xl backdrop-blur-xl lg:hidden"
          >
            <div className="px-4 py-4">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-800">
                  Навигация
                </span>
                <span className="text-xs font-medium text-text-secondary">Выберите страницу</span>
              </div>

              <div className="flex flex-col gap-2.5">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = isActiveLink(link.themeId);
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group flex min-h-[60px] items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-[0.99] ${
                        isActive
                          ? link.theme.activeClass
                          : `${link.theme.cardClass} text-text-primary`
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                          isActive
                            ? 'border-slate-200 bg-slate-50 text-current'
                            : `border-transparent ${link.theme.iconClass}`
                        }`}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-base font-extrabold leading-tight text-current">
                          {link.theme.order} · {link.fullLabel}
                        </span>
                        <span
                          className={`mt-0.5 text-xs leading-snug ${
                            isActive ? 'text-current opacity-85' : 'text-text-secondary'
                          }`}
                        >
                          {link.description}
                        </span>
                      </span>
                      <ChevronRight
                        className={`h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${
                          isActive ? 'text-current' : link.theme.textClass
                        }`}
                        aria-hidden="true"
                      />
                    </a>
                  );
                })}
                <a
                  href={PAGE_PATHS.status}
                  onClick={() => setMenuOpen(false)}
                  aria-current={activeView === 'status' ? 'page' : undefined}
                  className={`group flex min-h-[60px] items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary ${
                    activeView === 'status'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-emerald-200 bg-emerald-50 text-text-primary hover:bg-emerald-100'
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
                    <HeartPulse className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-base font-extrabold">Состояние системы</span>
                    <span className="mt-0.5 text-xs text-text-secondary">Источники, котировки и проверки</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                </a>
              </div>
            </div>
          </motion.nav>
        )}
      </motion.header>

      {/* A separate sibling avoids transformed-header containing blocks from
          changing the fixed positioning of the mobile page switcher. */}
      <nav
        aria-label="Частые страницы"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex items-stretch justify-between rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:hidden"
      >
        {mobileQuickLinks.map((link) => {
          const Icon = link.icon;
          const isActive = activeView === link.page;
          return (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-10 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-0.5 py-1 text-[10px] font-extrabold leading-none transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                isActive
                  ? link.theme?.activeClass ?? 'border-accent-strong bg-accent-strong text-white shadow-sm'
                  : link.theme
                    ? `${link.theme.cardClass} text-text-primary`
                    : 'border-transparent text-text-secondary hover:bg-slate-100 hover:text-text-primary'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-current' : link.theme?.textClass ?? 'text-blue-700'
                }`}
                aria-hidden="true"
              />
              <span className="max-w-full truncate">{link.label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
