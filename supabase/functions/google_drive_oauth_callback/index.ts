import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
} from "../_shared/case-utils.ts";
import {
  assertGoogleDriveScopesGranted,
  ensureGoogleDriveRootFolder,
  exchangeGoogleDriveCode,
  getGoogleAccountEmail,
  googleDriveCallbackResponse,
  verifyGoogleDriveState,
} from "../_shared/google-drive.ts";

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  let returnUrl: string | undefined;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const googleError = url.searchParams.get("error") || "";

    if (state) {
      try {
        returnUrl = (await verifyGoogleDriveState(state)).returnUrl;
      } catch {
        // State validation happens again below for successful callbacks.
      }
    }

    if (googleError) {
      return googleDriveCallbackResponse(false, `Google returned an OAuth error: ${googleError}`, returnUrl);
    }
    if (!code || !state) {
      return googleDriveCallbackResponse(false, "Missing Google OAuth callback parameters.", returnUrl);
    }

    const statePayload = await verifyGoogleDriveState(state);
    returnUrl = statePayload.returnUrl;
    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data: user, error: userError } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", statePayload.userId)
      .maybeSingle();
    if (userError) throw new Error(userError.message);
    if (!user?.is_active) throw new Error("Your Lawbric user is not active.");

    const tokens = await exchangeGoogleDriveCode(code);
    assertGoogleDriveScopesGranted(tokens.scope);
    const accountEmail = await getGoogleAccountEmail(tokens);
    const tokenExpiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();

    const { data: existingIntegration } = await supabase
      .from("google_drive_integrations")
      .select("refresh_token, metadata")
      .eq("location_id", statePayload.locationId)
      .maybeSingle();

    const { data: integration, error: upsertError } = await supabase
      .from("google_drive_integrations")
      .upsert({
        location_id: statePayload.locationId,
        connected_by: statePayload.userId,
        google_account_email: accountEmail || null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || existingIntegration?.refresh_token || null,
        token_expires_at: tokenExpiresAt,
        scopes: typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : [],
        status: "connected",
        disconnected_at: null,
        metadata: {
          ...(existingIntegration?.metadata && typeof existingIntegration.metadata === "object"
            ? existingIntegration.metadata
            : {}),
          connectedAt: new Date().toISOString(),
        },
      }, { onConflict: "location_id" })
      .select("*")
      .single();
    if (upsertError) throw new Error(upsertError.message);

    try {
      await ensureGoogleDriveRootFolder({
        supabase,
        user: { id: statePayload.userId },
        location: {
          id: statePayload.locationId,
          ghlLocationId: null,
          encryptedApiKey: null,
        },
      }, integration, { accessToken: tokens.access_token });
    } catch (folderError) {
      console.error("Google Drive root folder setup failed:", folderError);
    }

    return googleDriveCallbackResponse(
      true,
      accountEmail ? `Connected ${accountEmail} to Google Drive.` : "Google Drive is connected.",
      returnUrl,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive connection failed.";
    return googleDriveCallbackResponse(false, message, returnUrl);
  }
});
