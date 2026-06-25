import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  ensureCaseOpportunity,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
  requireContextPermission,
  syncCaseReference,
} from "../_shared/case-utils.ts";
import { ensureMatterDriveFolder } from "../_shared/google-drive.ts";

function normalizeOptionalTimestamp(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const text = String(value).trim();
  if (!text) return null;

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Filing Deadline date.");

  return date.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    await requireContextPermission(context, "matters.create", "You do not have permission to create matters.");

    if (!body.caseName?.trim()) return jsonResponse({ error: "Case name is required" }, 400);
    if (!body.contactId?.trim()) return jsonResponse({ error: "GHL contact is required" }, 400);

    const contactId = body.contactId.trim();
    let assignedUserId = body.assignedUserId || null;
    const statuteOfLimitationsAt = normalizeOptionalTimestamp(body.statuteOfLimitationsAt);

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

    if (assignedUserId || body.sourceAttorneyUserId || body.assignedGhlUserId) {
      await requireContextPermission(context, "matters.assign", "You do not have permission to assign matters.");
    }

    const { data: insertedCaseRow, error } = await context.supabase
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
        source_attorney_user_id: body.sourceAttorneyUserId || null,
        assigned_ghl_user_id: body.assignedGhlUserId || null,
        ghl_pipeline_id: body.ghlPipelineId || null,
        ghl_pipeline_stage_id: body.ghlPipelineStageId || null,
        statute_of_limitations_at: statuteOfLimitationsAt ?? null,
        metadata: body.metadata || {},
        created_by: context.user.id,
        updated_by: context.user.id,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    let caseRow = insertedCaseRow;

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

    const associatedParties = Array.isArray(body.associatedContacts)
      ? body.associatedContacts.flatMap((party) => {
          if (!party || typeof party !== "object") return [];

          const associatedContactId = typeof party.contactId === "string" ? party.contactId.trim() : "";
          if (associatedContactId && associatedContactId === contactId) return [];

          const name = typeof party.name === "string" ? party.name.trim() : "";
          const email = typeof party.email === "string" ? party.email.trim() : "";
          const phone = typeof party.phone === "string" ? party.phone.trim() : "";
          if (!associatedContactId && !name && !email && !phone) return [];

          return [
            {
              location_id: context.location.id,
              case_id: caseRow.id,
              party_type:
                typeof party.partyType === "string" && party.partyType.trim()
                  ? party.partyType.trim()
                  : "associated",
              role:
                typeof party.role === "string" && party.role.trim()
                  ? party.role.trim()
                  : "Associated Contact",
              name: name || email || phone || "Associated Contact",
              email: email || null,
              phone: phone || null,
              ghl_contact_id: associatedContactId || null,
              is_primary: false,
              created_by: context.user.id,
            },
          ];
        })
      : [];

    if (associatedParties.length > 0) {
      const { error: associatedPartiesError } = await context.supabase.from("case_parties").insert(associatedParties);
      if (associatedPartiesError) throw new Error(associatedPartiesError.message);
    }

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
      caseRow = await ensureCaseOpportunity(context, caseRow);
      await syncCaseReference(context, caseRow);
    } catch (syncError) {
      console.warn("Case created, but GHL opportunity/reference sync failed", syncError);
    }

    try {
      await ensureMatterDriveFolder(context, caseRow);
    } catch (driveError) {
      console.warn("Case created, but Google Drive folder creation failed", driveError);
    }

    return jsonResponse({ ok: true, case: caseRow }, 201);
  } catch (error) {
    return handleError(error);
  }
});
