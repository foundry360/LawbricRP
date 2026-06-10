import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  deleteTaskFromGhl,
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
    if (!body.taskId) return jsonResponse({ error: "Task ID is required" }, 400);

    const { data: existing, error: existingError } = await context.supabase
      .from("tasks")
      .select("id, ghl_contact_id, metadata, created_by")
      .eq("id", body.taskId)
      .eq("location_id", context.location.id)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (!existing) return jsonResponse({ error: "Task not found" }, 404);
    const existingMetadata = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
    const privateOwnerId = existingMetadata.private_owner_user_id || existing.created_by || null;
    if (existingMetadata.is_private === true && privateOwnerId !== context.user.id) {
      return jsonResponse({ error: "Task not found" }, 404);
    }

    const ghlDelete = await deleteTaskFromGhl(context, existing);

    const { error } = await context.supabase
      .from("tasks")
      .delete()
      .eq("id", existing.id)
      .eq("location_id", context.location.id);

    if (error) throw new Error(error.message);

    return jsonResponse({ ok: true, taskId: existing.id, ghlDelete });
  } catch (error) {
    return handleError(error);
  }
});
