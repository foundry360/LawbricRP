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
import {
  assertCanAccessDriveFolder,
  getConnectedGoogleDriveIntegration,
  getDriveFilePreviewContent,
  getValidGoogleDriveAccessToken,
} from "../_shared/google-drive.ts";

function getGoogleDriveFileId(document: { external_file_id?: string | null; file_url?: string | null }) {
  const externalId = String(document.external_file_id || "").trim();
  if (externalId) return externalId;

  const fileUrl = String(document.file_url || "").trim();
  if (!fileUrl) return null;

  const fileMatch = fileUrl.match(/\/file\/d\/([^/?#]+)/);
  if (fileMatch?.[1]) return fileMatch[1];

  const openMatch = fileUrl.match(/[?&]id=([^&]+)/);
  if (openMatch?.[1]) return openMatch[1];

  return null;
}

function inferPreviewMimeTypeFromSuffix(suffix: string) {
  if (suffix === "pdf") return "application/pdf";
  if (suffix === "png") return "image/png";
  if (suffix === "jpg" || suffix === "jpeg") return "image/jpeg";
  if (suffix === "webp") return "image/webp";
  if (suffix === "txt") return "text/plain";
  return "application/octet-stream";
}

async function getCachedGdrivePreview(
  context: Awaited<ReturnType<typeof getRequestContext>>,
  documentId: string,
  fileId: string,
) {
  const suffixes = ["pdf", "png", "jpg", "jpeg", "webp", "txt", "bin"];
  for (const suffix of suffixes) {
    const previewPath = `preview-cache/gdrive/${documentId}/${fileId}.${suffix}`;
    const { data: signed, error } = await context.supabase.storage
      .from("documents")
      .createSignedUrl(previewPath, 60 * 10);
    if (!error && signed?.signedUrl) {
      return {
        previewUrl: signed.signedUrl,
        previewMimeType: inferPreviewMimeTypeFromSuffix(suffix),
      };
    }
  }
  return null;
}

function getPreviewStorageSuffix(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1] || "img";
  if (mimeType.startsWith("text/")) return "txt";
  return "bin";
}

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

    if (document.storage_type === "gdrive") {
      if (!document.file_url) return jsonResponse({ error: "External document URL is missing" }, 400);

      const fileId = getGoogleDriveFileId(document);
      if (!fileId) {
        return jsonResponse({
          ok: true,
          url: document.file_url,
          previewUrl: null,
          storageType: document.storage_type,
          document,
        });
      }

      const integration = await getConnectedGoogleDriveIntegration(context);
      if (!integration) {
        return jsonResponse({
          ok: true,
          url: document.file_url,
          previewUrl: null,
          storageType: document.storage_type,
          document,
        });
      }

      const { accessToken } = await getValidGoogleDriveAccessToken(context, integration);
      await assertCanAccessDriveFolder(context, accessToken, fileId, integration);

      const cachedPreview = await getCachedGdrivePreview(context, document.id, fileId);
      if (cachedPreview) {
        return jsonResponse({
          ok: true,
          url: document.file_url,
          previewUrl: cachedPreview.previewUrl,
          previewMimeType: cachedPreview.previewMimeType,
          storageType: document.storage_type,
          document,
        });
      }

      try {
        const preview = await getDriveFilePreviewContent(accessToken, fileId);
        const resolvedPreviewPath = `preview-cache/gdrive/${document.id}/${fileId}.${getPreviewStorageSuffix(preview.mimeType)}`;
        const upload = await context.supabase.storage.from("documents").upload(resolvedPreviewPath, preview.bytes, {
          contentType: preview.mimeType,
          upsert: true,
        });
        if (upload.error) throw new Error(upload.error.message);

        const { data: signed, error: signedError } = await context.supabase.storage
          .from("documents")
          .createSignedUrl(resolvedPreviewPath, 60 * 10);
        if (signedError) throw new Error(signedError.message);

        return jsonResponse({
          ok: true,
          url: document.file_url,
          previewUrl: signed.signedUrl,
          previewMimeType: preview.mimeType,
          storageType: document.storage_type,
          document,
        });
      } catch (previewError) {
        console.error("Google Drive inline preview failed:", previewError);
        return jsonResponse({
          ok: true,
          url: document.file_url,
          previewUrl: null,
          storageType: document.storage_type,
          document,
        });
      }
    }

    if (document.storage_type && document.storage_type !== "internal") {
      if (!document.file_url) return jsonResponse({ error: "External document URL is missing" }, 400);
      return jsonResponse({
        ok: true,
        url: document.file_url,
        previewUrl: null,
        storageType: document.storage_type,
        document,
      });
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
