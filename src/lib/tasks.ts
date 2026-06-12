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
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
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

export function formatTaskStatusLabel(status?: string | null) {
  const normalizedStatus = String(status || "").trim();
  if (normalizedStatus === "todo") return "To Do";
  return normalizedStatus
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export async function generateTaskDueNotifications(locationId?: string | null) {
  const resolvedLocationId = locationId || await getLocationId();
  const { data, error } = await supabase.rpc("generate_task_due_notifications", {
    p_location_id: resolvedLocationId,
  });

  if (error) throw new Error(error.message);
  return Number(data || 0);
}

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

function isSoftDeleteColumnUnavailable(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error || "");
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("deleted_at") &&
    (normalizedMessage.includes("schema cache") || normalizedMessage.includes("column") && normalizedMessage.includes("does not exist"));
}

export async function listTasks(params: Record<string, unknown> = {}) {
  const locationId = String(params.locationId || await getLocationId());
  const limit = Math.min(Number(params.limit) || 200, 500);
  const status = String(params.status || "");
  const relatedType = String(params.relatedType || "");
  const assignedUserId = String(params.assignedUserId || "");
  const search = String(params.search || "").replace(/%/g, "").trim();

  const buildQuery = (includeSoftDeleteFilter: boolean) => {
    let query = supabase
      .from("tasks")
      .select(`
        *,
        case:cases(id, case_number, case_name, primary_contact_name),
        assigned_user:profiles!tasks_assigned_user_id_fkey(id, full_name, email, avatar_url)
      `)
      .eq("location_id", locationId);

    if (includeSoftDeleteFilter) query = query.is("deleted_at", null);
    query = query.order("due_at", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false }).limit(limit);
    if (status && status !== "all") query = query.eq("status", status);
    if (relatedType && relatedType !== "all") query = query.eq("related_type", relatedType);
    if (assignedUserId && assignedUserId !== "all") query = query.eq("assigned_user_id", assignedUserId);
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,description.ilike.%${search}%,ghl_contact_name.ilike.%${search}%,ghl_opportunity_name.ilike.%${search}%`,
      );
    }
    return query;
  };

  let { data, error } = await buildQuery(true);
  if (error && isSoftDeleteColumnUnavailable(error)) {
    ({ data, error } = await buildQuery(false));
  }

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
