begin;

create table if not exists public.contact_relationships (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  source_ghl_contact_id text not null,
  related_ghl_contact_id text not null,
  relationship_type text not null default 'Related',
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint contact_relationships_no_self_link check (source_ghl_contact_id <> related_ghl_contact_id),
  constraint contact_relationships_source_related_key unique (location_id, source_ghl_contact_id, related_ghl_contact_id)
);

create index if not exists contact_relationships_location_source_idx
  on public.contact_relationships(location_id, source_ghl_contact_id);

create index if not exists contact_relationships_location_related_idx
  on public.contact_relationships(location_id, related_ghl_contact_id);

drop trigger if exists contact_relationships_set_updated_at on public.contact_relationships;
create trigger contact_relationships_set_updated_at before update on public.contact_relationships
for each row execute function public.set_updated_at();

alter table public.contact_relationships enable row level security;
alter table public.contact_relationships force row level security;

drop policy if exists "contact_relationships_select_assigned_location"
on public.contact_relationships;

create policy "contact_relationships_select_assigned_location"
on public.contact_relationships
for select
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_relationships_insert_assigned_location"
on public.contact_relationships;

create policy "contact_relationships_insert_assigned_location"
on public.contact_relationships
for insert
to authenticated
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_relationships_update_assigned_location"
on public.contact_relationships;

create policy "contact_relationships_update_assigned_location"
on public.contact_relationships
for update
to authenticated
using (public.can_access_location(location_id) or public.is_admin())
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_relationships_delete_assigned_location"
on public.contact_relationships;

create policy "contact_relationships_delete_assigned_location"
on public.contact_relationships
for delete
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

revoke all on table public.contact_relationships from public, anon, authenticated;

grant select on table public.contact_relationships to authenticated;
grant insert (
  location_id,
  source_ghl_contact_id,
  related_ghl_contact_id,
  relationship_type,
  notes
) on table public.contact_relationships to authenticated;
grant update (
  relationship_type,
  notes,
  updated_at
) on table public.contact_relationships to authenticated;
grant delete on table public.contact_relationships to authenticated;
grant all on table public.contact_relationships to service_role;

commit;
