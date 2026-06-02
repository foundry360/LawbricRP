-- Maps Supabase users to GHL staff/user accounts created through the admin
-- provisioning flow.

begin;

create table if not exists public.ghl_user_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  ghl_user_id text not null,
  email text not null,
  status text not null default 'active',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ghl_user_accounts_status_check
    check (status in ('pending', 'active', 'failed', 'deactivated')),
  constraint ghl_user_accounts_user_agency_key unique (user_id, agency_id),
  constraint ghl_user_accounts_agency_ghl_user_key unique (agency_id, ghl_user_id)
);

create index if not exists ghl_user_accounts_user_id_idx
  on public.ghl_user_accounts(user_id);

create index if not exists ghl_user_accounts_agency_id_idx
  on public.ghl_user_accounts(agency_id);

alter table public.ghl_user_accounts enable row level security;
alter table public.ghl_user_accounts force row level security;

drop policy if exists "ghl_user_accounts_select_own_or_admin"
on public.ghl_user_accounts;

create policy "ghl_user_accounts_select_own_or_admin"
on public.ghl_user_accounts
for select
to authenticated
using (
  (user_id = auth.uid() and public.is_active_user())
  or public.is_admin()
);

revoke all on table public.ghl_user_accounts from public, anon, authenticated;

grant select (
  id,
  user_id,
  agency_id,
  ghl_user_id,
  email,
  status,
  created_at,
  updated_at
) on table public.ghl_user_accounts to authenticated;

grant all on table public.ghl_user_accounts to service_role;

commit;
