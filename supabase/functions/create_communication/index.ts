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

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    await requireContextPermission(context, "matters.edit", "You do not have permission to save matter communications.");

    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const channel = String(body.channel || "email").trim().toLowerCase();
    const direction = String(body.direction || "outbound").trim().toLowerCase();
    const status = String(body.status || "sent").trim().toLowerCase();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const bodyText = typeof body.body === "string" ? body.body : "";
    const preview = typeof body.preview === "string" ? body.preview.trim() : "";
    const { data: senderProfile } = await context.supabase
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("id", context.user.id)
      .maybeSingle();
    const requestMetadata = asObject(body.metadata);
    const metadata = {
      ...requestMetadata,
      senderName: senderProfile?.full_name || senderProfile?.email || (requestMetadata as any).fromEmail || null,
      senderEmail: senderProfile?.email || (requestMetadata as any).fromEmail || null,
      senderAvatarUrl: senderProfile?.avatar_url || null,
    };

    const { data, error } = await context.supabase
      .from("case_communications")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        channel,
        direction,
        subject: subject || null,
        body: bodyText,
        preview: preview || null,
        status,
        participant_name: typeof body.participantName === "string" ? body.participantName.trim() || null : null,
        recipients: asArray(body.recipients),
        attachments: asArray(body.attachments),
        ghl_message_ids: asArray(body.ghlMessageIds),
        ghl_conversation_ids: asArray(body.ghlConversationIds),
        metadata,
        occurred_at: typeof body.occurredAt === "string" && body.occurredAt ? body.occurredAt : new Date().toISOString(),
        created_by: context.user.id,
      })
      .select("*, created_user:profiles!case_communications_created_by_fkey(id, full_name, email, avatar_url)")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, communication: data }, 201);
  } catch (error) {
    return handleError(error);
  }
});
