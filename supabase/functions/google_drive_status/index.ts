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
  ensureGoogleDriveRootFolder,
  getConnectedGoogleDriveIntegration,
  getGoogleDriveAuthUrl,
  getGoogleDriveConfig,
} from "../_shared/google-drive.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    await requireContextPermission(context, "documents.view", "You do not have permission to view documents.");
    const canManageIntegrations = await userHasPermission(context, "documents.manage_integrations");
    const config = getGoogleDriveConfig();
    let integration = await getConnectedGoogleDriveIntegration(context);

    if (integration && !integration.root_folder_id) {
      try {
        await ensureGoogleDriveRootFolder(context, integration);
        integration = await getConnectedGoogleDriveIntegration(context);
      } catch (folderError) {
        console.error("Google Drive root folder repair failed:", folderError);
      }
    }

    const authUrl = config && canManageIntegrations ? await getGoogleDriveAuthUrl(context, body.returnUrl) : "";

    return jsonResponse({
      ok: true,
      configured: Boolean(config),
      connected: Boolean(integration),
      authUrl,
      integration: integration
        ? {
          id: integration.id,
          googleAccountEmail: integration.google_account_email,
          rootFolderId: integration.root_folder_id,
          rootFolderUrl: integration.root_folder_url,
          status: integration.status,
          tokenExpiresAt: integration.token_expires_at,
          connectedAt: integration.metadata?.connectedAt || integration.metadata?.connected_at || null,
        }
        : null,
    });
  } catch (error) {
    return handleError(error);
  }
});
