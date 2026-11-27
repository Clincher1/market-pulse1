
type BrandMarkProps = {
  className?: string;
};

/** Crisp vector mark: a market line with a travelling pulse of light. */
export default function BrandMark({ className = 'h-10 w-10' }: BrandMarkProps) {
  const path = 'M9 36H18L24 21L31 46L38 29L43 35H50L56 22';

  return (
    <svg
      viewBox="0 0 64 64"
      className={`brand-mark ${className}`}
      role="img"
      aria-label="Логотип Market Pulse"
      focusable="false"
    >

      <rect x="2" y="2" width="60" height="60" rx="18" fill="#1B2A41" />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="17.25" fill="none" stroke="#8FB8FF" strokeOpacity="0.32" strokeWidth="1.5" />
      <path d="M10 19H54M10 32H54M10 45H54" stroke="#DBEAFE" strokeOpacity="0.075" />
      <path d="M18 10V54M32 10V54M46 10V54" stroke="#DBEAFE" strokeOpacity="0.045" />
      <path d={path} fill="none" stroke="#4DE5D4" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={path}
        className="brand-mark__pulse-flow"
        pathLength="100"
        fill="none"
        stroke="#E8FFFC"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="brand-mark__signal-node" cx="56" cy="22" r="3.3" fill="#B6FFCB" />
      <circle cx="56" cy="22" r="6.2" fill="none" stroke="#63F2DA" strokeOpacity="0.5" strokeWidth="1.2" />
    </svg>
  );
}
