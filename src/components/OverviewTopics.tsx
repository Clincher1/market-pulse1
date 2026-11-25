import { m as motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { DASHBOARD_THEME_ORDER, SECTION_THEMES, type SectionThemeId } from './sectionThemes.data';

const OVERVIEW_THEME_ORDER: SectionThemeId[] = [...DASHBOARD_THEME_ORDER, 'status'];

export default function OverviewTopics() {
  const reduceMotion = useReducedMotion();

  return (
    <section aria-labelledby="page-links-title" className="overview-topics overview-topics--compact mb-7 lg:mb-10">
      <div className="overview-topics__heading">
        <div>
          <p className="overview-section-kicker">ВЫБЕРИТЕ СВОЙ МАРШРУТ</p>
          <h2 id="page-links-title" className="overview-topics__title">С чего начнём?</h2>
        </div>
        <p className="overview-topics__intro">
          Одна тема — одна страница. Ничего лишнего не нужно прокручивать.
        </p>
      </div>

      <nav aria-label="Страницы Market Pulse" className="overview-topics__grid">
        {OVERVIEW_THEME_ORDER.map((themeId, index) => {
          const theme = SECTION_THEMES[themeId];
          const Icon = theme.icon;
          return (
            <motion.a
              key={theme.id}
              href={theme.href}
              data-testid={`overview-topic-${theme.id}`}
              className={`overview-topic-card group ${theme.cardClass}`}
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.42, delay: 0.08 + index * 0.045, ease: 'easeOut' as const }
              }
              whileHover={reduceMotion ? undefined : { y: -5, scale: 1.012 }}
              whileTap={reduceMotion ? undefined : { scale: 0.99 }}
            >
              <span className="overview-topic-card__topline">
                <span className={`overview-topic-card__icon ${theme.iconClass}`} aria-hidden="true">
                  <Icon className="h-[19px] w-[19px]" />
                </span>
                <span className="overview-topic-card__index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </span>
              <span className="overview-topic-card__copy">
                <span className={`overview-topic-card__title ${theme.textClass}`}>{theme.label}</span>
                <span className="overview-topic-card__description">{theme.description}</span>
              </span>
              <span className="overview-topic-card__open">
                Перейти
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </motion.a>
          );
        })}
      </nav>
    </section>
  );
}
