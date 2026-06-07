import { getAppLocationContext } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { CaseRecord } from "@/lib/cases";

export type TaskRecord = {
  id: string;
  location_id: string;
  case_id?: string | null;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled" | string;
  priority: "low" | "normal" | "high" | "urgent" | string;
  due_at?: string | null;
  reminder_at?: string | null;
  completed_at?: string | null;
  assigned_user_id?: string | null;
  related_type?: "case" | "contact" | "opportunity" | "general" | string;
  ghl_contact_id?: string | null;
  ghl_contact_name?: string | null;
  ghl_opportunity_id?: string | null;
  ghl_opportunity_name?: string | null;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  case?: Pick<CaseRecord, "id" | "case_number" | "case_name" | "primary_contact_name"> | null;
  assigned_user?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    profilePhoto?: string | null;
  } | null;
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
      const text = await context.clone().text().catch(() => "");
      if (text) return text;
    }
  }

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Task request failed";
}

async function invokeTaskFunction<T>(name: string, body: Record<string, unknown>) {
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

export async function listTasks(params: Record<string, unknown> = {}) {
  const locationId = String(params.locationId || await getLocationId());
  const limit = Math.min(Number(params.limit) || 200, 500);
  let query = supabase
    .from("tasks")
    .select(`
      *,
      case:cases(id, case_number, case_name, primary_contact_name),
      assigned_user:profiles!tasks_assigned_user_id_fkey(id, full_name, email, avatar_url)
    `)
    .eq("location_id", locationId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  const status = String(params.status || "");
  if (status && status !== "all") query = query.eq("status", status);

  const relatedType = String(params.relatedType || "");
  if (relatedType && relatedType !== "all") query = query.eq("related_type", relatedType);

  const assignedUserId = String(params.assignedUserId || "");
  if (assignedUserId && assignedUserId !== "all") query = query.eq("assigned_user_id", assignedUserId);

  const search = String(params.search || "").replace(/%/g, "").trim();
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%,ghl_contact_name.ilike.%${search}%,ghl_opportunity_name.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as TaskRecord[];
}

export async function createTask(payload: Record<string, unknown>) {
  const data = await invokeTaskFunction<{ task: TaskRecord }>("create_task", payload);
  return data.task;
}

export async function updateTask(payload: Record<string, unknown>) {
  const data = await invokeTaskFunction<{ task: TaskRecord }>("update_task", payload);
  return data.task;
}

export async function deleteTask(payload: Record<string, unknown>) {
  return invokeTaskFunction<{ ok: boolean; taskId: string }>("delete_task", payload);
}
