begin;

create table if not exists public.lead_opportunities (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  lead_name text not null,
  status text not null default 'open',
  stage text not null default 'new',
  ghl_contact_id text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  ghl_pipeline_id text,
  ghl_pipeline_stage_id text,
  ghl_opportunity_id text,
  ghl_opportunity_name text,
  converted_case_id uuid references public.cases(id) on delete set null,
  converted_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists lead_opportunities_location_id_idx
  on public.lead_opportunities(location_id);

create index if not exists lead_opportunities_contact_id_idx
  on public.lead_opportunities(location_id, ghl_contact_id);

create index if not exists lead_opportunities_pipeline_idx
  on public.lead_opportunities(location_id, ghl_pipeline_id, ghl_pipeline_stage_id);

create index if not exists lead_opportunities_converted_case_idx
  on public.lead_opportunities(converted_case_id)
  where converted_case_id is not null;

drop trigger if exists lead_opportunities_set_updated_at on public.lead_opportunities;
create trigger lead_opportunities_set_updated_at before update on public.lead_opportunities
for each row execute function public.set_updated_at();

alter table public.lead_opportunities enable row level security;
alter table public.lead_opportunities force row level security;

drop policy if exists "lead_opportunities_select_assigned_location"
on public.lead_opportunities;

create policy "lead_opportunities_select_assigned_location"
on public.lead_opportunities
for select
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "lead_opportunities_insert_assigned_location"
on public.lead_opportunities;

create policy "lead_opportunities_insert_assigned_location"
on public.lead_opportunities
for insert
to authenticated
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "lead_opportunities_update_assigned_location"
on public.lead_opportunities;

create policy "lead_opportunities_update_assigned_location"
on public.lead_opportunities
for update
to authenticated
using (public.can_access_location(location_id) or public.is_admin())
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "lead_opportunities_delete_assigned_location"
on public.lead_opportunities;

create policy "lead_opportunities_delete_assigned_location"
on public.lead_opportunities
for delete
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

revoke all on table public.lead_opportunities from public, anon, authenticated;
grant select, insert, update, delete on table public.lead_opportunities to authenticated;
grant all on table public.lead_opportunities to service_role;

commit;
