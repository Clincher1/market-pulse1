alter table public.asset_price_snapshots_v2
  add column if not exists snapshot_key text;

create unique index if not exists asset_price_snapshots_v2_snapshot_key_unique
  on public.asset_price_snapshots_v2 (snapshot_key);

comment on column public.asset_price_snapshots_v2.snapshot_key is
  'Deterministic upsert key: instrument_id|observation_date|price_timestamp. Computed by update-prices-v2-shadow.';
