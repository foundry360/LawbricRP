begin;

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists title text,
  add column if not exists status text not null default 'active',
  add column if not exists office_location text,
  add column if not exists reports_to uuid references public.profiles(id) on delete set null,
  add column if not exists team_department text,
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active', 'inactive', 'contract'));

create index if not exists profiles_reports_to_idx on public.profiles(reports_to);
create index if not exists profiles_status_idx on public.profiles(status);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null unique,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null unique,
  category text not null default 'general',
  description text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamp with time zone not null default now(),
  primary key (user_id, role_id)
);

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect text not null default 'grant',
  reason text,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamp with time zone not null default now(),
  primary key (user_id, permission_id),
  constraint user_permissions_effect_check check (effect in ('grant', 'deny'))
);

create table if not exists public.user_permission_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid references public.permissions(id) on delete set null,
  old_effect text,
  new_effect text,
  action text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.matter_role_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null unique,
  description text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.user_matter_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  matter_role_type_id uuid not null references public.matter_role_types(id) on delete cascade,
  assigned_at timestamp with time zone not null default now(),
  primary key (user_id, matter_role_type_id)
);

create table if not exists public.user_practice_areas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  practice_area text not null,
  assigned_at timestamp with time zone not null default now(),
  primary key (user_id, practice_area)
);

create table if not exists public.user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bar_number text,
  jurisdiction text,
  admission_date date,
  certifications text[] not null default '{}'::text[],
  licenses text[] not null default '{}'::text[],
  malpractice_provider text,
  malpractice_policy_number text,
  malpractice_expiration date,
  conflict_check_status boolean not null default false,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_bucket text not null default 'user-documents',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  expires_at date,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint user_documents_storage_path_key unique (storage_bucket, storage_path)
);

create table if not exists public.user_system_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_status text not null default 'active',
  mfa_enabled boolean not null default false,
  last_login_at timestamp with time zone,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamp with time zone not null default now(),
  constraint user_system_access_account_status_check check (account_status in ('active', 'suspended', 'locked'))
);

create index if not exists role_permissions_permission_id_idx on public.role_permissions(permission_id);
create index if not exists user_roles_role_id_idx on public.user_roles(role_id);
create index if not exists user_permissions_permission_id_idx on public.user_permissions(permission_id);
create index if not exists user_matter_roles_role_type_idx on public.user_matter_roles(matter_role_type_id);
create index if not exists user_credentials_user_id_idx on public.user_credentials(user_id);
create index if not exists user_credentials_malpractice_expiration_idx on public.user_credentials(malpractice_expiration)
  where malpractice_expiration is not null;
create index if not exists user_documents_user_id_idx on public.user_documents(user_id);
create index if not exists user_documents_expires_at_idx on public.user_documents(expires_at)
  where expires_at is not null;

drop trigger if exists roles_set_updated_at on public.roles;
create trigger roles_set_updated_at before update on public.roles
for each row execute function public.set_updated_at();

drop trigger if exists user_credentials_set_updated_at on public.user_credentials;
create trigger user_credentials_set_updated_at before update on public.user_credentials
for each row execute function public.set_updated_at();

drop trigger if exists user_documents_set_updated_at on public.user_documents;
create trigger user_documents_set_updated_at before update on public.user_documents
for each row execute function public.set_updated_at();

drop trigger if exists user_system_access_set_updated_at on public.user_system_access;
create trigger user_system_access_set_updated_at before update on public.user_system_access
for each row execute function public.set_updated_at();

insert into public.roles (key, name, description)
values
  ('admin', 'Admin', 'Full access to all users and permissions.'),
  ('managing_partner', 'Managing Partner', 'Can manage attorney profiles and compliance.'),
  ('attorney', 'Attorney', 'Can view and maintain their own profile.'),
  ('staff', 'Staff', 'Can view limited profile identity fields.')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.permissions (key, name, category, description)
values
  ('user_profiles.view_limited', 'View Limited User Profiles', 'users', 'View non-sensitive identity fields.'),
  ('user_profiles.view_all', 'View All User Profiles', 'users', 'View full profile details for all users.'),
  ('user_profiles.view_attorneys', 'View Attorney Profiles', 'users', 'View full profile details for attorney users.'),
  ('user_profiles.edit_own', 'Edit Own User Profile', 'users', 'Edit own non-sensitive profile fields.'),
  ('user_profiles.edit_all', 'Edit All User Profiles', 'users', 'Edit profile fields for all users.'),
  ('user_profiles.edit_attorneys', 'Edit Attorney Profiles', 'users', 'Edit profile fields for attorney users.'),
  ('user_roles.manage', 'Manage User Roles', 'permissions', 'Assign and remove user roles.'),
  ('permissions.manage', 'Manage Permissions', 'permissions', 'Manage role permissions and user overrides.'),
  ('user_credentials.manage', 'Manage User Credentials', 'compliance', 'Manage bar, license, and compliance data.'),
  ('user_documents.manage', 'Manage User Documents', 'compliance', 'Manage user compliance document uploads.'),
  ('system_access.manage', 'Manage System Access', 'system', 'Manage account status and access metadata.'),
  ('matters.view_own', 'View Own Matters', 'matters', 'View matters where the user is the owner or creator.'),
  ('matters.view_assigned', 'View Assigned Matters', 'matters', 'View matters assigned to the user.'),
  ('matters.view_all', 'View All Matters', 'matters', 'View every matter available to the firm.'),
  ('matters.create', 'Create Matters', 'matters', 'Create new matters.'),
  ('matters.edit', 'Edit Matters', 'matters', 'Update matter details, stage, and status.'),
  ('matters.delete', 'Delete Matters', 'matters', 'Delete matters from the system.'),
  ('matters.assign', 'Assign Matters', 'matters', 'Assign lead, source, and other matter responsibilities.'),
  ('contacts.view_assigned', 'View Assigned Contacts', 'contacts', 'View contacts assigned to the user.'),
  ('contacts.view_location', 'View Location Contacts', 'contacts', 'View contacts within assigned locations.'),
  ('contacts.view_all', 'View All Contacts', 'contacts', 'View every contact available to the firm.'),
  ('contacts.create', 'Create Contacts', 'contacts', 'Create new contacts.'),
  ('contacts.edit', 'Edit Contacts', 'contacts', 'Update contact details.'),
  ('contacts.delete', 'Delete Contacts', 'contacts', 'Delete contacts from the system.'),
  ('leads.view_assigned', 'View Assigned Leads', 'leads', 'View leads assigned to the user.'),
  ('leads.view_all', 'View All Leads', 'leads', 'View every lead available to the firm.'),
  ('leads.create', 'Create Leads', 'leads', 'Create new leads.'),
  ('leads.edit', 'Edit Leads', 'leads', 'Update lead details and pipeline stage.'),
  ('leads.convert', 'Convert Leads', 'leads', 'Convert leads into matters.'),
  ('leads.delete', 'Delete Leads', 'leads', 'Delete leads from the system.'),
  ('dashboards.view', 'View Dashboards', 'dashboards', 'Access operational dashboards.'),
  ('dashboards.view_team', 'View Team Dashboards', 'dashboards', 'Access team-level dashboard data.'),
  ('dashboards.view_financials', 'View Financial Dashboards', 'dashboards', 'Access financial dashboard widgets.'),
  ('dashboards.manage', 'Manage Dashboards', 'dashboards', 'Configure dashboard views and widgets.')
on conflict (key) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key = any (
  case roles.key
    when 'admin' then array[
      'user_profiles.view_limited',
      'user_profiles.view_all',
      'user_profiles.view_attorneys',
      'user_profiles.edit_own',
      'user_profiles.edit_all',
      'user_profiles.edit_attorneys',
      'user_roles.manage',
      'permissions.manage',
      'user_credentials.manage',
      'user_documents.manage',
      'system_access.manage',
      'matters.view_own',
      'matters.view_assigned',
      'matters.view_all',
      'matters.create',
      'matters.edit',
      'matters.delete',
      'matters.assign',
      'contacts.view_assigned',
      'contacts.view_location',
      'contacts.view_all',
      'contacts.create',
      'contacts.edit',
      'contacts.delete',
      'leads.view_assigned',
      'leads.view_all',
      'leads.create',
      'leads.edit',
      'leads.convert',
      'leads.delete',
      'dashboards.view',
      'dashboards.view_team',
      'dashboards.view_financials',
      'dashboards.manage'
    ]
    when 'managing_partner' then array[
      'user_profiles.view_limited',
      'user_profiles.view_attorneys',
      'user_profiles.edit_attorneys',
      'user_credentials.manage',
      'user_documents.manage',
      'matters.view_assigned',
      'matters.view_all',
      'matters.create',
      'matters.edit',
      'matters.assign',
      'contacts.view_location',
      'contacts.view_all',
      'contacts.create',
      'contacts.edit',
      'leads.view_all',
      'leads.create',
      'leads.edit',
      'leads.convert',
      'dashboards.view',
      'dashboards.view_team'
    ]
    when 'attorney' then array[
      'user_profiles.view_limited',
      'user_profiles.edit_own',
      'matters.view_own',
      'matters.view_assigned',
      'matters.create',
      'matters.edit',
      'contacts.view_assigned',
      'contacts.create',
      'contacts.edit',
      'leads.view_assigned',
      'leads.create',
      'leads.convert',
      'dashboards.view'
    ]
    when 'staff' then array[
      'user_profiles.view_limited',
      'matters.view_assigned',
      'contacts.view_assigned',
      'contacts.create',
      'leads.view_assigned',
      'dashboards.view'
    ]
    else array[]::text[]
  end
)
on conflict do nothing;

insert into public.matter_role_types (key, name, description)
values
  ('lead_attorney', 'Lead / Responsible Attorney', 'Primary attorney responsible for a matter.'),
  ('originating_attorney', 'Originating Attorney', 'Attorney credited with originating the matter.'),
  ('billing_attorney', 'Billing Attorney', 'Attorney responsible for billing oversight.')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.user_roles (user_id, role_id)
select profiles.id, roles.id
from public.profiles
join public.roles on roles.key = case when profiles.role = 'admin' then 'admin' else 'staff' end
on conflict do nothing;

insert into public.user_system_access (user_id, account_status)
select id, case when is_active then 'active' else 'suspended' end
from public.profiles
on conflict (user_id) do nothing;

create or replace function public.user_has_role(target_user_id uuid, role_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = target_user_id
      and r.key = role_key
  );
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and (
      public.is_admin()
      or (
        not exists (
          select 1
          from public.user_permissions up
          join public.permissions p on p.id = up.permission_id
          where up.user_id = auth.uid()
            and p.key = permission_key
            and up.effect = 'deny'
        )
        and (
          exists (
            select 1
            from public.user_permissions up
            join public.permissions p on p.id = up.permission_id
            where up.user_id = auth.uid()
              and p.key = permission_key
              and up.effect = 'grant'
          )
          or exists (
            select 1
            from public.user_roles ur
            join public.role_permissions rp on rp.role_id = ur.role_id
            join public.permissions p on p.id = rp.permission_id
            where ur.user_id = auth.uid()
              and p.key = permission_key
          )
        )
      )
    );
$$;

create or replace function public.can_view_user_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and exists (select 1 from public.profiles where id = target_user_id)
    and (
      public.is_admin()
      or target_user_id = auth.uid()
      or public.has_permission('user_profiles.view_all')
      or public.has_permission('user_profiles.view_limited')
      or (
        public.has_permission('user_profiles.view_attorneys')
        and public.user_has_role(target_user_id, 'attorney')
      )
    );
$$;

create or replace function public.can_edit_user_profile(target_user_id uuid, section text default 'core')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and exists (select 1 from public.profiles where id = target_user_id)
    and (
      public.is_admin()
      or public.has_permission('user_profiles.edit_all')
      or (
        section = 'core'
        and target_user_id = auth.uid()
        and public.has_permission('user_profiles.edit_own')
      )
      or (
        section in ('core', 'credentials', 'documents')
        and public.has_permission('user_profiles.edit_attorneys')
        and public.user_has_role(target_user_id, 'attorney')
      )
      or (
        section = 'roles'
        and public.has_permission('user_roles.manage')
      )
      or (
        section = 'permissions'
        and public.has_permission('permissions.manage')
      )
      or (
        section = 'credentials'
        and public.has_permission('user_credentials.manage')
      )
      or (
        section = 'documents'
        and public.has_permission('user_documents.manage')
      )
      or (
        section = 'system_access'
        and public.has_permission('system_access.manage')
      )
    );
$$;

create or replace function public.get_user_profile_access(target_user_id uuid)
returns table (
  can_view boolean,
  can_edit_core boolean,
  can_edit_roles boolean,
  can_edit_credentials boolean,
  can_edit_documents boolean,
  can_edit_system_access boolean,
  can_manage_permissions boolean,
  is_limited_view boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_view_user_profile(target_user_id) as can_view,
    public.can_edit_user_profile(target_user_id, 'core') as can_edit_core,
    public.can_edit_user_profile(target_user_id, 'roles') as can_edit_roles,
    public.can_edit_user_profile(target_user_id, 'credentials') as can_edit_credentials,
    public.can_edit_user_profile(target_user_id, 'documents') as can_edit_documents,
    public.can_edit_user_profile(target_user_id, 'system_access') as can_edit_system_access,
    public.has_permission('permissions.manage') as can_manage_permissions,
    (
      public.can_view_user_profile(target_user_id)
      and not public.is_admin()
      and not public.has_permission('user_profiles.view_all')
      and not (
        public.has_permission('user_profiles.view_attorneys')
        and public.user_has_role(target_user_id, 'attorney')
      )
      and target_user_id <> auth.uid()
    ) as is_limited_view;
$$;

create or replace function public.storage_object_owner_uuid(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  owner_text text;
begin
  owner_text := (storage.foldername(object_name))[1];
  return owner_text::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.audit_user_permission_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_permission_audit_log (
      user_id,
      permission_id,
      new_effect,
      action,
      changed_by,
      metadata
    )
    values (new.user_id, new.permission_id, new.effect, 'insert', auth.uid(), jsonb_build_object('reason', new.reason));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.user_permission_audit_log (
      user_id,
      permission_id,
      old_effect,
      new_effect,
      action,
      changed_by,
      metadata
    )
    values (new.user_id, new.permission_id, old.effect, new.effect, 'update', auth.uid(), jsonb_build_object('reason', new.reason));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.user_permission_audit_log (
      user_id,
      permission_id,
      old_effect,
      action,
      changed_by,
      metadata
    )
    values (old.user_id, old.permission_id, old.effect, 'delete', auth.uid(), jsonb_build_object('reason', old.reason));
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists user_permission_override_audit on public.user_permissions;
create trigger user_permission_override_audit
after insert or update or delete on public.user_permissions
for each row execute function public.audit_user_permission_override();

create or replace view public.user_compliance_expiration_alerts
with (security_invoker = true)
as
select
  'malpractice_policy'::text as alert_type,
  uc.user_id,
  uc.id as source_id,
  uc.malpractice_expiration as expires_at,
  uc.malpractice_provider as title,
  case
    when uc.malpractice_expiration < current_date then 'expired'
    when uc.malpractice_expiration <= current_date + interval '30 days' then 'due_soon'
    else 'upcoming'
  end as status
from public.user_credentials uc
where uc.malpractice_expiration is not null
union all
select
  ud.document_type as alert_type,
  ud.user_id,
  ud.id as source_id,
  ud.expires_at,
  ud.file_name as title,
  case
    when ud.expires_at < current_date then 'expired'
    when ud.expires_at <= current_date + interval '30 days' then 'due_soon'
    else 'upcoming'
  end as status
from public.user_documents ud
where ud.expires_at is not null;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.user_permission_audit_log enable row level security;
alter table public.matter_role_types enable row level security;
alter table public.user_matter_roles enable row level security;
alter table public.user_practice_areas enable row level security;
alter table public.user_credentials enable row level security;
alter table public.user_documents enable row level security;
alter table public.user_system_access enable row level security;

alter table public.roles force row level security;
alter table public.permissions force row level security;
alter table public.role_permissions force row level security;
alter table public.user_roles force row level security;
alter table public.user_permissions force row level security;
alter table public.user_permission_audit_log force row level security;
alter table public.matter_role_types force row level security;
alter table public.user_matter_roles force row level security;
alter table public.user_practice_areas force row level security;
alter table public.user_credentials force row level security;
alter table public.user_documents force row level security;
alter table public.user_system_access force row level security;

drop policy if exists "profiles_select_rbac" on public.profiles;
create policy "profiles_select_rbac"
on public.profiles for select to authenticated
using (public.can_view_user_profile(id));

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_rbac_core" on public.profiles;
create policy "profiles_update_rbac_core"
on public.profiles for update to authenticated
using (public.can_edit_user_profile(id, 'core'))
with check (public.can_edit_user_profile(id, 'core'));

drop policy if exists "roles_select_active" on public.roles;
create policy "roles_select_active"
on public.roles for select to authenticated
using (public.is_active_user());

drop policy if exists "permissions_select_active" on public.permissions;
create policy "permissions_select_active"
on public.permissions for select to authenticated
using (public.is_active_user());

drop policy if exists "role_permissions_select_active" on public.role_permissions;
create policy "role_permissions_select_active"
on public.role_permissions for select to authenticated
using (public.is_active_user());

drop policy if exists "user_roles_select_profile_access" on public.user_roles;
create policy "user_roles_select_profile_access"
on public.user_roles for select to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or public.has_permission('user_profiles.view_all')
  or (
    public.has_permission('user_profiles.view_attorneys')
    and public.user_has_role(user_id, 'attorney')
  )
);

drop policy if exists "user_roles_write_manage" on public.user_roles;
create policy "user_roles_write_manage"
on public.user_roles for all to authenticated
using (public.can_edit_user_profile(user_id, 'roles'))
with check (public.can_edit_user_profile(user_id, 'roles'));

drop policy if exists "user_permissions_select_manage_or_own" on public.user_permissions;
create policy "user_permissions_select_manage_or_own"
on public.user_permissions for select to authenticated
using (public.has_permission('permissions.manage') or user_id = auth.uid());

drop policy if exists "user_permissions_write_manage" on public.user_permissions;
create policy "user_permissions_write_manage"
on public.user_permissions for all to authenticated
using (public.can_edit_user_profile(user_id, 'permissions'))
with check (public.can_edit_user_profile(user_id, 'permissions'));

drop policy if exists "user_permission_audit_select_manage" on public.user_permission_audit_log;
create policy "user_permission_audit_select_manage"
on public.user_permission_audit_log for select to authenticated
using (public.has_permission('permissions.manage'));

drop policy if exists "matter_role_types_select_active" on public.matter_role_types;
create policy "matter_role_types_select_active"
on public.matter_role_types for select to authenticated
using (public.is_active_user());

drop policy if exists "user_matter_roles_select_profile_access" on public.user_matter_roles;
create policy "user_matter_roles_select_profile_access"
on public.user_matter_roles for select to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or public.has_permission('user_profiles.view_all')
  or (
    public.has_permission('user_profiles.view_attorneys')
    and public.user_has_role(user_id, 'attorney')
  )
);

drop policy if exists "user_matter_roles_write_roles" on public.user_matter_roles;
create policy "user_matter_roles_write_roles"
on public.user_matter_roles for all to authenticated
using (public.can_edit_user_profile(user_id, 'roles'))
with check (public.can_edit_user_profile(user_id, 'roles'));

drop policy if exists "user_practice_areas_select_profile_access" on public.user_practice_areas;
create policy "user_practice_areas_select_profile_access"
on public.user_practice_areas for select to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or public.has_permission('user_profiles.view_all')
  or (
    public.has_permission('user_profiles.view_attorneys')
    and public.user_has_role(user_id, 'attorney')
  )
);

drop policy if exists "user_practice_areas_write_roles" on public.user_practice_areas;
create policy "user_practice_areas_write_roles"
on public.user_practice_areas for all to authenticated
using (public.can_edit_user_profile(user_id, 'roles'))
with check (public.can_edit_user_profile(user_id, 'roles'));

drop policy if exists "user_credentials_select_profile_access" on public.user_credentials;
create policy "user_credentials_select_profile_access"
on public.user_credentials for select to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or public.has_permission('user_profiles.view_all')
  or (
    public.has_permission('user_profiles.view_attorneys')
    and public.user_has_role(user_id, 'attorney')
  )
);

drop policy if exists "user_credentials_write_manage" on public.user_credentials;
create policy "user_credentials_write_manage"
on public.user_credentials for all to authenticated
using (public.can_edit_user_profile(user_id, 'credentials'))
with check (public.can_edit_user_profile(user_id, 'credentials'));

drop policy if exists "user_documents_select_profile_access" on public.user_documents;
create policy "user_documents_select_profile_access"
on public.user_documents for select to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or public.has_permission('user_profiles.view_all')
  or (
    public.has_permission('user_profiles.view_attorneys')
    and public.user_has_role(user_id, 'attorney')
  )
);

drop policy if exists "user_documents_write_manage" on public.user_documents;
create policy "user_documents_write_manage"
on public.user_documents for all to authenticated
using (public.can_edit_user_profile(user_id, 'documents'))
with check (public.can_edit_user_profile(user_id, 'documents'));

drop policy if exists "user_system_access_select_manage_or_own" on public.user_system_access;
create policy "user_system_access_select_manage_or_own"
on public.user_system_access for select to authenticated
using (public.can_edit_user_profile(user_id, 'system_access') or user_id = auth.uid());

drop policy if exists "user_system_access_write_manage" on public.user_system_access;
create policy "user_system_access_write_manage"
on public.user_system_access for all to authenticated
using (public.can_edit_user_profile(user_id, 'system_access'))
with check (public.can_edit_user_profile(user_id, 'system_access'));

revoke all on table public.roles from public, anon, authenticated;
revoke all on table public.permissions from public, anon, authenticated;
revoke all on table public.role_permissions from public, anon, authenticated;
revoke all on table public.user_roles from public, anon, authenticated;
revoke all on table public.user_permissions from public, anon, authenticated;
revoke all on table public.user_permission_audit_log from public, anon, authenticated;
revoke all on table public.matter_role_types from public, anon, authenticated;
revoke all on table public.user_matter_roles from public, anon, authenticated;
revoke all on table public.user_practice_areas from public, anon, authenticated;
revoke all on table public.user_credentials from public, anon, authenticated;
revoke all on table public.user_documents from public, anon, authenticated;
revoke all on table public.user_system_access from public, anon, authenticated;
revoke all on table public.user_compliance_expiration_alerts from public, anon, authenticated;

grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;
grant select, insert, delete on table public.user_roles to authenticated;
grant select, insert, update, delete on table public.user_permissions to authenticated;
grant select on table public.user_permission_audit_log to authenticated;
grant select on table public.matter_role_types to authenticated;
grant select, insert, delete on table public.user_matter_roles to authenticated;
grant select, insert, delete on table public.user_practice_areas to authenticated;
grant select, insert, update, delete on table public.user_credentials to authenticated;
grant select, insert, update, delete on table public.user_documents to authenticated;
grant select, insert, update on table public.user_system_access to authenticated;
grant select on table public.user_compliance_expiration_alerts to authenticated;

grant select (
  title,
  status,
  office_location,
  reports_to,
  team_department,
  updated_at
) on table public.profiles to authenticated;

grant update (
  full_name,
  phone,
  title,
  status,
  office_location,
  reports_to,
  team_department,
  updated_at
) on table public.profiles to authenticated;

grant all on table public.roles to service_role;
grant all on table public.permissions to service_role;
grant all on table public.role_permissions to service_role;
grant all on table public.user_roles to service_role;
grant all on table public.user_permissions to service_role;
grant all on table public.user_permission_audit_log to service_role;
grant all on table public.matter_role_types to service_role;
grant all on table public.user_matter_roles to service_role;
grant all on table public.user_practice_areas to service_role;
grant all on table public.user_credentials to service_role;
grant all on table public.user_documents to service_role;
grant all on table public.user_system_access to service_role;
grant all on table public.user_compliance_expiration_alerts to service_role;

insert into storage.buckets (id, name, public)
values ('user-documents', 'user-documents', false)
on conflict (id) do nothing;

drop policy if exists "user_documents_storage_select" on storage.objects;
create policy "user_documents_storage_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'user-documents'
  and public.can_view_user_profile(public.storage_object_owner_uuid(name))
);

drop policy if exists "user_documents_storage_insert" on storage.objects;
create policy "user_documents_storage_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'user-documents'
  and public.can_edit_user_profile(public.storage_object_owner_uuid(name), 'documents')
);

drop policy if exists "user_documents_storage_update" on storage.objects;
create policy "user_documents_storage_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'user-documents'
  and public.can_edit_user_profile(public.storage_object_owner_uuid(name), 'documents')
)
with check (
  bucket_id = 'user-documents'
  and public.can_edit_user_profile(public.storage_object_owner_uuid(name), 'documents')
);

drop policy if exists "user_documents_storage_delete" on storage.objects;
create policy "user_documents_storage_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'user-documents'
  and public.can_edit_user_profile(public.storage_object_owner_uuid(name), 'documents')
);

revoke all on function public.user_has_role(uuid, text) from public;
revoke all on function public.has_permission(text) from public;
revoke all on function public.can_view_user_profile(uuid) from public;
revoke all on function public.can_edit_user_profile(uuid, text) from public;
revoke all on function public.get_user_profile_access(uuid) from public;
revoke all on function public.storage_object_owner_uuid(text) from public;
revoke all on function public.audit_user_permission_override() from public;

grant execute on function public.user_has_role(uuid, text) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.can_view_user_profile(uuid) to authenticated;
grant execute on function public.can_edit_user_profile(uuid, text) to authenticated;
grant execute on function public.get_user_profile_access(uuid) to authenticated;
grant execute on function public.storage_object_owner_uuid(text) to authenticated;

commit;
