begin;

drop policy if exists "contact_notes_insert_location" on public.contact_notes;
create policy "contact_notes_insert_permission"
on public.contact_notes for insert to authenticated
with check (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('contacts.edit')
);

drop policy if exists "contact_notes_update_location" on public.contact_notes;
create policy "contact_notes_update_permission"
on public.contact_notes for update to authenticated
using (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('contacts.edit')
)
with check (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('contacts.edit')
);

drop policy if exists "contact_notes_delete_location" on public.contact_notes;
create policy "contact_notes_delete_permission"
on public.contact_notes for delete to authenticated
using (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('contacts.edit')
);

commit;
