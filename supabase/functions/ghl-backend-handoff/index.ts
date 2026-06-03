import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type HandoffRequest = {
  locationId: string;
  action: string;
  payload?: unknown;
};

type ApiPayload = {
  endpoint?: string;
  method?: string;
  body?: unknown;
  version?: string;
};

type LocationRow = {
  id?: string;
  location_id?: string;
  ghl_location_id: string | null;
  agency_id: string | null;
  encrypted_api_key: string | null;
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

function isApiPayload(payload: unknown): payload is ApiPayload {
  return typeof payload === "object" && payload !== null;
}

function buildGhlUrl(baseUrl: string, endpoint: string) {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.includes("://")) {
    throw new Error("payload.endpoint must be a relative GHL API path");
  }

  return new URL(endpoint, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function getGhlApiVersion(payloadVersion: unknown, fallbackVersion: string) {
  if (typeof payloadVersion !== "string" || payloadVersion.trim() === "") return fallbackVersion;

  const version = payloadVersion.trim();
  if (!["2021-07-28", "2021-04-15"].includes(version)) {
    throw new Error("Unsupported GHL API version");
  }

  return version;
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

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration is incomplete" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  const jwt = authHeader?.replace(/^Bearer\s+/i, "");

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

  const body = (await req.json()) as Partial<HandoffRequest>;

  if (!body.locationId || !body.action) {
    return jsonResponse({ error: "locationId and action are required" }, 400);
  }

  const { data: mapping, error: mappingError } = await supabase
    .from("user_locations")
    .select("location_id, ghl_locations!inner(ghl_location_id, agency_id, encrypted_api_key)")
    .eq("user_id", user.id)
    .eq("location_id", body.locationId)
    .maybeSingle();

  if (mappingError) {
    return jsonResponse({ error: "Could not verify location access" }, 500);
  }

  let location: LocationRow | null = mapping
    ? Array.isArray(mapping.ghl_locations)
      ? mapping.ghl_locations[0]
      : mapping.ghl_locations
    : null;

  if (!location) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return jsonResponse({ error: "Could not verify admin access" }, 500);
    }

    if (profile?.role !== "admin" || !profile?.is_active) {
      return jsonResponse({ error: "Location access denied" }, 403);
    }

    const { data: adminLocation, error: adminLocationError } = await supabase
      .from("ghl_locations")
      .select("id, ghl_location_id, agency_id, encrypted_api_key")
      .eq("id", body.locationId)
      .maybeSingle();

    if (adminLocationError) {
      return jsonResponse({ error: "Could not load admin location access" }, 500);
    }

    if (!adminLocation) {
      return jsonResponse({ error: "Location access denied" }, 403);
    }

    location = adminLocation;
  }

  if (!location.ghl_location_id || !location.encrypted_api_key) {
    return jsonResponse({
      error: "GHL Location ID or Private Integration API Key is not configured. Complete Account Activation first.",
    }, 400);
  }

  if (body.action !== "api") {
    return jsonResponse({ error: `Unsupported GHL handoff action: ${body.action}` }, 400);
  }

  if (!isApiPayload(body.payload) || !body.payload.endpoint) {
    return jsonResponse({ error: "payload.endpoint is required" }, 400);
  }

  const method = (body.payload.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return jsonResponse({ error: "Unsupported GHL API method" }, 400);
  }

  let requestGhlApiVersion: string;
  try {
    requestGhlApiVersion = getGhlApiVersion(body.payload.version, ghlApiVersion);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid GHL API version" }, 400);
  }

  let ghlUrl: string;
  try {
    ghlUrl = buildGhlUrl(ghlApiBaseUrl, body.payload.endpoint);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid GHL API endpoint" }, 400);
  }

  const ghlResponse = await fetch(ghlUrl, {
    method,
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${location.encrypted_api_key}`,
      "Content-Type": "application/json",
      "Version": requestGhlApiVersion,
    },
    body: method === "GET" || method === "DELETE" || body.payload.body === undefined
      ? undefined
      : JSON.stringify(body.payload.body),
  });

  const responseText = await ghlResponse.text();

  return new Response(responseText, {
    status: ghlResponse.status,
    headers: {
      ...corsHeaders,
      "Content-Type": ghlResponse.headers.get("Content-Type") ?? "application/json",
    },
  });
});
