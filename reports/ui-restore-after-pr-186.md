# UI restoration and mobile title clearance

## Scope and history

Compared `src/brand-refresh.css`, `src/App.tsx`, `src/components/PulseOrbit.tsx`, `src/components/OverviewTopics.tsx`, and `src/components/Header.tsx` between the pre-PR snapshot `d21164a` and PR #186 merge `9b8f7f4`. PR #186 changed all five files. The visual restoration uses the pre-merge brand-refresh CSS as its baseline; no unrelated application/component behavior was reverted.

## Restored appearance

- Re-established the pre-#186 light brand palette, typography and background treatment from `d21164a`.
- Kept readable dark foreground colors and high-contrast action/orbit text; no low-contrast styling was reintroduced.
- Preserved PR #186's opaque base state for reveal content, `prefers-reduced-motion` behavior, horizontally scrollable mobile navigation and its right-edge fade cue.

## Mobile title issue

The narrow layout uses a fixed, two-row header. The main content did not reserve enough vertical space consistently, allowing a section title to start under the header. Main content now reserves 83px on wide layouts and 125px at widths up to 1279px, plus the existing spacing token. A regression test checks this clearance and guards against negative title offsets or a clipping content wrapper.

At a 390px viewport, browser geometry verification measured a 125px header, 141px main top padding and the `/brief` title beginning at y=190px (opacity 1). Horizontal document overflow was 0px; the navigation remains horizontally scrollable and the fade cue is present. This was an automated Chromium check, not a physical iOS Safari device test.

## Diff summary

The source/test changes are limited to `src/brand-refresh.css`, `tests/mobile-reveal.test.mjs`, and the new `tests/mobile-title-clipping.test.mjs`. The report and three requested screenshots are included as deliverables. Stooq-related pre-existing workspace changes were not staged or included.

## Verification

- `npm test` — 657 passed, 0 failed
- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run build` — passed
- `git diff --check` — passed
- 390px browser geometry / overflow / visible-state / navigation fade check — passed

## Screenshots

- Desktop: [`screenshots/desktop.png`](../screenshots/desktop.png)
- Mobile home: [`screenshots/mobile.png`](../screenshots/mobile.png)
- Mobile brief / section title: [`screenshots/mobile-brief.png`](../screenshots/mobile-brief.png)
