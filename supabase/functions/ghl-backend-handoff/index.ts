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

function getNormalizedEndpoint(endpoint: string) {
  return endpoint.split("?")[0].replace(/\/+$/, "") || "/";
}

function getRequiredPermission(method: string, endpoint: string) {
  const normalizedEndpoint = getNormalizedEndpoint(endpoint);

  if (method === "POST" && /^\/contacts$/i.test(normalizedEndpoint)) {
    return "contacts.create";
  }

  if (["PUT", "PATCH"].includes(method) && /^\/contacts\/[^/]+$/i.test(normalizedEndpoint)) {
    return "contacts.edit";
  }

  if (method === "POST" && /^\/contacts\/bulk\/business$/i.test(normalizedEndpoint)) {
    return "contacts.edit";
  }

  if (method === "DELETE" && /^\/contacts\/[^/]+$/i.test(normalizedEndpoint)) {
    return "contacts.delete";
  }

  if (method === "POST" && /^\/businesses$/i.test(normalizedEndpoint)) {
    return "contacts.create";
  }

  if (["PUT", "PATCH"].includes(method) && /^\/businesses\/[^/]+$/i.test(normalizedEndpoint)) {
    return "contacts.edit";
  }

  if (method === "DELETE" && /^\/businesses\/[^/]+$/i.test(normalizedEndpoint)) {
    return "contacts.delete";
  }

  if (method === "POST" && /^\/opportunities$/i.test(normalizedEndpoint)) {
    return "leads.create";
  }

  if (["PUT", "PATCH"].includes(method) && /^\/opportunities\/[^/]+$/i.test(normalizedEndpoint)) {
    return "leads.edit";
  }

  if (method === "DELETE" && /^\/opportunities\/[^/]+$/i.test(normalizedEndpoint)) {
    return "leads.delete";
  }

  return null;
}

function getEndpointRecordId(endpoint: string, prefix: "contacts" | "businesses") {
  const normalizedEndpoint = getNormalizedEndpoint(endpoint);
  const match = normalizedEndpoint.match(new RegExp(`^/${prefix}/([^/]+)$`, "i"));
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

async function userHasPermission(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  permissionKey: string,
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile?.is_active) return false;
  if (profile.role === "admin") return true;

  const { data: overrideRows, error: overrideError } = await supabase
    .from("user_permissions")
    .select("effect, permissions!inner(key)")
    .eq("user_id", userId)
    .eq("permissions.key", permissionKey);

  if (overrideError) return false;

  const overrides = overrideRows ?? [];
  if (overrides.some((row: any) => row.effect === "deny")) return false;
  if (overrides.some((row: any) => row.effect === "grant")) return true;

  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);

  if (roleError || !roleRows?.length) return false;

  const roleIds = roleRows.map((row: any) => row.role_id).filter(Boolean);
  if (roleIds.length === 0) return false;

  const { data: rolePermissionRows, error: rolePermissionError } = await supabase
    .from("role_permissions")
    .select("role_id, permissions!inner(key)")
    .in("role_id", roleIds)
    .eq("permissions.key", permissionKey);

  if (rolePermissionError) return false;
  return Boolean(rolePermissionRows?.length);
}

async function userHasAnyPermission(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  permissionKeys: string[],
) {
  for (const permissionKey of permissionKeys) {
    if (await userHasPermission(supabase, userId, permissionKey)) return true;
  }
  return false;
}

async function userCanAccessContact(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  locationId: string,
  contactId: string,
) {
  if (!contactId) return false;
  if (await userHasAnyPermission(supabase, userId, ["contacts.view_all", "contacts.view_location"])) return true;
  if (!await userHasPermission(supabase, userId, "contacts.view_assigned")) return false;

  const { data, error } = await supabase
    .from("contact_assignments")
    .select("ghl_contact_id")
    .eq("location_id", locationId)
    .eq("ghl_contact_id", contactId)
    .eq("assigned_user_id", userId)
    .limit(1);

  if (error) return false;
  return Boolean(data?.length);
}

function getContactId(rawContact: any) {
  return String(rawContact?.id || rawContact?._id || rawContact?.contactId || "");
}

function filterContactsPayload(payload: any, allowedContactIds: Set<string>) {
  const filterContacts = (contacts: any[]) => contacts.filter((contact) => allowedContactIds.has(getContactId(contact)));
  const nextPayload = Array.isArray(payload) ? filterContacts(payload) : { ...payload };

  if (Array.isArray(nextPayload.contacts)) nextPayload.contacts = filterContacts(nextPayload.contacts);
  if (Array.isArray(nextPayload.data)) nextPayload.data = filterContacts(nextPayload.data);
  if (nextPayload.data && Array.isArray(nextPayload.data.contacts)) {
    nextPayload.data = {
      ...nextPayload.data,
      contacts: filterContacts(nextPayload.data.contacts),
    };
  }

  return nextPayload;
}

function filterBusinessesPayload(payload: any, allowedBusinessIds: Set<string>) {
  const filterBusinesses = (businesses: any[]) => businesses.filter((business) => allowedBusinessIds.has(getContactId(business)));
  const nextPayload = Array.isArray(payload) ? filterBusinesses(payload) : { ...payload };

  if (Array.isArray(nextPayload.businesses)) nextPayload.businesses = filterBusinesses(nextPayload.businesses);
  if (Array.isArray(nextPayload.data)) nextPayload.data = filterBusinesses(nextPayload.data);
  if (nextPayload.data && Array.isArray(nextPayload.data.businesses)) {
    nextPayload.data = {
      ...nextPayload.data,
      businesses: filterBusinesses(nextPayload.data.businesses),
    };
  }

  return nextPayload;
}

async function filterContactListResponse(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  locationId: string,
  responseText: string,
) {
  if (await userHasAnyPermission(supabase, userId, ["contacts.view_all", "contacts.view_location"])) return responseText;
  if (!await userHasPermission(supabase, userId, "contacts.view_assigned")) return responseText;

  const { data, error } = await supabase
    .from("contact_assignments")
    .select("ghl_contact_id")
    .eq("location_id", locationId)
    .eq("assigned_user_id", userId);

  if (error) return responseText;
  const allowedContactIds = new Set((data ?? []).map((row: any) => String(row.ghl_contact_id || "")).filter(Boolean));

  try {
    return JSON.stringify(filterContactsPayload(JSON.parse(responseText), allowedContactIds));
  } catch {
    return responseText;
  }
}

async function filterBusinessListResponse(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  locationId: string,
  responseText: string,
) {
  if (await userHasAnyPermission(supabase, userId, ["contacts.view_all", "contacts.view_location"])) return responseText;
  if (!await userHasPermission(supabase, userId, "contacts.view_assigned")) return responseText;

  const { data, error } = await supabase
    .from("contact_assignments")
    .select("ghl_contact_id")
    .eq("location_id", locationId)
    .eq("assigned_user_id", userId);

  if (error) return responseText;
  const allowedBusinessIds = new Set((data ?? []).map((row: any) => String(row.ghl_contact_id || "")).filter(Boolean));

  try {
    return JSON.stringify(filterBusinessesPayload(JSON.parse(responseText), allowedBusinessIds));
  } catch {
    return responseText;
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

  const requiredPermission = getRequiredPermission(method, body.payload.endpoint);
  if (requiredPermission && !await userHasPermission(supabase, user.id, requiredPermission)) {
    return jsonResponse({ error: "You do not have permission to perform this action." }, 403);
  }

  const normalizedEndpoint = getNormalizedEndpoint(body.payload.endpoint);
  const contactId = getEndpointRecordId(body.payload.endpoint, "contacts");
  const businessId = getEndpointRecordId(body.payload.endpoint, "businesses");
  const isContactListRequest = method === "GET" && /^\/contacts$/i.test(normalizedEndpoint);
  const isBusinessListRequest = method === "GET" && /^\/businesses$/i.test(normalizedEndpoint);
  const isSingleContactRequest = method === "GET" && Boolean(contactId);
  const isContactWriteRequest = ["PUT", "PATCH", "DELETE"].includes(method) && Boolean(contactId);
  const isSingleBusinessRequest = method === "GET" && Boolean(businessId);

  if (isContactListRequest && !await userHasAnyPermission(supabase, user.id, [
    "contacts.view_all",
    "contacts.view_location",
    "contacts.view_assigned",
  ])) {
    return jsonResponse({ error: "You do not have permission to view contacts." }, 403);
  }

  if ((isSingleContactRequest || isContactWriteRequest) && !await userCanAccessContact(supabase, user.id, body.locationId, contactId)) {
    return jsonResponse({ error: "You do not have permission to access this contact." }, 403);
  }

  if (isBusinessListRequest && !await userHasAnyPermission(supabase, user.id, [
    "contacts.view_all",
    "contacts.view_location",
    "contacts.view_assigned",
  ])) {
    return jsonResponse({ error: "You do not have permission to view companies." }, 403);
  }

  if (isSingleBusinessRequest && !await userCanAccessContact(supabase, user.id, body.locationId, businessId)) {
    return jsonResponse({ error: "You do not have permission to access this company." }, 403);
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
  let filteredResponseText = responseText;
  if (isContactListRequest && ghlResponse.ok) {
    filteredResponseText = await filterContactListResponse(supabase, user.id, body.locationId, responseText);
  }
  if (isBusinessListRequest && ghlResponse.ok) {
    filteredResponseText = await filterBusinessListResponse(supabase, user.id, body.locationId, responseText);
  }

  return new Response(filteredResponseText, {
    status: ghlResponse.status,
    headers: {
      ...corsHeaders,
      "Content-Type": ghlResponse.headers.get("Content-Type") ?? "application/json",
    },
  });
});
