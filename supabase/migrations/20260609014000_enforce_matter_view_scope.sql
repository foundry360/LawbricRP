begin;

create or replace function public.can_view_matter_record(
  target_case_id uuid,
  target_location_id uuid,
  target_assigned_user_id uuid default null,
  target_source_attorney_user_id uuid default null
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
      public.has_permission('matters.view_all')
      or (
        public.has_permission('matters.view_assigned')
        and (
          target_assigned_user_id = auth.uid()
          or target_source_attorney_user_id = auth.uid()
          or exists (
            select 1
            from public.case_assignments ca
            where ca.case_id = target_case_id
              and ca.location_id = target_location_id
              and ca.assigned_user_id = auth.uid()
              and ca.ended_at is null
          )
        )
      )
    );
$$;

create or replace function public.can_view_matter(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = target_case_id
      and public.can_view_matter_record(
        c.id,
        c.location_id,
        c.assigned_user_id,
        c.source_attorney_user_id
      )
  );
$$;

drop policy if exists "cases_select_location" on public.cases;
drop policy if exists "cases_select_matter_scope" on public.cases;
create policy "cases_select_matter_scope"
on public.cases for select to authenticated
using (
  public.can_view_matter_record(
    id,
    location_id,
    assigned_user_id,
    source_attorney_user_id
  )
);

drop policy if exists "case_assignments_select_location" on public.case_assignments;
drop policy if exists "case_assignments_select_matter_scope" on public.case_assignments;
create policy "case_assignments_select_matter_scope"
on public.case_assignments for select to authenticated
using (public.can_view_matter(case_id));

drop policy if exists "case_parties_select_location" on public.case_parties;
drop policy if exists "case_parties_select_matter_scope" on public.case_parties;
create policy "case_parties_select_matter_scope"
on public.case_parties for select to authenticated
using (public.can_view_matter(case_id));

drop policy if exists "case_events_select_location" on public.case_events;
drop policy if exists "case_events_select_matter_scope" on public.case_events;
create policy "case_events_select_matter_scope"
on public.case_events for select to authenticated
using (public.can_view_matter(case_id));

drop policy if exists "documents_select_location" on public.documents;
drop policy if exists "documents_select_matter_scope" on public.documents;
create policy "documents_select_matter_scope"
on public.documents for select to authenticated
using (public.can_view_matter(case_id));

drop policy if exists "financials_select_location" on public.financials;
drop policy if exists "financials_select_matter_scope" on public.financials;
create policy "financials_select_matter_scope"
on public.financials for select to authenticated
using (public.can_view_matter(case_id));

drop policy if exists "notes_select_location" on public.notes;
drop policy if exists "notes_select_matter_scope" on public.notes;
create policy "notes_select_matter_scope"
on public.notes for select to authenticated
using (public.can_view_matter(case_id));

revoke all on function public.can_view_matter_record(uuid, uuid, uuid, uuid) from public;
revoke all on function public.can_view_matter(uuid) from public;
grant execute on function public.can_view_matter_record(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.can_view_matter(uuid) to authenticated;

commit;
