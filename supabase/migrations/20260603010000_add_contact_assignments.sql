-- Stores app-level contact assignments to Supabase users without relying on
-- GHL native user ownership. GHL contacts remain the system of record for the
-- contact itself; this table stores Lawbric-specific assignment metadata.

begin;

create table if not exists public.contact_assignments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  ghl_contact_id text not null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint contact_assignments_location_contact_key unique (location_id, ghl_contact_id)
);

create index if not exists contact_assignments_location_id_idx
  on public.contact_assignments(location_id);

create index if not exists contact_assignments_assigned_user_id_idx
  on public.contact_assignments(assigned_user_id);

alter table public.contact_assignments enable row level security;
alter table public.contact_assignments force row level security;

drop policy if exists "contact_assignments_select_assigned_location"
on public.contact_assignments;

create policy "contact_assignments_select_assigned_location"
on public.contact_assignments
for select
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_assignments_insert_assigned_location"
on public.contact_assignments;

create policy "contact_assignments_insert_assigned_location"
on public.contact_assignments
for insert
to authenticated
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_assignments_update_assigned_location"
on public.contact_assignments;

create policy "contact_assignments_update_assigned_location"
on public.contact_assignments
for update
to authenticated
using (public.can_access_location(location_id) or public.is_admin())
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_assignments_delete_assigned_location"
on public.contact_assignments;

create policy "contact_assignments_delete_assigned_location"
on public.contact_assignments
for delete
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

revoke all on table public.contact_assignments from public, anon, authenticated;

grant select on table public.contact_assignments to authenticated;
grant insert (location_id, ghl_contact_id, assigned_user_id)
  on table public.contact_assignments to authenticated;
grant update (assigned_user_id, updated_at)
  on table public.contact_assignments to authenticated;
grant delete on table public.contact_assignments to authenticated;
grant all on table public.contact_assignments to service_role;

commit;
