# Second expanded technical attempt: not acceptance

Run 44880665366 verified all 24 Chromium/Firefox/WebKit route/viewport smoke
cases, the 120 world-history points and six Russian series. Lighthouse mobile
performance was 99 (home) / 98 (world), desktop 100 / 100. Lab LCP was below
one second in all four measurements; visible-name issues were resolved.

The stricter WCAG 2.2 AA scan still failed on the home diagram at 768/1280px,
also reproduced by desktop Lighthouse: the world link inherited `left:0` and
`bottom:12%` from the old stylesheet while a newer one set `top:22%` and
`right:0`. It stretched vertically and covered part of the Russia link.
This is a real hit-target layout defect, not waived as a scanner issue.
The common orbit-link rule now resets all four inset edges before applying
new-layout modifiers. Direct overlap regression assertions were added for
all tested widths; fresh full audits are required on that fix.
