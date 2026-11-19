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
    detail: 'мировые ориентиры',
    icon: Globe2,
    className: 'pulse-orbit__link--world',
  },
  {
    href: PAGE_PATHS.news,
    label: 'Публикации',
    detail: 'источники и контекст',
    icon: Newspaper,
    className: 'pulse-orbit__link--news',
  },
];

/** Abstract vector artwork for the overview hero; it is not a live chart. */
export default function PulseOrbit() {
  const reduceMotion = useReducedMotion();

  return (
    <nav
      className="pulse-orbit"
      aria-label="Быстрые ссылки: российские рынки, мировые рынки и публикации. Графика декоративная и не показывает рыночные данные."
    >
      <div className="pulse-orbit__aura pulse-orbit__aura--blue" aria-hidden="true" />
      <div className="pulse-orbit__aura pulse-orbit__aura--mint" aria-hidden="true" />
      <div className="pulse-orbit__mesh" aria-hidden="true" />

      <svg className="pulse-orbit__chart" viewBox="0 0 640 600" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="pulse-chart-line" x1="75" y1="361" x2="566" y2="228" gradientUnits="userSpaceOnUse">
            <stop stopColor="#44E5D1" />
            <stop offset="0.47" stopColor="#43A7FF" />
            <stop offset="0.78" stopColor="#9A82FF" />
            <stop offset="1" stopColor="#C1FFD4" />
          </linearGradient>
          <linearGradient id="pulse-chart-runner" x1="90" y1="340" x2="570" y2="235" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F2FFFE" stopOpacity="0" />
            <stop offset="0.45" stopColor="#F2FFFE" />
            <stop offset="1" stopColor="#B6FFF3" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="pulse-chart-fill" cx="0" cy="0" r="1" gradientTransform="matrix(0 190 -265 0 320 276)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4E8DFF" stopOpacity="0.22" />
            <stop offset="1" stopColor="#4E8DFF" stopOpacity="0" />
          </radialGradient>
          <filter id="pulse-chart-glow" x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle className="pulse-orbit__chart-ring pulse-orbit__chart-ring--outer" cx="320" cy="292" r="252" />
        <circle className="pulse-orbit__chart-ring pulse-orbit__chart-ring--inner" cx="320" cy="292" r="196" />
        <ellipse className="pulse-orbit__chart-orbit" cx="320" cy="292" rx="239" ry="114" transform="rotate(-28 320 292)" />
        <path d="M60 292H580M320 32V552" className="pulse-orbit__crosshair" />
        <path d="M75 362H166L195 309L232 414L265 339L296 353L330 302L371 329L413 219L457 263L489 240L565 240V460H75V362Z" fill="url(#pulse-chart-fill)" />
        <path
          d="M75 362H166L195 309L232 414L265 339L296 353L330 302L371 329L413 219L457 263L489 240L565 240"
          className="pulse-orbit__chart-line"
          pathLength="100"
        />
        <path
          d="M75 362H166L195 309L232 414L265 339L296 353L330 302L371 329L413 219L457 263L489 240L565 240"
          className="pulse-orbit__chart-runner"
          pathLength="100"
          filter="url(#pulse-chart-glow)"
        />
        <circle className="pulse-orbit__chart-node" cx="232" cy="414" r="5" />
        <circle className="pulse-orbit__chart-node pulse-orbit__chart-node--bright" cx="413" cy="219" r="6" />
        <circle className="pulse-orbit__chart-node pulse-orbit__chart-node--mint" cx="565" cy="240" r="5" />
      </svg>

      <div className="pulse-orbit__center" aria-hidden="true">
        <span className="pulse-orbit__center-halo" />
        <span className="pulse-orbit__center-label">MARKET PULSE</span>
        <BrandMark className="pulse-orbit__brand" />
        <span className="pulse-orbit__center-caption">факты · источники · контекст</span>
      </div>

      <div className="pulse-orbit__status" aria-hidden="true">
        <span className="pulse-orbit__status-dot" />
        <span>КАРТА РЫНКОВ</span>
        <span className="pulse-orbit__status-divider" />
        <span>БЕЗ ЛИШНЕГО ШУМА</span>
      </div>

      {ORBIT_LINKS.map((link, index) => {
        const Icon = link.icon;
        return (
          <motion.a
            key={link.href}
            href={link.href}
            className={`pulse-orbit__link ${link.className}`}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.54, delay: 0.2 + index * 0.11, ease: 'easeOut' }
            }
            whileHover={reduceMotion ? undefined : { y: -5, scale: 1.035 }}
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

      <span className="pulse-orbit__micro-label" aria-hidden="true">OBSERVE · VERIFY · UNDERSTAND</span>
    </nav>
  );
}
