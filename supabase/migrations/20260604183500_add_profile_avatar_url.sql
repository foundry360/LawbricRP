-- Store profile image URLs on profiles so task/user joins can display avatars.

begin;

alter table public.profiles
  add column if not exists avatar_url text;

grant select (avatar_url) on table public.profiles to authenticated;
grant update (avatar_url) on table public.profiles to authenticated;

commit;
