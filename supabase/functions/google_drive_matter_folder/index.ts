import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
  requireContextPermission,
  userHasPermission,
} from "../_shared/case-utils.ts";
import {
  ensureMatterDriveFolder,
  getConnectedGoogleDriveIntegration,
  getMatterDriveFolder,
} from "../_shared/google-drive.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    await requireContextPermission(context, "documents.view", "You do not have permission to view matter documents.");
    if (body.createIfMissing) {
      const [canUpload, canManageIntegrations] = await Promise.all([
        userHasPermission(context, "documents.upload"),
        userHasPermission(context, "documents.manage_integrations"),
      ]);
      if (!canUpload && !canManageIntegrations) {
        return jsonResponse({ error: "You do not have permission to create matter document folders." }, 403);
      }
    }

    if (!body.caseId) return jsonResponse({ error: "Matter ID is required" }, 400);
    const { data: caseRow, error: caseError } = await context.supabase
      .from("cases")
      .select("*")
      .eq("id", body.caseId)
      .eq("location_id", context.location.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (caseError) throw new Error(caseError.message);
    if (!caseRow) return jsonResponse({ error: "Matter not found" }, 404);

    const integration = await getConnectedGoogleDriveIntegration(context);
    if (!integration) {
      return jsonResponse({
        ok: true,
        connected: false,
        folder: null,
      });
    }

    const folder = body.createIfMissing
      ? await ensureMatterDriveFolder(context, caseRow)
      : await getMatterDriveFolder(context, caseRow.id);

    return jsonResponse({
      ok: true,
      connected: true,
      rootFolderUrl: integration.root_folder_url || null,
      rootFolderId: integration.root_folder_id || null,
      folder: folder
        ? {
          id: folder.id,
          folderName: folder.folder_name,
          driveFolderId: folder.drive_folder_id,
          webUrl: folder.web_url,
        }
        : null,
    });
  } catch (error) {
    return handleError(error);
  }
});
