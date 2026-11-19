import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown, ChevronRight, HeartPulse, LayoutDashboard, Menu, X } from 'lucide-react';
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

const desktopPrimaryThemeIds: SectionThemeId[] = ['passport', 'russia', 'global', 'news'];
const desktopPrimaryLinks = [
  {
    label: 'Обзор',
    href: PAGE_PATHS.dashboard,
    icon: LayoutDashboard,
    page: 'dashboard' as AppView,
    themeId: null,
  },
  ...desktopPrimaryThemeIds.map((themeId) => ({
    label: SECTION_THEMES[themeId].navLabel,
    href: SECTION_THEMES[themeId].href,
    icon: SECTION_THEMES[themeId].icon,
    page: themeId as AppView,
    themeId,
  })),
];
const desktopMoreLinks = navLinks.filter((link) => !desktopPrimaryThemeIds.includes(link.themeId));

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
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        moreMenuRef.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !moreMenuRef.current?.open) return;
      moreMenuRef.current.open = false;
      moreMenuRef.current.querySelector('summary')?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const isActiveLink = (themeId: SectionThemeId) => activeView === themeId;

  return (
    <>
      <motion.header
        initial={reduceMotion ? false : { y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.42, ease: 'easeOut' }}
        className={`site-header ${scrolled || menuOpen ? 'is-scrolled' : ''}`}
      >
        <div className="site-header__inner mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
          <a
            href={PAGE_PATHS.dashboard}
            onClick={() => setMenuOpen(false)}
            className="site-brand group flex shrink-0 items-center gap-2.5 rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
            aria-label="Market Pulse — обзор"
            aria-current={activeView === 'dashboard' ? 'page' : undefined}
          >
            <BrandMark className="site-brand__mark h-11 w-11" />
            <span className="flex flex-col">
              <span className="brand-wordmark">Market Pulse</span>
              <span className="brand-tagline mt-1 hidden xl:block">
                ФАКТЫ <i>·</i> ИСТОЧНИКИ <i>·</i> КОНТЕКСТ
              </span>
            </span>
          </a>

          <nav aria-label="Основная навигация" className="desktop-navigation">
            {desktopPrimaryLinks.map((link) => {
              const Icon = link.icon;
              const isActive = activeView === link.page;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  data-testid={`header-nav-${link.themeId ?? 'dashboard'}`}
                  data-theme={link.themeId ?? 'dashboard'}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`desktop-navigation__link ${isActive ? 'is-active' : ''}`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="desktop-navigation-active"
                      className="desktop-navigation__active-bg"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 460, damping: 36 }
                      }
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="desktop-navigation__icon" aria-hidden="true" />
                  <span className="relative z-10">{link.label}</span>
                </a>
              );
            })}

            <details ref={moreMenuRef} className={`desktop-navigation__more ${
              desktopMoreLinks.some((link) => isActiveLink(link.themeId)) || activeView === 'status'
                ? 'is-active'
                : ''
            }`}>
              <summary className="desktop-navigation__more-trigger">
                Ещё
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </summary>
              <div className="desktop-navigation__menu">
                <p className="desktop-navigation__menu-kicker">ДРУГИЕ СТРАНИЦЫ</p>
                {desktopMoreLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = isActiveLink(link.themeId);
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={(event) => {
                        setMenuOpen(false);
                        const menu = event.currentTarget.closest('details');
                        if (menu) menu.open = false;
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      className={`desktop-navigation__menu-item ${isActive ? 'is-active' : ''}`}
                    >
                      <span className="desktop-navigation__menu-icon">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="desktop-navigation__menu-copy">
                        <span className="desktop-navigation__menu-title">{link.fullLabel}</span>
                        <span className="desktop-navigation__menu-description">{link.description}</span>
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                    </a>
                  );
                })}
                <a
                  href={PAGE_PATHS.status}
                  onClick={(event) => {
                    setMenuOpen(false);
                    const menu = event.currentTarget.closest('details');
                    if (menu) menu.open = false;
                  }}
                  aria-current={activeView === 'status' ? 'page' : undefined}
                  className={`desktop-navigation__menu-item ${activeView === 'status' ? 'is-active' : ''}`}
                >
                  <span className="desktop-navigation__menu-icon desktop-navigation__menu-icon--status">
                    <HeartPulse className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="desktop-navigation__menu-copy">
                    <span className="desktop-navigation__menu-title">Состояние системы</span>
                    <span className="desktop-navigation__menu-description">Источники и проверки</span>
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                </a>
              </div>
            </details>
          </nav>

          <button
            type="button"
            className="site-header__mobile-toggle inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-3.5 py-2 text-sm font-extrabold shadow-sm transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-[0.97] lg:hidden"
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
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
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
        className="mobile-quick-nav fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex items-stretch justify-between rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:hidden"
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
