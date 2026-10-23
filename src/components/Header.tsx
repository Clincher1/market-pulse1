import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  BrainCircuit,
  ChevronRight,
  Info,
  Landmark,
  LayoutDashboard,
  Menu,
  Newspaper,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';

const navLinks = [
  {
    label: 'Дашборд',
    href: '#dashboard',
    description: 'Tension, активы и общий обзор',
    icon: LayoutDashboard,
  },
  {
    label: 'Россия',
    href: '#russia-business',
    description: 'Курсы ЦБ, Мосбиржа и последствия для бизнеса',
    icon: Landmark,
  },
  {
    label: 'Новости',
    href: '#news',
    description: 'Свежая лента и фильтры',
    icon: Newspaper,
  },
  {
    label: 'Прогнозы',
    href: '#forecasts',
    description: 'Сигналы по ключевым активам',
    icon: Target,
  },
  {
    label: 'Память',
    href: '#market-memory',
    description: 'События, исторические аналоги и проверка исходов',
    icon: BrainCircuit,
  },
  {
    label: 'Как читать',
    href: '#guide',
    description: 'Методология, формулы и ограничения',
    icon: BookOpen,
  },
  {
    label: 'О проекте',
    href: '#footer',
    description: 'О проекте и исходный код',
    icon: Info,
  },
];

type HeaderProps = {
  activeView?: 'dashboard' | 'guide';
};

export default function Header({ activeView = 'dashboard' }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );

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

  const isActiveLink = (href: string) => {
    if (href === '#guide') return activeView === 'guide';
    if (activeView === 'guide') return false;
    if (href === '#dashboard') return !currentHash || currentHash === '#dashboard';
    return currentHash === href;
  };

  return (
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
          onClick={() => setCurrentHash('#dashboard')}
          className="group flex shrink-0 items-center gap-2.5 rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          aria-label="Market Pulse — на дашборд"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-accent to-accent-hover shadow-lg shadow-accent/25 transition-shadow group-hover:shadow-accent/45">
            <TrendingUp className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-extrabold tracking-tight text-text-primary">
            Market Pulse
          </span>
        </a>

        <nav
          aria-label="Основная навигация"
          className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_32px_rgba(0,0,0,0.20)] backdrop-blur-md md:flex"
        >
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = isActiveLink(link.href);
            return (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setCurrentHash(link.href)}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-extrabold transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary lg:gap-2 lg:px-4 lg:text-sm ${
                  isActive
                    ? 'bg-accent text-white shadow-lg shadow-accent/30'
                    : 'text-slate-100 hover:bg-white/10 hover:text-white active:bg-accent/20'
                }`}
              >
                <Icon
                  className={`hidden h-4 w-4 shrink-0 lg:block ${
                    isActive ? 'text-white' : 'text-blue-300'
                  }`}
                />
                {link.label}
              </a>
            );
          })}
        </nav>

        <button
          type="button"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.07] text-white shadow-[0_10px_26px_rgba(0,0,0,0.24)] transition-all hover:border-accent/65 hover:bg-accent/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-[0.97] md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {menuOpen && (
        <motion.nav
          id="mobile-navigation"
          aria-label="Мобильная навигация"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="overflow-hidden border-t border-white/10 bg-[#0B1222]/95 shadow-2xl backdrop-blur-xl md:hidden"
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
                      setMenuOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex min-h-[60px] items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:scale-[0.99] ${
                      isActive
                        ? 'border-accent bg-linear-to-r from-accent to-accent-hover text-white shadow-[0_14px_32px_rgba(37,99,235,0.32)]'
                        : 'border-white/15 bg-white/6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-accent/65 hover:bg-accent/15 active:bg-accent/20'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        isActive
                          ? 'border-white/25 bg-white/20 text-white'
                          : 'border-accent/30 bg-accent/20 text-blue-200'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-base font-extrabold leading-tight text-white">
                        {link.label}
                      </span>
                      <span
                        className={`mt-0.5 text-xs leading-snug ${
                          isActive ? 'text-blue-100' : 'text-slate-300'
                        }`}
                      >
                        {link.description}
                      </span>
                    </span>
                    <ChevronRight
                      className={`h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${
                        isActive ? 'text-white' : 'text-blue-300'
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
  );
}
