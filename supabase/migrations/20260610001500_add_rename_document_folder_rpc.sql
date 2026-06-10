begin;

create or replace function public.rename_document_folder(
  target_document_ids uuid[],
  target_matter_id uuid,
  target_folder_name text default null
)
returns setof public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_folder text := nullif(trim(coalesce(target_folder_name, '')), '');
begin
  if not public.is_active_user() then
    raise exception 'User is not active' using errcode = '42501';
  end if;

  if not (public.is_admin() or public.has_permission('matters.edit')) then
    raise exception 'You do not have permission to rename document folders' using errcode = '42501';
  end if;

  if target_document_ids is null or cardinality(target_document_ids) = 0 then
    raise exception 'No documents selected' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.cases c
    where c.id = target_matter_id
      and public.can_view_matter(c.id)
  ) then
    raise exception 'Target matter not found' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.documents d
    where d.id = any(target_document_ids)
      and (
        d.case_id is distinct from target_matter_id
        or d.matter_id is distinct from target_matter_id
        or not public.can_view_matter(d.case_id)
      )
  ) then
    raise exception 'Document not found' using errcode = '42501';
  end if;

  return query
  update public.documents d
  set metadata = case
    when normalized_folder is null then coalesce(d.metadata, '{}'::jsonb) - 'folder' - 'folderName' - 'folder_name'
    else (coalesce(d.metadata, '{}'::jsonb) - 'folder' - 'folderName' - 'folder_name') || jsonb_build_object('folder_name', normalized_folder)
  end
  where d.id = any(target_document_ids)
    and d.case_id = target_matter_id
  returning d.*;
end;
$$;

revoke all on function public.rename_document_folder(uuid[], uuid, text) from public;
grant execute on function public.rename_document_folder(uuid[], uuid, text) to authenticated;

commit;
