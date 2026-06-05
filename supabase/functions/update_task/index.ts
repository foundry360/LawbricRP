import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getCaseOrThrow,
  getRequestContext,
  handleError,
  hydrateTaskAssigneeAvatars,
  jsonResponse,
  readJsonBody,
  syncTaskToGhl,
} from "../_shared/case-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    if (!body.taskId) return jsonResponse({ error: "Task ID is required" }, 400);

    const { data: existing, error: existingError } = await context.supabase
      .from("tasks")
      .select("*")
      .eq("id", body.taskId)
      .eq("location_id", context.location.id)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (!existing) return jsonResponse({ error: "Task not found" }, 404);

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.status !== undefined) {
      updates.status = body.status;
      updates.completed_at = body.status === "done" ? existing.completed_at || new Date().toISOString() : null;
    }
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.dueAt !== undefined) updates.due_at = body.dueAt || null;
    if (body.reminderAt !== undefined) updates.reminder_at = body.reminderAt || null;
    if (body.assignedUserId !== undefined) updates.assigned_user_id = body.assignedUserId || null;
    if (body.relatedType !== undefined) updates.related_type = body.relatedType || "general";
    if (body.ghlContactId !== undefined) updates.ghl_contact_id = body.ghlContactId || null;
    if (body.ghlContactName !== undefined) updates.ghl_contact_name = body.ghlContactName || null;
    if (body.ghlOpportunityId !== undefined) updates.ghl_opportunity_id = body.ghlOpportunityId || null;
    if (body.ghlOpportunityName !== undefined) updates.ghl_opportunity_name = body.ghlOpportunityName || null;

    if (body.caseId !== undefined) {
      if (body.caseId) {
        const caseRow = await getCaseOrThrow(context, body.caseId);
        updates.case_id = caseRow.id;
        updates.ghl_contact_id = body.ghlContactId || caseRow.ghl_contact_id || null;
        updates.ghl_contact_name = body.ghlContactName || caseRow.primary_contact_name || null;
      } else {
        updates.case_id = null;
      }
    }

    const { data, error } = await context.supabase
      .from("tasks")
      .update(updates)
      .eq("id", body.taskId)
      .eq("location_id", context.location.id)
      .select(`
        *,
        case:cases(id, case_number, case_name, primary_contact_name),
        assigned_user:profiles!tasks_assigned_user_id_fkey(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) throw new Error(error.message);

    let task = data;
    try {
      const metadata = await syncTaskToGhl(context, task);
      const { data: syncedTask, error: metadataError } = await context.supabase
        .from("tasks")
        .update({ metadata })
        .eq("id", task.id)
        .eq("location_id", context.location.id)
        .select(`
          *,
          case:cases(id, case_number, case_name, primary_contact_name),
          assigned_user:profiles!tasks_assigned_user_id_fkey(id, full_name, email, avatar_url)
        `)
        .single();

      if (metadataError) throw new Error(metadataError.message);
      task = syncedTask;
    } catch (syncError) {
      const metadata = {
        ...(task.metadata || {}),
        ghl_task_sync_error: syncError instanceof Error ? syncError.message : "Could not sync task to GHL",
        ghl_task_sync_skipped: null,
      };
      await context.supabase
        .from("tasks")
        .update({ metadata })
        .eq("id", task.id)
        .eq("location_id", context.location.id);
    }

    const [hydratedTask] = await hydrateTaskAssigneeAvatars(context, [task]);
    return jsonResponse({ ok: true, task: hydratedTask });
  } catch (error) {
    return handleError(error);
  }
});
