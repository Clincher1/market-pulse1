import { useId } from 'react';

type BrandMarkProps = {
  className?: string;
};

/**
 * Фирменный знак Market Pulse: пульс события превращается в растущий
 * рыночный импульс. Тот же контур используется в favicon и OG-карточке.
 */
export default function BrandMark({ className = 'h-10 w-10' }: BrandMarkProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const bgId = `mp-brand-bg-${rawId}`;
  const pulseId = `mp-brand-pulse-${rawId}`;

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Логотип Market Pulse"
      focusable="false"
    >
      <defs>
        <linearGradient id={bgId} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#13233F" />
          <stop offset="0.55" stopColor="#0B1222" />
          <stop offset="1" stopColor="#07101F" />
        </linearGradient>
        <linearGradient id={pulseId} x1="9" y1="40" x2="55" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="0.48" stopColor="#3B82F6" />
          <stop offset="0.78" stopColor="#818CF8" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="16" fill={`url(#${bgId})`} />
      <rect
        x="3.75"
        y="3.75"
        width="56.5"
        height="56.5"
        rx="15.25"
        fill="none"
        stroke="#31527E"
        strokeOpacity="0.72"
        strokeWidth="1.5"
      />
      <path d="M10 45.5H54M10 32H54M10 18.5H54" stroke="#FFFFFF" strokeOpacity="0.055" />
      <path
        d="M9 38H20L26 21L33 47L39 33H47L54 24"
        fill="none"
        stroke={`url(#${pulseId})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M47.5 24H54V30.5"
        fill="none"
        stroke="#34D399"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="21" r="3.2" fill="#E0F2FE" stroke="#22D3EE" strokeWidth="1.6" />
      <circle cx="33" cy="47" r="3.2" fill="#E0E7FF" stroke="#818CF8" strokeWidth="1.6" />
    </svg>
  );
}
