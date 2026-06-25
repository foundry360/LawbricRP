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
  ensureDriveChildFolder,
  ensureMatterDriveFolder,
  getConnectedGoogleDriveIntegration,
  getValidGoogleDriveAccessToken,
  uploadDriveFile,
} from "../_shared/google-drive.ts";

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
    if (!body.caseId) return jsonResponse({ error: "Matter ID is required" }, 400);
    if (!body.fileName?.trim()) return jsonResponse({ error: "File name is required" }, 400);
    if (!body.contentBase64) return jsonResponse({ error: "File content is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    await requireContextPermission(context, "documents.upload", "You do not have permission to upload matter documents.");

    const integration = await getConnectedGoogleDriveIntegration(context);
    if (!integration) {
      return jsonResponse({ error: "Google Drive is not connected for this location." }, 400);
    }

    const matterFolder = await ensureMatterDriveFolder(context, caseRow);
    if (!matterFolder?.drive_folder_id) {
      return jsonResponse({ error: "Google Drive matter folder is unavailable." }, 400);
    }

    const { accessToken } = await getValidGoogleDriveAccessToken(context, integration);
    if (!accessToken) return jsonResponse({ error: "Google Drive access token is unavailable." }, 400);

    const folderName = typeof body.folderName === "string" ? body.folderName.trim() : "";
    const parentFolderId = await ensureDriveChildFolder(accessToken, matterFolder.drive_folder_id, folderName);
    const bytes = decodeBase64(String(body.contentBase64));
    const mimeType = String(body.mimeType || "application/octet-stream");
    const driveFile = await uploadDriveFile(
      accessToken,
      String(body.fileName).trim(),
      mimeType,
      bytes,
      parentFolderId,
    );

    const metadata = folderName ? { folder_name: folderName } : {};
    const { data, error } = await context.supabase
      .from("documents")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        matter_id: caseRow.id,
        name: driveFile.name,
        file_name: driveFile.name,
        document_type: "other",
        storage_type: "gdrive",
        storage_bucket: "documents",
        storage_path: null,
        file_path: null,
        external_file_id: driveFile.id,
        file_url: driveFile.webViewLink || null,
        mime_type: driveFile.mimeType || mimeType,
        size_bytes: driveFile.size || bytes.length,
        metadata,
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
