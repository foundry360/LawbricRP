begin;

alter table public.case_communications
  add column if not exists is_read boolean not null default false,
  add column if not exists read_at timestamp with time zone;

update public.case_communications
set
  is_read = true,
  read_at = coalesce(read_at, occurred_at)
where direction = 'outbound'
  and is_read = false;

create index if not exists case_communications_unread_idx
on public.case_communications(location_id, case_id, is_read, occurred_at desc)
where deleted_at is null;

grant select (is_read, read_at) on table public.case_communications to authenticated;
grant update (is_read, read_at) on table public.case_communications to authenticated;

commit;
