-- Stores the GHL agency/company ID needed for agency-level user management
-- calls such as creating staff/user accounts.

begin;

alter table public.agencies
  add column if not exists ghl_company_id text;

create unique index if not exists agencies_ghl_company_id_key
  on public.agencies(ghl_company_id)
  where ghl_company_id is not null;

comment on column public.agencies.ghl_company_id is
  'GHL company/agency ID used by server-side GHL Users API calls.';

commit;
