import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminSettingsAction = "upsertBusinessProfile";

type AdminSettingsRequest = {
  action?: AdminSettingsAction;
  agencyId?: string;
  locationId?: string;
  ghlLocationId?: string;
  privateIntegrationApiKey?: string;
  businessName?: string;
  address?: string;
  websiteUrl?: string;
  phone?: string;
};

type LocationRow = {
  id: string;
  agency_id: string;
  encrypted_api_key: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeText(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeNullableText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function isValidUrl(value: string | null): boolean {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration is incomplete" }, 500);
  }

  const jwt = getBearerToken(req);
  if (!jwt) {
    return jsonResponse({ error: "Missing bearer token" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await supabase.auth.getUser(jwt);

  if (callerError || !caller) {
    return jsonResponse({ error: "Invalid bearer token" }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", caller.id)
    .maybeSingle();

  if (callerProfileError) {
    return jsonResponse({ error: "Could not verify admin permissions" }, 500);
  }

  if (!callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  let body: AdminSettingsRequest;

  try {
    body = (await req.json()) as AdminSettingsRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (body.action !== "upsertBusinessProfile") {
    return jsonResponse({ error: "action must be upsertBusinessProfile" }, 400);
  }

  const businessName = normalizeText(body.businessName);
  const address = normalizeNullableText(body.address);
  const websiteUrl = normalizeNullableText(body.websiteUrl);
  const phone = normalizeNullableText(body.phone);
  const ghlLocationId = normalizeNullableText(body.ghlLocationId);
  const privateIntegrationApiKey = normalizeNullableText(body.privateIntegrationApiKey);

  if (!businessName) {
    return jsonResponse({ error: "businessName is required" }, 400);
  }

  if (!ghlLocationId) {
    return jsonResponse({ error: "ghlLocationId is required" }, 400);
  }

  if (!isValidUrl(websiteUrl)) {
    return jsonResponse({ error: "websiteUrl must be a valid http or https URL" }, 400);
  }

  let location: LocationRow | null = null;

  if (body.locationId) {
    if (!uuidPattern.test(body.locationId)) {
      return jsonResponse({ error: "locationId must be a Supabase location UUID" }, 400);
    }

    const { data, error } = await supabase
      .from("ghl_locations")
      .select("id, agency_id, encrypted_api_key")
      .eq("id", body.locationId)
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: "Could not load location" }, 500);
    }

    if (!data) {
      return jsonResponse({ error: "Location not found" }, 404);
    }

    location = data as LocationRow;

    if (!location.encrypted_api_key && !privateIntegrationApiKey) {
      return jsonResponse({
        error: "privateIntegrationApiKey is required because this location does not have one saved",
      }, 400);
    }

    const locationPatch: Record<string, string> = {
      name: businessName,
      ghl_location_id: ghlLocationId,
    };

    if (privateIntegrationApiKey) {
      locationPatch.encrypted_api_key = privateIntegrationApiKey;
    }

    const { error: locationUpdateError } = await supabase
      .from("ghl_locations")
      .update(locationPatch)
      .eq("id", location.id);

    if (locationUpdateError) {
      return jsonResponse({ error: "Could not update location settings" }, 500);
    }
  } else {
    if (body.agencyId && !uuidPattern.test(body.agencyId)) {
      return jsonResponse({ error: "agencyId must be a Supabase agency UUID" }, 400);
    }

    if (!privateIntegrationApiKey) {
      return jsonResponse({ error: "privateIntegrationApiKey is required when creating a location" }, 400);
    }

    let agencyId = body.agencyId;

    if (!agencyId) {
      const { data: agencies, error: agenciesError } = await supabase
        .from("agencies")
        .select("id")
        .order("created_at", { ascending: true });

      if (agenciesError) {
        return jsonResponse({ error: "Could not load agency" }, 500);
      }

      if (!agencies || agencies.length === 0) {
        return jsonResponse({ error: "No agency exists. Create the account agency first." }, 400);
      }

      if (agencies.length > 1) {
        return jsonResponse({
          error: "Multiple agencies exist. Select the account internally before saving settings.",
        }, 400);
      }

      agencyId = agencies[0].id;
    }

    const { data: agency, error: agencyError } = await supabase
      .from("agencies")
      .select("id")
      .eq("id", agencyId)
      .maybeSingle();

    if (agencyError) {
      return jsonResponse({ error: "Could not load agency" }, 500);
    }

    if (!agency) {
      return jsonResponse({ error: "Agency not found" }, 404);
    }

    const { data: insertedLocation, error: locationInsertError } = await supabase
      .from("ghl_locations")
      .insert({
        agency_id: agencyId,
        ghl_location_id: ghlLocationId,
        name: businessName,
        encrypted_api_key: privateIntegrationApiKey,
      })
      .select("id, agency_id, encrypted_api_key")
      .single();

    if (locationInsertError) {
      return jsonResponse({ error: "Could not create location" }, 500);
    }

    location = insertedLocation as LocationRow;
  }

  const { data: businessProfile, error: businessProfileError } = await supabase
    .from("business_profiles")
    .upsert(
      {
        agency_id: location.agency_id,
        location_id: location.id,
        business_name: businessName,
        address,
        website_url: websiteUrl,
        phone,
        updated_at: new Date().toISOString(),
        updated_by: caller.id,
      },
      { onConflict: "location_id" },
    )
    .select(
      "id, agency_id, location_id, business_name, address, website_url, phone, created_at, updated_at, updated_by",
    )
    .single();

  if (businessProfileError) {
    return jsonResponse({ error: "Could not save business profile" }, 500);
  }

  const { error: callerLocationError } = await supabase.from("user_locations").upsert(
    {
      user_id: caller.id,
      location_id: location.id,
    },
    { onConflict: "user_id,location_id" },
  );

  if (callerLocationError) {
    return jsonResponse({ error: "Could not assign admin to activated location" }, 500);
  }

  return jsonResponse({
    ok: true,
    action: body.action,
    locationId: location.id,
    businessProfile,
  });
});
