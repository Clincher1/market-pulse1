import { ArrowDownRight } from 'lucide-react';
import { DASHBOARD_THEME_ORDER, SECTION_THEMES, type SectionThemeId } from './sectionThemes.data';

/**
 * Порядок карточек в «Карте страницы». Паспорт дня стоит первым: это
 * единственная запись, которая фиксируется один раз и дальше не меняется.
 * В шапке его нет намеренно — там уже восемь пунктов.
 */
const QUICK_NAV_ORDER: SectionThemeId[] = ['passport', ...DASHBOARD_THEME_ORDER];

export default function DashboardQuickNav() {
  return (
    <nav
      id="dashboard-quick-nav"
      data-testid="dashboard-quick-nav"
      aria-label="Быстрый доступ к разделам дашборда"
      className="mb-12 scroll-mt-24"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-text-primary">
            Карта страницы
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            Сверху — четыре числа для сверки с договорами, затем запись дня и факты: Россия,
            мировая экономика. Потом бриф и заголовки; в конце — архив прогнозных записей,
            который показывает, что было сохранено и какие исходы были посчитаны.
          </p>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-text-secondary">
          Цвет кнопки повторяется в заголовке и рамке соответствующего раздела — так легче
          запомнить, где находится нужная тема.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_NAV_ORDER.map((themeId) => {
          const theme = SECTION_THEMES[themeId];
          const Icon = theme.icon;

          return (
            <a
              key={theme.id}
              href={theme.href}
              data-testid={`quick-nav-${theme.id}`}
              className={`group flex min-h-[138px] flex-col justify-between rounded-2xl border p-4 shadow-lg transition-all duration-300 hover:-translate-y-0.5 ${theme.cardClass}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-lg ${theme.iconClass}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className={`text-xs font-black tracking-[0.2em] ${theme.textClass}`}>
                  {theme.order}
                </span>
              </span>

              <span className="mt-4 block">
                <span className="flex items-center justify-between gap-3 text-base font-extrabold leading-tight text-text-primary">
                  {theme.label}
                  <ArrowDownRight className="h-4 w-4 shrink-0 text-text-secondary transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:text-text-primary" />
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-text-secondary">
                  {theme.description}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
