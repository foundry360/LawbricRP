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
    await requireContextPermission(context, "documents.view", "You do not have permission to view matter documents.");

    const { data: document, error } = await context.supabase
      .from("documents")
      .select("*, case:cases!documents_case_id_fkey(id, case_number, case_name), uploaded_user:profiles!documents_uploaded_by_fkey(id, full_name, email), updated_user:profiles!documents_updated_by_fkey(id, full_name, email)")
      .eq("id", body.documentId)
      .eq("location_id", context.location.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!document) return jsonResponse({ error: "Document not found" }, 404);

    await getCaseOrThrow(context, document.case_id || document.matter_id);

    if (document.storage_type && document.storage_type !== "internal") {
      if (!document.file_url) return jsonResponse({ error: "External document URL is missing" }, 400);
      return jsonResponse({ ok: true, url: document.file_url, storageType: document.storage_type, document });
    }

    const bucket = document.storage_bucket || "documents";
    const path = document.file_path || document.storage_path;
    if (!path) return jsonResponse({ error: "Document file path is missing" }, 400);

    const { data, error: signedUrlError } = await context.supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 10);

    if (signedUrlError) throw new Error(signedUrlError.message);
    return jsonResponse({ ok: true, url: data.signedUrl, storageType: "internal", document });
  } catch (error) {
    return handleError(error);
  }
});
