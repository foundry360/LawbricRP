import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getCaseOrThrow,
  getRequestContext,
  handleError,
  jsonResponse,
  requireContextPermission,
  readJsonBody,
} from "../_shared/case-utils.ts";

const EXTERNAL_STORAGE_TYPES = new Set(["gdrive", "onedrive"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    const caseId = body.caseId || body.matterId;
    const name = String(body.name || "").trim();
    const fileUrl = String(body.fileUrl || body.file_url || "").trim();
    const storageType = String(body.storageType || body.storage_type || "").trim();

    if (!caseId) return jsonResponse({ error: "Matter ID is required" }, 400);
    if (!name) return jsonResponse({ error: "Document name is required" }, 400);
    if (!fileUrl) return jsonResponse({ error: "Document URL is required" }, 400);
    if (!EXTERNAL_STORAGE_TYPES.has(storageType)) {
      return jsonResponse({ error: "Storage type must be gdrive or onedrive" }, 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(fileUrl);
    } catch {
      return jsonResponse({ error: "Document URL is invalid" }, 400);
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return jsonResponse({ error: "Document URL must use http or https" }, 400);
    }

    const caseRow = await getCaseOrThrow(context, caseId);
    await requireContextPermission(context, "documents.upload", "You do not have permission to attach matter documents.");

    const { data, error } = await context.supabase
      .from("documents")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        matter_id: caseRow.id,
        name,
        file_name: name,
        document_type: "external",
        storage_type: storageType,
        storage_bucket: "documents",
        storage_path: null,
        file_path: null,
        external_file_id: body.externalFileId || body.external_file_id || null,
        file_url: parsedUrl.toString(),
        metadata: body.metadata || {},
        uploaded_by: context.user.id,
        updated_by: context.user.id,
      })
      .select("*, case:cases!documents_case_id_fkey(id, case_number, case_name), uploaded_user:profiles!documents_uploaded_by_fkey(id, full_name, email), updated_user:profiles!documents_updated_by_fkey(id, full_name, email)")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, document: data }, 201);
  } catch (error) {
    return handleError(error);
  }
});
