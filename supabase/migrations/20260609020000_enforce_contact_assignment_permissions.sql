begin;

drop policy if exists "contact_assignments_select_assigned_location" on public.contact_assignments;
drop policy if exists "contact_assignments_select_permission_scope" on public.contact_assignments;
create policy "contact_assignments_select_permission_scope"
on public.contact_assignments
for select
to authenticated
using (
  (public.can_access_location(location_id) or public.is_admin())
  and (
    public.has_permission('contacts.view_all')
    or public.has_permission('contacts.view_location')
    or (
      public.has_permission('contacts.view_assigned')
      and assigned_user_id = auth.uid()
    )
  )
);

drop policy if exists "contact_assignments_insert_assigned_location" on public.contact_assignments;
drop policy if exists "contact_assignments_insert_permission" on public.contact_assignments;
create policy "contact_assignments_insert_permission"
on public.contact_assignments
for insert
to authenticated
with check (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('contacts.edit')
);

drop policy if exists "contact_assignments_update_assigned_location" on public.contact_assignments;
drop policy if exists "contact_assignments_update_permission" on public.contact_assignments;
create policy "contact_assignments_update_permission"
on public.contact_assignments
for update
to authenticated
using (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('contacts.edit')
)
with check (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('contacts.edit')
);

drop policy if exists "contact_assignments_delete_assigned_location" on public.contact_assignments;
drop policy if exists "contact_assignments_delete_permission" on public.contact_assignments;
create policy "contact_assignments_delete_permission"
on public.contact_assignments
for delete
to authenticated
using (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('contacts.edit')
);

commit;
