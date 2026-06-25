import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
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
    await requireContextPermission(
      context,
      "documents.manage_integrations",
      "You do not have permission to manage document integrations.",
    );

    const { error } = await context.supabase
      .from("google_drive_integrations")
      .update({
        status: "disconnected",
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        root_folder_id: null,
        root_folder_url: null,
        disconnected_at: new Date().toISOString(),
      })
      .eq("location_id", context.location.id);

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleError(error);
  }
});
