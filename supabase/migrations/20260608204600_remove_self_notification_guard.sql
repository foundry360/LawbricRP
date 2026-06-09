begin;

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.assigned_user_id is not distinct from old.assigned_user_id then
      return new;
    end if;
  end if;

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
  values (
    new.location_id,
    new.assigned_user_id,
    new.created_by,
    'task.assigned',
    'Task assigned to you',
    new.title,
    'task',
    new.id,
    '/tasks',
    jsonb_build_object('task_id', new.id, 'case_id', new.case_id)
  );

  return new;
end;
$$;

create or replace function public.notify_case_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.assigned_user_id is not distinct from old.assigned_user_id then
      return new;
    end if;
  end if;

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
  values (
    new.location_id,
    new.assigned_user_id,
    coalesce(new.updated_by, new.created_by),
    'matter.assigned',
    'Matter assigned to you',
    new.case_name,
    'matter',
    new.id,
    '/case/' || new.id::text,
    jsonb_build_object('case_id', new.id, 'case_number', new.case_number)
  );

  return new;
end;
$$;

revoke all on function public.notify_task_assignment() from public;
revoke all on function public.notify_case_assignment() from public;

grant execute on function public.notify_task_assignment() to service_role;
grant execute on function public.notify_case_assignment() to service_role;

commit;
