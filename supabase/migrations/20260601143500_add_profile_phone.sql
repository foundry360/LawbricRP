-- Store user phone numbers alongside existing profile names.

begin;

alter table public.profiles
  add column if not exists phone text;

create index if not exists profiles_phone_idx
  on public.profiles(phone)
  where phone is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'user'
  )
  on conflict (id) do update
    set
      email = excluded.email,
      phone = coalesce(public.profiles.phone, excluded.phone);

  return new;
end;
$$;

grant select (
  id,
  email,
  full_name,
  phone,
  role,
  is_active,
  deactivated_at,
  deactivated_by,
  deactivation_reason,
  created_at
) on table public.profiles to authenticated;

grant update (full_name, phone)
  on table public.profiles to authenticated;

commit;
