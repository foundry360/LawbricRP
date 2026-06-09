begin;

create or replace function public.can_view_lead_record(
  target_location_id uuid,
  target_assigned_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user()
    and (public.can_access_location(target_location_id) or public.is_admin())
    and (
      public.has_permission('leads.view_all')
      or (
        public.has_permission('leads.view_assigned')
        and target_assigned_user_id = auth.uid()
      )
    );
$$;

drop policy if exists "lead_opportunities_select_assigned_location" on public.lead_opportunities;
drop policy if exists "lead_opportunities_select_permission_scope" on public.lead_opportunities;
create policy "lead_opportunities_select_permission_scope"
on public.lead_opportunities
for select
to authenticated
using (public.can_view_lead_record(location_id, assigned_user_id));

drop policy if exists "lead_opportunities_insert_assigned_location" on public.lead_opportunities;
drop policy if exists "lead_opportunities_insert_permission" on public.lead_opportunities;
create policy "lead_opportunities_insert_permission"
on public.lead_opportunities
for insert
to authenticated
with check (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('leads.create')
);

drop policy if exists "lead_opportunities_update_assigned_location" on public.lead_opportunities;
drop policy if exists "lead_opportunities_update_permission" on public.lead_opportunities;
create policy "lead_opportunities_update_permission"
on public.lead_opportunities
for update
to authenticated
using (
  public.can_view_lead_record(location_id, assigned_user_id)
  and (
    public.has_permission('leads.edit')
    or public.has_permission('leads.convert')
  )
)
with check (
  (public.can_access_location(location_id) or public.is_admin())
  and (
    (
      public.has_permission('leads.edit')
      and status is distinct from 'converted'
      and converted_case_id is null
    )
    or (
      public.has_permission('leads.convert')
      and status = 'converted'
      and converted_case_id is not null
    )
  )
);

drop policy if exists "lead_opportunities_delete_assigned_location" on public.lead_opportunities;
drop policy if exists "lead_opportunities_delete_permission" on public.lead_opportunities;
create policy "lead_opportunities_delete_permission"
on public.lead_opportunities
for delete
to authenticated
using (
  public.can_view_lead_record(location_id, assigned_user_id)
  and public.has_permission('leads.delete')
);

revoke all on function public.can_view_lead_record(uuid, uuid) from public;
grant execute on function public.can_view_lead_record(uuid, uuid) to authenticated;

commit;
