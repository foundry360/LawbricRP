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
    const initialContext = await getRequestContext(req, body.locationId);
    await requireContextPermission(initialContext, "matters.edit", "You do not have permission to delete matter communications.");

    if (!body.communicationId) return jsonResponse({ error: "Communication ID is required" }, 400);

    const { data: existingCommunication, error: communicationError } = await initialContext.supabase
      .from("case_communications")
      .select("*")
      .eq("id", body.communicationId)
      .maybeSingle();

    if (communicationError) throw new Error(communicationError.message);
    if (!existingCommunication) return jsonResponse({ error: "Communication not found" }, 404);

    const context = existingCommunication.location_id === initialContext.location.id
      ? initialContext
      : await getRequestContext(req, existingCommunication.location_id);
    await requireContextPermission(context, "matters.edit", "You do not have permission to delete matter communications.");
    await getCaseOrThrow(context, existingCommunication.case_id);

    if (existingCommunication.deleted_at) {
      return jsonResponse({ ok: true, communicationId: existingCommunication.id, softDeleted: true, alreadyDeleted: true });
    }

    const deletedAt = new Date().toISOString();
    const deleteReason = typeof body.deleteReason === "string" ? body.deleteReason.trim() || null : null;

    const { error } = await context.supabase
      .from("case_communications")
      .update({
        deleted_at: deletedAt,
        deleted_by: context.user.id,
        delete_reason: deleteReason,
      })
      .eq("id", existingCommunication.id)
      .eq("location_id", existingCommunication.location_id)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, communicationId: existingCommunication.id, softDeleted: true });
  } catch (error) {
    return handleError(error);
  }
});
