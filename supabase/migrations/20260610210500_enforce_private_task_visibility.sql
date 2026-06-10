begin;

drop policy if exists "tasks_select_matter_scope" on public.tasks;
create policy "tasks_select_matter_scope"
on public.tasks for select to authenticated
using (
  public.can_view_matter(case_id)
  and (
    coalesce(metadata->>'is_private', 'false') <> 'true'
    or coalesce(metadata->>'private_owner_user_id', created_by::text) = auth.uid()::text
  )
);

commit;
