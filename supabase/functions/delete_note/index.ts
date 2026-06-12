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
    await requireContextPermission(context, "matters.edit", "You do not have permission to delete matter notes.");

    if (!body.noteId) return jsonResponse({ error: "Note ID is required" }, 400);

    const { data: existingNote, error: noteError } = await context.supabase
      .from("notes")
      .select("*")
      .eq("id", body.noteId)
      .eq("location_id", context.location.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (noteError) throw new Error(noteError.message);
    if (!existingNote) return jsonResponse({ error: "Note not found" }, 404);

    await getCaseOrThrow(context, existingNote.case_id);

    const deletedAt = new Date().toISOString();
    const deleteReason = typeof body.deleteReason === "string" ? body.deleteReason.trim() || null : null;

    const { error } = await context.supabase
      .from("notes")
      .update({
        deleted_at: deletedAt,
        deleted_by: context.user.id,
        delete_reason: deleteReason,
      })
      .eq("id", existingNote.id)
      .eq("location_id", context.location.id)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, noteId: existingNote.id, softDeleted: true });
  } catch (error) {
    return handleError(error);
  }
});
