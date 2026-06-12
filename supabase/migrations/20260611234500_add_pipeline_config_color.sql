begin;

alter table public.ghl_pipeline_configs
  add column if not exists color_hex text not null default '#2384CA',
  add constraint ghl_pipeline_configs_color_hex_check
    check (color_hex ~ '^#[0-9A-Fa-f]{6}$');

grant insert (color_hex) on table public.ghl_pipeline_configs to authenticated;
grant update (color_hex) on table public.ghl_pipeline_configs to authenticated;

commit;
