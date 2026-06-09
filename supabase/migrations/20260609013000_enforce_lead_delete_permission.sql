begin;

drop policy if exists "lead_opportunities_delete_assigned_location"
on public.lead_opportunities;

create policy "lead_opportunities_delete_permission"
on public.lead_opportunities
for delete
to authenticated
using (
  (public.can_access_location(location_id) or public.is_admin())
  and public.has_permission('leads.delete')
);

commit;
