begin;

alter table public.profiles
  add column if not exists email_signature_enabled boolean not null default false,
  add column if not exists email_signature_html text,
  add column if not exists email_signature_logo_url text;

grant select (email_signature_enabled, email_signature_html, email_signature_logo_url)
  on table public.profiles to authenticated;
grant update (email_signature_enabled, email_signature_html, email_signature_logo_url)
  on table public.profiles to authenticated;

insert into storage.buckets (id, name, public)
values ('email-signatures', 'email-signatures', true)
on conflict (id) do update set public = true;

drop policy if exists "email_signatures_select_public" on storage.objects;
create policy "email_signatures_select_public"
on storage.objects for select to public
using (bucket_id = 'email-signatures');

drop policy if exists "email_signatures_insert_own" on storage.objects;
create policy "email_signatures_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'email-signatures'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "email_signatures_update_own" on storage.objects;
create policy "email_signatures_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'email-signatures'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'email-signatures'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "email_signatures_delete_own" on storage.objects;
create policy "email_signatures_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'email-signatures'
  and split_part(name, '/', 1) = auth.uid()::text
);

commit;
