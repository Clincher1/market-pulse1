import { SECTION_THEMES, type SectionThemeId } from './sectionThemes.data';

export function SectionThemeBadge({
  themeId,
  className = '',
}: {
  themeId: SectionThemeId;
  className?: string;
}) {
  const theme = SECTION_THEMES[themeId];
  const Icon = theme.icon;

  return (
    <span
      className={`inline-flex items-center gap-[var(--space-1)] rounded-full border px-[var(--space-2)] py-[var(--space-1)] text-[11px] font-extrabold uppercase tracking-[0.13em] ${theme.badgeClass} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${theme.dotClass}`} aria-hidden="true" />
      <Icon className="h-3.5 w-3.5" />
      {theme.order} · {theme.label}
    </span>
  );
}
