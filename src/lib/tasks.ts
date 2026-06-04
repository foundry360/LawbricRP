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
  const data = await invokeTaskFunction<{ tasks: TaskRecord[] }>("list_tasks", params);
  return data.tasks || [];
}

export async function createTask(payload: Record<string, unknown>) {
  const data = await invokeTaskFunction<{ task: TaskRecord }>("create_task", payload);
  return data.task;
}

export async function updateTask(payload: Record<string, unknown>) {
  const data = await invokeTaskFunction<{ task: TaskRecord }>("update_task", payload);
  return data.task;
}
