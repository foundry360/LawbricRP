begin;

grant insert (location_id, ghl_contact_id, assigned_user_id, updated_at)
  on table public.contact_assignments to authenticated;

commit;
