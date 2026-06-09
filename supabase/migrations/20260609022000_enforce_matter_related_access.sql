begin;

drop policy if exists "tasks_select_location" on public.tasks;
drop policy if exists "tasks_select_matter_scope" on public.tasks;
create policy "tasks_select_matter_scope"
on public.tasks for select to authenticated
using (public.can_view_matter(case_id));

drop policy if exists "case_documents_select_authenticated" on storage.objects;
drop policy if exists "case_documents_select_matter_scope" on storage.objects;
create policy "case_documents_select_matter_scope"
on storage.objects for select to authenticated
using (
  bucket_id = 'case-documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_bucket = bucket_id
      and d.storage_path = name
      and public.can_view_matter(d.case_id)
  )
);

commit;
