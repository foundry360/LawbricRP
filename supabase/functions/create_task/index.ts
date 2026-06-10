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
    if (!body.title?.trim()) return jsonResponse({ error: "Task title is required" }, 400);

    const relatedType = body.relatedType || (body.caseId ? "case" : "general");
    if (!["case", "contact", "opportunity", "general"].includes(relatedType)) {
      return jsonResponse({ error: "Related type is invalid" }, 400);
    }

    const caseRow = body.caseId ? await getCaseOrThrow(context, body.caseId) : null;
    if (relatedType === "case" && !caseRow) return jsonResponse({ error: "Case ID is required" }, 400);
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    if (metadata.is_private === true && !metadata.private_owner_user_id) {
      metadata.private_owner_user_id = context.user.id;
    }

    const { data, error } = await context.supabase
      .from("tasks")
      .insert({
        location_id: context.location.id,
        case_id: caseRow?.id || null,
        title: body.title.trim(),
        description: body.description || null,
        status: body.status || "todo",
        priority: body.priority || "normal",
        due_at: body.dueAt || null,
        reminder_at: body.reminderAt || null,
        assigned_user_id: body.assignedUserId || caseRow?.assigned_user_id || null,
        related_type: relatedType,
        ghl_contact_id: body.ghlContactId || caseRow?.ghl_contact_id || null,
        ghl_contact_name: body.ghlContactName || caseRow?.primary_contact_name || null,
        ghl_opportunity_id: body.ghlOpportunityId || null,
        ghl_opportunity_name: body.ghlOpportunityName || null,
        template_key: body.templateKey || null,
        automation_key: body.automationKey || null,
        metadata,
        created_by: context.user.id,
      })
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
    return jsonResponse({ ok: true, task: hydratedTask }, 201);
  } catch (error) {
    return handleError(error);
  }
});
