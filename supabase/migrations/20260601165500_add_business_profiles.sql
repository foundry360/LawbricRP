-- Business profile settings for each GHL location/subaccount.

begin;

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  business_name text not null,
  address text,
  website_url text,
  phone text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  updated_by uuid references public.profiles(id),
  constraint business_profiles_location_key unique (location_id)
);

create index if not exists business_profiles_agency_id_idx
  on public.business_profiles(agency_id);

alter table public.business_profiles enable row level security;
alter table public.business_profiles force row level security;

drop policy if exists "business_profiles_select_assigned_or_admin"
on public.business_profiles;

create policy "business_profiles_select_assigned_or_admin"
on public.business_profiles
for select
to authenticated
using (
  public.is_admin()
  or public.can_access_location(location_id)
);

drop policy if exists "agencies_select_associated"
on public.agencies;

create policy "agencies_select_associated"
on public.agencies
for select
to authenticated
using (
  public.is_admin()
  or public.can_access_agency(id)
);

drop policy if exists "ghl_locations_select_assigned"
on public.ghl_locations;

create policy "ghl_locations_select_assigned"
on public.ghl_locations
for select
to authenticated
using (
  public.is_admin()
  or public.can_access_location(id)
);

revoke all on table public.business_profiles from public, anon, authenticated;

grant select (
  id,
  agency_id,
  location_id,
  business_name,
  address,
  website_url,
  phone,
  created_at,
  updated_at,
  updated_by
) on table public.business_profiles to authenticated;

grant all on table public.business_profiles to service_role;

commit;
