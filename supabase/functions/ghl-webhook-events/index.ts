import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WebhookPayload = Record<string, unknown>;

type NotificationEvent = {
  location_id: string;
  ghl_location_id: string;
  event_type: string;
  external_event_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  calendar_id: string | null;
  title: string;
  message: string | null;
  payload: WebhookPayload;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

// SHA-256 hash of the generated webhook secret. This avoids depending on
// Supabase function secrets while the CLI token flow is rejecting secret writes.
const fallbackWebhookSecretSha256 =
  "4b4fc28611437b009607424153d7a21a778ba335a45c1304c8d299b926c371cb";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNestedString(payload: WebhookPayload, paths: string[][]): string | null {
  for (const path of paths) {
    let current: unknown = payload;

    for (const segment of path) {
      if (!current || typeof current !== "object" || !(segment in current)) {
        current = null;
        break;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    const value = getString(current);
    if (value) {
      return value;
    }
  }

  return null;
}

function pickEventType(payload: WebhookPayload): string {
  return (
    getNestedString(payload, [
      ["type"],
      ["event"],
      ["eventType"],
      ["event_type"],
      ["trigger"],
    ]) ?? "ghl.webhook"
  );
}

function pickTitle(eventType: string, payload: WebhookPayload): string {
  return (
    getNestedString(payload, [
      ["title"],
      ["notification", "title"],
      ["contact", "name"],
      ["contact", "fullName"],
      ["opportunity", "name"],
      ["appointment", "title"],
      ["calendar", "name"],
    ]) ?? eventType
  );
}

function pickMessage(payload: WebhookPayload): string | null {
  return getNestedString(payload, [
    ["message"],
    ["notification", "message"],
    ["body"],
    ["description"],
    ["notes"],
  ]);
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }

  return mismatch === 0;
}

async function hasWebhookSecret(req: Request): Promise<boolean> {
  const expectedSecret = Deno.env.get("GHL_WEBHOOK_SHARED_SECRET");
  const expectedSecretSha256 =
    Deno.env.get("GHL_WEBHOOK_SHARED_SECRET_SHA256") ?? fallbackWebhookSecretSha256;

  if (!expectedSecret && !expectedSecretSha256) {
    return false;
  }

  const requestSecret =
    req.headers.get("x-lawbric-webhook-secret") ??
    req.headers.get("x-ghl-webhook-secret") ??
    new URL(req.url).searchParams.get("secret");

  if (!requestSecret) {
    return false;
  }

  if (expectedSecret && timingSafeEqual(requestSecret, expectedSecret)) {
    return true;
  }

  return timingSafeEqual(await sha256Hex(requestSecret), expectedSecretSha256);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!(await hasWebhookSecret(req))) {
    return jsonResponse({ error: "Invalid webhook secret" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration is incomplete" }, 500);
  }

  let payload: WebhookPayload;

  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const ghlLocationId = getNestedString(payload, [
    ["locationId"],
    ["location_id"],
    ["ghl_location_id"],
    ["location", "id"],
    ["data", "locationId"],
    ["data", "location_id"],
  ]);

  if (!ghlLocationId) {
    return jsonResponse({ error: "Webhook payload is missing locationId" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: location, error: locationError } = await supabase
    .from("ghl_locations")
    .select("id, ghl_location_id")
    .eq("ghl_location_id", ghlLocationId)
    .maybeSingle();

  if (locationError) {
    return jsonResponse({ error: "Could not resolve GHL location" }, 500);
  }

  if (!location) {
    return jsonResponse({ error: "Unknown GHL location" }, 404);
  }

  const eventType = pickEventType(payload);

  const notification: NotificationEvent = {
    location_id: location.id,
    ghl_location_id: location.ghl_location_id,
    event_type: eventType,
    external_event_id: getNestedString(payload, [
      ["webhookId"],
      ["webhook_id"],
      ["eventId"],
      ["event_id"],
      ["id"],
    ]),
    contact_id: getNestedString(payload, [
      ["contactId"],
      ["contact_id"],
      ["contact", "id"],
      ["data", "contactId"],
    ]),
    opportunity_id: getNestedString(payload, [
      ["opportunityId"],
      ["opportunity_id"],
      ["opportunity", "id"],
      ["data", "opportunityId"],
    ]),
    calendar_id: getNestedString(payload, [
      ["calendarId"],
      ["calendar_id"],
      ["calendar", "id"],
      ["appointment", "calendarId"],
      ["data", "calendarId"],
    ]),
    title: pickTitle(eventType, payload),
    message: pickMessage(payload),
    payload,
  };

  const { data: insertedEvent, error: insertError } = await supabase
    .from("ghl_notification_events")
    .insert(notification)
    .select("id")
    .single();

  if (insertError) {
    return jsonResponse({ error: "Could not store notification event" }, 500);
  }

  return jsonResponse({
    ok: true,
    id: insertedEvent.id,
  });
});
