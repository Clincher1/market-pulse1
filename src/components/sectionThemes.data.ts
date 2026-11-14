/**
 * Темы разделов: подписи, порядок, цвета.
 *
 * Отдельный модуль, а не часть файла с компонентом: иначе hot reload ломается
 * на смешанных экспортах (react-refresh/only-export-components), и линтер
 * справедливо ругается на два предупреждения вместо нуля.
 */
import type { ComponentType } from 'react';
import {
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  Globe,
  Info,
  Landmark,
  Newspaper,
  Zap,
} from 'lucide-react';

export type SectionThemeId =
  | 'passport'
  | 'russia'
  | 'global'
  | 'brief'
  | 'news'
  | 'memory'
  | 'guide'
  | 'about';

export interface SectionTheme {
  id: SectionThemeId;
  order: string;
  label: string;
  navLabel: string;
  href: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  badgeClass: string;
  cardClass: string;
  iconClass: string;
  dotClass: string;
  activeClass: string;
  textClass: string;
}

export const SECTION_THEMES: Record<SectionThemeId, SectionTheme> = {
  passport: {
    id: 'passport',
    order: '00',
    label: 'Паспорт дня',
    navLabel: 'Паспорт',
    href: '#daily-passport',
    description: 'Запись дня, которую нельзя переписать',
    icon: CalendarCheck,
    badgeClass: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
    cardClass:
      'border-emerald-300/25 bg-emerald-400/[0.07] hover:border-emerald-300/60 hover:bg-emerald-400/[0.12]',
    iconClass: 'bg-emerald-700 text-white',
    dotClass: 'bg-emerald-400',
    activeClass: 'border-emerald-300 bg-emerald-700 text-white shadow-lg shadow-emerald-500/25',
    textClass: 'text-emerald-200',
  },
  russia: {
    id: 'russia',
    order: '01',
    label: 'Россия и бизнес',
    navLabel: 'Россия',
    href: '#russia-business',
    description: 'ЦБ, Мосбиржа, рубль и последствия для бизнеса',
    icon: Landmark,
    badgeClass: 'border-blue-300/30 bg-blue-400/10 text-blue-200',
    cardClass:
      'border-blue-300/25 bg-blue-400/[0.07] hover:border-blue-300/60 hover:bg-blue-400/[0.12]',
    iconClass: 'bg-blue-600 text-white',
    dotClass: 'bg-blue-400',
    activeClass: 'border-blue-400 bg-blue-600 text-white shadow-lg shadow-blue-500/25',
    textClass: 'text-blue-200',
  },
  global: {
    id: 'global',
    order: '02',
    label: 'Глобальная экономика',
    navLabel: 'Мир',
    href: '#global-economy',
    description: 'S&P 500, нефть, золото и BTC с датами наблюдений',
    icon: Globe,
    badgeClass: 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200',
    cardClass:
      'border-cyan-300/25 bg-cyan-400/[0.07] hover:border-cyan-300/60 hover:bg-cyan-400/[0.12]',
    iconClass: 'bg-cyan-700 text-white',
    dotClass: 'bg-cyan-400',
    activeClass: 'border-cyan-300 bg-cyan-700 text-white shadow-lg shadow-cyan-500/25',
    textClass: 'text-cyan-200',
  },
  brief: {
    id: 'brief',
    order: '03',
    label: 'Бриф за 60 секунд',
    navLabel: 'Бриф',
    href: '#brief',
    description: 'Короткий синтез фактов и изменений со снимка дня',
    icon: Zap,
    badgeClass: 'border-violet-300/30 bg-violet-400/10 text-violet-200',
    cardClass:
      'border-violet-300/25 bg-violet-400/[0.07] hover:border-violet-300/60 hover:bg-violet-400/[0.12]',
    iconClass: 'bg-violet-600 text-white',
    dotClass: 'bg-violet-400',
    activeClass: 'border-violet-300 bg-violet-600 text-white shadow-lg shadow-violet-500/25',
    textClass: 'text-violet-200',
  },
  news: {
    id: 'news',
    order: '04',
    label: 'Глобальные новости',
    navLabel: 'Новости',
    href: '#news',
    description: 'Сначала последние 4 новости, остальные — по кнопке',
    icon: Newspaper,
    badgeClass: 'border-amber-300/30 bg-amber-400/10 text-amber-200',
    cardClass:
      'border-amber-300/25 bg-amber-400/[0.07] hover:border-amber-300/60 hover:bg-amber-400/[0.12]',
    iconClass: 'bg-amber-400 text-slate-950',
    dotClass: 'bg-amber-400',
    activeClass: 'border-amber-300 bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/25',
    textClass: 'text-amber-200',
  },
  memory: {
    id: 'memory',
    order: '06',
    label: 'Память рынка',
    navLabel: 'Память',
    href: '#market-memory',
    description: 'Архив старых прогнозных записей и их оценённых исходов',
    icon: BrainCircuit,
    badgeClass: 'border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-200',
    cardClass:
      'border-fuchsia-300/25 bg-fuchsia-400/[0.07] hover:border-fuchsia-300/60 hover:bg-fuchsia-400/[0.12]',
    iconClass: 'bg-fuchsia-700 text-white',
    dotClass: 'bg-fuchsia-400',
    activeClass: 'border-fuchsia-300 bg-fuchsia-700 text-white shadow-lg shadow-fuchsia-500/25',
    textClass: 'text-fuchsia-200',
  },
  guide: {
    id: 'guide',
    order: '07',
    label: 'Как читать сайт',
    navLabel: 'Гид',
    href: '#guide',
    description: 'Формулы, источники, ограничения и методология',
    icon: BookOpen,
    badgeClass: 'border-rose-300/30 bg-rose-400/10 text-rose-200',
    cardClass:
      'border-rose-300/25 bg-rose-400/[0.07] hover:border-rose-300/60 hover:bg-rose-400/[0.12]',
    iconClass: 'bg-rose-700 text-white',
    dotClass: 'bg-rose-400',
    activeClass: 'border-rose-300 bg-rose-700 text-white shadow-lg shadow-rose-500/25',
    textClass: 'text-rose-200',
  },
  about: {
    id: 'about',
    order: '08',
    label: 'О проекте',
    navLabel: 'Проект',
    href: '#about',
    description: 'Архитектура, стек и правила честности данных',
    icon: Info,
    badgeClass: 'border-slate-300/30 bg-slate-400/10 text-slate-200',
    cardClass:
      'border-slate-300/25 bg-slate-400/[0.07] hover:border-slate-300/60 hover:bg-slate-400/[0.12]',
    iconClass: 'bg-slate-600 text-white',
    dotClass: 'bg-slate-300',
    activeClass: 'border-slate-300 bg-slate-600 text-white shadow-lg shadow-slate-500/25',
    textClass: 'text-slate-200',
  },
};

export const DASHBOARD_THEME_ORDER: SectionThemeId[] = [
  'russia',
  'global',
  'brief',
  'news',
  'memory',
  'guide',
  'about',
];
