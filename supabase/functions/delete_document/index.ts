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
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!document) return jsonResponse({ error: "Document not found" }, 404);

    await getCaseOrThrow(context, document.case_id || document.matter_id);
    await requireContextPermission(context, "documents.delete", "You do not have permission to delete matter documents.");

    if (!document.storage_type || document.storage_type === "internal") {
      const bucket = document.storage_bucket || "documents";
      const path = document.file_path || document.storage_path;
      if (path) {
        const { error: removeError } = await context.supabase.storage.from(bucket).remove([path]);
        if (removeError) throw new Error(removeError.message);
      }
    }

    const { error: deleteError } = await context.supabase
      .from("documents")
      .delete()
      .eq("id", document.id);

    if (deleteError) throw new Error(deleteError.message);
    return jsonResponse({ ok: true, documentId: document.id });
  } catch (error) {
    return handleError(error);
  }
});
