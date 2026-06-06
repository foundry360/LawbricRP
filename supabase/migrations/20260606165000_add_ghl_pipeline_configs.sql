-- Stores Lawbric-owned metadata for GHL pipelines. Pipelines and stages are
-- still created in GHL; this table only controls how Lawbric classifies them.

begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.ghl_pipeline_configs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  ghl_pipeline_id text not null,
  name_snapshot text not null,
  classification text not null default 'unclassified',
  account_type_rule text,
  include_tags text[] not null default '{}'::text[],
  exclude_tags text[] not null default '{}'::text[],
  is_active boolean not null default true,
  display_order integer not null default 0,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ghl_pipeline_configs_location_pipeline_key unique (location_id, ghl_pipeline_id),
  constraint ghl_pipeline_configs_classification_check check (classification in ('unclassified', 'prospecting', 'matter'))
);

create index if not exists ghl_pipeline_configs_location_id_idx
  on public.ghl_pipeline_configs(location_id);

create index if not exists ghl_pipeline_configs_classification_idx
  on public.ghl_pipeline_configs(location_id, classification);

drop trigger if exists ghl_pipeline_configs_set_updated_at on public.ghl_pipeline_configs;
create trigger ghl_pipeline_configs_set_updated_at before update on public.ghl_pipeline_configs
for each row execute function public.set_updated_at();

alter table public.ghl_pipeline_configs enable row level security;
alter table public.ghl_pipeline_configs force row level security;

drop policy if exists "ghl_pipeline_configs_select_assigned_location"
on public.ghl_pipeline_configs;

create policy "ghl_pipeline_configs_select_assigned_location"
on public.ghl_pipeline_configs
for select
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "ghl_pipeline_configs_insert_assigned_location"
on public.ghl_pipeline_configs;

create policy "ghl_pipeline_configs_insert_assigned_location"
on public.ghl_pipeline_configs
for insert
to authenticated
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "ghl_pipeline_configs_update_assigned_location"
on public.ghl_pipeline_configs;

create policy "ghl_pipeline_configs_update_assigned_location"
on public.ghl_pipeline_configs
for update
to authenticated
using (public.can_access_location(location_id) or public.is_admin())
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "ghl_pipeline_configs_delete_assigned_location"
on public.ghl_pipeline_configs;

create policy "ghl_pipeline_configs_delete_assigned_location"
on public.ghl_pipeline_configs
for delete
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

revoke all on table public.ghl_pipeline_configs from public, anon, authenticated;

grant select on table public.ghl_pipeline_configs to authenticated;
grant insert (
  location_id,
  ghl_pipeline_id,
  name_snapshot,
  classification,
  account_type_rule,
  include_tags,
  exclude_tags,
  is_active,
  display_order,
  notes
) on table public.ghl_pipeline_configs to authenticated;
grant update (
  name_snapshot,
  classification,
  account_type_rule,
  include_tags,
  exclude_tags,
  is_active,
  display_order,
  notes,
  updated_at
) on table public.ghl_pipeline_configs to authenticated;
grant delete on table public.ghl_pipeline_configs to authenticated;
grant all on table public.ghl_pipeline_configs to service_role;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to service_role;

commit;
