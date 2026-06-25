import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
  requireContextPermission,
} from "../_shared/case-utils.ts";
import {
  assertCanAccessDriveFolder,
  getConnectedGoogleDriveIntegration,
  getDriveFolderName,
  getValidGoogleDriveAccessToken,
  listDriveFolderChildren,
} from "../_shared/google-drive.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    await requireContextPermission(context, "documents.view", "You do not have permission to view matter documents.");

    const integration = await getConnectedGoogleDriveIntegration(context);
    if (!integration) {
      return jsonResponse({ ok: true, connected: false, items: [], folderId: null, folderName: null });
    }

    const folderId = String(body.folderId || integration.root_folder_id || "");
    if (!folderId) {
      return jsonResponse({ error: "Google Drive root folder is not configured." }, 400);
    }

    const { accessToken } = await getValidGoogleDriveAccessToken(context, integration);
    await assertCanAccessDriveFolder(context, accessToken, folderId, integration);

    const listing = await listDriveFolderChildren(accessToken, folderId, body.pageToken);
    const folderName = await getDriveFolderName(accessToken, folderId);

    return jsonResponse({
      ok: true,
      connected: true,
      folderId,
      folderName,
      items: listing.items,
      nextPageToken: listing.nextPageToken,
    });
  } catch (error) {
    return handleError(error);
  }
});
