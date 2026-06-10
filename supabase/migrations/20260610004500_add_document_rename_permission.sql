begin;

insert into public.permissions (key, name, category, description)
values ('documents.edit', 'Edit Documents', 'documents', 'Rename documents on accessible matters.')
on conflict (key) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key = 'documents.edit'
where roles.key in ('admin', 'managing_partner', 'attorney')
on conflict do nothing;

create or replace function public.rename_document(
  target_document_id uuid,
  target_name text
)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := nullif(trim(coalesce(target_name, '')), '');
  source_document public.documents%rowtype;
  renamed_document public.documents%rowtype;
begin
  if not public.is_active_user() then
    raise exception 'User is not active' using errcode = '42501';
  end if;

  if not (public.is_admin() or public.has_permission('documents.edit')) then
    raise exception 'You do not have permission to edit documents' using errcode = '42501';
  end if;

  if normalized_name is null then
    raise exception 'Document name is required' using errcode = '22023';
  end if;

  select *
  into source_document
  from public.documents
  where id = target_document_id;

  if not found or not public.can_view_matter(source_document.case_id) then
    raise exception 'Document not found' using errcode = '42501';
  end if;

  update public.documents
  set
    name = normalized_name,
    file_name = normalized_name,
    updated_by = auth.uid()
  where id = target_document_id
  returning * into renamed_document;

  return renamed_document;
end;
$$;

revoke all on function public.rename_document(uuid, text) from public;
grant execute on function public.rename_document(uuid, text) to authenticated;

commit;
