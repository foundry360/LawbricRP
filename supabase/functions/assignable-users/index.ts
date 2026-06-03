import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function getBearerToken(req: Request) {
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
    data: { user: caller },
    error: callerError,
  } = await supabase.auth.getUser(jwt);

  if (callerError || !caller) {
    return jsonResponse({ error: "Invalid bearer token" }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", caller.id)
    .maybeSingle();

  if (callerProfileError) {
    return jsonResponse({ error: "Could not verify user access" }, 500);
  }

  if (!callerProfile?.is_active) {
    return jsonResponse({ error: "Active app user required" }, 403);
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (profilesError) {
    return jsonResponse({ error: "Could not load assignable users" }, 500);
  }

  return jsonResponse({
    ok: true,
    users: (profiles ?? []).map((profile) => ({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      name: profile.full_name || profile.email || profile.id,
      role: profile.role,
      is_active: profile.is_active,
    })),
  });
});
