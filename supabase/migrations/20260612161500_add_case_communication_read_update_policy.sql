begin;

drop policy if exists "case_communications_update_read_state" on public.case_communications;
create policy "case_communications_update_read_state"
on public.case_communications for update to authenticated
using (public.can_view_matter(case_id))
with check (public.can_view_matter(case_id));

grant update (is_read, read_at) on table public.case_communications to authenticated;

commit;
