# First expanded technical audit: not acceptance

Run 44879658003 had two clean existing 42-case browser/API rounds and verified
120 cached/global-history points plus six Russian series. The broader technical
step failed. This evidence is retained, not counted as a clean full technical audit.

- The new privacy assertion omitted the existing local heatmap-palette preference.
  It is a display preference, not telemetry; the explicit allowlist now includes it.
- The first desktop Lighthouse configuration incorrectly kept mobile throttling
  while using desktop scoring. The next run uses Lighthouse's official desktop preset.
- Mobile LCP was ~3 seconds, above the 2.5s target; critical route code and text
  rendering were optimized before the next run, not waived by lowering the target.
- Navigation accessible names did not always include the visible label. Fixed.
- Desktop target-size needs precise node diagnostics and remains unverified until
  the expanded accessibility checks pass. WCAG 2.1 A and 2.2 AA tags are now
  explicitly included, beyond the earlier scanner's narrower tags.
