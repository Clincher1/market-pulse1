import { useEffect, useRef, useState } from 'react';
import { m as motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown, LayoutDashboard } from 'lucide-react';
import BrandMark from './BrandMark';
import {
  DASHBOARD_THEME_ORDER,
  SECTION_THEMES,
  type SectionThemeId,
} from './sectionThemes.data';
import { PAGE_PATHS, type AppView } from '@/lib/routes';

const HEADER_THEME_ORDER: SectionThemeId[] = [
  ...DASHBOARD_THEME_ORDER.slice(0, 5),
  'memory',
  'guide',
  'about',
  'status',
];
const navLinks = HEADER_THEME_ORDER.map((themeId) => {
  const theme = SECTION_THEMES[themeId];
  return {
    themeId,
    label: theme.navLabel,
    fullLabel: theme.label,
    href: theme.href,
    description: theme.description,
    icon: theme.icon,
  };
});

const desktopPrimaryThemeIds: SectionThemeId[] = ['brief', 'passport', 'russia', 'global', 'news'];
const desktopPrimaryLinks = [
  {
    label: 'Обзор',
    href: PAGE_PATHS.dashboard,
    icon: LayoutDashboard,
    page: 'dashboard' as AppView,
    themeId: null,
  },
  ...desktopPrimaryThemeIds.map((themeId) => ({
    label: themeId === 'brief' ? SECTION_THEMES.brief.label : SECTION_THEMES[themeId].navLabel,
    href: SECTION_THEMES[themeId].href,
    icon: SECTION_THEMES[themeId].icon,
    page: themeId as AppView,
    themeId,
  })),
];
const desktopMoreLinks = navLinks.filter((link) => !desktopPrimaryThemeIds.includes(link.themeId));

type HeaderProps = {
  activeView: AppView;
};

export default function Header({ activeView }: HeaderProps) {
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
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
  const moreIsActive = desktopMoreLinks.some((link) => isActiveLink(link.themeId));

  return (
    <motion.header
      initial={reduceMotion ? false : { y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.42, ease: 'easeOut' }}
      className={`site-header ${scrolled ? 'is-scrolled' : ''}`}
    >
      <div className="site-header__inner site-container flex items-center justify-between gap-3">
        <a
          href={PAGE_PATHS.dashboard}
          className="site-brand group flex shrink-0 items-center gap-2.5 rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
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
          <div className="desktop-navigation__links">
            {desktopPrimaryLinks.map((link) => {
              const Icon = link.icon;
              const isActive = activeView === link.page;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  data-testid={`header-nav-${link.themeId ?? 'dashboard'}`}
                  data-theme={link.themeId ?? 'dashboard'}
                  aria-current={isActive ? 'page' : undefined}
                  className={`desktop-navigation__link ${isActive ? 'is-active' : ''}`}
                >
                  {isActive && (
                    <motion.span
                      className="desktop-navigation__active-bg"
                      initial={reduceMotion ? false : { opacity: 0.4, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: reduceMotion ? 0 : 0.2 }}
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="desktop-navigation__icon" aria-hidden="true" />
                  <span className="relative z-10">{link.label}</span>
                </a>
              );
            })}
          </div>

          <details
            ref={moreMenuRef}
            className={`desktop-navigation__more ${moreIsActive ? 'is-active' : ''}`}
          >
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
            </div>
          </details>
        </nav>
      </div>
    </motion.header>
  );
}
