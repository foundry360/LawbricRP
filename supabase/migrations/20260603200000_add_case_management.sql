-- Case management is Supabase-first. GHL stores only lightweight references
-- needed for contact context, communication, and automation.

begin;

create extension if not exists pgcrypto;

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

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_number text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  case_name text not null,
  case_type text not null default 'General',
  status text not null default 'open',
  stage text not null default 'intake',
  ghl_contact_id text not null,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  assigned_ghl_user_id text,
  ghl_case_record_id text,
  ghl_pipeline_id text,
  ghl_pipeline_stage_id text,
  opened_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint cases_status_check check (status in ('open', 'pending', 'closed', 'archived')),
  constraint cases_case_number_location_key unique (location_id, case_number)
);

create table if not exists public.case_parties (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  party_type text not null,
  role text,
  name text not null,
  email text,
  phone text,
  ghl_contact_id text,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.case_assignments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  assigned_user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner',
  is_primary boolean not null default false,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamp with time zone not null default now(),
  ended_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  constraint case_assignments_active_role_key unique (case_id, assigned_user_id, role)
);

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  event_type text not null default 'case',
  description text,
  start_at timestamp with time zone not null,
  end_at timestamp with time zone,
  status text not null default 'scheduled',
  ghl_calendar_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint case_events_status_check check (status in ('scheduled', 'completed', 'cancelled'))
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'normal',
  due_at timestamp with time zone,
  reminder_at timestamp with time zone,
  completed_at timestamp with time zone,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  template_key text,
  automation_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint tasks_status_check check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  constraint tasks_priority_check check (priority in ('low', 'normal', 'high', 'urgent'))
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  file_name text not null,
  document_type text not null default 'other',
  storage_bucket text not null default 'case-documents',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint documents_storage_path_key unique (storage_bucket, storage_path)
);

create table if not exists public.financials (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  entry_type text not null,
  status text not null default 'open',
  description text not null,
  amount_cents integer not null,
  currency text not null default 'USD',
  due_date date,
  paid_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint financials_entry_type_check check (entry_type in ('fee', 'expense', 'payment', 'refund', 'write_off')),
  constraint financials_status_check check (status in ('open', 'paid', 'void', 'overdue'))
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  body text not null,
  note_type text not null default 'case',
  is_pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists cases_location_id_idx on public.cases(location_id);
create index if not exists cases_ghl_contact_id_idx on public.cases(location_id, ghl_contact_id);
create index if not exists cases_status_stage_idx on public.cases(location_id, status, stage);
create index if not exists cases_assigned_user_id_idx on public.cases(assigned_user_id);

create index if not exists case_parties_case_id_idx on public.case_parties(case_id);
create index if not exists case_parties_location_id_idx on public.case_parties(location_id);
create index if not exists case_parties_ghl_contact_id_idx on public.case_parties(location_id, ghl_contact_id);

create index if not exists case_assignments_case_id_idx on public.case_assignments(case_id);
create index if not exists case_assignments_assigned_user_id_idx on public.case_assignments(assigned_user_id);
create index if not exists case_assignments_location_id_idx on public.case_assignments(location_id);

create index if not exists case_events_case_id_start_at_idx on public.case_events(case_id, start_at desc);
create index if not exists case_events_location_start_at_idx on public.case_events(location_id, start_at desc);

create index if not exists tasks_case_id_due_at_idx on public.tasks(case_id, due_at);
create index if not exists tasks_location_status_idx on public.tasks(location_id, status);
create index if not exists tasks_assigned_user_due_at_idx on public.tasks(assigned_user_id, due_at);

create index if not exists documents_case_id_idx on public.documents(case_id);
create index if not exists documents_location_id_idx on public.documents(location_id);

create index if not exists financials_case_id_idx on public.financials(case_id);
create index if not exists financials_location_status_idx on public.financials(location_id, status);

create index if not exists notes_case_id_created_at_idx on public.notes(case_id, created_at desc);
create index if not exists notes_location_id_idx on public.notes(location_id);

drop trigger if exists cases_set_updated_at on public.cases;
create trigger cases_set_updated_at before update on public.cases
for each row execute function public.set_updated_at();

drop trigger if exists case_parties_set_updated_at on public.case_parties;
create trigger case_parties_set_updated_at before update on public.case_parties
for each row execute function public.set_updated_at();

drop trigger if exists case_events_set_updated_at on public.case_events;
create trigger case_events_set_updated_at before update on public.case_events
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists financials_set_updated_at on public.financials;
create trigger financials_set_updated_at before update on public.financials
for each row execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at before update on public.notes
for each row execute function public.set_updated_at();

alter table public.cases enable row level security;
alter table public.case_parties enable row level security;
alter table public.case_assignments enable row level security;
alter table public.case_events enable row level security;
alter table public.tasks enable row level security;
alter table public.documents enable row level security;
alter table public.financials enable row level security;
alter table public.notes enable row level security;

alter table public.cases force row level security;
alter table public.case_parties force row level security;
alter table public.case_assignments force row level security;
alter table public.case_events force row level security;
alter table public.tasks force row level security;
alter table public.documents force row level security;
alter table public.financials force row level security;
alter table public.notes force row level security;

create policy "cases_select_location"
on public.cases for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

create policy "case_parties_select_location"
on public.case_parties for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

create policy "case_assignments_select_location"
on public.case_assignments for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

create policy "case_events_select_location"
on public.case_events for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

create policy "tasks_select_location"
on public.tasks for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

create policy "documents_select_location"
on public.documents for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

create policy "financials_select_location"
on public.financials for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

create policy "notes_select_location"
on public.notes for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

revoke all on table public.cases from public, anon, authenticated;
revoke all on table public.case_parties from public, anon, authenticated;
revoke all on table public.case_assignments from public, anon, authenticated;
revoke all on table public.case_events from public, anon, authenticated;
revoke all on table public.tasks from public, anon, authenticated;
revoke all on table public.documents from public, anon, authenticated;
revoke all on table public.financials from public, anon, authenticated;
revoke all on table public.notes from public, anon, authenticated;

grant select on table public.cases to authenticated;
grant select on table public.case_parties to authenticated;
grant select on table public.case_assignments to authenticated;
grant select on table public.case_events to authenticated;
grant select on table public.tasks to authenticated;
grant select on table public.documents to authenticated;
grant select on table public.financials to authenticated;
grant select on table public.notes to authenticated;

grant all on table public.cases to service_role;
grant all on table public.case_parties to service_role;
grant all on table public.case_assignments to service_role;
grant all on table public.case_events to service_role;
grant all on table public.tasks to service_role;
grant all on table public.documents to service_role;
grant all on table public.financials to service_role;
grant all on table public.notes to service_role;

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

create policy "case_documents_select_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'case-documents');

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to service_role;

commit;
