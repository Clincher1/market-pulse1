# Supabase backend

This directory contains the versioned Supabase backend for Market Pulse. It is not an empty
placeholder: Edge Function sources, shared modules, SQL diagnostics, configuration and database
migrations live here.

## Contents

- `functions/` — Edge Functions and shared server-side code. Examples include public data
  updates, source checks, morning snapshots, the system self-check and legacy research
  pipelines. Read each function before deploying; source presence alone does not prove that a
  Dashboard schedule currently invokes it.
- `migrations/` — ordered SQL schema, access-policy and scheduled-job changes. This is the
  versioned record of database changes.
- `sql/` — documented operational SQL files that are not migration history.
- `diagnostics.sql` — read-only `SELECT` queries for inspecting database state.
- `config.toml` — Supabase CLI configuration for this repository.

## Database change procedure

1. Confirm the exact schema/policy change and verify that a migration is necessary.
2. Use the connected Supabase migration workflow (`create_migration`) when available.
3. Save the exact migration SQL under `migrations/` with a timestamped, descriptive name.
4. Review the diff and validate the migration before applying it. Do not use ad hoc production
   SQL as a substitute for a migration.
5. Preserve historical records. A UI removal does not authorize deleting a table, archive,
   forecast, outcome or source record.

## Access and deployment cautions

- Browser clients use only the public publishable/anon key and must remain read-only under RLS
  and grants. Never put a service-role key or another secret in frontend code or `VITE_*`.
- Secrets belong in Supabase/Vercel server-side settings, not in this repository or chat.
- External requests from functions need timeouts, source-respecting pacing and independent
  failure handling. Do not add HTML scraping without explicit owner consent.
- Do not assume that cron jobs or Dashboard settings match the repository. Confirm deployed
  state with observable checks before reporting a deployment or schedule as active.

The public interface currently shows market observations, source headlines, and an archive of
historical forecast records. The legacy news-tension data and other historical rows are not
public-facing product metrics and must not be renamed or deleted as part of presentation work.
See `../AGENTS.md` and `../docs/PROJECT-CONTEXT.md` for product and verification rules.
