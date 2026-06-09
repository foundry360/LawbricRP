begin;

alter table public.cases
add column if not exists source_attorney_user_id uuid references public.profiles(id) on delete set null;

create index if not exists cases_source_attorney_user_id_idx
on public.cases(source_attorney_user_id);

commit;
