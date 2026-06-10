begin;

alter table public.documents
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

update public.documents
set updated_by = uploaded_by
where updated_by is null
  and uploaded_by is not null;

create index if not exists documents_updated_by_idx
  on public.documents(updated_by);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();

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
