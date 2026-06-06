begin;

alter table public.ghl_pipeline_configs
add column if not exists display_order integer not null default 0;

create index if not exists ghl_pipeline_configs_display_order_idx
  on public.ghl_pipeline_configs(location_id, classification, display_order);

grant insert (display_order) on table public.ghl_pipeline_configs to authenticated;
grant update (display_order) on table public.ghl_pipeline_configs to authenticated;

commit;
