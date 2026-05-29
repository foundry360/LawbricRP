import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type HandoffRequest = {
  locationId: string;
  action: string;
  payload?: unknown;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const backendUrl = Deno.env.get("GHL_BACKEND_URL");
  const backendSecret = Deno.env.get("GHL_BACKEND_SHARED_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !backendUrl || !backendSecret) {
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
    .select("location_id, ghl_locations!inner(ghl_location_id, agency_id)")
    .eq("user_id", user.id)
    .eq("location_id", body.locationId)
    .maybeSingle();

  if (mappingError) {
    return jsonResponse({ error: "Could not verify location access" }, 500);
  }

  if (!mapping) {
    return jsonResponse({ error: "Location access denied" }, 403);
  }

  const location = Array.isArray(mapping.ghl_locations)
    ? mapping.ghl_locations[0]
    : mapping.ghl_locations;

  const backendResponse = await fetch(`${backendUrl.replace(/\/$/, "")}/ghl/handoff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GHL-Backend-Secret": backendSecret,
    },
    body: JSON.stringify({
      userId: user.id,
      locationId: mapping.location_id,
      ghlLocationId: location.ghl_location_id,
      agencyId: location.agency_id,
      action: body.action,
      payload: body.payload ?? null,
    }),
  });

  const responseText = await backendResponse.text();

  return new Response(responseText, {
    status: backendResponse.status,
    headers: {
      ...corsHeaders,
      "Content-Type": backendResponse.headers.get("Content-Type") ?? "application/json",
    },
  });
});
