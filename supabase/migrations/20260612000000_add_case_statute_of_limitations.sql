begin;

alter table public.cases
  add column if not exists statute_of_limitations_at timestamptz;

grant insert (statute_of_limitations_at) on table public.cases to authenticated;
grant select (statute_of_limitations_at) on table public.cases to authenticated;
grant update (statute_of_limitations_at) on table public.cases to authenticated;

commit;
