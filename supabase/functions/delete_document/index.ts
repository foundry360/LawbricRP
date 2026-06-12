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
    if (!body.documentId) return jsonResponse({ error: "Document ID is required" }, 400);

    const { data: document, error } = await context.supabase
      .from("documents")
      .select("*")
      .eq("id", body.documentId)
      .eq("location_id", context.location.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!document) return jsonResponse({ error: "Document not found" }, 404);

    await getCaseOrThrow(context, document.case_id || document.matter_id);
    await requireContextPermission(context, "documents.delete", "You do not have permission to delete matter documents.");

    const deletedAt = new Date().toISOString();
    const deleteReason = typeof body.deleteReason === "string" ? body.deleteReason.trim() || null : null;

    const { error: deleteError } = await context.supabase
      .from("documents")
      .update({
        deleted_at: deletedAt,
        deleted_by: context.user.id,
        delete_reason: deleteReason,
      })
      .eq("id", document.id)
      .eq("location_id", context.location.id)
      .is("deleted_at", null);

    if (deleteError) throw new Error(deleteError.message);
    return jsonResponse({ ok: true, documentId: document.id, softDeleted: true });
  } catch (error) {
    return handleError(error);
  }
});
