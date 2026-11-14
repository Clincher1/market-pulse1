# Instructions for coding agents

Read this file and `docs/PROJECT-CONTEXT.md` before changing product behavior. The code
and current data contracts are authoritative; old handover notes and archived concepts may
be stale.

## Product rules: facts before interpretation

- Show an observable value with its instrument, source, observation/publication date and
  unit. Keep the received value distinct from calculations made from it.
- Do not invent fallback numbers, dates, sources, event matches or causal explanations.
  Missing or stale data must remain visibly missing/stale.
- Do not present model-generated importance, confidence, sentiment, impact, event
  classification or similar headings as facts. Do not repair such output by renaming it.
- Do not infer that a headline caused a later price move. Similar titles are not proof that
  articles describe one event.
- No public news-tension index or replacement index. The legacy server/database history is
  not the public product and must not be deleted as part of UI work.
- New forecast issuance is stopped. Keep archived forecast records and source rows intact;
  do not enable, rewrite or delete them without an explicit task.
- Derived values are acceptable only when their formula uses displayed values and the
  comparison dates, units and limitations are clear. Do not make claims from a single
  measurement when the requirement is stability over an interval.
- If no display rule fires, use the neutral text “Ни одно из правил показа не сработало”; do
  not claim that the market is normal or calm.

## Data, sources and privacy

- Use free service tiers only. Do not add paid APIs, trackers, analytics, browser telemetry
  or browser monitoring SDKs. Monitoring stays server-side.
- No cookies or client-side analytics. Do not add new persistent browser identifiers.
- External sources must have timeouts and must not block unrelated responses. HTML scraping
  requires explicit owner consent; prefer a documented/public feed or API.
- Source selection is manual and may change only when an actually equivalent replacement
  exists. Do not silently substitute a different instrument, venue, unit or cadence.
- All charts use the shared standards and state their cadence. Do not interpolate or
  backfill missing observations unless the chart explicitly labels that calculation.
- Do not ask for, print or commit credentials. Never put service-role keys or other secrets
  in frontend `VITE_*` variables.
- Do not touch unrelated repositories, databases or projects.

## Database and history

- Do not delete historical rows, forecasts, outcomes, news or archives to make a dashboard
  look cleaner. Change only what the task explicitly scopes.
- Schema/data-policy changes must be implemented as migrations, using the connected
  Supabase migration workflow when available, with the exact migration copied into
  `supabase/migrations/`. Do not make ad hoc production SQL changes.
- Keep public access read-only and verify RLS/grants before changing a query or view.

## Repository and Git

- Check `git branch --show-current` before Git operations. Work only on the current branch;
  do not switch, create, push or rename another branch.
- Keep fixes narrow. The owner requires one concrete defect/slot per commit; avoid bundling
  unrelated repairs. When a commit is requested, use `Clincher1
  <88886535+Clincher1@users.noreply.github.com>`.
- Do not rewrite or delete Git history. Do not run a broad history scan when a targeted file
  or current diff is enough.
- The canonical public reference is
  <https://github.com/Clincher1/market-pulse1/tree/main>. A work branch is not a separate
  source of truth.

## Validation

- Before tests, run `npm ci`; then `npm test`.
- Run `npm run typecheck`, `npm run lint` and `npm run build` for relevant frontend changes.
- For Edge Functions, run:
  `cd supabase/functions && npx -y deno@2 check */index.ts _shared/*.ts`.
- If a self-check is added or renamed, add its human-readable entry in
  `src/lib/checkLabels.ts` and a matching test in `tests/status-labels.test.mjs`.
- A claim of stability requires observations over the stated time interval. Follow
  `docs/VERIFICATION-METHOD.md`; a single successful run is not proof.
- Report what was actually run and any unverified behavior. Do not describe a build, test,
  deployment or live response as successful unless its result was observed.
