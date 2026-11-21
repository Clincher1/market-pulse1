# Fourth attempt: one complete pass, one instrumentation failure

Run 44882394329, product a30919f: expanded round A passed all gates. Mobile
TBT home/world 101/150ms, performance 99/98; desktop performance 100/100.
Expanded round B mobile TBT 92/81.5ms and all completed checks passed, but
Lighthouse desktop /world produced NO_NAVSTART (missing trace navigation
marker). Its scores/metrics are invalid, not zero or a passed test. Therefore
this run does NOT establish two complete clean expanded rounds.
Both 42-case browser rounds and HTTP audits passed, including WCAG 2.2 AA.

The harness now permits one fresh-browser retry only for this exact trace
instrumentation error, saves its original report separately and records the
retry reason. It does not retry low scores, slow metrics, inaccessible pages,
assertion failures or other runtime errors. Fresh expanded rounds remain
required; no product changes were made after a30919f.
