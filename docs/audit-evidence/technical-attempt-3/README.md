# Third expanded attempt: not full acceptance

Run 44881495091: both 42-case browser rounds passed with zero failures,
including WCAG 2.2 AA and direct orbit hit-target overlap assertions. The
24-case Chromium/Firefox/WebKit smoke checks and data reconciliation passed.
All four Lighthouse runs scored 100 for accessibility, best practices and SEO;
desktop performance 100/100, mobile 96/93 and LCP 0.91s/0.91s. However mobile
TBT was 233/315ms against the unchanged 200ms gate: overall run failed.

The public client previously included unused Auth, Realtime and Storage SDKs.
It now imports the same official PostgREST and Functions implementations
standalone, preserving API paths, public headers and return/error behavior.
Mocked transport tests cover select/filter/order/limit/maybeSingle, the proxy,
and function invocation without invoking the real production writer. Build
Supabase library chunk decreased from 202.92kB (51.93 gzip) to 18.13kB (5.68
gzip). This is a bundle result, not a claim of achieved live TBT or acceptance;
a fresh full production audit must assess that change.
