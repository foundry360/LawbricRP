import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  deleteCaseFromGhl,
  deleteTaskFromGhl,
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
    const { data: caseTasks, error: tasksError } = await context.supabase
      .from("tasks")
      .select("id, ghl_contact_id, metadata")
      .eq("case_id", caseRow.id)
      .eq("location_id", context.location.id);

    if (tasksError) throw new Error(tasksError.message);

    const ghlTaskDeletes = [];
    for (const task of caseTasks ?? []) {
      ghlTaskDeletes.push({ taskId: task.id, ...(await deleteTaskFromGhl(context, task)) });
    }

    const ghlCaseDelete = await deleteCaseFromGhl(context, caseRow);

    const { error } = await context.supabase
      .from("cases")
      .delete()
      .eq("id", caseRow.id)
      .eq("location_id", context.location.id);

    if (error) throw new Error(error.message);

    return jsonResponse({ ok: true, caseId: caseRow.id, ghlCaseDelete, ghlTaskDeletes });
  } catch (error) {
    return handleError(error);
  }
});
