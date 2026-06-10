import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  buildTimeline,
  corsHeaders,
  getCaseOrThrow,
  getRequestContext,
  handleError,
  jsonResponse,
  readJsonBody,
  userHasPermission,
} from "../_shared/case-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJsonBody(req);
    const context = await getRequestContext(req, body.locationId);
    if (!body.caseId) return jsonResponse({ error: "Case ID is required" }, 400);

    const caseRow = await getCaseOrThrow(context, body.caseId);
    const canViewDocuments = await userHasPermission(context, "documents.view");
    const [parties, assignments, tasks, events, documents, financials, notes, contactAssignment] = await Promise.all([
      context.supabase.from("case_parties").select("*").eq("case_id", caseRow.id).order("created_at", { ascending: true }),
      context.supabase
        .from("case_assignments")
        .select("*, assigned_user:profiles!case_assignments_assigned_user_id_fkey(id, full_name, email)")
        .eq("case_id", caseRow.id),
      context.supabase.from("tasks").select("*").eq("case_id", caseRow.id).order("due_at", { ascending: true, nullsFirst: false }),
      context.supabase.from("case_events").select("*").eq("case_id", caseRow.id).order("start_at", { ascending: false }),
      canViewDocuments
        ? context.supabase
          .from("documents")
          .select("*, uploaded_user:profiles!documents_uploaded_by_fkey(id, full_name, email), updated_user:profiles!documents_updated_by_fkey(id, full_name, email)")
          .eq("case_id", caseRow.id)
          .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      context.supabase.from("financials").select("*").eq("case_id", caseRow.id).order("created_at", { ascending: false }),
      context.supabase.from("notes").select("*").eq("case_id", caseRow.id).order("created_at", { ascending: false }),
      context.supabase
        .from("contact_assignments")
        .select("*, assigned_user:profiles!contact_assignments_assigned_user_id_fkey(id, full_name, email)")
        .eq("location_id", context.location.id)
        .eq("ghl_contact_id", caseRow.ghl_contact_id)
        .maybeSingle(),
    ]);

    for (const result of [parties, assignments, tasks, events, documents, financials, notes, contactAssignment]) {
      if (result.error) throw new Error(result.error.message);
    }

    return jsonResponse({
      ok: true,
      case: caseRow,
      parties: parties.data ?? [],
      assignments: assignments.data ?? [],
      tasks: tasks.data ?? [],
      events: events.data ?? [],
      documents: documents.data ?? [],
      financials: financials.data ?? [],
      notes: notes.data ?? [],
      contactAssignment: contactAssignment.data ?? null,
      timeline: buildTimeline({
        notes: notes.data ?? [],
        tasks: tasks.data ?? [],
        events: events.data ?? [],
      }),
    });
  } catch (error) {
    return handleError(error);
  }
});
