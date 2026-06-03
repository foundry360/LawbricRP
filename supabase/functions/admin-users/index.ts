import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminUserAction =
  | "create"
  | "update"
  | "deactivate"
  | "reactivate"
  | "sendPasswordReset"
  | "listAssignableUsers";

type ProfileRole = "admin" | "user";

type AdminUserRequest = {
  userId?: string;
  action?: AdminUserAction;
  email?: string;
  fullName?: string;
  phone?: string;
  role?: ProfileRole;
  locationIds?: string[];
  ghlRole?: string;
  ghlPermissions?: Record<string, unknown>;
  ghlScopes?: string[];
  reason?: string;
};

type LocationRow = {
  id: string;
  agency_id: string;
  ghl_location_id: string;
  encrypted_api_key: string | null;
};

type GhlCreateUserResponse = {
  ghlUserId?: string;
  id?: string;
  user?: {
    id?: string;
  };
  raw?: unknown;
};

type GhlUserAccountRow = {
  agency_id: string;
  ghl_user_id: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function writeCreateDiagnostic(
  supabase: ReturnType<typeof createClient>,
  message: string,
  data: Record<string, unknown> = {},
) {
  try {
    await supabase.from("agent_debug_events").insert({
      session_id: "admin-users-create",
      run_id: "password-reset-flow",
      hypothesis_id: "create",
      location: "supabase/functions/admin-users/index.ts",
      message,
      data,
    });
  } catch {
    // Diagnostics must never block the user-management flow.
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(req: Request): string | null {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null;
}

function normalizeEmail(email: string | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

function normalizeFullName(fullName: string | undefined): string | null {
  const normalized = fullName?.trim().replace(/\s+/g, " ");
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizePhone(phone: string | undefined): string | null {
  const normalized = phone?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeAuthPhone(phone: string | null): string | null {
  if (!phone) {
    return null;
  }

  if (phone.startsWith("+")) {
    return phone;
  }

  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

function splitName(fullName: string) {
  const [firstName, ...rest] = fullName.split(" ");

  return {
    firstName,
    lastName: rest.join(" ") || firstName,
  };
}

function isProfileRole(role: string | undefined): role is ProfileRole {
  return role === "admin" || role === "user";
}

async function updateGhlStaffUser(
  apiBaseUrl: string,
  apiToken: string,
  apiVersion: string,
  ghlUserId: string,
  payload: unknown,
): Promise<GhlCreateUserResponse> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/users/${ghlUserId}`, {
    method: "PUT",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      "Version": apiVersion,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = (await response.json().catch(() => null)) as
    | GhlCreateUserResponse
    | null;

  if (!response.ok) {
    throw new Error(`GHL staff user update failed: ${response.status}`);
  }

  return responseBody ?? {};
}

async function rollbackAuthUser(supabase: ReturnType<typeof createClient>, userId: string) {
  await supabase.auth.admin.deleteUser(userId).catch(() => null);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ghlApiBaseUrl = Deno.env.get("GHL_API_BASE_URL") ?? "https://services.leadconnectorhq.com";
  const ghlApiVersion = Deno.env.get("GHL_API_VERSION") ?? "2021-07-28";
  const configuredPasswordResetRedirectTo = Deno.env.get("PASSWORD_RESET_REDIRECT_TO");
  const passwordResetRedirectTo =
    configuredPasswordResetRedirectTo &&
      !configuredPasswordResetRedirectTo.includes("vibepreview.com")
      ? configuredPasswordResetRedirectTo
      : "https://lawbric-rp.vercel.app/reset-password";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration is incomplete" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  await writeCreateDiagnostic(supabase, "post received", {
    hasAuthHeader: Boolean(req.headers.get("Authorization")),
    contentType: req.headers.get("Content-Type") ?? null,
  });

  const jwt = getBearerToken(req);
  if (!jwt) {
    await writeCreateDiagnostic(supabase, "missing bearer token");
    return jsonResponse({ error: "Missing bearer token" }, 401);
  }

  const {
    data: { user: caller },
    error: callerError,
  } = await supabase.auth.getUser(jwt);

  if (callerError || !caller) {
    await writeCreateDiagnostic(supabase, "invalid bearer token", {
      errorName: callerError?.name,
      errorMessage: callerError?.message,
    });
    return jsonResponse({ error: "Invalid bearer token" }, 401);
  }

  let body: AdminUserRequest;

  try {
    body = (await req.json()) as AdminUserRequest;
  } catch {
    await writeCreateDiagnostic(supabase, "invalid json payload");
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  await writeCreateDiagnostic(supabase, "body parsed", {
    action: body.action ?? null,
    hasUserId: Boolean(body.userId),
    hasEmail: Boolean(body.email),
    hasFullName: Boolean(body.fullName),
    hasLocationIds: Boolean(body.locationIds?.length),
  });

  if (
    body.action !== "create" &&
    body.action !== "update" &&
    body.action !== "deactivate" &&
    body.action !== "reactivate" &&
    body.action !== "sendPasswordReset" &&
    body.action !== "listAssignableUsers"
  ) {
    return jsonResponse({
      error: "action must be create, update, deactivate, reactivate, sendPasswordReset, or listAssignableUsers",
    }, 400);
  }

  const { data: callerProfile, error: callerProfileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", caller.id)
    .maybeSingle();

  if (callerProfileError) {
    await writeCreateDiagnostic(supabase, "caller profile lookup failed", {
      errorCode: callerProfileError.code,
    });
    return jsonResponse({ error: "Could not verify admin permissions" }, 500);
  }

  if (!callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
    await writeCreateDiagnostic(supabase, "caller permission rejected", {
      hasProfile: Boolean(callerProfile),
      role: callerProfile?.role ?? null,
      isActive: callerProfile?.is_active ?? null,
    });
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  if (body.action === "listAssignableUsers") {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (profilesError) {
      await writeCreateDiagnostic(supabase, "assignable users lookup failed", {
        errorCode: profilesError.code,
        errorMessage: profilesError.message,
      });
      return jsonResponse({ error: "Could not load assignable users" }, 500);
    }

    return jsonResponse({
      ok: true,
      action: body.action,
      users: (profiles ?? []).map((profile) => ({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        name: profile.full_name || profile.email || profile.id,
        role: profile.role,
        is_active: profile.is_active,
      })),
    });
  }

  if (body.action === "sendPasswordReset") {
    if (!body.userId || !uuidPattern.test(body.userId)) {
      await writeCreateDiagnostic(supabase, "reset rejected invalid user id", {
        hasUserId: Boolean(body.userId),
      });
      return jsonResponse({ error: "Valid userId is required" }, 400);
    }

    const { data: targetProfile, error: targetProfileError } = await supabase
      .from("profiles")
      .select("id, email, is_active")
      .eq("id", body.userId)
      .maybeSingle();

    if (targetProfileError) {
      await writeCreateDiagnostic(supabase, "reset failed loading target profile", {
        errorCode: targetProfileError.code,
      });
      return jsonResponse({ error: "Could not load target profile" }, 500);
    }

    if (!targetProfile) {
      await writeCreateDiagnostic(supabase, "reset target profile not found", {});
      return jsonResponse({ error: "Target user profile not found" }, 404);
    }

    if (!targetProfile.is_active) {
      await writeCreateDiagnostic(supabase, "reset target user inactive", {});
      return jsonResponse({ error: "Cannot send password reset to an inactive user" }, 400);
    }

    const email = normalizeEmail(targetProfile.email);

    if (!email) {
      await writeCreateDiagnostic(supabase, "reset target email invalid", {});
      return jsonResponse({ error: "Target user does not have a valid email" }, 400);
    }

    const { error: passwordResetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: passwordResetRedirectTo,
    });

    if (passwordResetError) {
      await writeCreateDiagnostic(supabase, "reset email send failed", {
        errorName: passwordResetError.name,
        errorStatus: passwordResetError.status,
        errorCode: passwordResetError.code,
        errorMessage: passwordResetError.message,
      });

      return jsonResponse({
        ok: true,
        action: body.action,
        userId: body.userId,
        passwordResetSent: false,
        passwordResetSkippedReason: passwordResetError.message,
        passwordResetError: {
          name: passwordResetError.name,
          message: passwordResetError.message,
          status: passwordResetError.status,
          code: passwordResetError.code,
        },
      });
    }

    return jsonResponse({
      ok: true,
      action: body.action,
      userId: body.userId,
      passwordResetSent: true,
    });
  }

  if (body.action === "create") {
    const email = normalizeEmail(body.email);
    const fullName = normalizeFullName(body.fullName);
    const phone = normalizePhone(body.phone);
    const authPhone = normalizeAuthPhone(phone);
    const role = body.role ?? "user";

    if (!email) {
      return jsonResponse({ error: "Valid email is required" }, 400);
    }

    if (!fullName) {
      return jsonResponse({ error: "fullName is required" }, 400);
    }

    if (!isProfileRole(role)) {
      return jsonResponse({ error: "Invalid profile role" }, 400);
    }

    await writeCreateDiagnostic(supabase, "create validated request", {
      hasEmail: Boolean(email),
      hasFullName: Boolean(fullName),
      hasPhone: Boolean(phone),
      role,
      locationIdsCount: body.locationIds?.length ?? 0,
    });

    let uniqueLocationIds = [...new Set(body.locationIds ?? [])];

    if (uniqueLocationIds.length === 0) {
      const { data: businessProfiles, error: businessProfilesError } = await supabase
        .from("business_profiles")
        .select("location_id")
        .order("updated_at", { ascending: false });

      if (businessProfilesError) {
        return jsonResponse({ error: "Could not load saved business profile locations" }, 500);
      }

      const savedLocationIds = [
        ...new Set((businessProfiles ?? []).map((profile) => profile.location_id)),
      ];

      if (savedLocationIds.length === 1) {
        uniqueLocationIds = savedLocationIds;
      } else if (savedLocationIds.length === 0) {
        return jsonResponse({
          error: "No saved business profile location exists. Complete Account Activation first.",
        }, 400);
      } else {
        return jsonResponse({
          error: "Multiple saved business profile locations exist. Select a location before creating a user.",
        }, 400);
      }
    }

    if (uniqueLocationIds.some((locationId) => !uuidPattern.test(locationId))) {
      return jsonResponse({ error: "locationIds must be Supabase location UUIDs" }, 400);
    }

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfileError) {
      await writeCreateDiagnostic(supabase, "create failed checking existing profile", {
        errorCode: existingProfileError.code,
      });
      return jsonResponse({ error: "Could not check existing user" }, 500);
    }

    if (existingProfile) {
      await writeCreateDiagnostic(supabase, "create found existing profile", {});
      return jsonResponse({ error: "A profile with this email already exists" }, 409);
    }

    const { data: locations, error: locationsError } = await supabase
      .from("ghl_locations")
      .select("id, agency_id, ghl_location_id, encrypted_api_key")
      .in("id", uniqueLocationIds);

    if (locationsError) {
      return jsonResponse({ error: "Could not load selected locations" }, 500);
    }

    if (!locations || locations.length !== uniqueLocationIds.length) {
      return jsonResponse({ error: "One or more locations were not found" }, 400);
    }

    const agencyIds = [...new Set(locations.map((location: LocationRow) => location.agency_id))];

    if (agencyIds.length !== 1) {
      return jsonResponse({ error: "All selected locations must belong to one agency" }, 400);
    }

    if (locations.length !== 1) {
      return jsonResponse({ error: "Create one subaccount user for one location at a time" }, 400);
    }

    const location = locations[0] as LocationRow;

    if (!location.encrypted_api_key) {
      return jsonResponse({
        error: "Private Integration API Key is not configured for this location. Complete Account Activation first.",
      }, 400);
    }

    if (!location.ghl_location_id) {
      return jsonResponse({
        error: "GHL Location ID is not configured for this location. Complete Account Activation first.",
      }, 400);
    }

    const temporaryPassword = `${crypto.randomUUID()}Aa1!`;

    const {
      data: { user: createdUser },
      error: createUserError,
    } = await supabase.auth.admin.createUser({
      email,
      phone: authPhone ?? undefined,
      phone_confirm: authPhone ? true : undefined,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
      },
    });

    if (createUserError || !createdUser) {
      await writeCreateDiagnostic(supabase, "create failed creating auth user", {
        errorName: createUserError?.name,
        errorStatus: createUserError?.status,
        errorCode: createUserError?.code,
        errorMessage: createUserError?.message,
      });
      return jsonResponse({
        error: "Could not create Supabase Auth user",
        authError: {
          name: createUserError?.name,
          message: createUserError?.message,
          status: createUserError?.status,
          code: createUserError?.code,
        },
      }, 500);
    }

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: createdUser.id,
        email,
        full_name: fullName,
        phone,
        role,
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_reason: null,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      await rollbackAuthUser(supabase, createdUser.id);
      return jsonResponse({ error: "Could not create profile" }, 500);
    }

    const { error: locationsInsertError } = await supabase.from("user_locations").upsert(
      locations.map((location: LocationRow) => ({
        user_id: createdUser.id,
        location_id: location.id,
      })),
      { onConflict: "user_id,location_id" },
    );

    if (locationsInsertError) {
      await rollbackAuthUser(supabase, createdUser.id);
      await writeCreateDiagnostic(supabase, "create failed assigning locations", {
        errorCode: locationsInsertError.code,
      });
      return jsonResponse({ error: "Could not assign user locations" }, 500);
    }

    const { error: passwordResetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: passwordResetRedirectTo,
    });

    if (passwordResetError) {
      await writeCreateDiagnostic(supabase, "create failed sending password reset", {
        errorName: passwordResetError.name,
        errorStatus: passwordResetError.status,
        errorCode: passwordResetError.code,
        errorMessage: passwordResetError.message,
      });

      return jsonResponse(
        {
          ok: true,
          action: body.action,
          userId: createdUser.id,
          locationIds: uniqueLocationIds,
          passwordResetSent: false,
          passwordResetSkippedReason: passwordResetError.message,
          ghlCreated: false,
          ghlSkippedReason:
            "This app now creates Supabase app users only. GHL data access uses the saved subaccount integration key and location ID.",
        },
        201,
      );
    }

    return jsonResponse(
      {
        ok: true,
        action: body.action,
        userId: createdUser.id,
        locationIds: uniqueLocationIds,
        passwordResetSent: true,
        ghlCreated: false,
        ghlSkippedReason:
          "This app now creates Supabase app users only. GHL data access uses the saved subaccount integration key and location ID.",
      },
      201,
    );
  }

  if (!body.userId || !uuidPattern.test(body.userId)) {
    return jsonResponse({ error: "Valid userId is required" }, 400);
  }

  if (body.action === "update") {
    const profilePatch: Record<string, string | null> = {};
    const authMetadataPatch: Record<string, string | null> = {};
    const authPatch: {
      email?: string;
      phone?: string;
      phone_confirm?: boolean;
      user_metadata?: Record<string, string | null>;
    } = {};
    const ghlPatch: Record<string, unknown> = {};
    let authPhoneSkippedReason: string | null = null;

    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);

      if (!email) {
        return jsonResponse({ error: "Valid email is required" }, 400);
      }

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .neq("id", body.userId)
        .maybeSingle();

      if (existingProfileError) {
        return jsonResponse({ error: "Could not check existing email" }, 500);
      }

      if (existingProfile) {
        return jsonResponse({ error: "A profile with this email already exists" }, 409);
      }

      profilePatch.email = email;
      authPatch.email = email;
      ghlPatch.email = email;
    }

    if (body.fullName !== undefined) {
      const fullName = normalizeFullName(body.fullName);

      if (!fullName) {
        return jsonResponse({ error: "fullName cannot be empty" }, 400);
      }

      profilePatch.full_name = fullName;
      authMetadataPatch.full_name = fullName;

      const { firstName, lastName } = splitName(fullName);
      ghlPatch.firstName = firstName;
      ghlPatch.lastName = lastName;
    }

    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone);
      const authPhone = normalizeAuthPhone(phone);

      profilePatch.phone = phone;
      authMetadataPatch.phone = phone;
      ghlPatch.phone = phone ?? "";

      if (authPhone) {
        authPatch.phone = authPhone;
        authPatch.phone_confirm = true;
      } else if (phone) {
        authPhoneSkippedReason =
          "Supabase Auth phone requires an E.164 value. Stored phone in profiles and metadata only.";
      }
    }

    if (body.role !== undefined) {
      if (!isProfileRole(body.role)) {
        return jsonResponse({ error: "Invalid profile role" }, 400);
      }

      profilePatch.role = body.role;
    }

    if (body.ghlRole !== undefined) {
      ghlPatch.role = body.ghlRole;
    }

    if (Object.keys(profilePatch).length === 0) {
      return jsonResponse({ error: "No supported profile fields were provided" }, 400);
    }

    if (body.userId === caller.id && profilePatch.role && profilePatch.role !== "admin") {
      return jsonResponse({ error: "Admins cannot remove their own admin role" }, 400);
    }

    if (profilePatch.role && profilePatch.role !== "admin") {
      const { count, error: adminCountError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true)
        .neq("id", body.userId);

      if (adminCountError) {
        return jsonResponse({ error: "Could not verify remaining admins" }, 500);
      }

      if (!count || count < 1) {
        return jsonResponse({ error: "Cannot remove the last active admin" }, 400);
      }
    }

    const { data: targetProfile, error: targetProfileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", body.userId)
      .maybeSingle();

    if (targetProfileError) {
      return jsonResponse({ error: "Could not load target profile" }, 500);
    }

    if (!targetProfile) {
      return jsonResponse({ error: "Target user profile not found" }, 404);
    }

    if (Object.keys(authMetadataPatch).length > 0) {
      authPatch.user_metadata = authMetadataPatch;
    }

    if (Object.keys(authPatch).length > 0) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(body.userId, authPatch);

      if (authUpdateError) {
        return jsonResponse({ error: "Could not update auth user" }, 500);
      }
    }

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update(profilePatch)
      .eq("id", body.userId);

    if (profileUpdateError) {
      return jsonResponse({ error: "Could not update profile" }, 500);
    }

    let ghlUpdated = false;
    let ghlUpdateSkippedReason: string | null = null;

    if (Object.keys(ghlPatch).length > 0) {
      const { data: ghlAccount, error: ghlAccountError } = await supabase
        .from("ghl_user_accounts")
        .select("agency_id, ghl_user_id")
        .eq("user_id", body.userId)
        .maybeSingle();

      if (ghlAccountError) {
        return jsonResponse({ error: "Profile updated but could not load GHL user mapping" }, 500);
      }

      if (ghlAccount) {
        const { data: location, error: locationError } = await supabase
          .from("ghl_locations")
          .select("encrypted_api_key")
          .eq("agency_id", (ghlAccount as GhlUserAccountRow).agency_id)
          .limit(1)
          .maybeSingle();

        if (locationError) {
          return jsonResponse({ error: "Profile updated but could not load GHL location key" }, 500);
        }

        const locationApiKey = (location as { encrypted_api_key?: string | null } | null)
          ?.encrypted_api_key;
        const ghlUpdateApiKey = locationApiKey ?? Deno.env.get("GHL_API_TOKEN");

        if (!ghlUpdateApiKey) {
          return jsonResponse({
            error: "Profile updated but no GHL API key is configured for this location",
          }, 500);
        }

        try {
          const ghlResponse = await updateGhlStaffUser(
            ghlApiBaseUrl,
            ghlUpdateApiKey,
            ghlApiVersion,
            (ghlAccount as GhlUserAccountRow).ghl_user_id,
            ghlPatch,
          );

          const ghlAccountPatch: Record<string, unknown> = {
            raw_response: ghlResponse,
            updated_at: new Date().toISOString(),
          };

          if (profilePatch.email) {
            ghlAccountPatch.email = profilePatch.email;
          }

          const { error: ghlAccountUpdateError } = await supabase
            .from("ghl_user_accounts")
            .update(ghlAccountPatch)
            .eq("user_id", body.userId)
            .eq("agency_id", (ghlAccount as GhlUserAccountRow).agency_id);

          if (ghlAccountUpdateError) {
            return jsonResponse({ error: "GHL updated but local GHL mapping update failed" }, 500);
          }

          ghlUpdated = true;
        } catch {
          return jsonResponse({ error: "Profile updated but GHL user update failed" }, 502);
        }
      } else {
        ghlUpdateSkippedReason =
          "No GHL user mapping exists for this Supabase user. Create or backfill ghl_user_accounts before GHL updates can sync.";
      }
    }

    return jsonResponse({
      ok: true,
      userId: body.userId,
      action: body.action,
      ghlUpdated,
      ghlUpdateSkippedReason,
      authPhoneSkippedReason,
    });
  }

  if (body.action === "deactivate" && body.userId === caller.id) {
    return jsonResponse({ error: "Admins cannot deactivate themselves" }, 400);
  }

  const { data: targetProfile, error: targetProfileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", body.userId)
    .maybeSingle();

  if (targetProfileError) {
    return jsonResponse({ error: "Could not load target profile" }, 500);
  }

  if (!targetProfile) {
    return jsonResponse({ error: "Target user profile not found" }, 404);
  }

  if (body.action === "deactivate" && targetProfile.role === "admin") {
    const { count, error: adminCountError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", body.userId);

    if (adminCountError) {
      return jsonResponse({ error: "Could not verify remaining admins" }, 500);
    }

    if (!count || count < 1) {
      return jsonResponse({ error: "Cannot deactivate the last active admin" }, 400);
    }
  }

  const authAttributes =
    body.action === "deactivate"
      ? { ban_duration: "876000h" }
      : { ban_duration: "none" };

  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
    body.userId,
    authAttributes,
  );

  if (authUpdateError) {
    return jsonResponse({ error: "Could not update auth user" }, 500);
  }

  const profilePatch =
    body.action === "deactivate"
      ? {
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: caller.id,
          deactivation_reason: body.reason ?? null,
        }
      : {
          is_active: true,
          deactivated_at: null,
          deactivated_by: null,
          deactivation_reason: null,
        };

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update(profilePatch)
    .eq("id", body.userId);

  if (profileUpdateError) {
    return jsonResponse({ error: "Auth updated but profile update failed" }, 500);
  }

  return jsonResponse({
    ok: true,
    userId: body.userId,
    action: body.action,
  });
});
