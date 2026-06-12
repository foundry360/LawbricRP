import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getCaseOrThrow,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
  requireContextPermission,
  syncCaseReference,
  syncCaseStageToGhl,
} from "../_shared/case-utils.ts";

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
    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);
    await requireContextPermission(context, "matters.edit", "You do not have permission to edit matters.");
    if (body.assignedUserId !== undefined || body.sourceAttorneyUserId !== undefined || body.assignedGhlUserId !== undefined) {
      await requireContextPermission(context, "matters.assign", "You do not have permission to assign matters.");
    }

    const existing = await getCaseOrThrow(context, body.caseId);
    const updates: Record<string, unknown> = {
      updated_by: context.user.id,
    };

    if (body.caseNumber !== undefined) updates.case_number = String(body.caseNumber).trim();
    if (body.caseName !== undefined) updates.case_name = String(body.caseName).trim();
    if (body.caseType !== undefined) updates.case_type = String(body.caseType).trim() || "General";
    if (body.status !== undefined) updates.status = body.status;
    if (body.stage !== undefined) updates.stage = body.stage;
    if (body.statuteOfLimitationsAt !== undefined) {
      updates.statute_of_limitations_at = normalizeOptionalTimestamp(body.statuteOfLimitationsAt);
    }

    if (body.assignedUserId !== undefined) updates.assigned_user_id = body.assignedUserId || null;
    if (body.assignedUserId !== undefined) updates.assigned_ghl_user_id = null;
    if (body.sourceAttorneyUserId !== undefined) updates.source_attorney_user_id = body.sourceAttorneyUserId || null;
    if (body.assignedGhlUserId !== undefined) updates.assigned_ghl_user_id = body.assignedGhlUserId || null;
    if (body.ghlPipelineId !== undefined) updates.ghl_pipeline_id = body.ghlPipelineId || null;
    if (body.ghlPipelineStageId !== undefined) updates.ghl_pipeline_stage_id = body.ghlPipelineStageId || null;
    if (body.metadata !== undefined) updates.metadata = { ...(existing.metadata || {}), ...body.metadata };
    if (body.status === "closed" && !existing.closed_at) updates.closed_at = new Date().toISOString();

    const stageChanged = body.stage !== undefined && body.stage !== existing.stage;
    const statusChanged = body.status !== undefined && body.status !== existing.status;
    const pipelineChanged = body.ghlPipelineId !== undefined && body.ghlPipelineId !== existing.ghl_pipeline_id;
    const pipelineStageChanged = body.ghlPipelineStageId !== undefined &&
      body.ghlPipelineStageId !== existing.ghl_pipeline_stage_id;
    const caseReferenceChanged = body.caseNumber !== undefined ||
      body.caseName !== undefined ||
      body.caseType !== undefined ||
      body.assignedUserId !== undefined;

    const { data: updatedCaseRow, error } = await context.supabase
      .from("cases")
      .update(updates)
      .eq("id", body.caseId)
      .eq("location_id", context.location.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    let caseRow = updatedCaseRow;

    if (body.assignedUserId !== undefined) {
      const nextAssignedUserId = body.assignedUserId || null;
      const endedAt = new Date().toISOString();

      const { error: clearAssignmentError } = await context.supabase
        .from("case_assignments")
        .update({ is_primary: false, ended_at: endedAt })
        .eq("location_id", context.location.id)
        .eq("case_id", caseRow.id)
        .eq("role", "owner")
        .eq("is_primary", true);

      if (clearAssignmentError) throw new Error(clearAssignmentError.message);

      if (nextAssignedUserId) {
        const { error: upsertAssignmentError } = await context.supabase.from("case_assignments").upsert(
          {
            location_id: context.location.id,
            case_id: caseRow.id,
            assigned_user_id: nextAssignedUserId,
            role: "owner",
            is_primary: true,
            assigned_by: context.user.id,
            assigned_at: endedAt,
            ended_at: null,
          },
          { onConflict: "case_id,assigned_user_id,role" },
        );

        if (upsertAssignmentError) throw new Error(upsertAssignmentError.message);
      }

    }

    const caseMetadata = caseRow.metadata && typeof caseRow.metadata === "object" ? caseRow.metadata : {};
    const needsOpportunitySync = !caseMetadata.ghl_opportunity_id &&
      Boolean(caseRow.ghl_contact_id && caseRow.ghl_pipeline_id && caseRow.ghl_pipeline_stage_id);

    if (stageChanged || statusChanged || pipelineChanged || pipelineStageChanged || needsOpportunitySync) {
      await context.supabase.from("case_events").insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        title: "Case stage updated",
        event_type: "stage_change",
        description: `Case changed from ${existing.stage}/${existing.status} to ${caseRow.stage}/${caseRow.status}.`,
        start_at: new Date().toISOString(),
        status: "completed",
        metadata: {
          previous_stage: existing.stage,
          previous_status: existing.status,
          stage: caseRow.stage,
          status: caseRow.status,
        },
        created_by: context.user.id,
      });
      caseRow = await syncCaseStageToGhl(context, caseRow);
    } else if (caseReferenceChanged) {
      await syncCaseReference(context, caseRow);
    }

    return jsonResponse({ ok: true, case: caseRow });
  } catch (error) {
    return handleError(error);
  }
});
