import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, readJsonBody } from "../_shared/case-utils.ts";

type LocationRow = {
  id: string;
  ghl_location_id: string | null;
};

type MatterMatch = {
  caseId: string;
  locationId: string;
  matchedBy: string;
};

type CommunicationMatchRow = {
  case_id: string | null;
  location_id: string | null;
  recipients: unknown;
};

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => firstString(item)).filter(Boolean)
    : firstString(value)
    ? [firstString(value)]
    : [];
}

function asEmailRecipientArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => {
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const email = normalizeEmail(firstString(
          record.email,
          record.address,
          record.emailAddress,
          record.email_address,
          record.value,
        ));
        return email ? { email } : null;
      }

      const email = normalizeEmail(item);
      return email ? { email } : null;
    }).filter((recipient): recipient is { email: string } => Boolean(recipient))
    : asStringArray(value).map((recipient) => ({ email: normalizeEmail(recipient) || recipient }));
}

function normalizeEmail(value: unknown) {
  const rawValue = String(value || "").trim();
  const match = rawValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (match?.[0] || rawValue).toLowerCase();
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
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

function getPathValue(source: Record<string, any>, path: string) {
  const literalValue = source[path];
  if (literalValue !== undefined) return literalValue;

  return path.split(".").reduce((current: any, key) => {
    if (!current || typeof current !== "object") return undefined;
    return current[key];
  }, source);
}

function firstPathString(sources: Array<Record<string, any>>, ...paths: string[]) {
  for (const path of paths) {
    for (const source of sources) {
      const value = getPathValue(source, path);
      const stringValue = firstString(value);
      if (stringValue) return stringValue;
    }
  }
  return "";
}

function cleanInboundPlainText(value: string) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/(^|\s)>\s*\[?https?:\/\/email\.lc\.[^\]\s]+]?\s*/gi, "\n")
    .split("\n")
    .filter((line) => {
      const trimmedLine = line.trim();
      const unquotedLine = trimmedLine.replace(/^>\s?/, "").trim();
      if (!unquotedLine) return true;
      if (/^\[?https?:\/\/email\.lc\.[^\]\s]+]?\s*$/i.test(unquotedLine)) return false;
      if (/^https?:\/\/email\.lc\.[^\s]+$/i.test(unquotedLine)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getBearerToken(req: Request) {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getWebhookSecrets() {
  return [
    Deno.env.get("INBOUND_EMAIL_WEBHOOK_SECRET"),
    Deno.env.get("GHL_WEBHOOK_SECRET"),
    Deno.env.get("GHL_WEBHOOK_SHARED_SECRET"),
  ].filter((value): value is string => Boolean(value));
}

function getWebhookSecretHashes() {
  return [
    Deno.env.get("INBOUND_EMAIL_WEBHOOK_SECRET_SHA256"),
    Deno.env.get("GHL_WEBHOOK_SECRET_SHA256"),
    Deno.env.get("GHL_WEBHOOK_SHARED_SECRET_SHA256"),
  ].filter((value): value is string => Boolean(value));
}

async function verifyWebhookSecret(req: Request) {
  const url = new URL(req.url);
  const providedSecret =
    req.headers.get("x-lawbric-webhook-secret") ||
    req.headers.get("x-ghl-webhook-secret") ||
    getBearerToken(req) ||
    url.searchParams.get("secret") ||
    "";
  if (!providedSecret) return false;

  for (const configuredSecret of getWebhookSecrets()) {
    if (timingSafeEqual(providedSecret, configuredSecret)) return true;
  }

  const providedSecretSha256 = await sha256Hex(providedSecret);
  return getWebhookSecretHashes().some((configuredHash) => timingSafeEqual(providedSecretSha256, configuredHash));
}

function getInboundPayload(body: Record<string, any>) {
  const data = asObject(body.data);
  const customData = asObject(body.customData || body.custom_data || body.custom || data.customData || data.custom_data || data.custom);
  const message = asObject(body.message || data.message || body.messageData || data.messageData || data);
  const inboundEmail = asObject(body.inboundEmail || body.inbound_email || data.inboundEmail || data.inbound_email || customData.inboundEmail || customData.inbound_email || message.inboundEmail || message.inbound_email);
  const email = asObject(body.email || data.email || customData.email || message.email);
  const conversation = asObject(body.conversation || data.conversation || message.conversation);
  const contact = asObject(body.contact || data.contact || message.contact);
  const sources = [body, customData, data, inboundEmail, email, message];
  const rawFrom = firstPathString(
    sources,
    "from.email",
    "from",
    "fromEmail",
    "from_email",
    "fromAddress",
    "from_address",
    "email.from.address",
    "email.from.email",
    "sender.email",
    "senderEmail",
    "sender_email",
    "inboundEmail.from",
    "inboundEmail.fromEmail",
    "inboundEmail.senderEmail",
  );
  const from = asObject(body.from || data.from || inboundEmail.from || email.from || message.from || message.sender);
  const to = asEmailRecipientArray(body.to || data.to || inboundEmail.to || email.to || message.to || message.toEmail || message.recipients);
  const direction = firstPathString(sources, "direction", "type", "message.direction", "inboundEmail.direction", "messageType").toLowerCase();

  return {
    locationId: firstPathString(sources, "locationId", "location_id", "location.id", "inboundEmail.locationId", "inboundEmail.location_id"),
    messageIds: collectIds(
      firstPathString(sources, "messageId", "message_id", "message.messageId", "inboundEmail.messageId", "inboundEmail.message_id", "id"),
      firstPathString(sources, "emailMessageId", "email_message_id", "message.emailMessageId", "inboundEmail.emailMessageId"),
      firstPathString(sources, "providerMessageId", "provider_message_id", "message.providerMessageId", "message.provider_message_id"),
      firstPathString(sources, "message.id", "inboundEmail.id", "threadId", "thread_id", "inboundEmail.threadId"),
    ),
    conversationIds: collectIds(
      firstPathString(sources, "conversationId", "conversation_id", "conversation.id", "message.conversationId", "inboundEmail.conversationId", "conversationProviderId", "message.conversationProviderId"),
      conversation.id,
    ),
    contactId: firstPathString(sources, "contactId", "contact_id", "contact.id", "message.contactId", "inboundEmail.contactId", "inboundEmail.contact_id"),
    senderName: firstString(
      from.name,
      from.fullName,
      from.full_name,
      firstPathString(sources, "senderName", "sender_name", "fromName", "from_name", "from.name", "sender.name", "inboundEmail.fromName", "inboundEmail.senderName"),
      contact.name,
      contact.fullName,
    ),
    senderEmail: normalizeEmail(firstString(
      from.email,
      rawFrom,
      firstPathString(sources, "senderEmail", "sender_email", "fromEmail", "from_email", "fromAddress", "from_address", "from.email", "from.address", "sender.email", "email.from.address", "inboundEmail.from", "inboundEmail.fromEmail", "inboundEmail.senderEmail"),
      contact.email,
    )),
    subject: firstPathString(sources, "subject", "emailSubject", "message.subject", "inboundEmail.subject"),
    html: firstPathString(sources, "html", "bodyHtml", "body_html", "bodyFullHtml", "body_full_html", "message.html", "inboundEmail.html", "inboundEmail.bodyFullHtml"),
    text: firstPathString(sources, "text", "body", "bodyPlain", "body_plain", "bodyFullPlain", "body_full_plain", "message", "message.body", "inboundEmail.body", "inboundEmail.text", "inboundEmail.bodyPlain", "inboundEmail.bodyFullPlain"),
    occurredAt: firstPathString(sources, "occurredAt", "occurred_at", "date", "createdAt", "created_at", "dateAdded", "message.dateAdded", "inboundEmail.date"),
    attachments: asArray(body.attachments || data.attachments || customData.attachments || inboundEmail.attachments || email.attachments || message.attachments),
    recipients: to,
    rawDirection: direction,
  };
}

async function getSupabase() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function resolveLocation(supabase: Awaited<ReturnType<typeof getSupabase>>, locationId: string): Promise<LocationRow | null> {
  if (!locationId) return null;

  const byGhlId = await supabase
    .from("ghl_locations")
    .select("id, ghl_location_id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();

  if (byGhlId.error) throw new Error(byGhlId.error.message);
  if (byGhlId.data) return byGhlId.data;

  if (!isUuid(locationId)) return null;

  const byId = await supabase
    .from("ghl_locations")
    .select("id, ghl_location_id")
    .eq("id", locationId)
    .maybeSingle();

  if (byId.error) throw new Error(byId.error.message);
  return byId.data;
}

async function findDuplicateMessage(supabase: Awaited<ReturnType<typeof getSupabase>>, locationId: string, messageIds: string[]) {
  for (const messageId of messageIds) {
    let query = supabase
      .from("case_communications")
      .select("id, case_id, location_id")
      .filter("ghl_message_ids", "cs", JSON.stringify([messageId]))
      .limit(1);

    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (data?.[0]) return data[0];
  }

  return null;
}

async function findCaseByConversation(supabase: Awaited<ReturnType<typeof getSupabase>>, locationId: string, conversationIds: string[]) {
  for (const conversationId of conversationIds) {
    let query = supabase
      .from("case_communications")
      .select("case_id, location_id")
      .filter("ghl_conversation_ids", "cs", JSON.stringify([conversationId]))
      .limit(10);

    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const matches = Array.from(
      new Map((data || []).filter((row) => row.case_id && row.location_id).map((row) => [row.case_id, row])).values(),
    );
    if (matches.length === 1) return { caseId: matches[0].case_id, locationId: matches[0].location_id, matchedBy: "conversation" };
    const caseIds = matches.map((row) => row.case_id);
    if (caseIds.length > 1) return { caseId: "", matchedBy: "ambiguous_conversation" };
  }

  return { caseId: "", locationId: "", matchedBy: "" };
}

async function findCaseByMatterContact(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  locationId: string,
  contactId: string,
  senderEmail: string,
) {
  const caseIds = new Set<string>();
  const locationIdsByCaseId = new Map<string, string>();

  if (contactId) {
    let query = supabase
      .from("case_parties")
      .select("case_id, location_id")
      .eq("ghl_contact_id", contactId)
      .is("deleted_at", null);

    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    (data || []).forEach((row) => {
      if (!row.case_id || !row.location_id) return;
      caseIds.add(row.case_id);
      locationIdsByCaseId.set(row.case_id, row.location_id);
    });
  }

  if (senderEmail) {
    let query = supabase
      .from("case_parties")
      .select("case_id, location_id")
      .ilike("email", senderEmail)
      .is("deleted_at", null);

    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    (data || []).forEach((row) => {
      if (!row.case_id || !row.location_id) return;
      caseIds.add(row.case_id);
      locationIdsByCaseId.set(row.case_id, row.location_id);
    });
  }

  if (caseIds.size === 0 && (contactId || senderEmail)) {
    let query = supabase
      .from("cases")
      .select("id, location_id")
      .is("deleted_at", null);

    if (locationId) query = query.eq("location_id", locationId);

    if (contactId && senderEmail) {
      query = query.or(`ghl_contact_id.eq.${contactId},primary_contact_email.ilike.${senderEmail}`);
    } else if (contactId) {
      query = query.eq("ghl_contact_id", contactId);
    } else {
      query = query.ilike("primary_contact_email", senderEmail);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    (data || []).forEach((row) => {
      if (!row.id || !row.location_id) return;
      caseIds.add(row.id);
      locationIdsByCaseId.set(row.id, row.location_id);
    });
  }

  if (caseIds.size === 1) {
    const caseId = Array.from(caseIds)[0];
    return { caseId, locationId: locationIdsByCaseId.get(caseId) || locationId, matchedBy: "matter_contact" };
  }
  if (caseIds.size > 1) return { caseId: "", locationId: "", matchedBy: "ambiguous_matter_contact" };
  return { caseId: "", locationId: "", matchedBy: "" };
}

function communicationHasParticipant(row: CommunicationMatchRow, contactId: string, senderEmail: string) {
  const recipients = Array.isArray(row.recipients) ? row.recipients : [];
  return recipients.some((recipient) => {
    if (!recipient || typeof recipient !== "object") return false;
    const recipientRecord = recipient as Record<string, unknown>;
    const recipientContactId = firstString(recipientRecord.contactId, recipientRecord.contact_id);
    const recipientEmail = normalizeEmail(recipientRecord.email);
    return Boolean(
      (contactId && recipientContactId === contactId) ||
        (senderEmail && recipientEmail === senderEmail),
    );
  });
}

async function findCaseByRecentCommunicationParticipant(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  locationId: string,
  contactId: string,
  senderEmail: string,
) {
  if (!contactId && !senderEmail) return { caseId: "", locationId: "", matchedBy: "" };

  let query = supabase
    .from("case_communications")
    .select("case_id, location_id, recipients")
    .eq("channel", "email")
    .eq("direction", "outbound")
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (locationId) query = query.eq("location_id", locationId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const matches = new Map<string, CommunicationMatchRow>();
  (data || []).forEach((row) => {
    if (!row.case_id || !row.location_id || !communicationHasParticipant(row, contactId, senderEmail)) return;
    if (!matches.has(row.case_id)) matches.set(row.case_id, row);
  });

  if (matches.size === 1) {
    const match = Array.from(matches.values())[0];
    return { caseId: match.case_id || "", locationId: match.location_id || "", matchedBy: "communication_recipient" };
  }
  if (matches.size > 1) return { caseId: "", locationId: "", matchedBy: "ambiguous_communication_recipient" };
  return { caseId: "", locationId: "", matchedBy: "" };
}

function getPreview(html: string, text: string) {
  const raw = text || html.replace(/<[^>]+>/g, " ");
  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (getWebhookSecrets().length === 0 && getWebhookSecretHashes().length === 0) {
    return jsonResponse({ error: "Inbound email webhook secret is not configured" }, 500);
  }
  if (!await verifyWebhookSecret(req)) return jsonResponse({ error: "Invalid webhook secret" }, 401);

  try {
    const body = asObject(await readJsonBody(req));
    const inbound = getInboundPayload(body);
    const isOutbound = inbound.rawDirection.includes("outbound") || inbound.rawDirection.includes("sent");
    if (isOutbound) return jsonResponse({ ok: true, ignored: true, reason: "Outbound message" });

    const supabase = await getSupabase();
    const location = await resolveLocation(supabase, inbound.locationId);
    const scopedLocationId = location?.id || "";

    const duplicate = await findDuplicateMessage(supabase, scopedLocationId, inbound.messageIds);
    if (duplicate) {
      return jsonResponse({ ok: true, ignored: true, reason: "Duplicate message", communicationId: duplicate.id, caseId: duplicate.case_id });
    }

    let match = await findCaseByConversation(supabase, scopedLocationId, inbound.conversationIds) as MatterMatch | { caseId: string; locationId: string; matchedBy: string };
    if (!match.caseId && !match.matchedBy.startsWith("ambiguous")) {
      match = await findCaseByMatterContact(supabase, scopedLocationId, inbound.contactId, inbound.senderEmail);
    }
    if (!match.caseId && !match.matchedBy.startsWith("ambiguous")) {
      match = await findCaseByRecentCommunicationParticipant(supabase, scopedLocationId, inbound.contactId, inbound.senderEmail);
    }

    if (!match.caseId) {
      console.warn("Inbound communication not matched", {
        reason: match.matchedBy || "Matter not matched",
        locationId: scopedLocationId || inbound.locationId || null,
        messageIds: inbound.messageIds,
        conversationIds: inbound.conversationIds,
        contactId: inbound.contactId || null,
        senderEmail: inbound.senderEmail || null,
        subject: inbound.subject || null,
      });
      return jsonResponse({ ok: true, ignored: true, reason: match.matchedBy || "Matter not matched" });
    }

    const { data: caseRow, error: caseError } = await supabase
      .from("cases")
      .select("id")
      .eq("id", match.caseId)
      .eq("location_id", match.locationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (caseError) throw new Error(caseError.message);
    if (!caseRow) return jsonResponse({ ok: true, ignored: true, reason: "Matter not available" });

    const senderName = inbound.senderName || inbound.senderEmail || "Unknown sender";
    const occurredAt = inbound.occurredAt || new Date().toISOString();
    const cleanedText = cleanInboundPlainText(inbound.text);
    const bodyHtmlOrText = inbound.html || cleanedText;

    const { data: communication, error } = await supabase
      .from("case_communications")
      .insert({
        location_id: match.locationId,
        case_id: caseRow.id,
        channel: "email",
        direction: "inbound",
        subject: inbound.subject || null,
        body: bodyHtmlOrText,
        preview: getPreview(inbound.html, cleanedText) || null,
        status: "received",
        participant_name: senderName,
        recipients: inbound.recipients,
        attachments: inbound.attachments,
        ghl_message_ids: inbound.messageIds,
        ghl_conversation_ids: inbound.conversationIds,
        is_read: false,
        read_at: null,
        metadata: {
          senderName,
          senderEmail: inbound.senderEmail || null,
          fromEmail: inbound.senderEmail || null,
          contactId: inbound.contactId || null,
          matchedBy: match.matchedBy,
        },
        occurred_at: occurredAt,
        created_by: null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return jsonResponse({ ok: true, communication, caseId: caseRow.id, matchedBy: match.matchedBy }, 201);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
