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
    await getCaseOrThrow(context, existingCommunication.case_id);

    if (existingCommunication.deleted_at) {
      return jsonResponse({
        ok: true,
        communication: existingCommunication,
        communicationId: existingCommunication.id,
        softDeleted: true,
        alreadyDeleted: true,
      });
    }

    const updateFields: Record<string, unknown> = {};
    if (body.delete === true || body.softDelete === true) {
      await requireContextPermission(context, "matters.edit", "You do not have permission to delete matter communications.");
      updateFields.deleted_at = new Date().toISOString();
      updateFields.deleted_by = context.user.id;
      updateFields.delete_reason = typeof body.deleteReason === "string" ? body.deleteReason.trim() || null : null;
    }
    if (typeof body.isRead === "boolean") {
      updateFields.is_read = body.isRead;
      updateFields.read_at = body.isRead ? new Date().toISOString() : null;
    }

    if (Object.keys(updateFields).length === 0) {
      return jsonResponse({ error: "No communication changes were provided" }, 400);
    }

    const { data, error } = await context.supabase
      .from("case_communications")
      .update(updateFields)
      .eq("id", existingCommunication.id)
      .eq("location_id", existingCommunication.location_id)
      .is("deleted_at", null)
      .select("*, created_user:profiles!case_communications_created_by_fkey(id, full_name, email, avatar_url)")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({
      ok: true,
      communication: body.delete === true || body.softDelete === true ? null : data,
      communicationId: existingCommunication.id,
      softDeleted: body.delete === true || body.softDelete === true,
    });
  } catch (error) {
    return handleError(error);
  }
});
