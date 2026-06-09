import { getAppLocationContext, requirePermission } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export type CaseRecord = {
  id: string;
  location_id: string;
  case_number: string;
  case_name: string;
  case_type: string;
  status: "open" | "pending" | "closed" | "archived" | string;
  stage: string;
  ghl_contact_id: string;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  assigned_user_id?: string | null;
  source_attorney_user_id?: string | null;
  ghl_case_record_id?: string | null;
  ghl_pipeline_id?: string | null;
  ghl_pipeline_stage_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CaseDetail = {
  case: CaseRecord;
  parties: any[];
  assignments: any[];
  tasks: any[];
  events: any[];
  documents: any[];
  financials: any[];
  notes: any[];
  contactAssignment?: any | null;
  timeline: any[];
};

async function getLocationId() {
  const context = await getAppLocationContext();
  const locationId = context.location?.id;
  if (!locationId) throw new Error(context.reason || "Location is not configured.");
  return locationId;
}

async function getFunctionErrorMessage(error: unknown) {
  const context = error && typeof error === "object" && "context" in error ? error.context : null;

  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.error === "string") return payload.error;
      if (typeof payload?.message === "string") return payload.message;
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text;
      } catch {
        // Fall back to the original error message below.
      }
    }
  }

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Matter request failed";
}

async function invokeCaseFunction<T>(name: string, body: Record<string, unknown>) {
  const locationId = body.locationId || await getLocationId();
  const { data, error } = await supabase.functions.invoke(name, {
    body: {
      ...body,
      locationId,
    },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.error) throw new Error(data.error);

  return data as T;
}

export async function listCases(params: Record<string, unknown> = {}) {
  const locationId = String(params.locationId || await getLocationId());
  const limit = Math.min(Number(params.limit) || 100, 200);
  let query = supabase
    .from("cases")
    .select("*")
    .eq("location_id", locationId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  const status = String(params.status || "");
  if (status && status !== "all") query = query.eq("status", status);

  const caseType = String(params.caseType || "");
  if (caseType && caseType !== "all") query = query.eq("case_type", caseType);

  const search = String(params.search || "").replace(/%/g, "").trim();
  if (search) query = query.or(`case_name.ilike.%${search}%,case_number.ilike.%${search}%,primary_contact_name.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as CaseRecord[];
}

export async function getCase(caseId: string) {
  return invokeCaseFunction<CaseDetail>("get_case", { caseId });
}

export async function createCase(payload: Record<string, unknown>) {
  await requirePermission("matters.create", "You do not have permission to create matters.");
  if (payload.assignedUserId !== undefined || payload.sourceAttorneyUserId !== undefined || payload.assignedGhlUserId !== undefined) {
    await requirePermission("matters.assign", "You do not have permission to assign matters.");
  }
  const data = await invokeCaseFunction<{ case: CaseRecord }>("create_case", payload);
  return data.case;
}

export async function updateCase(payload: Record<string, unknown>) {
  await requirePermission("matters.edit", "You do not have permission to edit matters.");
  if (payload.assignedUserId !== undefined || payload.sourceAttorneyUserId !== undefined || payload.assignedGhlUserId !== undefined) {
    await requirePermission("matters.assign", "You do not have permission to assign matters.");
  }
  const data = await invokeCaseFunction<{ case: CaseRecord }>("update_case", payload);
  return data.case;
}

export async function deleteCase(payload: Record<string, unknown>) {
  await requirePermission("matters.delete", "You do not have permission to delete matters.");
  return invokeCaseFunction<{ ok: boolean; caseId: string }>("delete_case", payload);
}

export async function addCaseParty(payload: Record<string, unknown>) {
  const data = await invokeCaseFunction<{ party: any }>("add_case_party", payload);
  return data.party;
}

export async function createCaseTask(payload: Record<string, unknown>) {
  const data = await invokeCaseFunction<{ task: any }>("create_task", payload);
  return data.task;
}

export async function createCaseEvent(payload: Record<string, unknown>) {
  const data = await invokeCaseFunction<{ event: any }>("create_event", payload);
  return data.event;
}

export async function createCaseNote(payload: Record<string, unknown>) {
  await requirePermission("matters.edit", "You do not have permission to add matter notes.");
  const data = await invokeCaseFunction<{ note: any }>("create_note", payload);
  return data.note;
}

export async function updateCaseNote(payload: Record<string, unknown>) {
  await requirePermission("matters.edit", "You do not have permission to edit matter notes.");
  const data = await invokeCaseFunction<{ note: any }>("update_note", payload);
  return data.note;
}

export async function deleteCaseNote(payload: Record<string, unknown>) {
  await requirePermission("matters.edit", "You do not have permission to delete matter notes.");
  return invokeCaseFunction<{ ok: boolean; noteId: string }>("delete_note", payload);
}

export async function uploadCaseDocument(payload: Record<string, unknown>) {
  const data = await invokeCaseFunction<{ document: any }>("upload_document", payload);
  return data.document;
}
