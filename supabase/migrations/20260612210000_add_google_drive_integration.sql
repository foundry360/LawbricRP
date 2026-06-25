begin;

insert into public.permissions (key, name, category, description)
values
  ('documents.manage_integrations', 'Manage Document Integrations', 'documents', 'Connect and disconnect external document storage integrations.')
on conflict (key) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key = 'documents.manage_integrations'
where roles.key in ('admin', 'managing_partner')
on conflict do nothing;

create table if not exists public.google_drive_integrations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  connected_by uuid references public.profiles(id) on delete set null,
  google_account_email text,
  root_folder_id text,
  root_folder_url text,
  shared_drive_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamp with time zone,
  scopes text[] not null default '{}'::text[],
  status text not null default 'connected',
  metadata jsonb not null default '{}'::jsonb,
  disconnected_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint google_drive_integrations_location_key unique (location_id),
  constraint google_drive_integrations_status_check check (status in ('connected', 'disconnected', 'error'))
);

create index if not exists google_drive_integrations_location_id_idx
on public.google_drive_integrations(location_id);

create table if not exists public.matter_drive_folders (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  drive_folder_id text not null,
  folder_name text not null,
  web_url text,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint matter_drive_folders_case_key unique (case_id)
);

create index if not exists matter_drive_folders_location_id_idx
on public.matter_drive_folders(location_id);

drop trigger if exists google_drive_integrations_set_updated_at on public.google_drive_integrations;
create trigger google_drive_integrations_set_updated_at before update on public.google_drive_integrations
for each row execute function public.set_updated_at();

drop trigger if exists matter_drive_folders_set_updated_at on public.matter_drive_folders;
create trigger matter_drive_folders_set_updated_at before update on public.matter_drive_folders
for each row execute function public.set_updated_at();

alter table public.google_drive_integrations enable row level security;
alter table public.google_drive_integrations force row level security;
alter table public.matter_drive_folders enable row level security;
alter table public.matter_drive_folders force row level security;

drop policy if exists "google_drive_integrations_select_assigned_location" on public.google_drive_integrations;
create policy "google_drive_integrations_select_assigned_location"
on public.google_drive_integrations
for select
to authenticated
using (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "matter_drive_folders_select_visible_matter" on public.matter_drive_folders;
create policy "matter_drive_folders_select_visible_matter"
on public.matter_drive_folders
for select
to authenticated
using (public.can_view_matter(case_id));

revoke all on table public.google_drive_integrations from public, anon, authenticated;
revoke all on table public.matter_drive_folders from public, anon, authenticated;

grant select (
  id,
  location_id,
  connected_by,
  google_account_email,
  root_folder_id,
  root_folder_url,
  shared_drive_id,
  token_expires_at,
  scopes,
  status,
  metadata,
  disconnected_at,
  created_at,
  updated_at
) on table public.google_drive_integrations to authenticated;

grant select on table public.matter_drive_folders to authenticated;
grant all on table public.google_drive_integrations to service_role;
grant all on table public.matter_drive_folders to service_role;

commit;
