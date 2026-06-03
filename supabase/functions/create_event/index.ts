import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getCaseOrThrow,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
} from "../_shared/case-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);
    if (!body.title?.trim()) return jsonResponse({ error: "Event title is required" }, 400);
    if (!body.startAt) return jsonResponse({ error: "Event start time is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const { data, error } = await context.supabase
      .from("case_events")
      .insert({
        location_id: context.location.id,
        case_id: caseRow.id,
        title: body.title.trim(),
        event_type: body.eventType || "case",
        description: body.description || null,
        start_at: body.startAt,
        end_at: body.endAt || null,
        status: body.status || "scheduled",
        ghl_calendar_event_id: body.ghlCalendarEventId || null,
        metadata: body.metadata || {},
        created_by: context.user.id,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, event: data }, 201);
  } catch (error) {
    return handleError(error);
  }
});
