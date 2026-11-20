-- Preserve the writer's queue order. Previously every enabled source was
-- `chosen=true` and JSON array ordinality was lost, so the UI could present
-- Coinbase/Twelve as the default while the writer used Kraken/gold-api.
-- Only the display view changes: no preferences, instruments or history change.
create or replace view public.slot_sources_view as
with ranked as (
  select registry.number, registry.slot_id, registry.section, registry.title,
    registry.can_choose, source.value->>'id' as source_id,
    coalesce(preference.enabled, true) as enabled,
    row_number() over (
      partition by registry.slot_id
      order by coalesce(preference.enabled, true) desc,
        (preference.slot_id is not null) desc,
        preference.priority asc nulls last, source.position asc
    )::integer as queue_position,
    case
      when not registry.can_choose then 'источник задан: замена была бы подменой инструмента'
      when preference.slot_id is null then 'по умолчанию'
      when preference.enabled then 'выбран вручную'
      else 'выключен вручную'
    end as why
  from public.data_slot_registry registry
  cross join lateral jsonb_array_elements(registry.sources) with ordinality as source(value, position)
  left join public.source_preferences preference
    on preference.slot_id = registry.slot_id
    and preference.source_id = source.value->>'id'
)
select number, slot_id, section, title, can_choose, source_id,
  (enabled and queue_position = 1) as chosen,
  queue_position as priority, why
from ranked;

comment on view public.slot_sources_view is
  'Configured source queue, not the provider of the last observation. chosen marks the first enabled source; priority preserves manual priority and registry array order.';
-- Existing column SELECT grants stay intact. No broader grants are introduced.
