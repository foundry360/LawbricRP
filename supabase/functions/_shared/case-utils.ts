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

function getAvatarUrlFromMetadata(metadata?: Record<string, unknown> | null) {
  const possibleValues = [
    metadata?.avatar_url,
    metadata?.avatarUrl,
    metadata?.profilePhoto,
    metadata?.profile_photo,
    metadata?.profilePicture,
    metadata?.profile_picture,
    metadata?.picture,
  ];
  const avatarUrl = possibleValues.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof avatarUrl === "string" ? avatarUrl.trim() : "";
}

async function getAuthAvatarUrl(context: RequestContext, userId: string) {
  try {
    const { data, error } = await context.supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return "";
    return getAvatarUrlFromMetadata(data.user.user_metadata as Record<string, unknown> | null);
  } catch {
    return "";
  }
}

export async function hydrateTaskAssigneeAvatars<T extends { assigned_user_id?: string | null; assigned_user?: any }>(
  context: RequestContext,
  tasks: T[],
) {
  const missingAvatarUserIds = Array.from(
    new Set(
      tasks
        .map((task) => task.assigned_user?.id || task.assigned_user_id)
        .filter((userId) => typeof userId === "string" && userId)
        .filter((userId) => {
          const task = tasks.find((item) => (item.assigned_user?.id || item.assigned_user_id) === userId);
          return task?.assigned_user && !task.assigned_user.avatar_url;
        }) as string[],
    ),
  );

  if (missingAvatarUserIds.length === 0) return tasks;

  const avatarEntries = await Promise.all(
    missingAvatarUserIds.map(async (userId) => [userId, await getAuthAvatarUrl(context, userId)] as const),
  );
  const avatarMap = new Map(avatarEntries.filter(([, avatarUrl]) => Boolean(avatarUrl)));

  if (avatarMap.size === 0) return tasks;

  await Promise.all(
    Array.from(avatarMap.entries()).map(([userId, avatarUrl]) =>
      context.supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId),
    ),
  );

  return tasks.map((task) => {
    const userId = task.assigned_user?.id || task.assigned_user_id;
    const avatarUrl = userId ? avatarMap.get(userId) : "";
    if (!avatarUrl || !task.assigned_user) return task;
    return {
      ...task,
      assigned_user: {
        ...task.assigned_user,
        avatar_url: avatarUrl,
      },
    };
  });
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

export async function userHasPermission(context: RequestContext, permissionKey: string) {
  const { data: profile, error: profileError } = await context.supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", context.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) return false;
  if (profile.role === "admin") return true;

  const { data: overrideRows, error: overrideError } = await context.supabase
    .from("user_permissions")
    .select("effect, permissions!inner(key)")
    .eq("user_id", context.user.id)
    .eq("permissions.key", permissionKey);

  if (overrideError) return false;

  const overrides = overrideRows ?? [];
  if (overrides.some((row: any) => row.effect === "deny")) return false;
  if (overrides.some((row: any) => row.effect === "grant")) return true;

  const { data: roleRows, error: roleError } = await context.supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", context.user.id);

  if (roleError || !roleRows?.length) return false;

  const roleIds = roleRows.map((row: any) => row.role_id).filter(Boolean);
  if (roleIds.length === 0) return false;

  const { data: rolePermissionRows, error: rolePermissionError } = await context.supabase
    .from("role_permissions")
    .select("role_id, permissions!inner(key)")
    .in("role_id", roleIds)
    .eq("permissions.key", permissionKey);

  if (rolePermissionError) return false;
  return Boolean(rolePermissionRows?.length);
}

export async function requireContextPermission(context: RequestContext, permissionKey: string, message: string) {
  if (!await userHasPermission(context, permissionKey)) {
    throw new Response(JSON.stringify({ error: message }), { status: 403 });
  }
}

export async function userHasAnyRole(context: RequestContext, roleKeys: string[]) {
  const normalizedRoleKeys = roleKeys.map((roleKey) => roleKey.trim()).filter(Boolean);
  if (normalizedRoleKeys.length === 0) return false;

  const { data: profile, error: profileError } = await context.supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", context.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) return false;
  if (profile.role === "admin" && normalizedRoleKeys.includes("admin")) return true;

  const { data: userRoleRows, error: userRolesError } = await context.supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", context.user.id);

  if (userRolesError || !userRoleRows?.length) return false;

  const roleIds = userRoleRows.map((row: any) => row.role_id).filter(Boolean);
  if (roleIds.length === 0) return false;

  const { data: roleRows, error: rolesError } = await context.supabase
    .from("roles")
    .select("key")
    .in("id", roleIds)
    .in("key", normalizedRoleKeys);

  if (rolesError) return false;
  return Boolean(roleRows?.length);
}

export async function requireAnyRole(context: RequestContext, roleKeys: string[], message: string) {
  if (!await userHasAnyRole(context, roleKeys)) {
    throw new Response(JSON.stringify({ error: message }), { status: 403 });
  }
}

export async function getDocumentCapabilities(context: RequestContext) {
  const [canView, canUpload, canEdit, canMove, canDelete, canManageFolders] = await Promise.all([
    userHasPermission(context, "documents.view"),
    userHasPermission(context, "documents.upload"),
    userHasPermission(context, "documents.edit"),
    userHasPermission(context, "documents.move"),
    userHasPermission(context, "documents.delete"),
    userHasPermission(context, "folders.manage"),
  ]);

  return { canView, canUpload, canEdit, canMove, canDelete, canManageFolders };
}

export async function canViewMatter(context: RequestContext, caseRow: any) {
  if (!caseRow) return false;
  if (!caseRow.location_id || caseRow.location_id !== context.location.id) return false;

  if (await userHasPermission(context, "matters.view_all")) return true;
  if (caseRow.created_by === context.user.id && await userHasPermission(context, "matters.view_own")) return true;
  if (!await userHasPermission(context, "matters.view_assigned")) return false;

  if (caseRow.assigned_user_id === context.user.id || caseRow.source_attorney_user_id === context.user.id) {
    return true;
  }

  const { data, error } = await context.supabase
    .from("case_assignments")
    .select("id")
    .eq("location_id", context.location.id)
    .eq("case_id", caseRow.id)
    .eq("assigned_user_id", context.user.id)
    .is("ended_at", null)
    .limit(1);

  if (error) return false;
  return Boolean(data?.length);
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
  if (!await canViewMatter(context, caseRow)) {
    throw new Response(JSON.stringify({ error: "You do not have permission to view this matter." }), { status: 403 });
  }

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
      title: communication.title || communication.subject || "Communication",
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

async function ghlRequestOrThrow(context: RequestContext, endpoint: string, options: RequestInit = {}) {
  if (!context.location.encryptedApiKey) throw new Error("GHL API key is not configured");

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
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = parsed?.message || parsed?.error || text || `GHL request failed with status ${response.status}`;
    throw new Error(message);
  }

  return parsed;
}

async function getProfileDisplay(context: RequestContext, userId: string) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Could not load assigned user profile for GHL case sync", error);
    return null;
  }

  return {
    name: data?.full_name || data?.email || "",
    email: data?.email || "",
  };
}

function getCollection(response: any, ...keys: string[]) {
  if (Array.isArray(response)) return response;
  for (const key of keys) {
    if (Array.isArray(response?.[key])) return response[key];
    if (Array.isArray(response?.data?.[key])) return response.data[key];
  }
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

async function getCaseContactAssociationId(context: RequestContext, objectKey: string) {
  const response = await ghlRequest(
    context,
    `/associations/objectKey/${encodeURIComponent(objectKey)}?locationId=${encodeURIComponent(context.location.ghlLocationId)}`,
  );
  const associations = getCollection(response, "associations");
  const match = associations.find((association: any) => {
    const key = String(association.key || "").toLowerCase();
    const firstObjectKey = String(association.firstObjectKey || "").toLowerCase();
    const secondObjectKey = String(association.secondObjectKey || "").toLowerCase();
    return key === "case_contact" ||
      firstObjectKey === objectKey.toLowerCase() && secondObjectKey === "contact" ||
      firstObjectKey === "contact" && secondObjectKey === objectKey.toLowerCase();
  });

  return match?.id || null;
}

async function linkCaseRecordToContact(context: RequestContext, objectKey: string, recordId?: string | null, contactId?: string | null) {
  if (!recordId || !contactId) return;

  const associationId = await getCaseContactAssociationId(context, objectKey);
  if (!associationId) {
    console.warn("Could not link GHL case record to contact because association id was not found", { recordId, contactId });
    return;
  }

  await ghlRequest(context, "/associations/relations", {
    method: "POST",
    body: JSON.stringify({
      locationId: context.location.ghlLocationId,
      associationId,
      firstRecordId: recordId,
      secondRecordId: contactId,
    }),
  });
}

function parseJsonEnv(name: string) {
  const raw = Deno.env.get(name);
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`${name} is not valid JSON`, error);
    return {};
  }
}

function getCasePipelineStageId(caseRow: any) {
  const stageMap = parseJsonEnv("GHL_CASE_STAGE_MAP") as Record<string, string>;
  return caseRow.ghl_pipeline_stage_id ||
    stageMap[caseRow.stage] ||
    Deno.env.get("GHL_CASE_DEFAULT_PIPELINE_STAGE_ID") ||
    "";
}

function getCaseOpportunityStatus(caseRow: any) {
  const statusMap = {
    open: "open",
    pending: "open",
    closed: "won",
    archived: "lost",
    ...(parseJsonEnv("GHL_CASE_STATUS_MAP") as Record<string, string>),
  };

  return statusMap[caseRow.status] || "open";
}

function getCaseOpportunityName(caseRow: any) {
  const metadata = caseRow.metadata && typeof caseRow.metadata === "object" ? caseRow.metadata : {};
  const companyName = String(metadata.companyName || metadata.company_name || "").trim();
  const caseName = String(caseRow.case_name || caseRow.case_number || "Matter").trim();
  return companyName && !caseName.toLowerCase().includes(companyName.toLowerCase())
    ? `${companyName} - ${caseName}`
    : caseName;
}

export async function ensureCaseOpportunity(context: RequestContext, caseRow: any) {
  const metadata = caseRow.metadata && typeof caseRow.metadata === "object" ? caseRow.metadata : {};
  const existingOpportunityId = metadata.ghl_opportunity_id;
  if (existingOpportunityId) return caseRow;

  const pipelineId = caseRow.ghl_pipeline_id || Deno.env.get("GHL_CASE_PIPELINE_ID") || "";
  const pipelineStageId = getCasePipelineStageId(caseRow);
  if (!context.location.ghlLocationId || !pipelineId || !pipelineStageId || !caseRow.ghl_contact_id) return caseRow;

  const opportunityName = getCaseOpportunityName(caseRow);
  const response = await ghlRequestOrThrow(context, "/opportunities/", {
    method: "POST",
    body: JSON.stringify({
      locationId: context.location.ghlLocationId,
      contactId: caseRow.ghl_contact_id,
      name: opportunityName,
      pipelineId,
      pipelineStageId,
      status: getCaseOpportunityStatus(caseRow),
    }),
  });

  const opportunityId = response?.opportunity?.id || response?.data?.id || response?.id;
  if (!opportunityId) return caseRow;

  const nextMetadata = {
    ...metadata,
    ghl_opportunity_id: opportunityId,
    ghl_opportunity_name: opportunityName,
    ghl_opportunity_contact_id: caseRow.ghl_contact_id,
    ghl_opportunity_synced_at: new Date().toISOString(),
    ghl_opportunity_sync_error: null,
  };

  const { data, error } = await context.supabase
    .from("cases")
    .update({
      metadata: nextMetadata,
      ghl_pipeline_id: pipelineId,
      ghl_pipeline_stage_id: pipelineStageId,
    })
    .eq("id", caseRow.id)
    .eq("location_id", context.location.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data || { ...caseRow, metadata: nextMetadata, ghl_pipeline_id: pipelineId, ghl_pipeline_stage_id: pipelineStageId };
}

export async function syncTaskToGhl(context: RequestContext, taskRow: any) {
  const metadata = taskRow.metadata && typeof taskRow.metadata === "object" ? taskRow.metadata : {};

  if (!taskRow.ghl_contact_id) {
    return {
      ...metadata,
      ghl_task_sync_skipped: "Task is not linked to a GHL contact.",
      ghl_task_sync_error: null,
    };
  }

  if (!taskRow.due_at) {
    return {
      ...metadata,
      ghl_task_sync_skipped: "GHL contact tasks require a due date.",
      ghl_task_sync_error: null,
    };
  }

  const assignedUser = taskRow.assigned_user_id
    ? await getProfileDisplay(context, taskRow.assigned_user_id)
    : null;
  const assignedLine = assignedUser?.name
    ? `\n\nAssigned in Lawbric: ${assignedUser.name}${assignedUser.email ? ` <${assignedUser.email}>` : ""}`
    : "";
  const body = `${taskRow.description || ""}${assignedLine}`.trim();
  const ghlTaskId = metadata.ghl_task_id;
  const response = await ghlRequestOrThrow(
    context,
    ghlTaskId
      ? `/contacts/${encodeURIComponent(taskRow.ghl_contact_id)}/tasks/${encodeURIComponent(ghlTaskId)}`
      : `/contacts/${encodeURIComponent(taskRow.ghl_contact_id)}/tasks`,
    {
      method: ghlTaskId ? "PUT" : "POST",
      body: JSON.stringify({
        title: taskRow.title,
        body,
        dueDate: taskRow.due_at,
        completed: taskRow.status === "done",
      }),
    },
  );

  const syncedTaskId = response?.task?.id || response?.data?.id || response?.id || ghlTaskId;
  return {
    ...metadata,
    ghl_task_id: syncedTaskId,
    ghl_task_synced_at: new Date().toISOString(),
    ghl_task_sync_error: null,
    ghl_task_sync_skipped: null,
  };
}

export async function deleteTaskFromGhl(context: RequestContext, taskRow: any) {
  const metadata = taskRow.metadata && typeof taskRow.metadata === "object" ? taskRow.metadata : {};
  const ghlTaskId = metadata.ghl_task_id;

  if (!taskRow.ghl_contact_id || !ghlTaskId) {
    return {
      deleted: false,
      skippedReason: !taskRow.ghl_contact_id
        ? "Task is not linked to a GHL contact."
        : "Task does not have a synced GHL task ID.",
    };
  }

  try {
    await ghlRequestOrThrow(
      context,
      `/contacts/${encodeURIComponent(taskRow.ghl_contact_id)}/tasks/${encodeURIComponent(ghlTaskId)}`,
      { method: "DELETE" },
    );
    return { deleted: true, ghlTaskId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete GHL task";
    if (message.toLowerCase().includes("not found") || message.includes("404")) {
      return { deleted: false, ghlTaskId, skippedReason: "GHL task was already deleted." };
    }
    throw error;
  }
}

export async function syncCaseReference(context: RequestContext, caseRow: any) {
  const objectKey = Deno.env.get("GHL_CASE_OBJECT_KEY") || "custom_objects.cases";
  const assignedUser = caseRow.assigned_user_id
    ? await getProfileDisplay(context, caseRow.assigned_user_id)
    : null;
  const properties = {
    case_id: caseRow.case_number || caseRow.id,
    case_name: caseRow.case_name,
    case_type: caseRow.case_type,
    status: caseRow.status,
    stage: caseRow.stage,
    primary_attorney: assignedUser?.name || "",
    primary_attorney_id: caseRow.assigned_user_id || "",
    primary_attorney_email: assignedUser?.email || "",
    contact_id: caseRow.ghl_contact_id,
  };

  const body = JSON.stringify({
    locationId: context.location.ghlLocationId,
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
  await linkCaseRecordToContact(context, objectKey, recordId || caseRow.ghl_case_record_id, caseRow.ghl_contact_id);

  if (recordId && !caseRow.ghl_case_record_id) {
    await context.supabase
      .from("cases")
      .update({ ghl_case_record_id: recordId })
      .eq("id", caseRow.id)
      .eq("location_id", context.location.id);
  }
}

export async function deleteCaseFromGhl(context: RequestContext, caseRow: any) {
  const objectKey = Deno.env.get("GHL_CASE_OBJECT_KEY") || "custom_objects.cases";
  const recordId = caseRow.ghl_case_record_id;

  if (!recordId) {
    return { deleted: false, skippedReason: "Case does not have a synced GHL case record ID." };
  }

  try {
    await ghlRequestOrThrow(
      context,
      `/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(recordId)}?locationId=${encodeURIComponent(context.location.ghlLocationId)}`,
      { method: "DELETE" },
    );
    return { deleted: true, ghlCaseRecordId: recordId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete GHL case record";
    if (message.toLowerCase().includes("not found") || message.includes("404")) {
      return { deleted: false, ghlCaseRecordId: recordId, skippedReason: "GHL case record was already deleted." };
    }
    throw error;
  }
}

export async function syncCaseStageToGhl(context: RequestContext, caseRow: any) {
  const opportunityCaseRow = await ensureCaseOpportunity(context, caseRow);

  const opportunityId = opportunityCaseRow.metadata?.ghl_opportunity_id;
  if (!opportunityId) return opportunityCaseRow;

  try {
    const pipelineId = opportunityCaseRow.ghl_pipeline_id || Deno.env.get("GHL_CASE_PIPELINE_ID") || "";
    const pipelineStageId = getCasePipelineStageId(opportunityCaseRow);
    if (!pipelineStageId) return opportunityCaseRow;

    await ghlRequest(context, `/opportunities/${encodeURIComponent(opportunityId)}`, {
      method: "PUT",
      body: JSON.stringify({
        ...(pipelineId ? { pipelineId } : {}),
        pipelineStageId,
        status: getCaseOpportunityStatus(opportunityCaseRow),
      }),
    });
  } catch (error) {
    console.warn("Could not sync GHL case stage", error);
  }

  return opportunityCaseRow;
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
      related_type: "case",
      ghl_contact_id: caseRow.ghl_contact_id,
      ghl_contact_name: caseRow.primary_contact_name,
      template_key: template.templateKey,
      automation_key: "case_created",
      created_by: context.user.id,
    };
  });

  if (rows.length === 0) return;
  const { data: tasks, error } = await context.supabase.from("tasks").insert(rows).select("*");
  if (error) throw new Error(error.message);

  for (const task of tasks ?? []) {
    try {
      const metadata = await syncTaskToGhl(context, task);
      await context.supabase.from("tasks").update({ metadata }).eq("id", task.id).eq("location_id", context.location.id);
    } catch (syncError) {
      await context.supabase
        .from("tasks")
        .update({
          metadata: {
            ...(task.metadata || {}),
            ghl_task_sync_error: syncError instanceof Error ? syncError.message : "Could not sync task to GHL",
            ghl_task_sync_skipped: null,
          },
        })
        .eq("id", task.id)
        .eq("location_id", context.location.id);
    }
  }
}
