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
    if (!body.name?.trim()) return jsonResponse({ error: "Party name is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const { data, error } = await context.supabase
      .from("case_parties")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        party_type: body.partyType || "other",
        role: body.role || null,
        name: body.name.trim(),
        email: body.email || null,
        phone: body.phone || null,
        ghl_contact_id: body.contactId || null,
        is_primary: Boolean(body.isPrimary),
        metadata: body.metadata || {},
        created_by: context.user.id,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, party: data }, 201);
  } catch (error) {
    return handleError(error);
  }
});
