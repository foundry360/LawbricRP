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
    if (!body.title?.trim()) return jsonResponse({ error: "Task title is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const { data, error } = await context.supabase
      .from("tasks")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        title: body.title.trim(),
        description: body.description || null,
        status: body.status || "todo",
        priority: body.priority || "normal",
        due_at: body.dueAt || null,
        reminder_at: body.reminderAt || null,
        assigned_user_id: body.assignedUserId || caseRow.assigned_user_id || null,
        template_key: body.templateKey || null,
        automation_key: body.automationKey || null,
        metadata: body.metadata || {},
        created_by: context.user.id,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, task: data }, 201);
  } catch (error) {
    return handleError(error);
  }
});
