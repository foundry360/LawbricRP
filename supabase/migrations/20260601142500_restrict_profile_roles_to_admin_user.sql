-- Normalize application roles to the two roles exposed by User Management:
-- admin and user.

begin;

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = 'user'
where role in ('agency_user', 'viewer');

alter table public.profiles
  alter column role set default 'user';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'user'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'user'
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

commit;
