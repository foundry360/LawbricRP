import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getCaseOrThrow,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
} from "../_shared/case-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);
    if (!body.partyId) return jsonResponse({ error: "Related contact ID is required" }, 400);
    if (!body.name?.trim()) return jsonResponse({ error: "Related contact name is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const { data: existingParty, error: existingPartyError } = await context.supabase
      .from("case_parties")
      .select("id, is_primary")
      .eq("id", body.partyId)
      .eq("case_id", caseRow.id)
      .eq("location_id", context.location.id)
      .maybeSingle();

    if (existingPartyError) throw new Error(existingPartyError.message);
    if (!existingParty) return jsonResponse({ error: "Related contact was not found" }, 404);
    if (existingParty.is_primary) return jsonResponse({ error: "Primary contact cannot be edited here" }, 400);

    const { data, error } = await context.supabase
      .from("case_parties")
      .update({
        party_type: body.partyType || "Related Contact",
        role: body.role || null,
        name: body.name.trim(),
        email: body.email || null,
        phone: body.phone || null,
        ghl_contact_id: body.contactId || null,
        metadata: body.metadata || {},
      })
      .eq("id", existingParty.id)
      .eq("case_id", caseRow.id)
      .eq("location_id", context.location.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, party: data });
  } catch (error) {
    return handleError(error);
  }
});
