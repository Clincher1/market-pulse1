alter table public.cached_tension add column if not exists history_stats jsonb;
comment on column public.cached_tension.history_stats is 'Stage 2 roadmap: distribution stats over tension_history (days, below/above/equal counts vs current value, median, min, max, first/last date). Written by update-tension; read by the public frontend. Additive to the cached_tension contract.';
