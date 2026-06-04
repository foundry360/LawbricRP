import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
  syncCaseReference,
} from "../_shared/case-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);

    if (!body.caseName?.trim()) return jsonResponse({ error: "Case name is required" }, 400);
    if (!body.contactId?.trim()) return jsonResponse({ error: "GHL contact is required" }, 400);

    const contactId = body.contactId.trim();
    let assignedUserId = body.assignedUserId || null;

    if (!assignedUserId) {
      const { data: contactAssignment, error: contactAssignmentError } = await context.supabase
        .from("contact_assignments")
        .select("assigned_user_id")
        .eq("location_id", context.location.id)
        .eq("ghl_contact_id", contactId)
        .maybeSingle();

      if (contactAssignmentError) throw new Error(contactAssignmentError.message);
      assignedUserId = contactAssignment?.assigned_user_id || null;
    }

    const { data: caseRow, error } = await context.supabase
      .from("cases")
      .insert({
        location_id: context.location.id,
        ...(body.caseNumber?.trim() ? { case_number: body.caseNumber.trim() } : {}),
        case_name: body.caseName.trim(),
        case_type: body.caseType?.trim() || "General",
        status: body.status || "open",
        stage: body.stage || "intake",
        ghl_contact_id: contactId,
        primary_contact_name: body.contactName || null,
        primary_contact_email: body.contactEmail || null,
        primary_contact_phone: body.contactPhone || null,
        assigned_user_id: assignedUserId,
        assigned_ghl_user_id: body.assignedGhlUserId || null,
        ghl_pipeline_id: body.ghlPipelineId || null,
        ghl_pipeline_stage_id: body.ghlPipelineStageId || null,
        metadata: body.metadata || {},
        created_by: context.user.id,
        updated_by: context.user.id,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await context.supabase.from("case_parties").insert({
      location_id: context.location.id,
      case_id: caseRow.id,
      party_type: "client",
      role: "Primary Contact",
      name: body.contactName || body.caseName.trim(),
      email: body.contactEmail || null,
      phone: body.contactPhone || null,
      ghl_contact_id: contactId,
      is_primary: true,
      created_by: context.user.id,
    });

    if (assignedUserId) {
      await context.supabase.from("case_assignments").insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        assigned_user_id: assignedUserId,
        role: "owner",
        is_primary: true,
        assigned_by: context.user.id,
      });
    }

    if (body.notes?.trim()) {
      await context.supabase.from("notes").insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        body: body.notes.trim(),
        note_type: "intake",
        created_by: context.user.id,
      });
    }

    try {
      await syncCaseReference(context, caseRow);
    } catch (syncError) {
      console.warn("Case created, but GHL case reference sync failed", syncError);
    }

    return jsonResponse({ ok: true, case: caseRow }, 201);
  } catch (error) {
    return handleError(error);
  }
});
