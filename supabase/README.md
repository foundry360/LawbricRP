# Supabase Multi-Tenant GHL Setup

This Supabase project is configured for a multi-tenant SaaS running inside GHL AI Studio while using Supabase Auth and Row Level Security for data access control.

## Files

- `config.toml` enables local Supabase Auth with email/password and email OTP magic-link support.
- `migrations/20260529004900_initial_multi_tenant_ghl.sql` creates the schema, helper functions, RLS policies, grants, and the `user_accessible_locations` view.
- `migrations/20260601013000_add_user_deactivation.sql` adds profile deactivation state and tightens tenant access for inactive users.
- `migrations/20260601132500_add_ghl_staff_user_accounts.sql` maps Supabase users to their provisioned GHL staff/user accounts.
- `migrations/20260601140500_add_agency_ghl_company_id.sql` stores the GHL company/agency ID needed for staff/user creation.
- `migrations/20260601142500_restrict_profile_roles_to_admin_user.sql` normalizes app roles to `admin` and `user`.
- `migrations/20260601143500_add_profile_phone.sql` adds phone storage to `profiles` and auth profile creation.
- `migrations/20260601165500_add_business_profiles.sql` adds business profile settings for each GHL location.
- `migrations/20260608202000_add_native_notifications.sql` creates the Lawbric-native notification table, Realtime publication, and assignment notification triggers.
- `seed.sql` adds one sample agency and two sample locations. Set `sample_user_id` to an existing `auth.users.id` to create a sample mapping.
- `functions/ghl-backend-handoff/index.ts` is an optional Edge Function placeholder that validates a user's Supabase JWT and location access before forwarding non-secret context to a trusted backend service.
- `functions/admin-users/index.ts` lets an active admin create, deactivate, or reactivate users without exposing the service role key.
- `functions/admin-settings/index.ts` lets an active admin save business profile settings and GHL location IDs.

## Security Notes

- Authenticated clients can select assigned GHL location metadata, but not `encrypted_api_key`.
- `encrypted_api_key` is only granted to `service_role`; never ship the service role key to GHL AI Studio or a frontend.
- Tenant isolation is enforced through `user_locations`; users only see agencies and locations reachable through their own mappings.
- Profile `role` values are not user-editable from the client. Role assignment should be done from trusted backend tooling with the service role key.
- Notifications are recipient-scoped rows in `notifications`. Authenticated users can only read and mark their own notification rows for locations they can access.
- User creation/deactivation must go through `admin-users`. The frontend should never call Supabase Auth Admin APIs directly or receive the service role key.

## Edge Function Environment

Set these secrets before deploying `ghl-backend-handoff`:

```sh
supabase secrets set \
  GHL_BACKEND_URL="https://your-backend.example.com" \
  GHL_BACKEND_SHARED_SECRET="replace-me" \
  ALLOWED_ORIGIN="https://your-ghl-app-origin.example"
```

## Live Notification Feed

The frontend should:

1. Sign in with Supabase Auth.
2. Load assigned locations from `user_accessible_locations`.
3. Read recent rows from `notifications`.
4. Subscribe to inserts on `notifications` with Supabase Realtime.
5. Mark notification rows as read with direct Supabase updates.

Notifications originate inside Lawbric. The native migration adds database triggers for matter and task assignments, and the `create_notification` RPC can be used by app code for future Lawbric events without adding Edge Functions.

Current notification types:

- `task.assigned`: a task is assigned to a user.
- `task.due_soon`: an assigned task is due within the next 24 hours.
- `task.overdue`: an assigned task is past due and not done/cancelled.
- `task.completed`: a task is marked done.
- `matter.assigned`: a matter is assigned to a user.
- `matter.stage_changed`: a matter stage or GHL pipeline stage changes.

Example client subscription:

```ts
const channel = supabase
  .channel("lawbric-notifications")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "notifications",
    },
    (payload) => {
      console.log("New notification:", payload.new);
    },
  )
  .subscribe();
```

RLS still controls which rows an authenticated user can read and update.

## User Management

Deploy the admin user function:

```sh
supabase functions deploy admin-users --no-verify-jwt --use-api --project-ref <project-ref>
```

Subaccount app users are Supabase users, not native GHL staff users. The admin enters the subaccount Private Integration API Key and GHL Location ID once in Account Activation. Do not ask the admin for a Supabase Agency ID or GHL Company ID in the frontend while there is only one agency; `admin-settings` will use the single configured agency internally. `admin-users` creates the Supabase user and assigns that user to the saved configured location. GHL data access uses the saved subaccount integration key and GHL Location ID through backend calls.

Optional overrides:

```sh
GHL_API_BASE_URL="https://services.leadconnectorhq.com"
GHL_API_VERSION="2021-07-28"
PASSWORD_RESET_REDIRECT_TO="https://lawbric-rp.vercel.app/reset-password"
```

The saved subaccount Private Integration API Key should include the scopes needed for the GHL data your app reads or writes, such as contacts, calendars, opportunities, and conversations. Sending email through the matter Communications tab requires `conversations/message.write` on the subaccount token.

The frontend should call the function with the logged-in admin's Supabase access token.

Create a Supabase subaccount user:

```ts
const { data, error } = await supabase.functions.invoke("admin-users", {
  body: {
    action: "create",
    email: "jane@example.com",
    fullName: "Jane Smith",
    phone: "+15555550100",
    role: "user",
    locationIds: ["supabase-location-uuid"], // optional when one Account Activation location exists
  },
});
```

After the user is created, `admin-users` sends a Supabase password reset email so the user can set their own password. Configure `PASSWORD_RESET_REDIRECT_TO` if the reset link should return users to a specific app route. If Supabase rate-limits the reset email, the user is still created and the response includes `passwordResetSent: false` with a skipped reason.

`locationIds` may be omitted when exactly one saved `business_profiles.location_id` exists from Account Activation. In that case, `admin-users` uses that saved configured location. If no Location ID was entered and saved during Account Activation, user creation fails; the backend does not invent, hardcode, or fallback to any Location ID.

Create returns a Supabase app user assigned to the selected location:

```json
{
  "ok": true,
  "action": "create",
  "userId": "...",
  "locationIds": ["..."],
  "passwordResetSent": true,
  "passwordResetSkippedReason": "only present when passwordResetSent is false",
  "ghlCreated": false,
  "ghlSkippedReason": "This app now creates Supabase app users only. GHL data access uses the saved subaccount integration key and location ID."
}
```

User Management should read names and phone numbers from `profiles`:

```text
full_name
phone
```

Admins can view all profiles through RLS. Users can update their own `full_name` and `phone`.

Update a user's profile fields from User Management:

```ts
const { data, error } = await supabase.functions.invoke("admin-users", {
  body: {
    action: "update",
    userId: "target-user-uuid",
    email: "jane@example.com",
    fullName: "Jane Smith",
    phone: "+15555550100",
    role: "user",
    ghlRole: "user",
  },
});
```

Deactivate:

```ts
const { data, error } = await supabase.functions.invoke("admin-users", {
  body: {
    action: "deactivate",
    userId: "target-user-uuid",
    reason: "No longer needs access",
  },
});
```

Reactivate:

```ts
const { data, error } = await supabase.functions.invoke("admin-users", {
  body: {
    action: "reactivate",
    userId: "target-user-uuid",
  },
});
```

Send password reset email:

```ts
const { data, error } = await supabase.functions.invoke("admin-users", {
  body: {
    action: "sendPasswordReset",
    userId: "target-user-uuid",
  },
});
```

The function verifies the caller's JWT and requires `profiles.role = 'admin'` and `profiles.is_active = true`. User Management roles are limited to `admin` and `user`; display them as Admin and User in the frontend if desired. Create provisions Supabase Auth with an internal temporary password, sends a Supabase password reset email, creates `profiles`, and creates `user_locations`. It does not create native GHL staff users. `sendPasswordReset` sends a Supabase reset email for an active target user. Update modifies `auth.users`, `profiles.email`, `profiles.full_name`, `profiles.phone`, `profiles.role`, mirrors name/phone into Supabase Auth metadata, and updates the mapped GHL staff/user through `PUT /users/:userId` only when a legacy `ghl_user_accounts` mapping exists. Supabase Auth's top-level phone field is only updated when the phone can be normalized to E.164, for example `+19042103388` or `9042103388`. If there is no `ghl_user_accounts` row for the user, the response includes `ghlUpdated: false` and a skipped reason. Deactivation prevents self-deactivation and prevents deactivating the last active admin. Deactivation bans the Supabase Auth user for `876000h` and marks `profiles.is_active = false`; reactivation clears the ban with `ban_duration = 'none'`.

## Business Profile Settings

Deploy the admin settings function:

```sh
supabase functions deploy admin-settings --no-verify-jwt --use-api --project-ref <project-ref>
```

Read existing settings from `business_profiles`, `agencies`, and `ghl_locations`. Admins can read all of these through RLS.

Save an existing location's business profile:

```ts
const { data, error } = await supabase.functions.invoke("admin-settings", {
  body: {
    action: "upsertBusinessProfile",
    locationId: "supabase-location-uuid",
    businessName: "Lawbric",
    address: "123 Main St, Jacksonville, FL 32202",
    websiteUrl: "https://example.com",
    phone: "+19042103388",
    ghlLocationId: "real-ghl-location-id",
    privateIntegrationApiKey: "subaccount-private-integration-api-key",
  },
});
```

Create a new location and business profile. `ghlLocationId` is required. `agencyId` is optional when exactly one agency exists:

```ts
const { data, error } = await supabase.functions.invoke("admin-settings", {
  body: {
    action: "upsertBusinessProfile",
    businessName: "Lawbric",
    address: "123 Main St, Jacksonville, FL 32202",
    websiteUrl: "https://example.com",
    phone: "+19042103388",
    ghlLocationId: "real-ghl-location-id",
    privateIntegrationApiKey: "subaccount-private-integration-api-key",
  },
});
```

The function updates `ghl_locations.name`, requires and updates `ghl_locations.ghl_location_id`, saves the subaccount private integration key, and upserts `business_profiles`. Use `business_profiles.location_id` / `ghl_locations.id` as the value for future user creation `locationIds`. The frontend Account Activation form should collect business profile fields, `ghlLocationId`, and `privateIntegrationApiKey`; it should not show a Supabase Agency ID or GHL Company ID field for the current single-agency app-user setup and must not substitute a Location ID when the admin leaves it blank. `privateIntegrationApiKey` is required when creating a location, and it is required when updating an existing location that does not already have one saved.

## App Location Context

Deploy the app location context function:

```sh
supabase functions deploy app-location-context --no-verify-jwt --use-api --project-ref <project-ref>
```

Frontend login/app startup should call this function after the user is authenticated:

```ts
const { data, error } = await supabase.functions.invoke("app-location-context", {
  body: {},
});
```

The response returns safe active-location metadata:

```json
{
  "ok": true,
  "configured": true,
  "location": {
    "id": "supabase-location-uuid",
    "name": "Lawbric",
    "ghlLocationId": "real-ghl-location-id",
    "hasPrivateIntegrationKey": true,
    "businessProfile": {
      "businessName": "Lawbric",
      "address": "...",
      "websiteUrl": "...",
      "phone": "..."
    }
  }
}
```

This function never returns the private integration API key. If `configured = true`, the frontend should not ask the user for API key or Location ID. GHL data requests should go through backend functions that load the saved key server-side.
