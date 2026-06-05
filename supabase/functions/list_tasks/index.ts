import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getRequestContext,
  handleError,
  hydrateTaskAssigneeAvatars,
  jsonResponse,
  readJsonBody,
} from "../_shared/case-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    const limit = Math.min(Number(body.limit) || 200, 500);

    let query = context.supabase
      .from("tasks")
      .select(`
        *,
        case:cases(id, case_number, case_name, primary_contact_name),
        assigned_user:profiles!tasks_assigned_user_id_fkey(id, full_name, email, avatar_url)
      `)
      .eq("location_id", context.location.id)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (body.status && body.status !== "all") query = query.eq("status", body.status);
    if (body.relatedType && body.relatedType !== "all") query = query.eq("related_type", body.relatedType);
    if (body.assignedUserId && body.assignedUserId !== "all") query = query.eq("assigned_user_id", body.assignedUserId);
    if (body.search) {
      const term = String(body.search).replaceAll("%", "").trim();
      if (term) {
        query = query.or(
          `title.ilike.%${term}%,description.ilike.%${term}%,ghl_contact_name.ilike.%${term}%,ghl_opportunity_name.ilike.%${term}%`,
        );
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const tasks = await hydrateTaskAssigneeAvatars(context, data ?? []);
    return jsonResponse({ ok: true, tasks });
  } catch (error) {
    return handleError(error);
  }
});
