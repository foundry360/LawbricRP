-- Multi-tenant Supabase schema for a GHL-backed SaaS.
-- Trusted backend services should use the service role key. Never expose it to
-- GHL AI Studio, browsers, mobile clients, or any other untrusted runtime.

begin;

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer',
  created_at timestamp with time zone not null default now(),
  constraint profiles_role_check check (role in ('admin', 'agency_user', 'viewer'))
);

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone not null default now()
);

create table public.ghl_locations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  ghl_location_id text not null unique,
  name text not null,
  encrypted_api_key text,
  created_at timestamp with time zone not null default now()
);

comment on column public.ghl_locations.encrypted_api_key is
  'Encrypted GHL credential. Only trusted backend/service-role code may read this column.';

create table public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  constraint user_locations_user_location_key unique (user_id, location_id)
);

create index ghl_locations_agency_id_idx on public.ghl_locations(agency_id);
create index user_locations_user_id_idx on public.user_locations(user_id);
create index user_locations_location_id_idx on public.user_locations(location_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'viewer'
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_auth_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set email = new.email
   where id = new.id;

  return new;
end;
$$;

create or replace trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email_update();

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
  );
$$;

create or replace function public.can_access_location(location_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
  select exists (
    select 1
    from public.user_locations ul
    join public.ghl_locations gl on gl.id = ul.location_id
    where ul.user_id = auth.uid()
      and gl.agency_id = agency_uuid
  );
$$;

alter table public.profiles enable row level security;
alter table public.agencies enable row level security;
alter table public.ghl_locations enable row level security;
alter table public.user_locations enable row level security;

alter table public.profiles force row level security;
alter table public.agencies force row level security;
alter table public.ghl_locations force row level security;
alter table public.user_locations force row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "agencies_select_associated"
on public.agencies
for select
to authenticated
using (public.can_access_agency(id));

create policy "ghl_locations_select_assigned"
on public.ghl_locations
for select
to authenticated
using (public.can_access_location(id));

create policy "user_locations_select_own_or_admin"
on public.user_locations
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create or replace view public.user_accessible_locations
with (security_invoker = true)
as
select
  a.name as agency_name,
  gl.name as location_name,
  gl.ghl_location_id
from public.user_locations ul
join public.ghl_locations gl on gl.id = ul.location_id
join public.agencies a on a.id = gl.agency_id
where ul.user_id = auth.uid();

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.agencies from public, anon, authenticated;
revoke all on table public.ghl_locations from public, anon, authenticated;
revoke all on table public.user_locations from public, anon, authenticated;
revoke all on table public.user_accessible_locations from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select (id, email, full_name, role, created_at)
  on table public.profiles to authenticated;
grant update (full_name)
  on table public.profiles to authenticated;

grant select
  on table public.agencies to authenticated;

grant select (id, agency_id, ghl_location_id, name, created_at)
  on table public.ghl_locations to authenticated;

grant select
  on table public.user_locations to authenticated;

grant select
  on table public.user_accessible_locations to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.agencies to service_role;
grant all on table public.ghl_locations to service_role;
grant all on table public.user_locations to service_role;
grant all on table public.user_accessible_locations to service_role;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_auth_user_email_update() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_location(uuid) from public;
revoke all on function public.can_access_agency(uuid) from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_location(uuid) to authenticated;
grant execute on function public.can_access_agency(uuid) to authenticated;

commit;
