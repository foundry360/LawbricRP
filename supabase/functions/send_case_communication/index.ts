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

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function getPathValue(source: any, path: string) {
  return path.split(".").reduce((current: any, key) => {
    if (!current || typeof current !== "object") return undefined;
    return current[key];
  }, source);
}

function getFirstString(source: any, ...paths: string[]) {
  for (const path of paths) {
    const value = getPathValue(source, path);
    const stringValue = firstString(value);
    if (stringValue) return stringValue;
  }
  return "";
}

function collectIds(...values: unknown[]) {
  return Array.from(
    new Set(
      values.flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => firstString(value))
        .filter(Boolean),
    ),
  );
}

function getSendResponseMessageIds(response: any) {
  return collectIds(
    response?.messageId,
    response?.emailMessageId,
    response?.messageIds,
    getFirstString(response, "message.id", "message.messageId", "message.emailMessageId"),
    getFirstString(response, "data.messageId", "data.emailMessageId", "data.message.id", "data.message.messageId", "data.message.emailMessageId"),
  );
}

function getSendResponseConversationId(response: any) {
  return getFirstString(
    response,
    "conversationId",
    "conversation.id",
    "message.conversationId",
    "data.conversationId",
    "data.conversation.id",
    "data.message.conversationId",
  );
}

function getAttachmentUrls(body: Record<string, any>) {
  const explicitUrls = asArray(body.attachmentUrls).map((value) => firstString(value)).filter(Boolean);
  if (explicitUrls.length > 0) return explicitUrls;

  return asArray(body.attachments)
    .map((attachment) => typeof attachment === "string" ? attachment : firstString(asObject(attachment).url))
    .filter(Boolean);
}

function getGhlUrl(endpoint: string) {
  const baseUrl = Deno.env.get("GHL_API_BASE_URL") ?? "https://services.leadconnectorhq.com";
  return new URL(endpoint, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

async function sendGhlEmail(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch(getGhlUrl("/conversations/messages"), {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Version": "2021-04-15",
    },
    body: JSON.stringify({ type: "Email", ...payload }),
  });
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(firstString(data?.message, data?.error, text) || `GHL email send failed (${response.status})`);
  }

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    await requireContextPermission(context, "matters.edit", "You do not have permission to send matter communications.");

    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);
    if (!context.location.encryptedApiKey) return jsonResponse({ error: "GHL API key is not configured for this location." }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const recipients = asArray(body.recipients);
    const subject = firstString(body.subject);
    const html = firstString(body.body, body.html);
    const message = firstString(body.message, body.preview);
    if (recipients.length === 0) return jsonResponse({ error: "At least one recipient is required." }, 400);
    if (!subject) return jsonResponse({ error: "Subject is required." }, 400);
    if (!html && !message) return jsonResponse({ error: "Message body is required." }, 400);

    const { data: senderProfile } = await context.supabase
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("id", context.user.id)
      .maybeSingle();

    const now = new Date().toISOString();
    const requestMetadata = asObject(body.metadata);
    const metadata = {
      ...requestMetadata,
      senderName: senderProfile?.full_name || senderProfile?.email || requestMetadata.fromEmail || null,
      senderEmail: senderProfile?.email || requestMetadata.fromEmail || null,
      senderAvatarUrl: senderProfile?.avatar_url || null,
      sendStatus: "sending",
    };

    const { data: createdCommunication, error: insertError } = await context.supabase
      .from("case_communications")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        channel: "email",
        direction: "outbound",
        subject,
        body: html || message,
        preview: firstString(body.preview, message) || null,
        status: "draft",
        participant_name: firstString(body.participantName) || null,
        recipients,
        attachments: asArray(body.attachments),
        ghl_message_ids: [],
        ghl_conversation_ids: [],
        metadata,
        is_read: true,
        read_at: now,
        occurred_at: now,
        created_by: context.user.id,
      })
      .select("*, created_user:profiles!case_communications_created_by_fkey(id, full_name, email, avatar_url)")
      .single();

    if (insertError) throw new Error(insertError.message);

    const attachmentUrls = getAttachmentUrls(body);
    const emailFrom = firstString(body.emailFrom, requestMetadata.fromEmail);
    const replyMessageId = firstString(body.replyMessageId);
    const conversationId = firstString(body.conversationId);
    const shouldTryThreadedReply = Boolean(body.emailReplyMode && (replyMessageId || conversationId));

    const sendResults = await Promise.allSettled(
      recipients.map(async (recipient) => {
        const recipientRecord = asObject(recipient);
        const basePayload: Record<string, unknown> = {
          contactId: firstString(recipientRecord.contactId, recipientRecord.contact_id),
          emailTo: firstString(recipientRecord.email),
          emailFrom: emailFrom || undefined,
          subject,
          html: html || message,
          message: message || html,
          attachments: attachmentUrls,
        };

        if (!basePayload.contactId) throw new Error(`Missing contact ID for ${basePayload.emailTo || "recipient"}.`);

        if (!shouldTryThreadedReply) return sendGhlEmail(context.location.encryptedApiKey!, basePayload);

        try {
          return await sendGhlEmail(context.location.encryptedApiKey!, {
            ...basePayload,
            conversationId: conversationId || undefined,
            replyMessageId: replyMessageId || undefined,
            emailReplyMode: body.emailReplyMode,
          });
        } catch (error) {
          console.warn("Threaded GHL reply failed; falling back to normal email.", error);
          return sendGhlEmail(context.location.encryptedApiKey!, basePayload);
        }
      }),
    );

    const successfulResponses = sendResults
      .filter((result): result is PromiseFulfilledResult<any> => result.status === "fulfilled")
      .map((result) => result.value);
    const sendErrors = sendResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
    const sentAt = new Date().toISOString();
    const status = successfulResponses.length > 0 ? "sent" : "failed";
    const updateMetadata = {
      ...metadata,
      sendStatus: status,
      sentAt: successfulResponses.length > 0 ? sentAt : null,
      sendErrors,
      replyModeRequested: body.emailReplyMode || null,
    };

    const { data: updatedCommunication, error: updateError } = await context.supabase
      .from("case_communications")
      .update({
        status,
        ghl_message_ids: successfulResponses.flatMap(getSendResponseMessageIds),
        ghl_conversation_ids: collectIds(conversationId, successfulResponses.map(getSendResponseConversationId)),
        metadata: updateMetadata,
      })
      .eq("id", createdCommunication.id)
      .select("*, created_user:profiles!case_communications_created_by_fkey(id, full_name, email, avatar_url)")
      .single();

    if (updateError) throw new Error(updateError.message);
    if (successfulResponses.length === 0) {
      return jsonResponse({
        ok: false,
        communication: updatedCommunication,
        error: sendErrors[0] || "Email was not sent.",
      }, 502);
    }

    return jsonResponse({
      ok: true,
      communication: updatedCommunication,
      sendErrors,
    }, sendErrors.length > 0 ? 207 : 201);
  } catch (error) {
    return handleError(error);
  }
});
