-- Supabase default function privileges also grant these roles explicitly.
REVOKE ALL ON FUNCTION public.daily_snapshot_assets_are_dated(jsonb) FROM anon, authenticated;
