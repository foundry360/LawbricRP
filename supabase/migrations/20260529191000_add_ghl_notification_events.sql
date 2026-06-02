-- Stores inbound GHL webhook events for a live AI Studio notification feed.
-- The frontend reads these rows through RLS and subscribes with Supabase Realtime.

begin;

do $$
begin
  alter table public.ghl_locations
    add constraint ghl_locations_id_ghl_location_id_key unique (id, ghl_location_id);
exception
  when duplicate_object or duplicate_table then
    null;
end $$;

create table if not exists public.ghl_notification_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  ghl_location_id text not null,
  event_type text not null,
  external_event_id text,
  contact_id text,
  opportunity_id text,
  calendar_id text,
  title text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamp with time zone not null default now(),
  constraint ghl_notification_events_location_match_fk
    foreign key (location_id, ghl_location_id)
    references public.ghl_locations(id, ghl_location_id)
    on delete cascade
    on update cascade
);

create index if not exists ghl_notification_events_location_id_received_at_idx
  on public.ghl_notification_events(location_id, received_at desc);

create index if not exists ghl_notification_events_ghl_location_id_idx
  on public.ghl_notification_events(ghl_location_id);

create index if not exists ghl_notification_events_event_type_idx
  on public.ghl_notification_events(event_type);

create index if not exists ghl_notification_events_payload_gin_idx
  on public.ghl_notification_events using gin (payload);

alter table public.ghl_notification_events enable row level security;
alter table public.ghl_notification_events force row level security;

drop policy if exists "ghl_notification_events_select_assigned_locations"
on public.ghl_notification_events;

create policy "ghl_notification_events_select_assigned_locations"
on public.ghl_notification_events
for select
to authenticated
using (public.can_access_location(location_id));

revoke all on table public.ghl_notification_events from public, anon, authenticated;

grant select (
  id,
  location_id,
  ghl_location_id,
  event_type,
  external_event_id,
  contact_id,
  opportunity_id,
  calendar_id,
  title,
  message,
  payload,
  received_at
) on table public.ghl_notification_events to authenticated;

grant all on table public.ghl_notification_events to service_role;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.ghl_notification_events;
  end if;
exception
  when duplicate_object then
    null;
end $$;

commit;
