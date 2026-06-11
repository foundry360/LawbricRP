begin;

create table if not exists public.case_communications (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.ghl_locations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  channel text not null default 'email',
  direction text not null default 'outbound',
  subject text,
  body text,
  preview text,
  status text not null default 'sent',
  participant_name text,
  recipients jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  ghl_message_ids jsonb not null default '[]'::jsonb,
  ghl_conversation_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamp with time zone not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint case_communications_channel_check check (channel in ('email', 'sms', 'call', 'note', 'other')),
  constraint case_communications_direction_check check (direction in ('inbound', 'outbound')),
  constraint case_communications_status_check check (status in ('draft', 'sent', 'received', 'failed'))
);

create index if not exists case_communications_case_occurred_at_idx
on public.case_communications(case_id, occurred_at desc);

create index if not exists case_communications_location_occurred_at_idx
on public.case_communications(location_id, occurred_at desc);

drop trigger if exists case_communications_set_updated_at on public.case_communications;
create trigger case_communications_set_updated_at before update on public.case_communications
for each row execute function public.set_updated_at();

alter table public.case_communications enable row level security;
alter table public.case_communications force row level security;

drop policy if exists "case_communications_select_matter_scope" on public.case_communications;
create policy "case_communications_select_matter_scope"
on public.case_communications for select to authenticated
using (public.can_view_matter(case_id));

revoke all on table public.case_communications from public, anon, authenticated;
grant select on table public.case_communications to authenticated;
grant all on table public.case_communications to service_role;

commit;
