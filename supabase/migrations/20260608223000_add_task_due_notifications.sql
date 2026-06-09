begin;

create unique index if not exists notifications_task_due_unique_idx
  on public.notifications(notification_type, related_id, recipient_user_id)
  where related_type = 'task'
    and notification_type in ('task.due_soon', 'task.overdue');

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
  where task.assigned_user_id is not null
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
  where task.assigned_user_id is not null
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
