begin;

create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  ghl_contact_id text not null,
  body text not null,
  note_type text not null default 'contact',
  is_pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists contact_notes_contact_created_at_idx
on public.contact_notes(location_id, ghl_contact_id, created_at desc);

drop trigger if exists contact_notes_set_updated_at on public.contact_notes;
create trigger contact_notes_set_updated_at before update on public.contact_notes
for each row execute function public.set_updated_at();

alter table public.contact_notes enable row level security;
alter table public.contact_notes force row level security;

drop policy if exists "contact_notes_select_location" on public.contact_notes;
create policy "contact_notes_select_location"
on public.contact_notes for select to authenticated
using (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_notes_insert_location" on public.contact_notes;
create policy "contact_notes_insert_location"
on public.contact_notes for insert to authenticated
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_notes_update_location" on public.contact_notes;
create policy "contact_notes_update_location"
on public.contact_notes for update to authenticated
using (public.can_access_location(location_id) or public.is_admin())
with check (public.can_access_location(location_id) or public.is_admin());

drop policy if exists "contact_notes_delete_location" on public.contact_notes;
create policy "contact_notes_delete_location"
on public.contact_notes for delete to authenticated
using (public.can_access_location(location_id) or public.is_admin());

revoke all on table public.contact_notes from public, anon, authenticated;
grant select on table public.contact_notes to authenticated;
grant insert (location_id, ghl_contact_id, body, note_type, is_pinned, metadata, created_by)
  on table public.contact_notes to authenticated;
grant update (body, note_type, is_pinned, metadata, updated_at)
  on table public.contact_notes to authenticated;
grant delete on table public.contact_notes to authenticated;
grant all on table public.contact_notes to service_role;

commit;
