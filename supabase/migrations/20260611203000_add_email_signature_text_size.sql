begin;

alter table public.profiles
  add column if not exists email_signature_text_size text not null default 'normal',
  add constraint profiles_email_signature_text_size_check
    check (email_signature_text_size in ('small', 'normal', 'large', 'x-large'));

grant select (email_signature_text_size) on table public.profiles to authenticated;
grant update (email_signature_text_size) on table public.profiles to authenticated;

commit;
