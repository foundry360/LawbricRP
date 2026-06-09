begin;

create or replace function public.notify_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'done' or old.status is not distinct from new.status then
    return new;
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
  select
    new.location_id,
    recipient.user_id,
    null,
    'task.completed',
    'Task completed',
    new.title,
    'task',
    new.id,
    '/tasks',
    jsonb_build_object(
      'task_id', new.id,
      'case_id', new.case_id,
      'completed_at', new.completed_at
    )
  from (
    select distinct user_id
    from (
      values (new.assigned_user_id), (new.created_by)
    ) as candidate(user_id)
    where user_id is not null
  ) recipient
  where exists (
    select 1
    from public.user_locations
    where user_id = recipient.user_id
      and location_id = new.location_id
  );

  return new;
end;
$$;

drop trigger if exists tasks_notify_completed on public.tasks;
create trigger tasks_notify_completed after update of status on public.tasks
for each row execute function public.notify_task_completed();

create or replace function public.notify_case_stage_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_stage text;
  next_stage text;
begin
  if new.stage is not distinct from old.stage
    and new.ghl_pipeline_id is not distinct from old.ghl_pipeline_id
    and new.ghl_pipeline_stage_id is not distinct from old.ghl_pipeline_stage_id then
    return new;
  end if;

  previous_stage := coalesce(old.stage, 'Unassigned');
  next_stage := coalesce(new.stage, 'Unassigned');

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
    new.location_id,
    recipient.user_id,
    new.updated_by,
    'matter.stage_changed',
    'Matter stage changed',
    new.case_name || ' moved from ' || previous_stage || ' to ' || next_stage,
    'matter',
    new.id,
    '/case/' || new.id::text,
    jsonb_build_object(
      'case_id', new.id,
      'case_number', new.case_number,
      'previous_stage', old.stage,
      'stage', new.stage,
      'previous_ghl_pipeline_id', old.ghl_pipeline_id,
      'ghl_pipeline_id', new.ghl_pipeline_id,
      'previous_ghl_pipeline_stage_id', old.ghl_pipeline_stage_id,
      'ghl_pipeline_stage_id', new.ghl_pipeline_stage_id
    )
  from (
    select distinct user_id
    from (
      values (new.assigned_user_id), (new.created_by)
    ) as candidate(user_id)
    where user_id is not null
  ) recipient
  where exists (
    select 1
    from public.user_locations
    where user_id = recipient.user_id
      and location_id = new.location_id
  );

  return new;
end;
$$;

drop trigger if exists cases_notify_stage_changed on public.cases;
create trigger cases_notify_stage_changed after update of stage, ghl_pipeline_id, ghl_pipeline_stage_id on public.cases
for each row execute function public.notify_case_stage_changed();

revoke all on function public.notify_task_completed() from public;
revoke all on function public.notify_case_stage_changed() from public;

grant execute on function public.notify_task_completed() to service_role;
grant execute on function public.notify_case_stage_changed() to service_role;

commit;
