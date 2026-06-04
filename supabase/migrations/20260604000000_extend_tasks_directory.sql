begin;

alter table public.tasks
  alter column case_id drop not null,
  add column if not exists related_type text not null default 'case',
  add column if not exists ghl_contact_id text,
  add column if not exists ghl_contact_name text,
  add column if not exists ghl_opportunity_id text,
  add column if not exists ghl_opportunity_name text;

alter table public.tasks
  drop constraint if exists tasks_related_type_check;

alter table public.tasks
  add constraint tasks_related_type_check
  check (related_type in ('case', 'contact', 'opportunity', 'general'));

update public.tasks
set related_type = case
  when case_id is not null then 'case'
  when ghl_contact_id is not null then 'contact'
  when ghl_opportunity_id is not null then 'opportunity'
  else 'general'
end;

create index if not exists tasks_related_type_idx
  on public.tasks(location_id, related_type);

create index if not exists tasks_ghl_contact_id_idx
  on public.tasks(location_id, ghl_contact_id);

create index if not exists tasks_ghl_opportunity_id_idx
  on public.tasks(location_id, ghl_opportunity_id);

commit;
