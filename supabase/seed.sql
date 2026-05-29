-- Optional local seed data.
-- To add a sample user mapping, replace sample_user_id with an existing
-- auth.users.id before running `supabase db seed`.

do $$
declare
  sample_agency_id uuid := '11111111-1111-4111-8111-111111111111';
  sample_location_one_id uuid := '22222222-2222-4222-8222-222222222222';
  sample_location_two_id uuid := '33333333-3333-4333-8333-333333333333';
  sample_user_id uuid := null;
begin
  insert into public.agencies (id, name)
  values (sample_agency_id, 'Sample GHL Agency')
  on conflict (id) do update
    set name = excluded.name;

  insert into public.ghl_locations (
    id,
    agency_id,
    ghl_location_id,
    name,
    encrypted_api_key
  )
  values
    (
      sample_location_one_id,
      sample_agency_id,
      'sample-ghl-location-001',
      'Sample Location One',
      'encrypted-placeholder-location-one'
    ),
    (
      sample_location_two_id,
      sample_agency_id,
      'sample-ghl-location-002',
      'Sample Location Two',
      'encrypted-placeholder-location-two'
    )
  on conflict (ghl_location_id) do update
    set
      agency_id = excluded.agency_id,
      name = excluded.name,
      encrypted_api_key = excluded.encrypted_api_key;

  if sample_user_id is not null then
    insert into public.user_locations (user_id, location_id)
    values (sample_user_id, sample_location_one_id)
    on conflict (user_id, location_id) do nothing;
  end if;
end $$;
