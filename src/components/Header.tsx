import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, LayoutDashboard, Menu, X } from 'lucide-react';
import BrandMark from './BrandMark';
import {
  DASHBOARD_THEME_ORDER,
  SECTION_THEMES,
  type SectionThemeId,
} from './sectionThemes.data';

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

const SECTION_IDS = [
  'dashboard',
  'russia-business',
  'global-economy',
  'brief',
  'news',
  'market-memory',
  'about',
] as const;

const mobileThemeIds: SectionThemeId[] = [
  'russia',
  'global',
  'brief',
  'news',
  'memory',
  'guide',
];

const mobileQuickLinks = [
  {
    label: 'Обзор',
    href: '#dashboard',
    icon: LayoutDashboard,
    theme: null,
  },
  ...mobileThemeIds.map((themeId) => {
    const theme = SECTION_THEMES[themeId];
    return {
      label: theme.navLabel,
      href: theme.href,
      icon: theme.icon,
      theme,
    };
  }),
];

type HeaderProps = {
  activeView?: 'dashboard' | 'guide' | 'status';
};

export default function Header({ activeView = 'dashboard' }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );
  const [activeSection, setActiveSection] = useState<string>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const id = window.location.hash.replace('#', '');
    return SECTION_IDS.includes(id as (typeof SECTION_IDS)[number]) ? id : 'dashboard';
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const syncHash = () => setCurrentHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  // Scroll-spy: подсветка следует за реальной позицией страницы. Позиции
  // перечитываются на каждом scroll-кадре, а не привязываются к конкретным
  // DOM-узлам: отложенные секции сначала представлены placeholder-ом, а
  // после загрузки тот же id получает уже настоящий элемент.
  useEffect(() => {
    if (activeView !== 'dashboard') return;

    let rafId = 0;

    const updateActiveSection = () => {
      rafId = 0;
      const probeY = window.scrollY + Math.min(360, window.innerHeight * 0.38);
      let current: string = 'dashboard';

      for (const id of SECTION_IDS) {
        const element = document.getElementById(id);
        if (!element) continue;
        const top = element.getBoundingClientRect().top + window.scrollY;
        if (top <= probeY) current = id;
      }

      setActiveSection((previous) => (previous === current ? previous : current));
    };

    const scheduleUpdate = () => {
      if (!rafId) rafId = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', scheduleUpdate);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('hashchange', scheduleUpdate);
    };
  }, [activeView]);

  const isActiveLink = (href: string) => {
    if (href === '#guide') return activeView === 'guide';
    if (activeView === 'guide') return false;
    return activeSection === href.replace('#', '') || currentHash === href && !activeSection;
  };

  return (
    <>
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? 'border-b border-white/10 bg-bg-primary/90 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <a
          href="#dashboard"
          onClick={() => {
            setCurrentHash('#dashboard');
            setActiveSection('dashboard');
          }}
          className="group flex shrink-0 items-center gap-2.5 rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          aria-label="Market Pulse — на дашборд"
        >
          <BrandMark className="h-10 w-10 drop-shadow-[0_10px_22px_rgba(37,99,235,0.32)] transition-transform duration-200 group-hover:scale-[1.03]" />
          <span className="text-lg font-extrabold tracking-tight text-text-primary">
            Market Pulse
          </span>
        </a>

        <nav
          aria-label="Основная навигация"
          className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_32px_rgba(0,0,0,0.20)] backdrop-blur-md lg:flex"
        >
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = isActiveLink(link.href);
            return (
              <a
                key={link.href}
                href={link.href}
                data-testid={`header-nav-${link.themeId}`}
                onClick={() => {
                  setCurrentHash(link.href);
                  setActiveSection(link.href.replace('#', ''));
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-2.5 py-2 text-[13px] font-extrabold transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary xl:gap-2 xl:px-3.5 xl:text-sm ${
                  isActive
                    ? link.theme.activeClass
                    : `${link.theme.cardClass} text-slate-100 hover:text-white`
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
                />
                {link.label}
              </a>
            );
          })}
        </nav>

        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-2 text-sm font-extrabold text-white shadow-[0_10px_26px_rgba(0,0,0,0.24)] transition-all hover:border-accent/65 hover:bg-accent/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-[0.97] lg:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
        >
          {!menuOpen && (
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-300 opacity-50 [animation-duration:1.8s]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-300" />
            </span>
          )}
          <span>{menuOpen ? 'Закрыть' : 'Меню'}</span>
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
          className="max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain border-t border-white/10 bg-[#0B1222]/95 shadow-2xl backdrop-blur-xl lg:hidden"
        >
          <div className="px-4 py-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-200">
                Навигация
              </span>
              <span className="text-xs font-medium text-slate-400">Выберите раздел</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = isActiveLink(link.href);
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => {
                      setCurrentHash(link.href);
                      setActiveSection(link.href.replace('#', ''));
                      setMenuOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex min-h-[60px] items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-[0.99] ${
                      isActive
                        ? link.theme.activeClass
                        : `${link.theme.cardClass} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        isActive
                          ? 'border-white/25 bg-white/20 text-current'
                          : `border-transparent ${link.theme.iconClass}`
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-base font-extrabold leading-tight text-current">
                        {link.theme.order} · {link.fullLabel}
                      </span>
                      <span
                        className={`mt-0.5 text-xs leading-snug ${
                          isActive ? 'text-current opacity-80' : 'text-slate-300'
                        }`}
                      >
                        {link.description}
                      </span>
                    </span>
                    <ChevronRight
                      className={`h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${
                        isActive ? 'text-current' : link.theme.textClass
                      }`}
                    />
                  </a>
                );
              })}
            </div>
          </div>
        </motion.nav>
      )}
    </motion.header>

      {/* Мобильная быстрая навигация — sibling шапки, а не её потомок:
          backdrop-filter/transform на header создаёт containing block и
          иначе «fixed bottom» внезапно считается от шапки, а не viewport. */}
      <nav
        aria-label="Быстрая мобильная навигация"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex overflow-x-auto rounded-2xl border border-white/12 bg-[#0B1222]/92 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl scrollbar-hide lg:hidden"
      >
        {mobileQuickLinks.map((link) => {
          const Icon = link.icon;
          const isActive = isActiveLink(link.href);
          return (
            <a
              key={link.href}
              href={link.href}
              onClick={() => {
                setCurrentHash(link.href);
                setActiveSection(link.href.replace('#', ''));
                setMenuOpen(false);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-12 min-w-[4.15rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-1.5 text-[10px] font-extrabold leading-none transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
                isActive
                  ? link.theme?.activeClass ?? 'border-accent-strong bg-accent-strong text-white shadow-lg shadow-accent/25'
                  : link.theme
                    ? `${link.theme.cardClass} text-slate-200`
                    : 'border-transparent text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon
                className={`h-4.5 w-4.5 shrink-0 ${
                  isActive ? 'text-current' : link.theme?.textClass ?? 'text-blue-300'
                }`}
              />
              <span className="max-w-full truncate">{link.label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
