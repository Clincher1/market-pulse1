/**
 * Темы страниц: подписи, порядок, цвета.
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
  HeartPulse,
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
  | 'about'
  | 'status';

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
    label: 'Сводка дня',
    navLabel: 'Сводка',
    href: '/passport',
    description: 'Денежные ориентиры и наблюдаемая динамика',
    icon: CalendarCheck,
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    cardClass: 'border-emerald-200 bg-emerald-50/80 hover:border-emerald-300 hover:bg-emerald-100',
    iconClass: 'bg-emerald-700 text-white',
    dotClass: 'bg-emerald-600',
    activeClass: 'border-emerald-700 bg-emerald-700 text-white shadow-sm shadow-emerald-900/10',
    textClass: 'text-emerald-800',
  },
  russia: {
    id: 'russia',
    order: '01',
    label: 'Россия и бизнес',
    navLabel: 'Россия',
    href: '/russia',
    description: 'ЦБ, Мосбиржа, рубль и последствия для бизнеса',
    icon: Landmark,
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-800',
    cardClass: 'border-blue-200 bg-blue-50/80 hover:border-blue-300 hover:bg-blue-100',
    iconClass: 'bg-blue-700 text-white',
    dotClass: 'bg-blue-600',
    activeClass: 'border-blue-700 bg-blue-700 text-white shadow-sm shadow-blue-900/10',
    textClass: 'text-blue-800',
  },
  global: {
    id: 'global',
    order: '02',
    label: 'Глобальная экономика',
    navLabel: 'Мир',
    href: '/world',
    description: 'S&P 500, нефть, золото и BTC с датами наблюдений',
    icon: Globe,
    badgeClass: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    cardClass: 'border-cyan-200 bg-cyan-50/80 hover:border-cyan-300 hover:bg-cyan-100',
    iconClass: 'bg-cyan-700 text-white',
    dotClass: 'bg-cyan-600',
    activeClass: 'border-cyan-700 bg-cyan-700 text-white shadow-sm shadow-cyan-900/10',
    textClass: 'text-cyan-800',
  },
  brief: {
    id: 'brief',
    order: '03',
    label: 'Бриф за 60 секунд',
    navLabel: 'Бриф',
    href: '/brief',
    description: 'Короткий синтез фактов и изменений со снимка дня',
    icon: Zap,
    badgeClass: 'border-violet-200 bg-violet-50 text-violet-800',
    cardClass: 'border-violet-200 bg-violet-50/80 hover:border-violet-300 hover:bg-violet-100',
    iconClass: 'bg-violet-700 text-white',
    dotClass: 'bg-violet-600',
    activeClass: 'border-violet-700 bg-violet-700 text-white shadow-sm shadow-violet-900/10',
    textClass: 'text-violet-800',
  },
  news: {
    id: 'news',
    order: '04',
    label: 'Глобальные новости',
    navLabel: 'Новости',
    href: '/news',
    description: 'Исходные заголовки и ссылки на публикации',
    icon: Newspaper,
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-900',
    cardClass: 'border-amber-200 bg-amber-50/80 hover:border-amber-300 hover:bg-amber-100',
    iconClass: 'bg-amber-300 text-slate-950',
    dotClass: 'bg-amber-500',
    activeClass: 'border-amber-300 bg-amber-300 text-slate-950 shadow-sm shadow-amber-900/10',
    textClass: 'text-amber-900',
  },
  memory: {
    id: 'memory',
    order: '06',
    label: 'Память рынка',
    navLabel: 'Память',
    href: '/memory',
    description: 'Архив старых прогнозных записей и их оценённых исходов',
    icon: BrainCircuit,
    badgeClass: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
    cardClass: 'border-fuchsia-200 bg-fuchsia-50/80 hover:border-fuchsia-300 hover:bg-fuchsia-100',
    iconClass: 'bg-fuchsia-700 text-white',
    dotClass: 'bg-fuchsia-600',
    activeClass: 'border-fuchsia-700 bg-fuchsia-700 text-white shadow-sm shadow-fuchsia-900/10',
    textClass: 'text-fuchsia-800',
  },
  guide: {
    id: 'guide',
    order: '07',
    label: 'Как читать сайт',
    navLabel: 'Гид',
    href: '/guide',
    description: 'Формулы, источники, ограничения и методология',
    icon: BookOpen,
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-800',
    cardClass: 'border-rose-200 bg-rose-50/80 hover:border-rose-300 hover:bg-rose-100',
    iconClass: 'bg-rose-700 text-white',
    dotClass: 'bg-rose-600',
    activeClass: 'border-rose-700 bg-rose-700 text-white shadow-sm shadow-rose-900/10',
    textClass: 'text-rose-800',
  },
  about: {
    id: 'about',
    order: '08',
    label: 'О проекте',
    navLabel: 'Проект',
    href: '/about',
    description: 'Архитектура, стек и правила честности данных',
    icon: Info,
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-800',
    cardClass: 'border-slate-200 bg-slate-50/90 hover:border-slate-300 hover:bg-slate-100',
    iconClass: 'bg-slate-700 text-white',
    dotClass: 'bg-slate-500',
    activeClass: 'border-slate-700 bg-slate-700 text-white shadow-sm shadow-slate-900/10',
    textClass: 'text-slate-800',
  },
  status: {
    id: 'status',
    order: '09',
    label: 'Состояние системы',
    navLabel: 'Система',
    href: '/status',
    description: 'Свежесть источников, котировок и проверок',
    icon: HeartPulse,
    badgeClass: 'border-teal-200 bg-teal-50 text-teal-800',
    cardClass: 'border-teal-200 bg-teal-50/80 hover:border-teal-300 hover:bg-teal-100',
    iconClass: 'bg-teal-700 text-white',
    dotClass: 'bg-teal-600',
    activeClass: 'border-teal-700 bg-teal-700 text-white shadow-sm shadow-teal-900/10',
    textClass: 'text-teal-800',
  },
};

export const DASHBOARD_THEME_ORDER: SectionThemeId[] = [
  'passport',
  'russia',
  'global',
  'brief',
  'news',
  'guide',
  'about',
];
