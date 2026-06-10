begin;

alter table public.documents
  add column if not exists name text,
  add column if not exists matter_id uuid,
  add column if not exists storage_type text not null default 'internal',
  add column if not exists file_path text,
  add column if not exists external_file_id text,
  add column if not exists file_url text;

update public.documents
set
  name = coalesce(nullif(name, ''), file_name),
  matter_id = coalesce(matter_id, case_id),
  file_path = coalesce(file_path, storage_path),
  storage_type = coalesce(nullif(storage_type, ''), 'internal')
where name is null
   or matter_id is null
   or file_path is null
   or storage_type is null
   or storage_type = '';

alter table public.documents
  alter column name set not null,
  alter column matter_id set not null,
  alter column storage_path drop not null,
  alter column storage_bucket set default 'documents';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_matter_id_fkey'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_matter_id_fkey foreign key (matter_id) references public.cases(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_storage_type_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_storage_type_check check (storage_type in ('internal', 'gdrive', 'onedrive'));
  end if;
end;
$$;

create index if not exists documents_matter_id_idx on public.documents(matter_id);
create index if not exists documents_storage_type_idx on public.documents(storage_type);
create index if not exists documents_file_path_idx on public.documents(storage_bucket, file_path)
  where file_path is not null;

create or replace function public.sync_document_management_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.case_id := coalesce(new.case_id, new.matter_id);
  new.matter_id := coalesce(new.matter_id, new.case_id);
  new.file_name := coalesce(nullif(new.file_name, ''), nullif(new.name, ''), 'Untitled document');
  new.name := coalesce(nullif(new.name, ''), new.file_name);
  new.storage_type := coalesce(nullif(new.storage_type, ''), 'internal');

  if new.storage_type = 'internal' then
    new.storage_bucket := coalesce(nullif(new.storage_bucket, ''), 'documents');
    new.storage_path := coalesce(nullif(new.storage_path, ''), nullif(new.file_path, ''));
    new.file_path := coalesce(nullif(new.file_path, ''), new.storage_path);
  else
    new.storage_bucket := coalesce(nullif(new.storage_bucket, ''), 'documents');
    new.storage_path := null;
    new.file_path := null;
    new.mime_type := null;
    new.size_bytes := null;
  end if;

  return new;
end;
$$;

drop trigger if exists documents_sync_management_fields on public.documents;
create trigger documents_sync_management_fields
before insert or update on public.documents
for each row execute function public.sync_document_management_fields();

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_storage_select_matter_scope" on storage.objects;
create policy "documents_storage_select_matter_scope"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_bucket = bucket_id
      and d.file_path = name
      and public.can_view_matter(d.case_id)
  )
);

revoke all on function public.sync_document_management_fields() from public;
grant execute on function public.sync_document_management_fields() to service_role;

commit;
