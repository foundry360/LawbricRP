begin;

alter table public.cases
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.case_parties
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.case_assignments
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.case_events
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.tasks
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.documents
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.financials
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.notes
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.case_communications
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.lead_opportunities
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.contact_notes
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.contact_assignments
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

alter table public.contact_relationships
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists delete_reason text;

create index if not exists cases_not_deleted_idx on public.cases(location_id, updated_at desc) where deleted_at is null;
create index if not exists tasks_not_deleted_idx on public.tasks(location_id, due_at) where deleted_at is null;
create index if not exists documents_not_deleted_idx on public.documents(location_id, created_at desc) where deleted_at is null;
create index if not exists notes_not_deleted_idx on public.notes(location_id, created_at desc) where deleted_at is null;
create index if not exists case_communications_not_deleted_idx on public.case_communications(location_id, occurred_at desc) where deleted_at is null;
create index if not exists lead_opportunities_not_deleted_idx on public.lead_opportunities(location_id, updated_at desc) where deleted_at is null;
create index if not exists contact_notes_not_deleted_idx on public.contact_notes(location_id, ghl_contact_id, created_at desc) where deleted_at is null;
create index if not exists contact_assignments_not_deleted_idx on public.contact_assignments(location_id, ghl_contact_id) where deleted_at is null;
create index if not exists contact_relationships_not_deleted_source_idx on public.contact_relationships(location_id, source_ghl_contact_id) where deleted_at is null;
create index if not exists contact_relationships_not_deleted_related_idx on public.contact_relationships(location_id, related_ghl_contact_id) where deleted_at is null;

grant select (deleted_at, deleted_by, delete_reason) on table public.cases to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.cases to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.case_parties to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.case_parties to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.case_assignments to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.case_assignments to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.case_events to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.case_events to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.tasks to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.tasks to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.documents to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.documents to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.financials to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.financials to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.notes to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.notes to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.case_communications to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.case_communications to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.lead_opportunities to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.lead_opportunities to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.contact_notes to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.contact_notes to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.contact_assignments to authenticated;
grant insert (deleted_at, deleted_by, delete_reason) on table public.contact_assignments to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.contact_assignments to authenticated;

grant select (deleted_at, deleted_by, delete_reason) on table public.contact_relationships to authenticated;
grant insert (deleted_at, deleted_by, delete_reason) on table public.contact_relationships to authenticated;
grant update (deleted_at, deleted_by, delete_reason) on table public.contact_relationships to authenticated;

create or replace function public.generate_task_due_notifications(p_location_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_due_soon integer := 0;
  inserted_overdue integer := 0;
begin
  insert into public.notifications (
    location_id,
    recipient_user_id,
    actor_user_id,
    notification_type,
    title,
    message,
    related_type,
    related_id,
    action_url,
    metadata
  )
  select
    task.location_id,
    task.assigned_user_id,
    null,
    'task.due_soon',
    'Task due soon',
    task.title,
    'task',
    task.id,
    '/tasks',
    jsonb_build_object(
      'task_id', task.id,
      'case_id', task.case_id,
      'due_at', task.due_at
    )
  from public.tasks task
  where task.deleted_at is null
    and task.assigned_user_id is not null
    and task.due_at is not null
    and task.status not in ('done', 'cancelled')
    and task.due_at >= now()
    and task.due_at <= now() + interval '24 hours'
    and (p_location_id is null or task.location_id = p_location_id)
    and (public.can_access_location(task.location_id) or public.is_admin())
    and exists (
      select 1
      from public.user_locations
      where user_id = task.assigned_user_id
        and location_id = task.location_id
    )
  on conflict do nothing;

  get diagnostics inserted_due_soon = row_count;

  insert into public.notifications (
    location_id,
    recipient_user_id,
    actor_user_id,
    notification_type,
    title,
    message,
    related_type,
    related_id,
    action_url,
    metadata
  )
  select
    task.location_id,
    task.assigned_user_id,
    null,
    'task.overdue',
    'Task overdue',
    task.title,
    'task',
    task.id,
    '/tasks',
    jsonb_build_object(
      'task_id', task.id,
      'case_id', task.case_id,
      'due_at', task.due_at
    )
  from public.tasks task
  where task.deleted_at is null
    and task.assigned_user_id is not null
    and task.due_at is not null
    and task.status not in ('done', 'cancelled')
    and task.due_at < now()
    and (p_location_id is null or task.location_id = p_location_id)
    and (public.can_access_location(task.location_id) or public.is_admin())
    and exists (
      select 1
      from public.user_locations
      where user_id = task.assigned_user_id
        and location_id = task.location_id
    )
  on conflict do nothing;

  get diagnostics inserted_overdue = row_count;

  return inserted_due_soon + inserted_overdue;
end;
$$;

revoke all on function public.generate_task_due_notifications(uuid) from public;
grant execute on function public.generate_task_due_notifications(uuid) to authenticated;
grant execute on function public.generate_task_due_notifications(uuid) to service_role;

commit;
