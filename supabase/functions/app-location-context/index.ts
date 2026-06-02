import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ProfileRow = {
  id: string;
  role: "admin" | "user";
  is_active: boolean;
};

type LocationContextRow = {
  location_id: string;
  location_name: string;
  ghl_location_id: string | null;
  encrypted_api_key: string | null;
  business_name: string | null;
  address: string | null;
  website_url: string | null;
  phone: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: "Invalid bearer token" }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: "Could not load profile" }, 500);
  }

  if (!profile || !(profile as ProfileRow).is_active) {
    return jsonResponse({ error: "Active user profile required" }, 403);
  }

  const { data: assignedLocation, error: assignedLocationError } = await supabase
    .from("user_locations")
    .select(
      `
      location_id,
      ghl_locations!inner (
        name,
        ghl_location_id,
        encrypted_api_key,
        business_profiles (
          business_name,
          address,
          website_url,
          phone
        )
      )
    `,
    )
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (assignedLocationError) {
    return jsonResponse({ error: "Could not load assigned location" }, 500);
  }

  let location: LocationContextRow | null = null;

  if (assignedLocation) {
    const ghlLocation = (assignedLocation as {
      location_id: string;
      ghl_locations: {
        name: string;
        ghl_location_id: string | null;
        encrypted_api_key: string | null;
        business_profiles?: Array<{
          business_name: string | null;
          address: string | null;
          website_url: string | null;
          phone: string | null;
        }>;
      };
    }).ghl_locations;
    const businessProfile = ghlLocation.business_profiles?.[0] ?? null;

    location = {
      location_id: (assignedLocation as { location_id: string }).location_id,
      location_name: ghlLocation.name,
      ghl_location_id: ghlLocation.ghl_location_id,
      encrypted_api_key: ghlLocation.encrypted_api_key,
      business_name: businessProfile?.business_name ?? null,
      address: businessProfile?.address ?? null,
      website_url: businessProfile?.website_url ?? null,
      phone: businessProfile?.phone ?? null,
    };
  } else if ((profile as ProfileRow).role === "admin") {
    const { data: businessProfileLocation, error: businessProfileLocationError } = await supabase
      .from("business_profiles")
      .select(
        `
        location_id,
        business_name,
        address,
        website_url,
        phone,
        ghl_locations!inner (
          name,
          ghl_location_id,
          encrypted_api_key
        )
      `,
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (businessProfileLocationError) {
      return jsonResponse({ error: "Could not load activated location" }, 500);
    }

    if (businessProfileLocation) {
      const row = businessProfileLocation as {
        location_id: string;
        business_name: string | null;
        address: string | null;
        website_url: string | null;
        phone: string | null;
        ghl_locations: {
          name: string;
          ghl_location_id: string | null;
          encrypted_api_key: string | null;
        };
      };

      location = {
        location_id: row.location_id,
        location_name: row.ghl_locations.name,
        ghl_location_id: row.ghl_locations.ghl_location_id,
        encrypted_api_key: row.ghl_locations.encrypted_api_key,
        business_name: row.business_name,
        address: row.address,
        website_url: row.website_url,
        phone: row.phone,
      };
    }
  }

  if (!location) {
    return jsonResponse({
      ok: true,
      configured: false,
      userRole: (profile as ProfileRow).role,
      is_active: (profile as ProfileRow).is_active,
      reason: "No activated location is assigned to this user.",
    });
  }

  return jsonResponse({
    ok: true,
    configured: Boolean(location.ghl_location_id && location.encrypted_api_key),
    userRole: (profile as ProfileRow).role,
    is_active: (profile as ProfileRow).is_active,
    location: {
      id: location.location_id,
      name: location.location_name,
      ghlLocationId: location.ghl_location_id,
      hasPrivateIntegrationKey: Boolean(location.encrypted_api_key),
      businessProfile: {
        businessName: location.business_name,
        address: location.address,
        websiteUrl: location.website_url,
        phone: location.phone,
      },
    },
  });
});
