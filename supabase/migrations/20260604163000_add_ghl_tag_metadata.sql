-- Tracks app-level tag timestamps because GHL location tags do not return
-- created/updated dates in the location tags API response.

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

create table if not exists public.ghl_tag_metadata (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  ghl_tag_id text not null,
  tag_name text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ghl_tag_metadata_location_tag_key unique (location_id, ghl_tag_id)
);

create index if not exists ghl_tag_metadata_location_id_idx
  on public.ghl_tag_metadata(location_id);

drop trigger if exists ghl_tag_metadata_set_updated_at on public.ghl_tag_metadata;
create trigger ghl_tag_metadata_set_updated_at before update on public.ghl_tag_metadata
for each row execute function public.set_updated_at();

alter table public.ghl_tag_metadata enable row level security;
alter table public.ghl_tag_metadata force row level security;

drop policy if exists "ghl_tag_metadata_select_assigned_location"
on public.ghl_tag_metadata;

create policy "ghl_tag_metadata_select_assigned_location"
on public.ghl_tag_metadata
for select
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "ghl_tag_metadata_insert_assigned_location"
on public.ghl_tag_metadata;

create policy "ghl_tag_metadata_insert_assigned_location"
on public.ghl_tag_metadata
for insert
to authenticated
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "ghl_tag_metadata_update_assigned_location"
on public.ghl_tag_metadata;

create policy "ghl_tag_metadata_update_assigned_location"
on public.ghl_tag_metadata
for update
to authenticated
using (public.can_access_location(location_id) or public.is_admin())
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "ghl_tag_metadata_delete_assigned_location"
on public.ghl_tag_metadata;

create policy "ghl_tag_metadata_delete_assigned_location"
on public.ghl_tag_metadata
for delete
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

revoke all on table public.ghl_tag_metadata from public, anon, authenticated;

grant select on table public.ghl_tag_metadata to authenticated;
grant insert (location_id, ghl_tag_id, tag_name)
  on table public.ghl_tag_metadata to authenticated;
grant update (tag_name, updated_at)
  on table public.ghl_tag_metadata to authenticated;
grant delete on table public.ghl_tag_metadata to authenticated;
grant all on table public.ghl_tag_metadata to service_role;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to service_role;

commit;
