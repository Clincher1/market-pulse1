-- Supabase default privileges can grant service_role broad table/view access;
-- narrow them after creating the append-only revision log.
revoke all on table public.asset_price_revisions_v1 from service_role;
grant select, insert on table public.asset_price_revisions_v1 to service_role;
revoke all on sequence public.asset_price_revisions_v1_id_seq from service_role;
grant usage, select on sequence public.asset_price_revisions_v1_id_seq to service_role;

revoke all on public.asset_price_revisions_public_v1 from service_role;
grant select on public.asset_price_revisions_public_v1 to service_role;
