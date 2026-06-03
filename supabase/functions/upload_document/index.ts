import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getCaseOrThrow,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
} from "../_shared/case-utils.ts";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function decodeBase64(base64: string) {
  const binary = atob(base64.includes(",") ? base64.split(",").pop() || "" : base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);
    if (!body.fileName?.trim()) return jsonResponse({ error: "File name is required" }, 400);
    if (!body.contentBase64) return jsonResponse({ error: "File content is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const bucket = "case-documents";
    const fileName = sanitizeFileName(body.fileName.trim());
    const storagePath = `${context.location.id}/${caseRow.id}/${crypto.randomUUID()}-${fileName}`;
    const bytes = decodeBase64(body.contentBase64);
    const mimeType = body.mimeType || "application/octet-stream";

    const upload = await context.supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });

    if (upload.error) throw new Error(upload.error.message);

    const { data, error } = await context.supabase
      .from("documents")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        file_name: body.fileName.trim(),
        document_type: body.documentType || "other",
        storage_bucket: bucket,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: bytes.length,
        description: body.description || null,
        metadata: body.metadata || {},
        uploaded_by: context.user.id,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, document: data }, 201);
  } catch (error) {
    return handleError(error);
  }
});
