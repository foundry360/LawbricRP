import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LocationContext = {
  id: string;
  ghlLocationId: string | null;
  encryptedApiKey: string | null;
};

export type RequestContext = {
  supabase: ReturnType<typeof createClient>;
  user: { id: string };
  location: LocationContext;
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export async function readJsonBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function getBearerToken(req: Request) {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function getRequestContext(req: Request, locationId?: string): Promise<RequestContext> {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const jwt = getBearerToken(req);

  if (!jwt) throw new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401 });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) throw new Response(JSON.stringify({ error: "Invalid bearer token" }), { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error("Could not verify user access");
  if (!profile?.is_active) {
    throw new Response(JSON.stringify({ error: "Active app user required" }), { status: 403 });
  }

  let locationRow: any = null;

  if (locationId) {
    const { data: assignment, error: assignmentError } = await supabase
      .from("user_locations")
      .select("location_id, ghl_locations!inner(id, ghl_location_id, encrypted_api_key)")
      .eq("user_id", user.id)
      .eq("location_id", locationId)
      .maybeSingle();

    if (assignmentError) throw new Error("Could not verify location access");
    locationRow = Array.isArray(assignment?.ghl_locations) ? assignment.ghl_locations[0] : assignment?.ghl_locations;

    if (!locationRow && profile.role === "admin") {
      const { data: adminLocation, error: adminLocationError } = await supabase
        .from("ghl_locations")
        .select("id, ghl_location_id, encrypted_api_key")
        .eq("id", locationId)
        .maybeSingle();

      if (adminLocationError) throw new Error("Could not verify admin location access");
      locationRow = adminLocation;
    }
  } else {
    const { data: assignment, error: assignmentError } = await supabase
      .from("user_locations")
      .select("location_id, ghl_locations!inner(id, ghl_location_id, encrypted_api_key)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (assignmentError) throw new Error("Could not load assigned location");
    locationRow = Array.isArray(assignment?.ghl_locations) ? assignment.ghl_locations[0] : assignment?.ghl_locations;
  }

  if (!locationRow) {
    throw new Response(JSON.stringify({ error: "Location access denied" }), { status: 403 });
  }

  return {
    supabase,
    user: { id: user.id },
    location: {
      id: locationRow.id,
      ghlLocationId: locationRow.ghl_location_id,
      encryptedApiKey: locationRow.encrypted_api_key,
    },
  };
}

export async function handleError(error: unknown) {
  if (error instanceof Response) {
    return new Response(await error.text(), {
      status: error.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  console.error(error);
  return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
}

export async function getCaseOrThrow(context: RequestContext, caseId: string) {
  const { data: caseRow, error } = await context.supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .eq("location_id", context.location.id)
    .maybeSingle();

  if (error) throw new Error("Could not load case");
  if (!caseRow) throw new Response(JSON.stringify({ error: "Case not found" }), { status: 404 });

  return caseRow;
}

export function buildTimeline(payload: {
  notes?: any[];
  tasks?: any[];
  events?: any[];
  communications?: any[];
}) {
  return [
    ...(payload.notes ?? []).map((note) => ({
      id: note.id,
      type: "note",
      title: note.note_type === "case" ? "Case note" : note.note_type,
      body: note.body,
      occurred_at: note.created_at,
      raw: note,
    })),
    ...(payload.tasks ?? []).map((task) => ({
      id: task.id,
      type: "task",
      title: task.title,
      body: task.description,
      status: task.status,
      occurred_at: task.completed_at || task.due_at || task.created_at,
      raw: task,
    })),
    ...(payload.events ?? []).map((event) => ({
      id: event.id,
      type: "event",
      title: event.title,
      body: event.description,
      status: event.status,
      occurred_at: event.start_at || event.created_at,
      raw: event,
    })),
    ...(payload.communications ?? []).map((communication) => ({
      id: communication.id,
      type: "communication",
      title: communication.title || "GHL communication",
      body: communication.body || communication.message,
      occurred_at: communication.occurred_at || communication.created_at,
      raw: communication,
    })),
  ].sort((a, b) => new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime());
}

async function ghlRequest(context: RequestContext, endpoint: string, options: RequestInit = {}) {
  if (!context.location.encryptedApiKey) return null;

  const baseUrl = Deno.env.get("GHL_API_BASE_URL") ?? "https://services.leadconnectorhq.com";
  const version = Deno.env.get("GHL_API_VERSION") ?? "2021-07-28";
  const response = await fetch(new URL(endpoint, `${baseUrl.replace(/\/$/, "")}/`).toString(), {
    ...options,
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${context.location.encryptedApiKey}`,
      "Content-Type": "application/json",
      "Version": version,
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    console.warn("GHL case sync failed", response.status, text);
    return null;
  }

  return text ? JSON.parse(text) : {};
}

export async function syncCaseReference(context: RequestContext, caseRow: any) {
  const objectKey = Deno.env.get("GHL_CASE_OBJECT_KEY") || "custom_objects.cases";
  const properties = {
    case_id: caseRow.case_number || caseRow.id,
    case_name: caseRow.case_name,
    status: caseRow.status,
    stage: caseRow.stage,
    assigned_user: caseRow.assigned_ghl_user_id || caseRow.assigned_user_id || "",
    contact_id: caseRow.ghl_contact_id,
  };

  const body = JSON.stringify({
    locationId: context.location.ghlLocationId,
    contactId: caseRow.ghl_contact_id,
    properties,
  });

  const endpoint = caseRow.ghl_case_record_id
    ? `/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(caseRow.ghl_case_record_id)}`
    : `/objects/${encodeURIComponent(objectKey)}/records`;

  const response = await ghlRequest(context, endpoint, {
    method: caseRow.ghl_case_record_id ? "PUT" : "POST",
    body,
  });

  const recordId = response?.record?.id || response?.data?.id || response?.id;
  if (recordId && !caseRow.ghl_case_record_id) {
    await context.supabase
      .from("cases")
      .update({ ghl_case_record_id: recordId })
      .eq("id", caseRow.id)
      .eq("location_id", context.location.id);
  }
}

export async function syncCaseStageToGhl(context: RequestContext, caseRow: any) {
  await syncCaseReference(context, caseRow);

  const stageMapRaw = Deno.env.get("GHL_CASE_STAGE_MAP");
  const opportunityId = caseRow.metadata?.ghl_opportunity_id;
  if (!stageMapRaw || !opportunityId) return;

  try {
    const stageMap = JSON.parse(stageMapRaw);
    const pipelineStageId = stageMap[caseRow.stage] || caseRow.ghl_pipeline_stage_id;
    if (!pipelineStageId) return;

    await ghlRequest(context, `/opportunities/${encodeURIComponent(opportunityId)}`, {
      method: "PUT",
      body: JSON.stringify({
        pipelineStageId,
        status: caseRow.status,
      }),
    });
  } catch (error) {
    console.warn("Could not sync GHL case stage", error);
  }
}

const TASK_TEMPLATES: Record<string, Array<{ title: string; daysFromOpen: number; priority?: string; templateKey: string }>> = {
  General: [
    { title: "Review intake details", daysFromOpen: 1, priority: "normal", templateKey: "general.review_intake" },
    { title: "Schedule initial case review", daysFromOpen: 3, priority: "normal", templateKey: "general.initial_review" },
  ],
  Litigation: [
    { title: "Confirm statute and deadline dates", daysFromOpen: 1, priority: "high", templateKey: "litigation.deadline_review" },
    { title: "Request supporting documents", daysFromOpen: 2, priority: "normal", templateKey: "litigation.document_request" },
  ],
};

export async function createTemplateTasks(context: RequestContext, caseRow: any) {
  const templates = TASK_TEMPLATES[caseRow.case_type] || TASK_TEMPLATES.General;
  const openedAt = new Date(caseRow.opened_at || Date.now());
  const rows = templates.map((template) => {
    const dueAt = new Date(openedAt);
    dueAt.setDate(dueAt.getDate() + template.daysFromOpen);

    return {
      location_id: context.location.id,
      case_id: caseRow.id,
      title: template.title,
      priority: template.priority || "normal",
      due_at: dueAt.toISOString(),
      assigned_user_id: caseRow.assigned_user_id,
      template_key: template.templateKey,
      automation_key: "case_created",
      created_by: context.user.id,
    };
  });

  if (rows.length === 0) return;
  await context.supabase.from("tasks").insert(rows);
}
