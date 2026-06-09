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
    await requireContextPermission(context, "matters.edit", "You do not have permission to add matter notes.");

    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);
    if (!body.body?.trim()) return jsonResponse({ error: "Note is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const { data, error } = await context.supabase
      .from("notes")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        body: body.body.trim(),
        note_type: body.noteType || "case",
        is_pinned: Boolean(body.isPinned),
        metadata: body.metadata || {},
        created_by: context.user.id,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, note: data }, 201);
  } catch (error) {
    return handleError(error);
  }
});
