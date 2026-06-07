import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WebhookPayload = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info, x-lawbric-webhook-secret, x-ghl-webhook-secret",
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

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    if (value) return value;
  }

  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hasWebhookSecret(req: Request): Promise<boolean> {
  const expectedSecret = Deno.env.get("GHL_WEBHOOK_SHARED_SECRET");
  const expectedSecretSha256 = Deno.env.get("GHL_WEBHOOK_SHARED_SECRET_SHA256");
  const requestSecret =
    req.headers.get("x-lawbric-webhook-secret") ??
    req.headers.get("x-ghl-webhook-secret") ??
    new URL(req.url).searchParams.get("secret");

  if (!requestSecret) return false;
  if (expectedSecret && timingSafeEqual(requestSecret, expectedSecret)) return true;
  if (expectedSecretSha256) return timingSafeEqual(await sha256Hex(requestSecret), expectedSecretSha256);
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    if (!(await hasWebhookSecret(req))) {
      return jsonResponse({ error: "Invalid webhook secret" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration is incomplete" }, 500);
    }

    const payload = await req.json().catch(() => ({})) as WebhookPayload;
    const locationIdentifier = getNestedString(payload, [
      ["locationId"],
      ["location_id"],
      ["ghl_location_id"],
      ["location", "id"],
      ["data", "locationId"],
      ["data", "location_id"],
    ]);
    const opportunityId = getNestedString(payload, [
      ["opportunityId"],
      ["opportunity_id"],
      ["opportunity", "id"],
      ["opportunity", "_id"],
      ["data", "opportunityId"],
      ["data", "opportunity_id"],
    ]);
    const contactId = getNestedString(payload, [
      ["contactId"],
      ["contact_id"],
      ["contact", "id"],
      ["data", "contactId"],
      ["data", "contact_id"],
    ]);

    if (!locationIdentifier) return jsonResponse({ error: "Webhook payload is missing locationId" }, 400);
    if (!opportunityId && !contactId) {
      return jsonResponse({ error: "Webhook payload is missing opportunityId or contactId" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const locationLooksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationIdentifier);
    const { data: location, error: locationError } = await supabase
      .from("ghl_locations")
      .select("id, ghl_location_id")
      .eq(locationLooksLikeUuid ? "id" : "ghl_location_id", locationIdentifier)
      .maybeSingle();

    if (locationError) throw new Error(locationError.message);
    if (!location) return jsonResponse({ error: "Unknown location" }, 404);

    let leadQuery = supabase
      .from("lead_opportunities")
      .select("*")
      .eq("location_id", location.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (opportunityId) {
      leadQuery = leadQuery.eq("ghl_opportunity_id", opportunityId);
    } else if (contactId) {
      leadQuery = leadQuery.eq("ghl_contact_id", contactId);
    }

    const { data: leadRows, error: leadError } = await leadQuery;
    if (leadError) throw new Error(leadError.message);
    const lead = leadRows?.[0];
    if (!lead) return jsonResponse({ error: "Matching lead not found" }, 404);

    if (lead.converted_case_id) {
      return jsonResponse({
        ok: true,
        lead,
        caseId: lead.converted_case_id,
        alreadyConverted: true,
      });
    }

    const convertedAt = new Date().toISOString();
    const leadMetadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
    const { data: caseRow, error: caseError } = await supabase
      .from("cases")
      .insert({
        location_id: location.id,
        case_name: lead.lead_name,
        case_type: String(leadMetadata.case_type || "General"),
        status: "open",
        stage: "intake",
        ghl_contact_id: lead.ghl_contact_id,
        primary_contact_name: lead.contact_name || null,
        primary_contact_email: lead.contact_email || null,
        primary_contact_phone: lead.contact_phone || null,
        assigned_user_id: lead.assigned_user_id || null,
        metadata: {
          source: "ghl_workflow_lead_conversion",
          lead_id: lead.id,
          ghl_opportunity_id: lead.ghl_opportunity_id || opportunityId || null,
          ghl_location_id: location.ghl_location_id,
          workflow_payload: payload,
        },
      })
      .select("*")
      .single();

    if (caseError) throw new Error(caseError.message);

    await supabase.from("case_parties").insert({
      location_id: location.id,
      case_id: caseRow.id,
      party_type: "client",
      role: "Primary Contact",
      name: lead.contact_name || lead.lead_name,
      email: lead.contact_email || null,
      phone: lead.contact_phone || null,
      ghl_contact_id: lead.ghl_contact_id,
      is_primary: true,
      metadata: {
        source: "ghl_workflow_lead_conversion",
        lead_id: lead.id,
      },
    });

    if (lead.assigned_user_id) {
      await supabase.from("case_assignments").insert({
        location_id: location.id,
        case_id: caseRow.id,
        assigned_user_id: lead.assigned_user_id,
        role: "owner",
        is_primary: true,
      });
    }

    const { data: updatedLead, error: updateLeadError } = await supabase
      .from("lead_opportunities")
      .update({
        status: "converted",
        converted_case_id: caseRow.id,
        converted_at: convertedAt,
        metadata: {
          ...leadMetadata,
          converted_case_id: caseRow.id,
          converted_at: convertedAt,
          conversion_source: "ghl_workflow",
        },
      })
      .eq("id", lead.id)
      .select("*")
      .single();

    if (updateLeadError) throw new Error(updateLeadError.message);

    return jsonResponse({ ok: true, lead: updatedLead, case: caseRow });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead conversion failed";
    console.error("Lead conversion webhook failed", error);
    return jsonResponse({ error: message }, 500);
  }
});
