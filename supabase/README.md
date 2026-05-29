# Supabase Multi-Tenant GHL Setup

This Supabase project is configured for a multi-tenant SaaS running inside GHL AI Studio while using Supabase Auth and Row Level Security for data access control.

## Files

- `config.toml` enables local Supabase Auth with email/password and email OTP magic-link support.
- `migrations/20260529004900_initial_multi_tenant_ghl.sql` creates the schema, helper functions, RLS policies, grants, and the `user_accessible_locations` view.
- `seed.sql` adds one sample agency and two sample locations. Set `sample_user_id` to an existing `auth.users.id` to create a sample mapping.
- `functions/ghl-backend-handoff/index.ts` is an optional Edge Function placeholder that validates a user's Supabase JWT and location access before forwarding non-secret context to a trusted backend service.

## Security Notes

- Authenticated clients can select assigned GHL location metadata, but not `encrypted_api_key`.
- `encrypted_api_key` is only granted to `service_role`; never ship the service role key to GHL AI Studio or a frontend.
- Tenant isolation is enforced through `user_locations`; users only see agencies and locations reachable through their own mappings.
- Profile `role` values are not user-editable from the client. Role assignment should be done from trusted backend tooling with the service role key.

## Edge Function Environment

Set these secrets before deploying `ghl-backend-handoff`:

```sh
supabase secrets set \
  GHL_BACKEND_URL="https://your-backend.example.com" \
  GHL_BACKEND_SHARED_SECRET="replace-me" \
  ALLOWED_ORIGIN="https://your-ghl-app-origin.example"
```
