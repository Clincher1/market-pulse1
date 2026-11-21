# Initial HTML: technical quality improvement

## Scope

Addresses the empty initial HTML observed in the owner's static WebAnalyzer report.
All nine existing public routes now include a route-specific heading/description,
landmark regions, accessible navigation, source/methodology explanations and an honest
explanation of why live data requires JavaScript. The document is identical for people
and crawlers; there is no user-agent detection, hidden SEO text, extra API call or new
runtime dependency. The existing `createRoot` startup replaces this subtree.

This is **not full server rendering of live market data**. No current quote, news item,
calculated change, publication date or fake update timestamp is embedded at build time.
React pages, formulas, source configuration, API contracts, databases and history are
unchanged. A text fallback may be visible before JavaScript starts; it is not intended
to be a second copy of the interactive layout.

## Before → after

Measured on the built home document (without running JavaScript):

| Measure | Before | After |
| --- | ---: | ---: |
| H1 | 0 | 1 |
| Main/header/nav/footer landmarks | 0 | 4 |
| Links | 0 | 14 |
| Body words (whitespace split) | 0 | 141 |
| JSON-LD WebSite | 0 | 1 |

The new initial document adds roughly 3.3 KB of uncompressed HTML relative to the
previous empty-root output (new built document: 7,455 bytes). No external dependency
or request is needed to construct it. The existing stylesheet gains scoped fallback
styles only: 24 px outer padding, a 76 rem maximum reading container, 44 px navigation
targets, #0F172A text and #1D4ED8 links. Runtime components are not restyled.

The WebSite JSON-LD contains only the actual name, canonical URL, shared description
and Russian language. No invented author, review, rating, search action or freshness
claim. Both Vercel and optional origin-server CSP allow the exact SHA-256 of that
JSON-LD; executable `unsafe-inline`/`unsafe-eval` remain prohibited. A regression test
checks the JSON bytes against both policies.

## Implementation

- `scripts/static-document.mjs`: shared public route registry, text document and JSON-LD.
- `scripts/build-pages.mjs`: existing route metadata/sitemap builder now inserts the document.
- `src/index.css`: styles scoped to `.initial-document`, removed from the DOM by React.
- `vercel.json`, `server/origin.mjs`: exact JSON-LD CSP hash only.
- `tests/static-document.test.mjs`: built output, links, schema/CSP, fail-closed insertion,
  and replacement using the existing React root API.
- `tests/release-surfaces.test.mjs`: verifies the shared registry against public rewrites.
- `scripts/check-initial-document.mjs`: read-only full-browser verification.
- `.github/workflows/initial-document.yml`: expected-release public browser verification.

## Local validation

- `npm ci`: successful, npm reported zero known vulnerabilities.
- `npm test`: **412/412**, two consecutive complete runs.
- TypeScript, ESLint and production build: passed.
- Deno check of all Edge Functions/shared modules: passed; no Edge Function changed.
- `git diff --check`: passed.
- Browser checks: **216/216**, no failures. Two complete rounds × nine routes ×
  four widths (360/768/1024/1440) × three modes (JS disabled, failed script load,
  interactive startup). No horizontal overflow or CSP violations; one H1/main/footer,
  keyboard skip link, correct page text and no duplicated fallback after startup.
- Final interactive DOM versus the same build with an empty initial root: identical
  on all four widths. This is startup equivalence, not comparison of market data.
- Existing Brief/header checker: **72/72**, two rounds, all routes/four widths.
- Local production entry: `index-ChzyMUIF.js`.

Evidence: `audit-evidence/initial-document/local/report.json` and
`audit-evidence/initial-document/local/navigation.json`; selected screenshots alongside.
The local server was Vite production preview. Its document responses were given the
production CSP by the browser test so JSON-LD/startup security was actually exercised.

## Published verification

- Product commit: `d6725fa78d7a966023a31b9e0bf442d632e23480`.
- Vercel deployment: `dpl_54E3QJCm6iKc1CL2WQakDTakoHk3`, observed
  **READY / PROMOTED**, public alias `https://market-pulse1-eta.vercel.app/` assigned.
- Public entry: `index-ChzyMUIF.js`, checked on all nine routes.
- [Public browser run 44940384867](https://github.com/Clincher1/market-pulse1/actions/runs/44940384867):
  **SUCCESS**, 216/216 document cases across two rounds; final DOM equivalence 4/4;
  existing Brief/header navigation 72/72. Each document response was checked for the
  route marker, expected entry and actual JSON-LD CSP hash.
- [Product quality run 44940184383](https://github.com/Clincher1/market-pulse1/actions/runs/44940184383)
  and [verification-workflow quality run 44940384761](https://github.com/Clincher1/market-pulse1/actions/runs/44940384761):
  **SUCCESS**.
- An earlier public run, 44940184431, was **not clean**: the first home-page request
  did not contain the new document marker (215/216 cases passed). It happened during
  rollout; no product change was made between that attempt and the clean rerun.
  This is compatible with an old response during propagation, but the precise cache
  mechanism was not captured. The unsuccessful report is retained as
  `audit-evidence/initial-document/published/attempt-1.json`, not counted as success.
- Successful public reports and selected screenshots are under
  `audit-evidence/initial-document/published/`. Only verification/evidence commits follow
  the deployed product commit; they do not change the built website.

## Limits

All browser checks deliberately block external and `/api/` data requests. They certify
document availability, navigation and startup behavior, **not** quote correctness,
source freshness, live API availability or interval uptime. They are not a new complete
source audit or a Core Web Vitals/real-user performance certification. No guarantee of
zero outages or formal GOST/WCAG compliance is implied. WebAnalyzer was not rerun, and
no new score is claimed. Privacy policy content, detailed live-data prerendering and
other unrelated recommendations remain separate tasks.
