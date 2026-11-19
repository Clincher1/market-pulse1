import { useId } from 'react';

type BrandMarkProps = {
  className?: string;
};

/** Crisp vector mark: a market line with a travelling pulse of light. */
export default function BrandMark({ className = 'h-10 w-10' }: BrandMarkProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const bgId = `mp-brand-bg-${rawId}`;
  const pulseId = `mp-brand-pulse-${rawId}`;
  const glowId = `mp-brand-glow-${rawId}`;
  const path = 'M9 36H18L24 21L31 46L38 29L43 35H50L56 22';

  return (
    <svg
      viewBox="0 0 64 64"
      className={`brand-mark ${className}`}
      role="img"
      aria-label="Логотип Market Pulse"
      focusable="false"
    >
      <defs>
        <linearGradient id={bgId} x1="5" y1="4" x2="59" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#163A73" />
          <stop offset="0.48" stopColor="#101B3D" />
          <stop offset="1" stopColor="#0A1530" />
        </linearGradient>
        <linearGradient id={pulseId} x1="9" y1="36" x2="56" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#43E8D2" />
          <stop offset="0.48" stopColor="#44A7FF" />
          <stop offset="0.78" stopColor="#9A83FF" />
          <stop offset="1" stopColor="#B6FFCB" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${bgId})`} />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="17.25" fill="none" stroke="#8FB8FF" strokeOpacity="0.32" strokeWidth="1.5" />
      <path d="M10 19H54M10 32H54M10 45H54" stroke="#DBEAFE" strokeOpacity="0.075" />
      <path d="M18 10V54M32 10V54M46 10V54" stroke="#DBEAFE" strokeOpacity="0.045" />
      <path d={path} fill="none" stroke={`url(#${pulseId})`} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={path}
        className="brand-mark__pulse-flow"
        pathLength="100"
        fill="none"
        stroke="#E8FFFC"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />
      <circle className="brand-mark__signal-node" cx="56" cy="22" r="3.3" fill="#B6FFCB" />
      <circle cx="56" cy="22" r="6.2" fill="none" stroke="#63F2DA" strokeOpacity="0.5" strokeWidth="1.2" />
    </svg>
  );
}
