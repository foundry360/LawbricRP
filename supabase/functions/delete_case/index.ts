import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getCaseOrThrow,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
  requireContextPermission,
} from "../_shared/case-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);
    await requireContextPermission(context, "matters.delete", "You do not have permission to delete matters.");

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const deletedAt = new Date().toISOString();
    const deleteReason = typeof body.deleteReason === "string" ? body.deleteReason.trim() || null : null;
    const deleteMetadata = {
      deleted_at: deletedAt,
      deleted_by: context.user.id,
      delete_reason: deleteReason,
    };

    const childTables = [
      "case_parties",
      "case_assignments",
      "case_events",
      "tasks",
      "documents",
      "financials",
      "notes",
      "case_communications",
    ];

    for (const table of childTables) {
      const { error: childError } = await context.supabase
        .from(table)
        .update(deleteMetadata)
        .eq("case_id", caseRow.id)
        .eq("location_id", context.location.id)
        .is("deleted_at", null);

      if (childError) throw new Error(childError.message);
    }

    const { error } = await context.supabase
      .from("cases")
      .update(deleteMetadata)
      .eq("id", caseRow.id)
      .eq("location_id", context.location.id)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);

    return jsonResponse({ ok: true, caseId: caseRow.id, softDeleted: true });
  } catch (error) {
    return handleError(error);
  }
});
