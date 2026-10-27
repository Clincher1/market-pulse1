import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  Calculator,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  ExternalLink,
  Eye,
  Gauge,
  Heart,
  Info,
  Landmark,
  Lightbulb,
  LineChart,
  ListFilter,
  MousePointerClick,
  Newspaper,
  Palette,
  RefreshCw,
  Route,
  Scale,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  DASHBOARD_THEME_ORDER,
  SECTION_THEMES,
  SectionThemeBadge,
} from './sectionThemes';
import ExpandHint from './ExpandHint';

type GuideSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  icon: typeof Activity;
  children: ReactNode;
};

function GuideSection({ id, eyebrow, title, icon: Icon, children }: GuideSectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="scroll-mt-24 bg-bg-card rounded-xl2 border border-border-subtle shadow-lg p-6 lg:p-8"
    >
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-300/25 bg-rose-400/10 text-rose-200 shadow-[0_10px_24px_rgba(244,63,94,0.10)]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-rose-300">
            {eyebrow}
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-text-primary sm:text-[28px]">
            {title}
          </h2>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function Callout({
  variant = 'info',
  children,
}: {
  variant?: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const styles =
    variant === 'warning'
      ? 'bg-warning/5 border-warning/25 text-warning'
      : variant === 'danger'
        ? 'bg-negative/5 border-negative/25 text-negative'
        : 'bg-accent/5 border-accent/25 text-accent';
  const Icon = variant === 'info' ? Info : AlertTriangle;

  return (
    <div className={`rounded-xl border p-5 flex items-start gap-3 ${styles}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed text-text-primary">{children}</div>
    </div>
  );
}

function FormulaDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-rose-300/30 bg-bg-primary/70 shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
      <summary className="flex min-h-[58px] cursor-pointer list-none items-center justify-between gap-3 bg-rose-400/10 px-4 py-3 text-sm font-extrabold text-text-primary transition-colors hover:bg-rose-400/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-300 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-md shadow-rose-500/25">
            <Calculator className="h-4 w-4" />
          </span>
          <span>{title}</span>
        </span>
        <ExpandHint
          detailsMode
          closedLabel={(
            <>
              <span className="sm:hidden">Развернуть</span>
              <span className="hidden sm:inline">Нажмите, чтобы развернуть</span>
            </>
          )}
          openLabel="Свернуть"
          testId="guide-formula-expand-hint"
          className="border-rose-300/40 bg-rose-400/10 text-rose-100"
        />
      </summary>
      <div className="space-y-3 border-t border-white/10 px-4 pb-5 pt-4 text-sm leading-relaxed text-text-secondary sm:px-5">
        {children}
      </div>
    </details>
  );
}

function ReadingMode({
  icon: Icon,
  time,
  title,
  text,
  className,
  iconClassName,
}: {
  icon: typeof Timer;
  time: string;
  title: string;
  text: string;
  className: string;
  iconClassName: string;
}) {
  return (
    <div className={`rounded-2xl border bg-bg-primary/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg ${iconClassName}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-200">
          {time}
        </span>
      </div>
      <div className="mb-1.5 font-extrabold text-text-primary">{title}</div>
      <p className="text-sm leading-relaxed text-text-secondary">{text}</p>
    </div>
  );
}

function Takeaway({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-rose-300/25 bg-rose-400/[0.07] px-4 py-3.5 text-sm leading-relaxed text-slate-100">
      <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
      <p>
        <strong className="font-extrabold text-white">Простыми словами:</strong> {children}
      </p>
    </div>
  );
}

const quickLinks = [
  {
    label: 'Маршрут по сайту',
    href: '#guide-start',
    icon: Route,
    className: 'border-rose-300/45 bg-rose-400/15 hover:border-rose-300 hover:bg-rose-500 focus-visible:ring-rose-300',
    iconClassName: 'bg-rose-500 text-white group-hover:bg-white group-hover:text-rose-600',
  },
  {
    label: 'Факт или модель',
    href: '#guide-overview',
    icon: Scale,
    className: 'border-rose-300/45 bg-rose-400/15 hover:border-rose-300 hover:bg-rose-500 focus-visible:ring-rose-300',
    iconClassName: 'bg-rose-500 text-white group-hover:bg-white group-hover:text-rose-600',
  },
  {
    label: 'Россия и бизнес',
    href: '#guide-russia',
    icon: Landmark,
    className: 'border-blue-300/45 bg-blue-400/15 hover:border-blue-300 hover:bg-blue-500 focus-visible:ring-blue-300',
    iconClassName: 'bg-blue-500 text-white group-hover:bg-white group-hover:text-blue-600',
  },
  {
    label: 'Tension',
    href: '#guide-tension',
    icon: Activity,
    className: 'border-cyan-300/45 bg-cyan-400/15 hover:border-cyan-300 hover:bg-cyan-500 focus-visible:ring-cyan-300',
    iconClassName: 'bg-cyan-500 text-white group-hover:bg-white group-hover:text-cyan-700',
  },
  {
    label: 'Активы и графики',
    href: '#guide-assets',
    icon: LineChart,
    className: 'border-cyan-300/45 bg-cyan-400/15 hover:border-cyan-300 hover:bg-cyan-500 focus-visible:ring-cyan-300',
    iconClassName: 'bg-cyan-500 text-white group-hover:bg-white group-hover:text-cyan-700',
  },
  {
    label: 'Бриф',
    href: '#guide-brief',
    icon: Zap,
    className: 'border-violet-300/45 bg-violet-400/15 hover:border-violet-300 hover:bg-violet-500 focus-visible:ring-violet-300',
    iconClassName: 'bg-violet-500 text-white group-hover:bg-white group-hover:text-violet-700',
  },
  {
    label: 'Новости',
    href: '#guide-news',
    icon: Newspaper,
    className: 'border-amber-300/45 bg-amber-400/15 hover:border-amber-300 hover:bg-amber-400 hover:text-slate-950 focus-visible:ring-amber-300',
    iconClassName: 'bg-amber-400 text-slate-950 group-hover:bg-slate-950 group-hover:text-amber-300',
  },
  {
    label: 'Сигналы',
    href: '#guide-forecasts',
    icon: Target,
    className: 'border-emerald-300/45 bg-emerald-400/15 hover:border-emerald-300 hover:bg-emerald-500 focus-visible:ring-emerald-300',
    iconClassName: 'bg-emerald-500 text-white group-hover:bg-white group-hover:text-emerald-700',
  },
  {
    label: 'Память рынка',
    href: '#guide-memory',
    icon: BrainCircuit,
    className: 'border-fuchsia-300/45 bg-fuchsia-400/15 hover:border-fuchsia-300 hover:bg-fuchsia-500 focus-visible:ring-fuchsia-300',
    iconClassName: 'bg-fuchsia-500 text-white group-hover:bg-white group-hover:text-fuchsia-700',
  },
  {
    label: 'Свежесть данных',
    href: '#guide-data-quality',
    icon: RefreshCw,
    className: 'border-slate-300/45 bg-slate-400/15 hover:border-slate-300 hover:bg-slate-500 focus-visible:ring-slate-300',
    iconClassName: 'bg-slate-500 text-white group-hover:bg-white group-hover:text-slate-700',
  },
  {
    label: 'Частые вопросы',
    href: '#guide-faq',
    icon: ShieldQuestion,
    className: 'border-rose-300/45 bg-rose-400/15 hover:border-rose-300 hover:bg-rose-500 focus-visible:ring-rose-300',
    iconClassName: 'bg-rose-500 text-white group-hover:bg-white group-hover:text-rose-600',
  },
];

export default function AnalyticsGuide() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <motion.section
        id="guide"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="scroll-mt-24 overflow-hidden rounded-xl2 border border-rose-300/25 bg-linear-to-br from-rose-400/10 via-bg-card to-bg-card shadow-xl shadow-rose-950/20 p-6 lg:p-10"
      >
        <SectionThemeBadge themeId="guide" className="mb-5" />
        <h1 className="text-3xl lg:text-5xl font-extrabold tracking-tight mb-4">
          Как читать Market Pulse
        </h1>
        <p className="mb-5 max-w-4xl text-base leading-relaxed text-text-secondary lg:text-lg">
          Market Pulse — не оракул и не кнопка «купить/продать». Это карта дня, которая помогает
          последовательно ответить на четыре вопроса: <strong className="text-text-primary">что уже произошло,
          почему это может быть важно для России и активов, что рынок уже показал ценой и насколько
          модельной гипотезе вообще можно доверять</strong>.
        </p>
        <div className="mb-8 flex flex-wrap items-center gap-2 text-xs font-extrabold text-slate-100 sm:text-sm" aria-label="Логика чтения Market Pulse">
          {['Факт и источник', 'Объяснение канала', 'Реакция цены', 'Гипотеза сигнала', 'Проверка в памяти'].map((step, index, steps) => (
            <span key={step} className="inline-flex items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">{step}</span>
              {index < steps.length - 1 && <span className="text-rose-300" aria-hidden="true">→</span>}
            </span>
          ))}
        </div>

        <div id="guide-start" className="mb-8 scroll-mt-28">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-rose-300">
                Начните отсюда
              </div>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                Выберите глубину чтения
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-text-secondary">
              Не обязательно читать весь сайт сверху вниз каждый раз. Но порядок важен: сначала факты и цены,
              только потом выводы модели.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="guide-reading-modes">
            <ReadingMode
              icon={Timer}
              time="60 секунд"
              title="Быстрый взгляд"
              text="Синяя Россия → бирюзовый мировой фон → фиолетовый бриф. Ответьте себе: что изменилось и какой канал затронут сильнее?"
              className="border-violet-300/20"
              iconClassName="bg-violet-500 shadow-violet-500/25"
            />
            <ReadingMode
              icon={MousePointerClick}
              time="5 минут"
              title="Понять причину"
              text="Нажмите на плитку актива, проверьте дату и источник, затем откройте последние новости и первоисточник главной темы."
              className="border-cyan-300/20"
              iconClassName="bg-cyan-500 shadow-cyan-500/25"
            />
            <ReadingMode
              icon={ShieldCheck}
              time="Проверка"
              title="Не поверить на слово"
              text="Сопоставьте сигнал с уже произошедшей реакцией цены, откройте паспорт похожего события в Памяти и посмотрите размер выборки N."
              className="border-fuchsia-300/20"
              iconClassName="bg-fuchsia-500 shadow-fuchsia-500/25"
            />
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-bg-primary/55 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-rose-300">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Карта сайта
                </div>
                <h3 className="mt-1 text-lg font-extrabold text-white">
                  Восемь цветных остановок в том порядке, в котором построен дашборд
                </h3>
              </div>
              <p className="max-w-lg text-xs leading-relaxed text-text-secondary sm:text-sm">
                Цвет здесь — навигационный маяк: он повторяется на кнопке, подписи и рамке раздела.
                Не путайте его с цветом тепловой карты, где цвет уже означает рост или снижение цены.
              </p>
            </div>
            <nav aria-label="Карта разделов Market Pulse" data-testid="guide-site-route" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {DASHBOARD_THEME_ORDER.map((themeId) => {
                const theme = SECTION_THEMES[themeId];
                const Icon = theme.icon;
                return (
                  <a
                    key={theme.id}
                    href={theme.href}
                    className={`group flex min-h-[104px] items-start gap-3 rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300 ${theme.cardClass}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-lg ${theme.iconClass}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[11px] font-extrabold uppercase tracking-[0.13em] ${theme.textClass}`}>
                        {theme.order} · {theme.navLabel}
                      </span>
                      <span className="mt-1 block font-extrabold leading-snug text-white">
                        {theme.label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-300">
                        {theme.description}
                      </span>
                    </span>
                  </a>
                );
              })}
            </nav>
            <p className="mt-4 text-xs leading-relaxed text-text-secondary">
              Вы сейчас на седьмой остановке — в гиде. Нажатие на другую карточку вернёт вас на дашборд
              прямо к нужному разделу; на телефоне те же темы доступны в нижней панели и меню.
            </p>
          </div>
        </div>

        <nav
          aria-label="Разделы инструкции"
          className="rounded-2xl border border-white/10 bg-bg-primary/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-rose-200">
              Объяснения внутри гида
            </span>
            <span className="hidden text-xs font-medium text-text-secondary sm:block">
              Цвет кнопки совпадает с цветом раздела на дашборде
            </span>
          </div>
          <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 scrollbar-hide lg:flex-wrap lg:overflow-visible">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card active:translate-y-0 ${link.className}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${link.iconClassName}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="whitespace-nowrap">{link.label}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-75 transition-transform duration-200 group-hover:translate-y-0.5" />
                </a>
              );
            })}
          </div>
        </nav>
      </motion.section>

      <GuideSection id="guide-overview" eyebrow="Главное различие" title="Сначала отделите факт от мнения модели" icon={Scale}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="flex items-center gap-2 font-bold mb-3 text-text-primary">
              <Database className="w-4 h-4 text-positive" />
              Наблюдаемые данные
            </div>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>источник, заголовок, ссылка и дата публикации;</li>
              <li>курсы ЦБ, значения Мосбиржи и подпись, к какой дате и времени относится число;</li>
              <li>цена актива, провайдер, дата последнего наблюдения и фактическая реакция после события;</li>
              <li>количество новостей и наблюдений N, попавших в расчёт.</li>
            </ul>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="flex items-center gap-2 font-bold mb-3 text-text-primary">
              <MousePointerClick className="w-4 h-4 text-warning" />
              Интерпретация новости и канала
            </div>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>тональность от −1 до +1, важность от 1 до 10 и уверенность классификации;</li>
              <li>стрелки предполагаемого влияния на конкретные активы;</li>
              <li>канал передачи для России: валюта, ставки, сырьё, спрос или торговля;</li>
              <li>текст «что это значит» — правдоподобный механизм, который ещё нужно сверить с ценой.</li>
            </ul>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="flex items-center gap-2 font-bold mb-3 text-text-primary">
              <Target className="w-4 h-4 text-accent" />
              Сводки и гипотезы
            </div>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>Tension — сводное негативное давление свежего новостного фона;</li>
              <li>статусы каналов России и бриф — короткий синтез нескольких наблюдаемых блоков;</li>
              <li>сигнал по активу — взвешенный перевес свидетельств, а не обещание движения;</li>
              <li>аналоги в Памяти становятся полезными только после достаточного числа проверенных исходов.</li>
            </ul>
          </div>
        </div>
        <div className="mt-5">
          <Callout>
            <strong>Правило чтения:</strong> чем дальше цифра находится от первоисточника, тем осторожнее её нужно трактовать.
            Заголовок можно открыть и проверить. Тональность уже является интерпретацией. Сигнал — гипотеза поверх нескольких интерпретаций.
            У каждой красивой цифры спрашивайте: <strong>от какой базы, на какой выборке и чем это потом проверить?</strong>
          </Callout>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-white/10 bg-bg-primary/60 p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="font-extrabold text-text-primary">Как понять, что панель можно открыть</h3>
              <ExpandHint
                closedLabel="Нажмите, чтобы развернуть"
                openLabel="Нажмите, чтобы свернуть"
                className="border-rose-300/40 bg-rose-400/10 text-rose-100"
              />
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              Ищите три признака одновременно: <strong className="text-text-primary">мягко пульсирующую точку,
              понятную подпись и стрелку</strong>. Такие подсказки стоят на плитках мировых активов, в паспортах
              событий Памяти, формулах и вопросах этого гида. Кнопка «Развернуть фильтры» и выпадающие списки
              новостей используют тот же принцип. После открытия подпись меняется на «Свернуть», а стрелка поворачивается.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-bg-primary/60 p-5">
            <div className="mb-3 flex items-center gap-2 font-extrabold text-text-primary">
              <ExternalLink className="h-4 w-4 text-blue-300" aria-hidden="true" />
              А это — не раскрытие, а переход
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              Подпись <strong className="text-text-primary">«Открыть источник»</strong> на российских плитках ведёт
              на внешний сайт ЦБ или Мосбиржи. Она тоже заметна, но ничего внутри Market Pulse не разворачивает.
              Если браузер или система просит уменьшить анимацию, пульсация автоматически отключается.
            </p>
          </div>
        </div>
      </GuideSection>
      <GuideSection id="guide-russia" eyebrow="01 · Синий раздел" title="Россия и бизнес: сначала свой контур, потом внешний мир" icon={Landmark}>
        <div className="mb-6">
          <Takeaway>
            этот раздел отвечает не «куда пойдёт рубль?», а на более честный вопрос: какие российские
            показатели уже изменились и через какой канал внешнее событие может дойти до вашей компании.
          </Takeaway>
        </div>
        <p className="text-text-secondary leading-relaxed mb-6">
          Синий блок стоит первым на дашборде. Внутри него сначала идут официальные курсы и Мосбиржа,
          затем каналы влияния, отобранные события и российские деловые источники. Российские значения
          подписаны источником, базисом расчёта и датой или временем, к которым они относятся.
          Только после всего российского раздела начинается отдельный бирюзовый блок глобальной экономики:
          там находятся Tension и внешние ориентиры (USD/EUR, S&amp;P 500, Brent, золото и BTC). Рубль, IMOEX и RGBI не смешаны с мировыми активами:
          сначала смотрите российский факт, а уже потом — внешний контекст.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-5" aria-label="Порядок чтения российского блока">
          {[
            ['1', 'Дата и источник', 'Проверьте, официальное это значение ЦБ или биржевое Мосбиржи.'],
            ['2', 'Статус канала', '«Спокойно», «Внимание» или «Повышенное движение» — только пороговый фон.'],
            ['3', 'Причина', 'Откройте событие и абзац «Почему в подборке».'],
            ['4', 'Первоисточник', 'На рыночных плитках — «Открыть источник»; заголовки российских новостей тоже ведут к первоисточнику.'],
            ['5', 'Мировой фон', 'Затем сопоставьте вывод с Tension и внешней ценой ниже.'],
          ].map(([number, title, text]) => (
            <div key={number} className="rounded-xl border border-blue-300/15 bg-blue-400/[0.05] p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-xs font-extrabold text-white">
                {number}
              </div>
              <div className="text-sm font-extrabold text-white">{title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{text}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-3">Что является наблюдаемым фактом</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li><strong className="text-text-primary">Банк России:</strong> официальные дневные курсы USD/RUB, EUR/RUB и CNY/RUB. Это не курс конкретной сделки и не внутридневная биржевая цена.</li>
              <li><strong className="text-text-primary">Мосбиржа ISS:</strong> CNYRUB_TOM, IMOEX и RGBI. Публичный поток может быть задержан, поэтому время источника показано на плитке.</li>
              <li><strong className="text-text-primary">Российские заголовки:</strong> «Коммерсантъ», «Ведомости» и Frank Media со ссылками на первоисточники. Заголовок ещё не является оценкой влияния.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-3">Что является аналитической интерпретацией</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>отбор мировых событий по важности, уверенности, свежести и каналам влияния;</li>
              <li>текст «Что это значит для бизнеса в России» — объяснение возможного механизма, а не доказанный эффект;</li>
              <li>статусы «Спокойно», «Внимание» и «Повышенное движение» — оперативные визуальные пороги по наблюдаемым ценам, а не прогноз.</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-3">Как отбираются главные события</h3>
            <div className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <p>Кандидат должен иметь важность не ниже 5/10, уверенность классификации не ниже 40% и либо прямую связь с Россией, либо понятный канал влияния.</p>
              <p>Ранг учитывает важность × уверенность × свежесть, прямую российскую связь, число каналов и совпадение с выбранным бизнес-профилем.</p>
              <p>Профиль («Импортирую», «Есть кредиты», «Экспортирую» и т.д.) хранится только в браузере и меняет порядок, но не скрывает остальные данные и не превращает подборку в персональную финансовую рекомендацию.</p>
            </div>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-3">Как читать RGBI и курсы</h3>
            <div className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <p><strong className="text-text-primary">RGBI</strong> — ценовой индекс гособлигаций. Когда он растёт, цены облигаций в среднем растут, а доходности при прочих равных снижаются. Падение RGBI обычно означает рост доходностей и более жёсткий рыночный фон.</p>
              <p><strong className="text-text-primary">USD/RUB и EUR/RUB ЦБ</strong> — официальные дневные значения. <strong className="text-text-primary">CNY/RUB Мосбиржи</strong> — биржевой инструмент CNYRUB_TOM. Разница между ними не ошибка: у них разный базис и время.</p>
            </div>
          </div>
        </div>

        <FormulaDetails title="Пороги статусов российского блока">
          <p><strong className="text-text-primary">Валюта и платежи:</strong> берётся максимальное по модулю дневное изменение USD/RUB, EUR/RUB и CNY/RUB. До 0,4% — «Спокойно», от 0,4% до 1% — «Внимание», от 1% — «Повышенное движение».</p>
          <p><strong className="text-text-primary">Рынок и стоимость денег:</strong> сравниваются нормированные движения IMOEX и RGBI: max(|IMOEX| / 1,5; |RGBI| / 0,6). До 0,5 — спокойно, 0,5–1 — внимание, выше 1 — повышенное движение.</p>
          <p><strong className="text-text-primary">Сырьё и экспорт:</strong> Brent до 1% — спокойно, 1–2,5% — внимание, выше 2,5% — повышенное движение.</p>
          <p><strong className="text-text-primary">Глобальный риск:</strong> учитываются движение S&amp;P 500 и доля негативных событий в тройке главных. Это индикатор фона для дальнейшей проверки, а не статистическая вероятность кризиса.</p>
        </FormulaDetails>

        <div className="mt-5">
          <Callout variant="warning">
            <strong>Граница честного вывода:</strong> российские цены и заголовки можно проверить по источникам, а объяснение канала
            остаётся гипотезой о механизме. Отдельный раздел «Память рынка» накапливает события и позже сверяет их с ценами,
            но российский блок сам по себе не обещает направление рубля, Мосбиржи или результат для конкретной компании.
          </Callout>
        </div>
      </GuideSection>
      <GuideSection id="guide-tension" eyebrow="02 · Мировой фон" title="Tension: термометр негативного новостного фона" icon={Activity}>
        <p className="text-text-secondary leading-relaxed mb-6">
          Tension — это <strong className="text-text-primary">индекс негативного новостного давления от 0 до 100</strong>.
          Он не измеряет «вероятность кризиса» и пока не является аналогом VIX: в текущей версии в нём участвуют только классифицированные новости, а не волатильность рынка, кредитные Спреды или календарь событий.
        </p>
        <div className="mb-6">
          <Takeaway>
            низкий Tension означает лишь, что в отобранных свежих заголовках сейчас мало сильного негатива.
            Он не гарантирует безопасность рынка, а высокий Tension — не команда продавать.
          </Takeaway>
        </div>

        <div className="mb-3 flex overflow-hidden rounded-full border border-border-subtle text-xs font-bold">
          <div style={{ width: '30%' }} className="bg-blue-500/80 text-white px-3 py-3 text-center">0–29 · Холодно</div>
          <div style={{ width: '41%' }} className="bg-warning/80 text-black px-3 py-3 text-center">30–70 · Тепло</div>
          <div style={{ width: '29%' }} className="bg-negative/85 text-white px-3 py-3 text-center">71–100 · Горячо</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7 text-sm leading-relaxed">
          <div className="rounded-xl bg-bg-primary/60 p-5 border border-border-subtle">
            <strong className="text-blue-400">0–29.</strong> <span className="text-text-secondary">Негативных и значимых сигналов мало либо они разбавлены нейтральными и позитивными новостями.</span>
          </div>
          <div className="rounded-xl bg-bg-primary/60 p-5 border border-border-subtle">
            <strong className="text-warning">30–70.</strong> <span className="text-text-secondary">Фон смешанный или умеренно негативный. Смотрите, какие именно сюжеты создают давление.</span>
          </div>
          <div className="rounded-xl bg-bg-primary/60 p-5 border border-border-subtle">
            <strong className="text-negative">71–100.</strong> <span className="text-text-secondary">Много свежих, важных и уверенно негативных сигналов. Это повод проверять первоисточники и реакцию цен, а не автоматическая команда продавать.</span>
          </div>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-text-secondary">
          Границы 30 и 70 — удобные визуальные зоны текущей версии, а не статистически доказанные пороги риска.
          Если индекс заметно вырос, следующий шаг всегда один: посмотреть, <strong className="text-text-primary">какие сюжеты его подняли</strong>
          в новостях и <strong className="text-text-primary">успели ли цены уже отреагировать</strong> на тепловой карте.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><LineChart className="w-4 h-4 text-warning" /> Как читать график</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li><strong className="text-text-primary">Горизонтальная ось</strong> — календарные дни, до семи последних точек.</li>
              <li><strong className="text-text-primary">Вертикальная ось</strong> — та же шкала 0–100, без скрытого масштаба.</li>
              <li><strong className="text-text-primary">Каждая точка</strong> — последнее сохранённое значение Tension за соответствующий день, а не каждое 15-минутное обновление.</li>
              <li><strong className="text-text-primary">Линия между точками</strong> — визуальное соединение дней; внутри дня индекс мог двигаться иначе.</li>
              <li>Если дней меньше семи, сайт честно показывает, сколько истории уже накоплено.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><Clock className="w-4 h-4 text-accent" /> Какие новости попадают в индекс</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>только новости не старше 24 часов и не из будущего;</li>
              <li>не более 20 самых свежих квалифицированных записей;</li>
              <li>важность не ниже 3/10;</li>
              <li>уверенность классификации не ниже 50%;</li>
              <li>если квалифицированных новостей меньше трёх, расчёт пропускается и может оставаться предыдущее значение.</li>
            </ul>
          </div>
        </div>

        <FormulaDetails title="Формула Tension и пример расчёта">
          <p>Для каждой новости считается негативный вклад:</p>
          <div className="rounded-lg bg-bg-card border border-border-subtle p-4 font-mono text-[13px] text-text-primary overflow-x-auto">
            вклад = max(0, −тональность) × важность × уверенность
            <br />
            Tension = средний вклад ÷ 10 × 100
          </div>
          <p>
            Уверенность в формуле берётся долей: 80% → 0.8. Позитивная новость даёт нулевой негативный вклад, но всё равно участвует в среднем и поэтому разбавляет давление.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="min-w-[560px] w-full text-left text-sm">
              <thead className="bg-bg-card text-text-primary">
                <tr>
                  <th className="p-3">Новость</th>
                  <th className="p-3">Тональность</th>
                  <th className="p-3">Важность</th>
                  <th className="p-3">Уверенность</th>
                  <th className="p-3">Вклад</th>
                </tr>
              </thead>
              <tbody className="[&_td]:p-3 [&_tr]:border-t [&_tr]:border-border-subtle">
                <tr><td>Резкая эскалация</td><td>−0.80</td><td>8</td><td>90%</td><td>0.8 × 8 × 0.9 = 5.76</td></tr>
                <tr><td>Умеренный негатив</td><td>−0.20</td><td>5</td><td>60%</td><td>0.2 × 5 × 0.6 = 0.60</td></tr>
                <tr><td>Позитивная новость</td><td>+0.60</td><td>7</td><td>80%</td><td>0</td></tr>
              </tbody>
            </table>
          </div>
          <p><strong className="text-text-primary">Итог:</strong> (5.76 + 0.60 + 0) ÷ 3 ÷ 10 × 100 = <strong className="text-text-primary">21</strong>. Поэтому один тревожный заголовок не обязан делать весь фон «горячим».</p>
        </FormulaDetails>
      </GuideSection>
      <GuideSection id="guide-assets" eyebrow="02 · Мировые рынки" title="Тепловая карта: нажмите на плитку — под ней целая панель" icon={TrendingUp}>
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-6">
          <div className="rounded-xl2 border border-white/10 bg-emerald-600 p-6 text-white shadow-lg">
            <div className="mb-3 flex items-start justify-between">
              <span className="text-sm font-extrabold">Пример плитки актива</span>
              <ArrowUpRight className="h-4 w-4" />
            </div>
            <div className="text-3xl font-extrabold tabular-nums">$78.40</div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="text-base font-extrabold tabular-nums">+1.20%</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">шкала ±4%</span>
            </div>
            <svg viewBox="0 0 260 72" className="mt-4 h-20 w-full" role="img" aria-label="Пример мини-графика цены">
              <polygon points="0,72 0,58 32,52 64,55 96,42 128,46 160,31 192,34 224,20 260,14 260,72" fill="rgba(255,255,255,0.14)" />
              <polyline points="0,58 32,52 64,55 96,42 128,46 160,31 192,34 224,20 260,14" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <ExpandHint
              closedLabel="Нажмите, чтобы развернуть"
              openLabel="Нажмите, чтобы свернуть"
              className="mt-4 w-full justify-center border-white/40 bg-black/25 px-2 text-center leading-tight text-white"
            />
            <div className="mt-3 text-xs text-white/75">Плитка условная: цифры нужны только для объяснения элементов.</div>
          </div>

          <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
            <p><strong className="text-text-primary">Крупная цена</strong> — последнее значение из публичного кэша Market Pulse. Это не поток биржевых сделок: для точной котировки и времени сделки используйте свой терминал.</p>
            <p><strong className="text-text-primary">Процент под ценой</strong> зависит от кнопок над картой «За день», «За неделю» и «За месяц». Они считают 1, 5 или до 29 последних наблюдений источника, а не строгие календарные интервалы: у рынков есть выходные, а FRED/EIA публикуют часть рядов с задержкой.</p>
            <p><strong className="text-text-primary">Белая мини-линия</strong> показывает только форму последних сохранённых точек. У неё нет дат и фиксированной оси, поэтому маленькое движение может выглядеть драматично. Сначала читайте процент, потом форму.</p>
            <p><strong className="text-text-primary">USD/EUR</strong> на плитке читается буквально: сколько евро дают за один доллар. Например, 0,8969 — это 0,8969 евро за $1. В Памяти может встретиться обратное обозначение EUR/USD — доллары за один евро; сайт не склеивает эти ряды молча.</p>
            <p><strong className="text-text-primary">Практический смысл:</strong> плитка проверяет, отреагировал ли рынок уже сейчас. Если цена упала до появления новости в ленте, сюжет может быть уже учтён рынком, даже если для читателя он выглядит новым.</p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.05] p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-lg shadow-cyan-500/20">
              <MousePointerClick className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-extrabold text-text-primary">Что откроется по нажатию на плитку</h3>
              <p className="text-sm text-text-secondary">Под картой появится отдельная панель именно этого актива.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm leading-relaxed text-text-secondary md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-bg-primary/55 p-4">
              <strong className="text-text-primary">История с датами.</strong> Большой график дневных закрытий на 30, 90 или 180 календарных дней; по умолчанию выбран период 90 дней.
            </div>
            <div className="rounded-xl bg-bg-primary/55 p-4">
              <strong className="text-text-primary">Цифры периода.</strong> Изменение, минимум, максимум и последнее значение с точными датами, а не только наклон линии.
            </div>
            <div className="rounded-xl bg-bg-primary/55 p-4">
              <strong className="text-text-primary">Сигнал и источник.</strong> Текущий публичный статус, если он выпускается для актива, провайдер, название ряда и ссылка на первоисточник.
            </div>
            <div className="rounded-xl bg-bg-primary/55 p-4">
              <strong className="text-text-primary">Свежесть без угадайки.</strong> Дата последнего наблюдения и отставание источника подписаны прямо над графиком.
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-text-secondary">
            Закрыть панель можно повторным нажатием на ту же плитку, кнопкой <strong className="text-text-primary">«Свернуть»</strong>
            или клавишей Esc. Открытый актив отражается в адресе вида <code className="rounded bg-black/25 px-1.5 py-0.5 text-xs text-cyan-100">?asset=brent</code>,
            поэтому ссылку на конкретную панель можно отправить другому человеку.
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
          <h3 className="font-bold text-text-primary mb-3">Тепловая карта рынка</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-sm leading-relaxed text-text-secondary">
            <div className="space-y-3">
              <p>
                <strong className="text-text-primary">Цвет</strong> кодирует только знак процента:
                красный — снижение, нейтральный тёмный — около нуля, зелёный — рост.
              </p>
              <p>
                <strong className="text-text-primary">Насыщенность</strong> показывает силу движения
                относительно отдельной шкалы актива. Поэтому одинаковая яркость у разных активов
                не обязательно означает одинаковый процент — точное значение всегда напечатано на плитке.
              </p>
              <p>
                <strong className="text-text-primary">Площадь плиток одинакова</strong> и ничего не означает:
                это не капитализация, не объём торгов и не «важность» актива.
              </p>
            </div>
            <div>
              <div className="mb-2 h-3 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(220,38,38) 0%, rgb(30,41,59) 50%, rgb(5,150,105) 100%)' }} aria-hidden="true" />
              <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider mb-4">
                <span>сильнее вниз</span><span>0%</span><span>сильнее вверх</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="rounded-lg bg-bg-card px-3 py-2">USD/EUR · шкала ±0.8%</span>
                <span className="rounded-lg bg-bg-card px-3 py-2">S&amp;P 500 · шкала ±2%</span>
                <span className="rounded-lg bg-bg-card px-3 py-2">Gold · шкала ±2.5%</span>
                <span className="rounded-lg bg-bg-card px-3 py-2">Brent · шкала ±4%</span>
                <span className="rounded-lg bg-bg-card px-3 py-2">BTC · шкала ±6%</span>
              </div>
              <p className="mt-3">
                Это фиксированные визуальные шкалы текущей версии. Они нужны, чтобы обычное для валюты движение
                не выглядело так же, как обычное движение BTC, но не являются статистической «нормой» и не заменяют процент.
              </p>
              <p className="mt-3 flex items-start gap-2">
                <Palette className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                <span>
                  Если красно-зелёная схема читается плохо, включите над картой палитру для дальтоников:
                  синий будет означать рост, оранжевый — снижение. Выбор хранится только в вашем браузере,
                  а знак в любом случае продублирован стрелкой и процентом.
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <Callout variant="warning">
            <strong>Что важно помнить о датах:</strong> в развёрнутой панели подписаны провайдер, инструмент и дата
            последнего дневного наблюдения. Это дата значения у источника, а не момент открытия страницы:
            у FRED/EIA Brent она нормально отстаёт примерно на неделю. Ряды разных провайдеров не склеиваются:
            например, золото на графике — спот XAU/USD от Twelve Data, а не индекс FRED/Nasdaq. Датированный ряд
            пополняется реже публичной плитки, поэтому текущее значение плитки и последняя дневная точка графика
            могут немного различаться. Это дневные закрытия, а не поток котировок; для сделки сверяйте цену и время в своём терминале.
          </Callout>
        </div>
      </GuideSection>
      <GuideSection id="guide-brief" eyebrow="03 · Фиолетовый раздел" title="Бриф за 60 секунд: короткая сводка без выдуманного текста" icon={Zap}>
        <div className="mb-6">
          <Takeaway>
            бриф — не отдельный прогноз и не мнение нейросети. Это карманная выжимка тех же публичных
            фактов, которые можно проверить в соседних разделах по ссылкам каждого пункта.
          </Takeaway>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-violet-300/15 bg-violet-400/[0.05] p-5">
            <div className="mb-3 flex items-center gap-2 font-extrabold text-text-primary">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500 text-sm text-white">1</span>
              Факты
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              До трёх самых заметных пунктов: текущее значение Tension, главная публикация ленты, если она проходит
              порог важности, и сильнейшее движение внешнего фона. Если внешнего движения нет, вместо него может
              появиться самое заметное изменение российского контура.
            </p>
          </div>
          <div className="rounded-xl border border-violet-300/15 bg-violet-400/[0.05] p-5">
            <div className="mb-3 flex items-center gap-2 font-extrabold text-text-primary">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500 text-sm text-white">2</span>
              Что это значит для России
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              Здесь работают те же пороги каналов, что и в синем разделе: Brent, валютная корзина и RGBI.
              Если движения ниже порогов дневного шума, бриф честно пишет, что существенных последствий сейчас не видно,
              а не придумывает драматичный вывод.
            </p>
          </div>
          <div className="rounded-xl border border-violet-300/15 bg-violet-400/[0.05] p-5">
            <div className="mb-3 flex items-center gap-2 font-extrabold text-text-primary">
              <Eye className="h-5 w-5 text-violet-300" aria-hidden="true" />
              Смотреть сегодня
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              Ровно один следующий ориентир: подтвердит ли российский рынок внешний импульс, продолжится ли движение
              Tension или как цена отреагирует на главную тему. Это вопрос для наблюдения, а не обещание результата.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="mb-3 font-extrabold text-text-primary">«Что изменилось с утра» — сравнение с зафиксированной точкой</h3>
            <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
              <p>
                Каждый день в <strong className="text-text-primary">07:00 по Москве</strong> сайт сохраняет снимок публичных
                значений. Потом бриф сравнивает текущие цифры только с тем же индикатором, тем же провайдером и тем же
                публичным статусом сигнала. Российский и мировой контуры при этом не перемешиваются.
              </p>
              <p>
                Если сегодняшний снимок ещё не записан или не загрузился, блок сравнения скрывается. Вчерашняя база
                не подставляется молча: без честной точки отсчёта «изменение» было бы выдумкой.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="mb-3 flex items-center gap-2 font-extrabold text-text-primary">
              <Camera className="h-5 w-5 text-violet-300" aria-hidden="true" />
              Снимок для Telegram
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              Кнопка рядом с заголовком скачивает серверную PNG-карточку с текущими ключевыми цифрами.
              Это удобный снимок для переписки, но не замена сайту: точную дату последнего наблюдения и источник
              каждого актива проверяйте в развёрнутой панели плитки.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <FormulaDetails title="Как бриф отличает изменение от дневного шума">
            <p><strong className="text-text-primary">Tension:</strong> сдвиг меньше 5 пунктов не считается значимым изменением со снимка.</p>
            <p><strong className="text-text-primary">Цены:</strong> для каждого инструмента задан свой порог от 0,1% до 1,5%, потому что обычная дневная амплитуда валюты, индекса и BTC различается.</p>
            <p><strong className="text-text-primary">Сигналы:</strong> важна смена публичного статуса после порога 60/40 или сдвиг баланса минимум на 10 пунктов. Внутреннее колебание 53% → 57% внутри зоны «Нет сигнала» само по себе событием не объявляется.</p>
            <p>В итоговый список попадает не более шести самых заметных изменений выше порогов. Если таких нет, бриф прямо пишет об отсутствии значимых изменений.</p>
          </FormulaDetails>
        </div>

        <div className="mt-5">
          <Callout>
            <strong>Как читать бриф правильно:</strong> сначала используйте его как оглавление дня, затем нажимайте на пункты.
            Один клик должен привести вас к шкале, цене, российскому каналу или новости, из которой родился вывод.
          </Callout>
        </div>
      </GuideSection>
      <GuideSection id="guide-news" eyebrow="04 · Янтарный раздел" title="Глобальные новости: сначала четыре свежие, потом вся лента" icon={Newspaper}>
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.05] p-5">
            <h3 className="mb-3 flex items-center gap-2 font-extrabold text-text-primary">
              <ListFilter className="h-5 w-5 text-amber-300" aria-hidden="true" />
              Как пользоваться лентой, не утонув в заголовках
            </h3>
            <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
              <p><strong className="text-text-primary">Сначала видны последние 4 новости.</strong> Остальная лента не удалена: кнопки под карточками показывают половину подходящих новостей, затем все 100%, а «Свернуть до 4» возвращает компактный вид. Рядом всегда видно фактическое количество.</p>
              <p><strong className="text-text-primary">Фильтры сначала свёрнуты.</strong> Нажмите «Развернуть фильтры», чтобы выбрать источник, тему, актив влияния, тональность и минимальную важность. Пульсирующая точка у закрытого списка подсказывает, что его можно открыть.</p>
              <p><strong className="text-text-primary">Счётчик важнее ощущения пустоты.</strong> Если комбинация фильтров ничего не нашла, сайт покажет, сколько новостей есть в полном кэше, и предложит сбросить фильтры.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="mb-3 font-extrabold text-text-primary">Что означают подписи на карточке</h3>
            <ul className="space-y-2.5 text-sm leading-relaxed text-text-secondary">
              <li><strong className="text-text-primary">Заголовок</strong> — ссылка на первоисточник, если у записи есть настоящий URL.</li>
              <li><strong className="text-text-primary">«Похожие сообщения объединены»</strong> — несколько повторов одного сюжета показаны одной карточкой, а источники группы перечислены.</li>
              <li><strong className="text-text-primary">Резюме и стрелки</strong> — интерпретация классификатора, а не цитата из статьи.</li>
              <li><strong className="text-text-primary">«Последняя проверка»</strong> — когда сайт перечитал кэш; время публикации каждой новости показано отдельно.</li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl2 border border-border-subtle bg-bg-primary/60 p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="px-2.5 py-1 bg-accent/10 text-accent text-xs font-bold rounded-md">Пример источника</span>
            <span className="text-xs text-text-secondary flex items-center gap-1"><Clock className="w-3 h-3" /> 2 ч назад</span>
            <span className="ml-auto text-xs text-warning font-semibold">Условный пример</span>
          </div>
          <h3 className="text-lg font-bold leading-snug mb-3">Центральный банк неожиданно ужесточил политику</h3>
          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <span className="text-text-secondary">Влияние:</span>
            <span className="flex items-center gap-1 font-semibold text-negative">S&P 500 <TrendingDown className="w-4 h-4" /></span>
            <span className="flex items-center gap-1 font-semibold text-positive">Gold <TrendingUp className="w-4 h-4" /></span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed mb-5">
            Краткое резюме объясняет предполагаемый механизм: более высокие ставки повышают стоимость денег и могут давить на акции, а спрос на защитные активы при этом растёт.
          </p>
          <div className="flex flex-wrap gap-5 border-t border-border-subtle pt-4 text-sm">
            <span className="flex items-center gap-1.5"><Heart className="w-4 h-4 text-text-secondary" /> Тональность: <strong className="text-negative">−0.64 негатив</strong></span>
            <span className="flex items-center gap-1.5"><Gauge className="w-4 h-4 text-text-secondary" /> Важность: <strong className="text-negative">8/10</strong></span>
            <span className="flex items-center gap-1.5"><ShieldQuestion className="w-4 h-4 text-text-secondary" /> Уверенность: <strong className="text-positive">82%</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><Heart className="w-4 h-4 text-negative" /> Тональность</h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-5">
              Оценка эмоционального/рыночного знака новости от <strong className="text-text-primary">−1</strong> до <strong className="text-text-primary">+1</strong>. Это не процент и не ожидаемое изменение цены.
            </p>
            <div className="relative pt-1 pb-7">
              <div className="h-3 rounded-full bg-linear-to-r from-negative via-neutral to-positive" />
              <span className="absolute left-0 top-6 text-xs text-text-secondary">−1</span>
              <span className="absolute left-[35%] top-6 -translate-x-1/2 text-xs text-text-secondary">−0.3</span>
              <span className="absolute left-1/2 top-6 -translate-x-1/2 text-xs text-text-secondary">0</span>
              <span className="absolute left-[65%] top-6 -translate-x-1/2 text-xs text-text-secondary">+0.3</span>
              <span className="absolute right-0 top-6 text-xs text-text-secondary">+1</span>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li><span className="text-negative font-bold">Ниже −0.3</span> — негатив;</li>
              <li><span className="text-text-primary font-bold">−0.3…+0.3</span> — нейтральная/смешанная;</li>
              <li><span className="text-positive font-bold">Выше +0.3</span> — позитив.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><Gauge className="w-4 h-4 text-warning" /> Важность</h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-5">
              Оценка потенциального масштаба события от <strong className="text-text-primary">1 до 10</strong>. Она отвечает на вопрос «насколько широко это может затронуть рынок?», а не «насколько процентов вырастет цена?».
            </p>
            <div className="grid grid-cols-10 gap-1 mb-4" aria-label="Шкала важности от 1 до 10">
              {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                <div key={n} className={`rounded-md py-2 text-center text-xs font-bold ${n >= 8 ? 'bg-negative text-white' : n >= 6 ? 'bg-warning text-black' : 'bg-border-subtle text-text-secondary'}`}>
                  {n}
                </div>
              ))}
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li><strong className="text-text-primary">1–2</strong> — почти шум; сайт скрывает новости ниже 3;</li>
              <li><strong className="text-text-primary">3–5</strong> — локальное или ограниченное значение;</li>
              <li><strong className="text-warning">6–7</strong> — заметное событие;</li>
              <li><strong className="text-negative">8–10</strong> — потенциально широкое рыночное значение. Красный здесь означает внимание, а не обязательно падение.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><ShieldQuestion className="w-4 h-4 text-accent" /> Уверенность</h3>
            <p className="text-sm text-text-secondary leading-relaxed mb-5">
              Насколько уверенно классификатор понял новость и её предполагаемое влияние. Это <strong className="text-text-primary">не вероятность того, что прогноз сбудется</strong>.
            </p>
            <div className="flex overflow-hidden rounded-full border border-border-subtle text-[11px] font-bold mb-4">
              <div style={{ width: '40%' }} className="bg-negative/85 text-white py-2 text-center">0–40%</div>
              <div style={{ width: '30%' }} className="bg-warning/85 text-black py-2 text-center">41–70%</div>
              <div style={{ width: '30%' }} className="bg-positive/85 text-white py-2 text-center">71–100%</div>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li><span className="text-negative font-bold">Низкая</span> — текст неоднозначен, нужен первоисточник;</li>
              <li><span className="text-warning font-bold">Средняя</span> — трактовка правдоподобна, но есть альтернативы;</li>
              <li><span className="text-positive font-bold">Высокая</span> — связь события и активов выглядит прямой, хотя модель всё равно может ошибаться.</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-3">Как сочетать важность и уверенность</h3>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p><strong className="text-text-primary">Важность высокая + уверенность высокая:</strong> главный кандидат на внимание; проверьте первоисточник и уже произошедшую реакцию цены.</p>
              <p><strong className="text-text-primary">Важность высокая + уверенность низкая:</strong> потенциально значимо, но трактовка спорна. Это сигнал «разобраться», а не «действовать».</p>
              <p><strong className="text-text-primary">Важность низкая + уверенность высокая:</strong> модель уверенно считает событие малозначимым.</p>
              <p><strong className="text-text-primary">Обе низкие:</strong> обычно шум; такие карточки не должны определять вывод.</p>
            </div>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-3">Стрелки влияния и фильтры</h3>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p><span className="inline-flex items-center gap-1 text-positive font-bold">Актив <ArrowUpRight className="w-4 h-4" /></span> означает, что классификатор ожидает благоприятное направление для этого актива; <span className="inline-flex items-center gap-1 text-negative font-bold">Актив <ArrowDownRight className="w-4 h-4" /></span> — неблагоприятное. Это гипотеза о механизме, а не уже наблюдаемое движение.</p>
              <p>Одна новость может быть негативна для акций и позитивна для золота. Поэтому общая тональность и стрелки по конкретным активам могут не совпадать.</p>
              <p>Фильтры по источнику, теме, активу влияния, тональности и минимальной важности только меняют видимую ленту. Они не пересчитывают Tension, бриф и сигналы под выбранную вами выборку; после смены фильтра лента снова начинается с последних четырёх подходящих новостей.</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <Callout variant="warning">
            <strong>Если статья не открывается полностью:</strong> часть деловых изданий ограничивает доступ платной подпиской
            или защитой от автоматических запросов. Это не обязательно «битая ссылка», но и не повод верить одному заголовку:
            сверьте факт по другому источнику и посмотрите, подтверждает ли его цена.
          </Callout>
        </div>
      </GuideSection>
      <GuideSection id="guide-forecasts" eyebrow="05 · Изумрудный раздел" title="Сигналы по активам: когда сайт молчит — и почему это хорошо" icon={Target}>
        <Callout variant="danger">
          <strong>Процент на карточке сигнала нельзя читать как статистическую вероятность.</strong>
          Например, 56% означает лишь, что 56% взвешенного новостного свидетельства оказалось на одной стороне и 44% — на другой.
          Это почти равенство, поэтому карточка покажет «Нет сигнала». Калиброванная вероятность не публикуется, пока собственная
          история проверенных исходов не станет достаточно большой.
        </Callout>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="guide-signal-examples">
          <div className="rounded-xl border border-white/10 bg-bg-primary/60 p-5">
            <div className="text-3xl font-extrabold tabular-nums text-white">56 / 44</div>
            <div className="mt-1 font-extrabold text-slate-200">Нет сигнала</div>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">Свидетельства почти равны. Рисовать стрелку здесь значило бы выдавать шум за мнение.</p>
          </div>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.06] p-5">
            <div className="text-3xl font-extrabold tabular-nums text-white">63 / 37 ↑</div>
            <div className="mt-1 font-extrabold text-emerald-200">Слабый перекос вверх</div>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">Порог 60/40 пройден, но 63% — всё ещё доля веса новостей, а не шанс роста цены.</p>
          </div>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.06] p-5">
            <div className="text-3xl font-extrabold tabular-nums text-white">78 / 22 ↑</div>
            <div className="mt-1 font-extrabold text-emerald-200">Выраженный перекос</div>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">Новости согласованы сильнее, но всё равно проверьте число сигналов, источники и уже случившуюся реакцию цены.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-4">Баланс сигналов: от чего считать</h3>
            <div className="relative pt-2 pb-8">
              <div className="h-4 rounded-full bg-linear-to-r from-negative via-border-subtle to-positive" />
              <div className="absolute left-1/2 top-0 h-7 w-0.5 bg-white" />
              <div className="absolute left-1/2 top-8 -translate-x-1/2 text-xs font-bold">50% — перевеса нет</div>
              <span className="absolute left-0 top-8 text-xs text-negative font-bold">больше вниз</span>
              <span className="absolute right-0 top-8 text-xs text-positive font-bold">больше вверх</span>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed mt-3">
              <li><strong className="text-text-primary">50–59%</strong> — зона шума: карточка показывает «Нет сигнала» без стрелки;</li>
              <li><strong className="text-text-primary">60–69%</strong> — только слабый перекос новостного фона;</li>
              <li><strong className="text-text-primary">70–100%</strong> — выраженный новостной перекос, но всё ещё не шанс движения цены.</li>
              <li>Стрелка появляется только от 60% и показывает сторону с большим суммарным весом.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="font-bold mb-4">Окно и уверенность прогноза</h3>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p><strong className="text-text-primary">Окно 1–3 дня</strong> — горизонт, на котором новостной фон предположительно может проявляться. Это не обещание, что движение начнётся или закончится точно в эти сроки.</p>
              <p><strong className="text-negative">Низкая уверенность</strong> — мало сигналов, малый суммарный вес или перевес слабее 30% от максимально возможного баланса.</p>
              <p><strong className="text-warning">Средняя</strong> — сигналов достаточно, а нормированный баланс по модулю не ниже 0.30.</p>
              <p><strong className="text-positive">Высокая</strong> — баланс по модулю не ниже 0.60 и не менее пяти сигналов. «Высокая» относится к согласованности сигналов, а не к гарантированной точности.</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <FormulaDetails title="Формула прогноза и числовой пример">
            <p>Каждая новость старше 72 часов не учитывается. Вес сигнала уменьшается со временем с периодом полураспада 12 часов:</p>
            <div className="rounded-lg bg-bg-card border border-border-subtle p-4 font-mono text-[13px] text-text-primary overflow-x-auto">
              вес = важность × 2^(−возраст_часов / 12) × уверенность
              <br />
              баланс = (вес_вверх − вес_вниз) ÷ общий_вес
              <br />
              процент_на_карточке = 50 + |баланс| × 50
            </div>
            <p>
              Если суммарный вес вверх равен 11.2, вниз — 8.8, общий вес равен 20. Доля вверх — 56%, баланс — +0.12.
              Карточка покажет <strong className="text-text-primary">«Нет сигнала», 56%</strong>: нормированный перевес 12% ниже порога 20% (60/40), поэтому стрелку вверх рисовать было бы нечестно.
            </p>
            <p>
              Через 12 часов вес той же новости станет вдвое меньше, через 24 часа — вчетверо. Поэтому свежие события влияют на прогноз сильнее старых.
            </p>
          </FormulaDetails>
        </div>

        <div className="mt-5">
          <Takeaway>
            читайте карточку в таком порядке: сначала статус, затем блок «Основание» с числом и весом сигналов,
            и только потом процент. Для части внешних ориентиров публичный сигнал не выпускается вовсе — они нужны
            как ценовой контекст, а связанные события копятся в Памяти для последующей проверки.
          </Takeaway>
        </div>
      </GuideSection>
      <GuideSection id="guide-memory" eyebrow="06 · Раздел цвета фуксии" title="Память рынка: сайт проверяет собственные прошлые выводы" icon={BrainCircuit}>
        <div className="space-y-5">
          <Takeaway>
            обычная новостная лента забывает вчерашние выводы. Память рынка делает наоборот: сначала фиксирует,
            что сайт думал о событии в момент публикации, а потом возвращается и смотрит, что реально сделала цена.
          </Takeaway>
          <p className="text-text-secondary leading-relaxed">
            Статьи об одном факте объединяются в событие. Событие получает канал передачи и предполагаемое влияние
            на активы, а через 1, 3 и 10 торговых дней система сверяет направление с дневными ценами. Отдельно хранятся
            неизменяемые снимки агрегатных сигналов: их нельзя «подправить задним числом» под известный результат.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-bg-primary/60 border border-border-subtle rounded-xl p-5">
              <div className="font-bold text-text-primary mb-2">1 · Вкладка «События»</div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Каждая карточка — паспорт одного сюжета. Нажмите «Развернуть паспорт», чтобы увидеть источники,
                цепочку передачи, объяснение классификатора и фактические исходы по активам.
              </p>
            </div>
            <div className="bg-bg-primary/60 border border-border-subtle rounded-xl p-5">
              <div className="font-bold text-text-primary mb-2">2 · Вкладка «Исторические аналоги»</div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Похожие прошлые события группируются по каналу, активу, ожидаемому направлению и горизонту.
                Здесь важнее всего N: без достаточного числа уже наступивших исходов медиана остаётся ранней подсказкой.
              </p>
            </div>
            <div className="bg-bg-primary/60 border border-border-subtle rounded-xl p-5">
              <div className="font-bold text-text-primary mb-2">3 · Вкладка «Журнал прогнозов»</div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Каждый снимок сигнала записан до известного результата. Журнал показывает направленные выводы,
                воздержания «нет сигнала», ожидающие оценки и уже наступившие исходы.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-400/[0.05] p-5">
              <h3 className="mb-3 font-extrabold text-text-primary">Как читать паспорт события</h3>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-text-secondary">
                <li>Сначала само событие и первоисточник.</li>
                <li>Затем цепочку: событие → канал передачи → актив → ожидаемое направление.</li>
                <li>Ниже — что цена сделала через 1, 3 и 10 торговых дней.</li>
                <li>Статус «ожидает» означает только, что горизонт ещё не наступил, а не ошибку прогноза.</li>
              </ol>
            </div>
            <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
              <h3 className="mb-3 font-extrabold text-text-primary">Не путайте большие счётчики сверху с доказательством</h3>
              <p className="text-sm leading-relaxed text-text-secondary">
                «Статей» и «ценовых точек» может быть много, но статистический вывод строится только на уже оценённых
                направленных исходах конкретной группы. Фильтры по каналу и активу лишь выбирают паспорта;
                они не пересчитывают аналоги и не увеличивают выборку.
              </p>
            </div>
          </div>

          <FormulaDetails title="Словарь памяти: N, медиана и аномальная реакция">
            <p>
              <strong className="text-text-primary">EUR/USD</strong> здесь означает доллара за евро (USD per EUR). Это обратная величина к плитке USD/EUR в блоке котировок.
              <strong className="text-text-primary"> Gold index</strong> — отдельный дневной индекс Nasdaq по золоту для оценки относительной доходности в Памяти. Публичная плитка Gold на тепловой карте использует другой ряд — спот XAU/USD от Twelve Data; эти числа нельзя сравнивать как одну цену.
            </p>
            <p>
              <strong className="text-text-primary">N</strong> — число уже оценённых наблюдений. N меньше 8 помечается как малая выборка, 8–29 — ранняя, 30 и выше — рабочая для осторожной статистики.
              Даже при большом N аналоги показывают совместное движение после событий, а не доказательство того, что событие было единственной причиной движения.
            </p>
            <p>
              <strong className="text-text-primary">Медиана</strong> — срединная реакция в группе: половина наблюдений была слабее, половина сильнее.
              Она устойчивее среднего к одному экстремальному дню. <strong className="text-text-primary">Аномальная медиана</strong>
              дополнительно убирает обычный дневной фон актива, чтобы реакция не принимала повседневную волатильность за эффект события.
            </p>
            <p>
              <strong className="text-text-primary">Совпадение направления</strong> — только факт «ожидали вверх, цена за горизонт выросла»
              или наоборот. Это ещё не прибыль стратегии: размер движения, момент входа, комиссии и риск здесь не оцениваются.
              Старые архивные версии исходов не смешиваются с надёжной статистикой текущих классификаций.
            </p>
            <p>
              <strong className="text-text-primary">Score вверх</strong> в журнале — взвешенная доля направленных доказательств вверх среди направленных доказательств.
              Пока у сайта недостаточно оценённых прогнозов, это не калиброванная вероятность и не обещание точности.
            </p>
          </FormulaDetails>

          <Callout variant="warning">
            <strong>Достаточность данных важнее красивого процента.</strong> Market Pulse не будет публиковать «точность 80%» по пяти или десяти примерам:
            интерфейс сначала покажет малый N, ожидающие исходы и воздержания. Калибровка появится только после достаточной собственной проверенной истории.
          </Callout>
        </div>
      </GuideSection>
      <GuideSection id="guide-data-quality" eyebrow="Свежесть и честность" title="Почему у разных чисел разная скорость и разная дата" icon={RefreshCw}>
        <div className="grid grid-cols-1 gap-4 mb-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="text-2xl font-extrabold mb-1">5 минут</div>
            <p className="text-sm text-text-secondary leading-relaxed">Плановый интервал публичного кэша плиток активов и перечитывания открытой страницы. Это не превращает дневные ряды в поток сделок.</p>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="text-2xl font-extrabold mb-1">15 минут</div>
            <p className="text-sm text-text-secondary leading-relaxed">Плановый цикл публичных новостей, Tension и сигналов. Реальная свежесть также зависит от момента публикации у первоисточника.</p>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="text-2xl font-extrabold mb-1">07:00 МСК</div>
            <p className="text-sm text-text-secondary leading-relaxed">Ежедневный снимок для брифа и блока «Что изменилось с утра». Датированная история активов пополняется реже плиток — дважды в сутки.</p>
          </div>
          <div className="rounded-xl bg-bg-primary/60 border border-border-subtle p-5">
            <div className="text-2xl font-extrabold mb-1">1 / 3 / 10 дней</div>
            <p className="text-sm text-text-secondary leading-relaxed">Торговые горизонты проверки событий в Памяти. До наступления срока исход остаётся ожидающим, а не считается ни попаданием, ни промахом.</p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-bg-primary/60 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-extrabold text-text-primary">
            <Clock className="h-5 w-5 text-rose-300" aria-hidden="true" />
            На странице встречаются четыре разных «времени» — не смешивайте их
          </h3>
          <div className="grid grid-cols-1 gap-3 text-sm leading-relaxed text-text-secondary md:grid-cols-2 xl:grid-cols-4">
            <p><strong className="text-text-primary">Опубликовано</strong> — когда вышла новость у источника.</p>
            <p><strong className="text-text-primary">Дата значения</strong> — к какому торговому или календарному дню относится курс, индекс или закрытие.</p>
            <p><strong className="text-text-primary">Последняя проверка</strong> — когда Market Pulse перечитал свой публичный кэш.</p>
            <p><strong className="text-text-primary">Задержка провайдера</strong> — нормальное отставание ряда, например дневного Brent у FRED/EIA.</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            Tension смотрит на новости не старше 24 часов; сигналы допускают новости до 72 часов, но вес старой новости
            уменьшается вдвое каждые 12 часов. Поэтому «сайт обновился только что» и «последнее наблюдение датируется сегодня» — разные утверждения.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><CheckCircle2 className="w-4 h-4 text-positive" /> Когда сигналу можно доверять больше</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>есть ссылка на первоисточник или сильное деловое издание;</li>
              <li>новость свежая, важность и уверенность одновременно высокие;</li>
              <li>несколько независимых источников подтверждают само событие;</li>
              <li>механизм влияния на актив понятен без натяжек;</li>
              <li>цена ещё не полностью отреагировала до появления новости в ленте.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-primary/60 p-5">
            <h3 className="flex items-center gap-2 font-bold mb-3"><AlertTriangle className="w-4 h-4 text-warning" /> Когда нужно остановиться</h3>
            <ul className="space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>важность высокая, но уверенность низкая;</li>
              <li>карточка показывает «Нет сигнала» либо слабый перекос 60–69% на малом числе сигналов;</li>
              <li>все подтверждения являются перепечатками одного сообщения;</li>
              <li>источник не открывается или заголовок сильнее текста;</li>
              <li>данные выглядят устаревшими либо цена в терминале заметно расходится с карточкой.</li>
            </ul>
          </div>
        </div>

        <div className="mt-5">
          <Callout variant="warning">
            <strong>Публичный и исследовательский контуры специально разделены.</strong> Быстрая лента, Tension и сигналы показывают текущий фон;
            Память медленнее накапливает события и проверяет их на дневных ценах. Из-за этого один и тот же актив может иметь
            разные подписанные ряды для публичной плитки и оценки исхода. Если отдельный блок не обновился, интерфейс показывает
            предупреждение и последнее успешно загруженное состояние, а не выдаёт старые данные за свежие.
          </Callout>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.05] p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-text-secondary">
            <strong className="text-text-primary">Без регистрации и сбора личных данных.</strong> Market Pulse не просит аккаунт и не ставит
            аналитические cookies. В вашем браузере могут храниться только функциональные выборы: бизнес-профиль для сортировки
            российского блока и палитра тепловой карты. После перехода по внешней ссылке уже действуют правила сайта источника.
          </p>
        </div>
      </GuideSection>
      <GuideSection id="guide-faq" eyebrow="Разбор недоумений" title="Вопросы, которые возникают почти у всех" icon={BookOpen}>
        <div className="space-y-3">
          {[
            {
              q: 'Как понять, что плитку или карточку можно нажать?',
              a: 'Ищите мягко пульсирующую точку, текстовую подсказку и стрелку. На мировой плитке написано «Нажмите, чтобы развернуть», в Памяти — «Развернуть паспорт», у фильтров новостей — «Развернуть фильтры». Подпись «Открыть источник» означает переход на внешний сайт, а не раскрытие внутри страницы.',
            },
            {
              q: 'Почему в новостях сначала только четыре карточки?',
              a: 'Так страница не превращается в бесконечную стену заголовков. Сначала показаны самые свежие новости, затем кнопки открывают половину или всю подходящую ленту с точным количеством. После смены фильтра компактный режим начинается заново.',
            },
            {
              q: 'Почему цена на плитке и последняя точка большого графика могут различаться?',
              a: 'Плитка читает быстрый публичный кэш, а большой график — отдельный ряд дневных закрытий, который пополняется реже. У графика всегда подписаны провайдер и дата последнего наблюдения. Это разные срезы одного ориентира, а не поток сделок в реальном времени.',
            },
            {
              q: 'Почему дата Brent отстаёт от сегодняшнего дня?',
              a: 'Публичный ряд Brent приходит из FRED/EIA и нормально публикуется с задержкой примерно в неделю. Сайт показывает настоящую дату наблюдения и не дорисовывает недостающие дни другим провайдером: смешивание разных рядов создало бы красивую, но недостоверную непрерывность.',
            },
            {
              q: 'Почему официальный курс ЦБ может быть датирован следующим днём?',
              a: 'Банк России публикует официальный курс заранее на следующий календарный день. Поэтому дата на российской плитке может быть завтрашней уже сегодня. Это не прогноз Market Pulse и не биржевой курс конкретной сделки.',
            },
            {
              q: 'Почему Tension низкий, хотя одна новость выглядит страшной?',
              a: 'Индекс усредняет до 20 свежих квалифицированных новостей. Одна важная негативная карточка может быть разбавлена нейтральными и позитивными. Кроме того, её вклад уменьшают важность ниже 10 и уверенность ниже 100%.',
            },
            {
              q: 'Почему позитивная новость не вычитает негатив напрямую?',
              a: 'В текущей формуле Tension позитивная новость даёт нулевой негативный вклад, но увеличивает знаменатель среднего. Она снижает индекс через разбавление, а не через отрицательный вклад.',
            },
            {
              q: 'Почему при балансе 53% написано «Нет сигнала», а не «Вниз»?',
              a: '53% взвешенного сигнала на стороне вниз и 47% вверх — почти равенство. Для коррелированных новостных статей такой перевес неотличим от шума. Стрелка появляется только от 60/40, а до порога система честно воздерживается от направленного вывода.',
            },
            {
              q: 'Почему новость в целом негативная, а Gold отмечен вверх?',
              a: 'Общая тональность описывает фон новости, а стрелки — предполагаемое влияние на конкретные активы. Рост неопределённости может быть плох для акций и одновременно поддерживать защитные активы.',
            },
            {
              q: 'Почему важность 9/10, но уверенность прогноза низкая?',
              a: 'Важность одной новости и уверенность агрегированного прогноза — разные вещи. Для высокой уверенности прогноза нужны несколько согласованных сигналов и сильный суммарный баланс.',
            },
            {
              q: 'Почему мини-график актива резко прыгает при маленьком проценте?',
              a: 'Спарклайн внутри плитки не имеет фиксированной оси и растягивает диапазон точек на свою высоту. В развёрнутой панели ось времени уже календарная, но вертикальный диапазон по-прежнему подбирается под выбранный период. Смотрите прежде всего цену, процент периода и датированные минимум/максимум, а форму линии используйте как контекст.',
            },
            {
              q: 'Можно ли торговать только по этим цифрам?',
              a: 'Нет. Market Pulse — аналитический обзор и исследовательский прототип. Он помогает быстрее найти сюжеты и понять фон, но решение требует первоисточников, точной котировки, горизонта, размера позиции и управления риском.',
            },
          ].map((item) => (
            <details
              key={item.q}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-bg-primary/70 shadow-[0_10px_28px_rgba(0,0,0,0.14)] transition-colors open:border-accent/40"
            >
              <summary className="flex min-h-[58px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-extrabold text-text-primary transition-colors hover:bg-white/4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-5 [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <ExpandHint
                  detailsMode
                  closedLabel="Открыть ответ"
                  openLabel="Свернуть"
                  testId="guide-faq-expand-hint"
                  className="border-rose-300/40 bg-rose-400/10 text-rose-100"
                />
              </summary>
              <p className="border-t border-white/10 px-4 pb-5 pt-4 text-sm leading-relaxed text-text-secondary sm:px-5">
                {item.a}
              </p>
            </details>
          ))}
        </div>

        <div className="mt-6 rounded-xl2 border border-positive/25 bg-positive/5 p-6">
          <h3 className="font-bold text-lg mb-3">Короткая памятка перед выводом</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-text-secondary">
            {[
              'Я посмотрел время публикации и первоисточник, а не только заголовок.',
              'Я понял, где факт, где объяснение канала, а где уже гипотеза модели.',
              'Я открыл плитку актива и проверил провайдера, дату наблюдения и период графика.',
              'Я не путаю цвет навигации раздела с цветом роста или снижения цены.',
              'Я проверил важность вместе с уверенностью и числом сигналов в «Основании».',
              'Я понимаю, что процент сигнала — баланс свидетельств от базы 50%, а не шанс движения.',
              'В Памяти я посмотрел N и статус исхода, а не поверил одному похожему событию.',
              'Я не принимаю торговое или бизнес-решение по одной карточке, одному индексу или одному брифу.',
            ].map((text) => (
              <div key={text} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-positive shrink-0 mt-0.5" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </GuideSection>
    </div>
  );
}
