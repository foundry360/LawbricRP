begin;

insert into public.permissions (key, name, category, description)
values
  ('documents.view', 'View Documents', 'documents', 'View documents on accessible matters.'),
  ('documents.upload', 'Upload Documents', 'documents', 'Upload or link documents to accessible matters.'),
  ('documents.move', 'Move Documents', 'documents', 'Move documents between matters and folders.'),
  ('documents.delete', 'Delete Documents', 'documents', 'Delete matter documents.'),
  ('folders.manage', 'Manage Document Folders', 'documents', 'Create, rename, and organize document folders.')
on conflict (key) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key = any (
  case roles.key
    when 'admin' then array[
      'documents.view',
      'documents.upload',
      'documents.move',
      'documents.delete',
      'folders.manage'
    ]
    when 'managing_partner' then array[
      'documents.view',
      'documents.upload',
      'documents.move',
      'documents.delete',
      'folders.manage'
    ]
    when 'attorney' then array[
      'documents.view',
      'documents.upload',
      'documents.move',
      'folders.manage'
    ]
    when 'staff' then array[
      'documents.view'
    ]
    else array[]::text[]
  end
)
on conflict do nothing;

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

  if not (public.is_admin() or public.has_permission('documents.move')) then
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
    metadata = next_metadata,
    updated_by = auth.uid()
  where id = target_document_id
  returning * into moved_document;

  return moved_document;
end;
$$;

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

  if not (public.is_admin() or public.has_permission('folders.manage')) then
    raise exception 'You do not have permission to manage document folders' using errcode = '42501';
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
  set
    metadata = case
      when normalized_folder is null then coalesce(d.metadata, '{}'::jsonb) - 'folder' - 'folderName' - 'folder_name'
      else (coalesce(d.metadata, '{}'::jsonb) - 'folder' - 'folderName' - 'folder_name') || jsonb_build_object('folder_name', normalized_folder)
    end,
    updated_by = auth.uid()
  where d.id = any(target_document_ids)
    and d.case_id = target_matter_id
  returning d.*;
end;
$$;

revoke all on function public.move_document(uuid, uuid, text) from public;
grant execute on function public.move_document(uuid, uuid, text) to authenticated;

revoke all on function public.rename_document_folder(uuid[], uuid, text) from public;
grant execute on function public.rename_document_folder(uuid[], uuid, text) to authenticated;

commit;
