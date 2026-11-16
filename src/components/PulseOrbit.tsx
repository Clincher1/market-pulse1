import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Globe2, Landmark, Newspaper } from 'lucide-react';
import { PAGE_PATHS } from '@/lib/routes';
import BrandMark from './BrandMark';

const ORBIT_LINKS = [
  {
    href: PAGE_PATHS.russia,
    label: 'Россия',
    detail: 'рынки и бизнес',
    icon: Landmark,
    className: 'pulse-orbit__link--russia',
  },
  {
    href: PAGE_PATHS.global,
    label: 'Мир',
    detail: 'мировые рынки',
    icon: Globe2,
    className: 'pulse-orbit__link--world',
  },
  {
    href: PAGE_PATHS.news,
    label: 'Публикации',
    detail: 'первоисточники',
    icon: Newspaper,
    className: 'pulse-orbit__link--news',
  },
];

/** Декоративная орбита — быстрый переход по темам, не график котировок. */
export default function PulseOrbit() {
  const reduceMotion = useReducedMotion();

  return (
    <nav
      className="pulse-orbit"
      aria-label="Быстрые ссылки по темам. Орбитальная графика декоративная и не отображает рыночные данные."
    >
      <div className="pulse-orbit__grid" aria-hidden="true" />
      <div className="pulse-orbit__rings" aria-hidden="true">
        <span className="pulse-orbit__ring pulse-orbit__ring--outer" />
        <span className="pulse-orbit__ring pulse-orbit__ring--inner" />
        <span className="pulse-orbit__spark pulse-orbit__spark--one" />
        <span className="pulse-orbit__spark pulse-orbit__spark--two" />
      </div>

      <div className="pulse-orbit__core" aria-hidden="true">
        <span className="pulse-orbit__core-glow" />
        <BrandMark className="pulse-orbit__brand" />
        <span className="pulse-orbit__wordmark">MARKET PULSE</span>
        <span className="pulse-orbit__caption">смотреть слоями</span>
      </div>

      {ORBIT_LINKS.map((link, index) => {
        const Icon = link.icon;
        return (
          <motion.a
            key={link.href}
            href={link.href}
            className={`pulse-orbit__link ${link.className}`}
            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.48, delay: 0.12 + index * 0.1, ease: 'easeOut' }
            }
            whileHover={reduceMotion ? undefined : { y: -4, scale: 1.025 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          >
            <span className="pulse-orbit__link-icon" aria-hidden="true">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="pulse-orbit__link-copy">
              <span className="pulse-orbit__link-title">{link.label}</span>
              <span className="pulse-orbit__link-detail">{link.detail}</span>
            </span>
            <ArrowUpRight className="pulse-orbit__link-arrow" aria-hidden="true" />
          </motion.a>
        );
      })}

      <span className="pulse-orbit__micro-label" aria-hidden="true">
        ФАКТЫ · ИСТОЧНИКИ · КОНТЕКСТ
      </span>
    </nav>
  );
}
