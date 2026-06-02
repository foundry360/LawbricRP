-- Adds app-level deactivation state and tightens RLS helpers so inactive users
-- cannot continue accessing tenant data with an existing session.

begin;

alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamp with time zone,
  add column if not exists deactivated_by uuid references public.profiles(id),
  add column if not exists deactivation_reason text;

create index if not exists profiles_is_active_idx on public.profiles(is_active);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.can_access_location(location_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.user_locations
      where user_id = auth.uid()
        and location_id = location_uuid
    );
$$;

create or replace function public.can_access_agency(agency_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.user_locations ul
      join public.ghl_locations gl on gl.id = ul.location_id
      where ul.user_id = auth.uid()
        and gl.agency_id = agency_uuid
    );
$$;

drop policy if exists "profiles_select_admin" on public.profiles;

create policy "profiles_select_admin"
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid() and public.is_active_user())
with check (id = auth.uid() and public.is_active_user());

drop policy if exists "user_locations_select_own_or_admin" on public.user_locations;

create policy "user_locations_select_own_or_admin"
on public.user_locations
for select
to authenticated
using (
  (user_id = auth.uid() and public.is_active_user())
  or public.is_admin()
);

grant select (
  id,
  email,
  full_name,
  role,
  is_active,
  deactivated_at,
  deactivated_by,
  deactivation_reason,
  created_at
) on table public.profiles to authenticated;

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;

commit;
