# Role-Based Access Model

## Goal

Users are Supabase app users, not native GHL users. Access to GHL data is controlled inside the app using Supabase Auth, location assignments, roles, and resource permissions.

The frontend should never call GHL directly or receive the private integration API key. All GHL data access should go through backend functions that verify the Supabase user and enforce permissions before calling GHL.

## Current Foundation

The current access model already has location-level access:

- `profiles` identifies the Supabase app user.
- `ghl_locations` stores the connected GHL subaccount/location.
- `user_locations` assigns app users to locations.
- `business_profiles` stores Account Activation settings for a location.

This answers the first access question: which GHL location can this app user access?

It does not answer more granular questions, such as:

- Which calendars can this user see?
- Which pipelines can this user edit?
- Can this user create contacts?
- Can this user delete opportunities?

Role-based access should handle those app-level permissions.

## Recommended Tables

### `app_roles`

Defines reusable roles per agency/location.

```text
app_roles
- id
- agency_id
- location_id
- name
- description
- is_system_role
- created_at
- updated_at
```

Example roles:

- Admin
- Attorney
- Paralegal
- Intake
- Scheduler
- Viewer

### `user_roles`

Assigns users to roles for a location.

```text
user_roles
- user_id
- role_id
- location_id
- created_at
```

### `role_permissions`

Defines what each role can do.

```text
role_permissions
- role_id
- location_id
- resource_type
- resource_id
- actions jsonb
- created_at
- updated_at
```

`resource_id` can be `null` for broad permissions, or a GHL resource ID for item-specific permissions.

Example `actions`:

```json
{
  "view": true,
  "create": true,
  "edit": false,
  "delete": false
}
```

## Resource Types

Resource types should match the app features and GHL data being protected.

Examples:

- `contacts`
- `calendars`
- `calendar`
- `pipelines`
- `pipeline`
- `opportunities`
- `conversations`
- `tasks`

Use plural resource types for broad feature access, and singular resource types for individual GHL resources.

Example:

```text
resource_type = "calendars"
resource_id = null
```

Means broad calendar feature access.

```text
resource_type = "calendar"
resource_id = "ghl-calendar-id"
```

Means access to one specific GHL calendar.

## Backend Enforcement

Every GHL data Edge Function should enforce access before calling GHL.

Each function should:

1. Verify the Supabase JWT.
2. Verify `profiles.is_active = true`.
3. Verify the user has location access through `user_locations`.
4. Load the user's role through `user_roles`.
5. Check role permissions through `role_permissions`.
6. Load the saved GHL Location ID and private integration key.
7. Call GHL only for allowed resources/actions.
8. Return only authorized data to the frontend.

The frontend can hide UI controls based on role permissions, but the backend must be the source of truth.

## Calendar Access Example

If users should only access their assigned calendars, create permissions like this:

```text
role_permissions
- role_id = Scheduler
- resource_type = calendar
- resource_id = ghl-calendar-a
- actions = {"view": true, "create": true, "edit": true, "delete": false}
```

Example outcome:

```text
Jeff -> Calendar A only
Sarah -> Calendar B only
Admin -> Calendar A + Calendar B + Calendar C
```

When Jeff opens calendars, the backend should:

1. Load Jeff's assigned role.
2. Load calendar permissions for Jeff's role.
3. Call GHL only for the allowed calendar IDs.
4. Return only those calendars/events.

## Pipeline Access Example

Pipeline access can follow the same pattern:

```text
role_permissions
- role_id = Intake
- resource_type = pipeline
- resource_id = ghl-pipeline-id
- actions = {"view": true, "create": true, "edit": true, "delete": false}
```

If a role should see all pipelines, use:

```text
role_permissions
- role_id = Admin
- resource_type = pipelines
- resource_id = null
- actions = {"view": true, "create": true, "edit": true, "delete": true}
```

## Optional User Overrides

Roles should handle the common case. If exceptions are needed later, add user-level overrides.

```text
user_permission_overrides
- user_id
- location_id
- resource_type
- resource_id
- actions jsonb
- created_at
- updated_at
```

Example:

```text
Paralegal role can view all contacts.
Sarah also gets access to Attorney Smith's calendar.
```

The backend permission check should merge permissions in this order:

1. Location access from `user_locations`.
2. Role permissions from `role_permissions`.
3. User overrides from `user_permission_overrides`.

## Recommended Admin UI

Add a Roles section under settings or user management:

- Create/edit roles.
- Assign role permissions.
- Assign users to roles.
- Optionally assign resource-specific permissions, such as specific calendars or pipelines.

For User Management:

- Show each user's role.
- Allow admins to change the user's role.
- Keep the existing Admin/User profile role separate from app roles if needed.

## Important Distinction

`profiles.role` is currently used for high-level app administration:

- `admin`
- `user`

Role-based access should be a separate layer for GHL feature/resource access.

That keeps the model clear:

```text
profiles.role
  -> Can this person administer the app?

app_roles / role_permissions
  -> What GHL data and app features can this person access?
```
