begin;

create or replace function public.move_document(
  target_document_id uuid,
  target_matter_id uuid,
  target_folder_name text default null
)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  source_document public.documents%rowtype;
  target_matter public.cases%rowtype;
  normalized_folder text := nullif(trim(coalesce(target_folder_name, '')), '');
  next_metadata jsonb;
  moved_document public.documents%rowtype;
begin
  if not public.is_active_user() then
    raise exception 'User is not active' using errcode = '42501';
  end if;

  if not (public.is_admin() or public.has_permission('matters.edit')) then
    raise exception 'You do not have permission to move documents' using errcode = '42501';
  end if;

  select *
  into source_document
  from public.documents
  where id = target_document_id;

  if not found or not public.can_view_matter(source_document.case_id) then
    raise exception 'Document not found' using errcode = '42501';
  end if;

  select *
  into target_matter
  from public.cases
  where id = target_matter_id;

  if not found or not public.can_view_matter(target_matter_id) then
    raise exception 'Target matter not found' using errcode = '42501';
  end if;

  if target_matter.location_id is distinct from source_document.location_id then
    raise exception 'Document cannot be moved to a matter in another location' using errcode = '42501';
  end if;

  next_metadata := coalesce(source_document.metadata, '{}'::jsonb) - 'folder' - 'folderName' - 'folder_name';

  if normalized_folder is not null then
    next_metadata := next_metadata || jsonb_build_object('folder_name', normalized_folder);
  end if;

  update public.documents
  set
    case_id = target_matter_id,
    matter_id = target_matter_id,
    metadata = next_metadata
  where id = target_document_id
  returning * into moved_document;

  return moved_document;
end;
$$;

revoke all on function public.move_document(uuid, uuid, text) from public;
grant execute on function public.move_document(uuid, uuid, text) to authenticated;

commit;
