import { supabase } from "@/lib/supabase";
import { API_CONFIG } from "@/lib/config";

type GhlRequestInit = RequestInit & {
  ghlVersion?: string;
};

export type AppLocationContext = {
  ok: boolean;
  configured: boolean;
  reason?: string;
  userRole?: "admin" | "user";
  is_active?: boolean;
  location?: {
    id: string;
    name: string;
    ghlLocationId: string;
    hasPrivateIntegrationKey: boolean;
    businessProfile?: {
      businessName: string | null;
      address: string | null;
      websiteUrl: string | null;
      phone: string | null;
    };
  };
};

export type GhlTag = {
  id: string;
  name: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type GhlBusiness = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  description?: string | null;
  locationId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  tags?: string[] | null;
};

export type GhlCustomFieldOption = {
  key?: string;
  label?: string;
  value?: string;
  name?: string;
};

export type GhlCustomField = {
  id: string;
  name?: string;
  label?: string;
  fieldKey?: string;
  key?: string;
  dataType?: string;
  type?: string;
  model?: string;
  objectKey?: string;
  options?: Array<string | GhlCustomFieldOption>;
  picklistOptions?: Array<string | GhlCustomFieldOption>;
};

export type GhlPipelineStage = {
  id: string;
  name: string;
  position?: number | null;
  showInFunnel?: boolean | null;
  showInPieChart?: boolean | null;
};

export type GhlPipeline = {
  id: string;
  name: string;
  stages?: GhlPipelineStage[];
  locationId?: string | null;
  showInFunnel?: boolean | null;
  showInPieChart?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type GhlOpportunity = {
  id: string;
  name: string;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  status?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

let cachedAppLocationContext: AppLocationContext | null = null;
let inFlightAppLocationContext: Promise<AppLocationContext> | null = null;
const cachedGhlReferenceData = new Map<string, unknown>();
const inFlightGhlReferenceData = new Map<string, Promise<unknown>>();
const cachedGhlListData = new Map<string, { data: unknown; expiresAt: number }>();
const inFlightGhlListData = new Map<string, Promise<unknown>>();
const GHL_LIST_CACHE_TTL_MS = 3 * 60 * 1000;

export function clearCachedAppLocationContext() {
  cachedAppLocationContext = null;
  inFlightAppLocationContext = null;
}

export function clearCachedGhlReferenceData() {
  cachedGhlReferenceData.clear();
  inFlightGhlReferenceData.clear();
}

const cachedGhlContactById = new Map<string, { data: unknown; expiresAt: number }>();
const inFlightGhlContactById = new Map<string, Promise<unknown>>();

export function clearCachedGhlListData() {
  cachedGhlListData.clear();
  inFlightGhlListData.clear();
  cachedGhlContactById.clear();
  inFlightGhlContactById.clear();
}

function getGhlReferenceCacheKey(kind: string, locationId: string) {
  return `${kind}:${locationId}`;
}

function getGhlListCacheKey(kind: string, locationId: string) {
  return `${kind}:${locationId}`;
}

function getCachedGhlReferenceDataIfAvailable<T>(kind: string, locationId: string) {
  return (cachedGhlReferenceData.get(getGhlReferenceCacheKey(kind, locationId)) as T | undefined) || null;
}

function getCachedGhlListDataIfAvailable<T>(kind: string, locationId: string) {
  const cacheKey = getGhlListCacheKey(kind, locationId);
  const cached = cachedGhlListData.get(cacheKey);

  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cachedGhlListData.delete(cacheKey);
    return null;
  }

  return cached.data as T;
}

async function getCachedGhlReferenceData<T>(
  kind: string,
  locationId: string,
  fetcher: () => Promise<T>,
  options: { forceRefresh?: boolean } = {},
) {
  const cacheKey = getGhlReferenceCacheKey(kind, locationId);
  if (options.forceRefresh) {
    cachedGhlReferenceData.delete(cacheKey);
    inFlightGhlReferenceData.delete(cacheKey);
  }

  if (cachedGhlReferenceData.has(cacheKey)) return cachedGhlReferenceData.get(cacheKey) as T;
  const inFlight = inFlightGhlReferenceData.get(cacheKey);
  if (inFlight) return inFlight as Promise<T>;

  const request = fetcher()
    .then((data) => {
      cachedGhlReferenceData.set(cacheKey, data);
      return data;
    })
    .finally(() => {
      inFlightGhlReferenceData.delete(cacheKey);
    });

  inFlightGhlReferenceData.set(cacheKey, request);
  return request;
}

async function getCachedGhlListData<T>(
  kind: string,
  locationId: string,
  fetcher: () => Promise<T>,
  options: { forceRefresh?: boolean } = {},
) {
  const cacheKey = getGhlListCacheKey(kind, locationId);
  const now = Date.now();
  if (options.forceRefresh) {
    cachedGhlListData.delete(cacheKey);
    inFlightGhlListData.delete(cacheKey);
  }

  const cached = cachedGhlListData.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data as T;
  if (cached) cachedGhlListData.delete(cacheKey);

  const inFlight = inFlightGhlListData.get(cacheKey);
  if (inFlight) return inFlight as Promise<T>;

  const request = fetcher()
    .then((data) => {
      cachedGhlListData.set(cacheKey, { data, expiresAt: Date.now() + GHL_LIST_CACHE_TTL_MS });
      return data;
    })
    .finally(() => {
      inFlightGhlListData.delete(cacheKey);
    });

  inFlightGhlListData.set(cacheKey, request);
  return request;
}

async function fetchAppLocationContext(): Promise<AppLocationContext> {
  const { data, error } = await supabase.functions.invoke("app-location-context", {
    body: {},
  });

  if (error) {
    throw error;
  }

  return data as AppLocationContext;
}

export async function getAppLocationContext(options: { forceRefresh?: boolean } = {}): Promise<AppLocationContext> {
  if (options.forceRefresh) clearCachedAppLocationContext();
  if (cachedAppLocationContext) return cachedAppLocationContext;
  if (inFlightAppLocationContext) return inFlightAppLocationContext;

  inFlightAppLocationContext = fetchAppLocationContext()
    .then((context) => {
      cachedAppLocationContext = context;
      return context;
    })
    .finally(() => {
      inFlightAppLocationContext = null;
    });

  return inFlightAppLocationContext;
}

export async function getActiveGhlLocationId(): Promise<string> {
  const context = await getAppLocationContext();
  return context.location?.ghlLocationId ?? "";
}

export async function hasPermission(permissionKey: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    permission_key: permissionKey,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function requirePermission(permissionKey: string, message = "You do not have permission to perform this action.") {
  if (!await hasPermission(permissionKey)) {
    throw new Error(message);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /too many requests|rate.?limit|429/i.test(message);
}

async function invokeGhlHandoff<T>(action: string, payload?: unknown): Promise<T> {
  const context = await getAppLocationContext();

  if (!context.configured || !context.location?.id) {
    throw new Error(context.reason || "Location is not configured.");
  }

  const { data, error } = await supabase.functions.invoke(API_CONFIG.ghlHandoffFunction, {
    body: {
      locationId: context.location.id,
      action,
      payload,
    },
  });

  if (error) {
    const errorContext = (error as { context?: unknown }).context;
    if (errorContext instanceof Response) {
      const errorBody = await errorContext.clone().json().catch(async () => {
        const text = await errorContext.clone().text().catch(() => "");
        return text ? { error: text } : null;
      });
      const message =
        errorBody?.error ||
        errorBody?.message ||
        error.message ||
        "GHL request failed.";
      throw new Error(message);
    }

    if (errorContext && typeof errorContext === "object") {
      const contextMessage =
        "error" in errorContext && typeof errorContext.error === "string"
          ? errorContext.error
          : "message" in errorContext && typeof errorContext.message === "string"
            ? errorContext.message
            : "";
      if (contextMessage) throw new Error(contextMessage);
    }

    throw new Error(error.message || "GHL request failed.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
}

export async function apiClient<T = unknown>(endpoint: string, init?: GhlRequestInit): Promise<T> {
  const requestPayload = {
    endpoint,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    version: init?.ghlVersion,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await invokeGhlHandoff<T>("api", requestPayload);
    } catch (error) {
      if (!isRateLimitError(error) || attempt === 2) throw error;
      await sleep(900 * (attempt + 1));
    }
  }

  return invokeGhlHandoff<T>("api", requestPayload);
}

export async function getContacts(locationId: string, options: { forceRefresh?: boolean } = {}) {
  return getCachedGhlListData(
    "contacts",
    locationId,
    () =>
      apiClient<{ contacts?: unknown[]; data?: unknown[] }>(
        `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
      ),
    options,
  );
}

export function getCachedContactsIfAvailable(locationId: string) {
  return getCachedGhlListDataIfAvailable<{ contacts?: unknown[]; data?: unknown[] }>("contacts", locationId);
}

export async function getContactsByBusinessId(locationId: string, businessId: string) {
  return apiClient<{ contacts?: unknown[]; data?: unknown[] }>(
    `/contacts/business/${encodeURIComponent(businessId)}?locationId=${encodeURIComponent(locationId)}`,
  );
}

function getGhlContactRecordId(contact: unknown) {
  if (!contact || typeof contact !== "object") return "";
  const record = contact as Record<string, unknown>;
  return String(record.id || record._id || record.contactId || "").trim();
}

function getContactsFromListResponse(response: unknown) {
  if (!response || typeof response !== "object") return [] as unknown[];
  const record = response as Record<string, unknown>;
  if (Array.isArray(record.contacts)) return record.contacts;
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (Array.isArray(data.contacts)) return data.contacts;
    if (Array.isArray(data)) return data;
  }
  if (Array.isArray(response)) return response as unknown[];
  return [] as unknown[];
}

function unwrapGhlContactResponse(response: unknown) {
  if (!response || typeof response !== "object") return response;
  const record = response as Record<string, unknown>;
  return record.contact || (record.data as Record<string, unknown> | undefined)?.contact || record.data || response;
}

export async function getContact(contactId: string, options: { forceRefresh?: boolean } = {}) {
  const normalizedId = String(contactId || "").trim();
  if (!normalizedId) throw new Error("Contact ID is required.");

  const now = Date.now();
  if (!options.forceRefresh) {
    const cached = cachedGhlContactById.get(normalizedId);
    if (cached && cached.expiresAt > now) return cached.data as { contact?: unknown; data?: unknown };
    const inFlight = inFlightGhlContactById.get(normalizedId);
    if (inFlight) return inFlight as Promise<{ contact?: unknown; data?: unknown }>;
  } else {
    cachedGhlContactById.delete(normalizedId);
    inFlightGhlContactById.delete(normalizedId);
  }

  const request = apiClient<{ contact?: unknown; data?: unknown }>(`/contacts/${encodeURIComponent(normalizedId)}`)
    .then((data) => {
      cachedGhlContactById.set(normalizedId, { data, expiresAt: Date.now() + GHL_LIST_CACHE_TTL_MS });
      return data;
    })
    .finally(() => {
      inFlightGhlContactById.delete(normalizedId);
    });

  inFlightGhlContactById.set(normalizedId, request);
  return request;
}

export async function resolveContactsByIds(locationId: string, contactIds: string[]) {
  const result = new Map<string, unknown>();
  const normalizedIds = Array.from(new Set(contactIds.map((id) => String(id || "").trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return result;

  const resolveFromCachedList = () => {
    const cached = getCachedContactsIfAvailable(locationId);
    if (!cached) return;
    const contacts = getContactsFromListResponse(cached);
    for (const id of normalizedIds) {
      if (result.has(id)) continue;
      const match = contacts.find((contact) => getGhlContactRecordId(contact) === id);
      if (match) result.set(id, match);
    }
  };

  resolveFromCachedList();

  if (normalizedIds.some((id) => !result.has(id))) {
    await getContacts(locationId);
    resolveFromCachedList();
  }

  const stillMissing = normalizedIds.filter((id) => !result.has(id));
  for (const id of stillMissing) {
    try {
      const response = await getContact(id);
      const contact = unwrapGhlContactResponse(response);
      if (contact) result.set(id, contact);
    } catch (error) {
      console.error("Failed to load contact details", id, error);
    }
  }

  return result;
}

export async function getGhlUsers(locationId: string, options: { forceRefresh?: boolean } = {}) {
  return getCachedGhlListData(
    "users",
    locationId,
    () => apiClient<{ users?: unknown[]; data?: unknown[] }>(`/users/?locationId=${encodeURIComponent(locationId)}`),
    options,
  );
}

export async function createContact(payload: Record<string, unknown>) {
  await requirePermission("contacts.create", "You do not have permission to create contacts.");
  const response = await apiClient<{ contact?: unknown }>("/contacts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  clearCachedGhlListData();
  return response;
}

export async function updateContact(contactId: string, payload: Record<string, unknown>) {
  await requirePermission("contacts.edit", "You do not have permission to edit contacts.");
  const response = await apiClient<{ contact?: unknown }>(`/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  clearCachedGhlListData();
  return response;
}

export async function deleteContact(contactId: string) {
  await requirePermission("contacts.delete", "You do not have permission to delete contacts.");
  const response = await apiClient<{ ok: boolean }>(`/contacts/${encodeURIComponent(contactId)}`, {
    method: "DELETE",
  });
  clearCachedGhlListData();
  return response;
}

export async function addContactsToBusiness(locationId: string, contactIds: string[], businessId: string | null) {
  await requirePermission("contacts.edit", "You do not have permission to edit contacts or companies.");
  const response = await apiClient<{ success?: boolean; ids?: string[] }>("/contacts/bulk/business", {
    method: "POST",
    body: JSON.stringify({
      locationId,
      ids: contactIds,
      businessId,
    }),
  });
  clearCachedGhlListData();
  return response;
}

export async function removeContactsFromBusiness(locationId: string, contactIds: string[]) {
  return addContactsToBusiness(locationId, contactIds, null);
}

export async function getBusinesses(locationId: string, options: { forceRefresh?: boolean } = {}) {
  return getCachedGhlListData(
    "businesses",
    locationId,
    () =>
      apiClient<{ businesses?: GhlBusiness[]; data?: { businesses?: GhlBusiness[] } }>(
        `/businesses/?locationId=${encodeURIComponent(locationId)}&limit=100`,
      ),
    options,
  );
}

export function getCachedBusinessesIfAvailable(locationId: string) {
  return getCachedGhlListDataIfAvailable<{ businesses?: GhlBusiness[]; data?: { businesses?: GhlBusiness[] } }>(
    "businesses",
    locationId,
  );
}

export async function getBusiness(businessId: string) {
  return apiClient<{ business?: GhlBusiness; buiseness?: GhlBusiness; data?: GhlBusiness }>(
    `/businesses/${encodeURIComponent(businessId)}`,
  );
}

export async function createBusiness(payload: Record<string, unknown>) {
  await requirePermission("contacts.create", "You do not have permission to create companies.");
  const response = await apiClient<{ business?: GhlBusiness; buiseness?: GhlBusiness; data?: GhlBusiness }>("/businesses/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  clearCachedGhlListData();
  return response;
}

export async function updateBusiness(businessId: string, payload: Record<string, unknown>) {
  await requirePermission("contacts.edit", "You do not have permission to edit companies.");
  const response = await apiClient<{ business?: GhlBusiness; buiseness?: GhlBusiness; data?: GhlBusiness }>(
    `/businesses/${encodeURIComponent(businessId)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
  clearCachedGhlListData();
  return response;
}

export async function deleteBusiness(businessId: string) {
  await requirePermission("contacts.delete", "You do not have permission to delete contacts or companies.");
  const response = await apiClient<{ ok?: boolean; success?: boolean }>(`/businesses/${encodeURIComponent(businessId)}`, {
    method: "DELETE",
  });
  clearCachedGhlListData();
  return response;
}

function normalizePipelineStage(rawStage: any): GhlPipelineStage {
  return {
    id: String(rawStage?.id || rawStage?._id || rawStage?.stageId || rawStage?.name || ""),
    name: String(rawStage?.name || rawStage?.title || "Untitled Stage"),
    position: rawStage?.position ?? rawStage?.order ?? rawStage?.sortOrder ?? null,
    showInFunnel: rawStage?.showInFunnel ?? null,
    showInPieChart: rawStage?.showInPieChart ?? null,
  };
}

function normalizePipeline(rawPipeline: any): GhlPipeline {
  return {
    id: String(rawPipeline?.id || rawPipeline?._id || rawPipeline?.pipelineId || rawPipeline?.name || ""),
    name: String(rawPipeline?.name || rawPipeline?.title || "Untitled Pipeline"),
    stages: Array.isArray(rawPipeline?.stages)
      ? rawPipeline.stages
          .map(normalizePipelineStage)
          .sort((a: GhlPipelineStage, b: GhlPipelineStage) => (a.position ?? 0) - (b.position ?? 0))
      : [],
    locationId: rawPipeline?.locationId || rawPipeline?.location_id || null,
    showInFunnel: rawPipeline?.showInFunnel ?? null,
    showInPieChart: rawPipeline?.showInPieChart ?? null,
    createdAt: rawPipeline?.createdAt || rawPipeline?.dateAdded || rawPipeline?.created_at || null,
    updatedAt: rawPipeline?.updatedAt || rawPipeline?.dateUpdated || rawPipeline?.updated_at || null,
  };
}

function getPipelineCollection(response: any) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.pipelines)) return response.pipelines;
  if (Array.isArray(response?.data?.pipelines)) return response.data.pipelines;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

export async function getPipelines(locationId: string, options: { forceRefresh?: boolean } = {}) {
  return getCachedGhlReferenceData(
    "pipelines",
    locationId,
    async () => {
      const response = await apiClient<unknown>(`/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`);
      return getPipelineCollection(response)
        .map((pipeline: unknown) => normalizePipeline(pipeline))
        .filter((pipeline: GhlPipeline) => pipeline.id && pipeline.name);
    },
    options,
  );
}

function normalizeOpportunity(rawOpportunity: any): GhlOpportunity {
  const contact = rawOpportunity?.contact || rawOpportunity?.contactInfo || {};
  return {
    id: String(rawOpportunity?.id || rawOpportunity?._id || rawOpportunity?.opportunityId || ""),
    name: String(rawOpportunity?.name || rawOpportunity?.title || rawOpportunity?.opportunityName || "Untitled Opportunity"),
    contactId: String(rawOpportunity?.contactId || rawOpportunity?.contact_id || contact?.id || ""),
    pipelineId: String(rawOpportunity?.pipelineId || rawOpportunity?.pipeline_id || ""),
    pipelineStageId: String(
      rawOpportunity?.pipelineStageId ||
        rawOpportunity?.pipeline_stage_id ||
        rawOpportunity?.stageId ||
        rawOpportunity?.stage_id ||
        "",
    ),
    status: rawOpportunity?.status || rawOpportunity?.opportunityStatus || null,
    contactName: contact?.name || contact?.fullName || rawOpportunity?.contactName || null,
    contactEmail: contact?.email || rawOpportunity?.contactEmail || null,
    contactPhone: contact?.phone || rawOpportunity?.contactPhone || null,
    createdAt: rawOpportunity?.createdAt || rawOpportunity?.dateAdded || rawOpportunity?.created_at || null,
    updatedAt: rawOpportunity?.updatedAt || rawOpportunity?.dateUpdated || rawOpportunity?.updated_at || null,
  };
}

function getOpportunityCollection(response: any) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.opportunities)) return response.opportunities;
  if (Array.isArray(response?.data?.opportunities)) return response.data.opportunities;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

export async function getOpportunities(
  locationId: string,
  params: { pipelineId?: string; pipelineStageId?: string; limit?: number } = {},
) {
  const query = new URLSearchParams({
    location_id: locationId,
    limit: String(params.limit || 100),
  });
  if (params.pipelineId) query.set("pipeline_id", params.pipelineId);
  if (params.pipelineStageId) query.set("pipeline_stage_id", params.pipelineStageId);

  const response = await apiClient<unknown>(`/opportunities/search?${query.toString()}`);
  return getOpportunityCollection(response)
    .map((opportunity: unknown) => normalizeOpportunity(opportunity))
    .filter((opportunity: GhlOpportunity) => opportunity.id && opportunity.contactId);
}

export async function getBusinessCustomFields(locationId: string, options: { forceRefresh?: boolean } = {}) {
  return getCachedGhlReferenceData(
    "business-custom-fields",
    locationId,
    () =>
      apiClient<{ fields?: GhlCustomField[]; customFields?: GhlCustomField[] }>(
        `/custom-fields/object-key/business?locationId=${encodeURIComponent(locationId)}`,
      ),
    options,
  );
}

export function getCachedBusinessCustomFieldsIfAvailable(locationId: string) {
  return getCachedGhlReferenceDataIfAvailable<{ fields?: GhlCustomField[]; customFields?: GhlCustomField[] }>(
    "business-custom-fields",
    locationId,
  );
}

export async function getBusinessObjectRecord(locationId: string, businessId: string) {
  return apiClient<{ record?: { properties?: Record<string, unknown> }; data?: { record?: { properties?: Record<string, unknown> } } }>(
    `/objects/business/records/${encodeURIComponent(businessId)}?locationId=${encodeURIComponent(locationId)}`,
  );
}

export async function updateBusinessObjectProperties(
  locationId: string,
  businessId: string,
  properties: Record<string, unknown>,
) {
  return apiClient<{ record?: { properties?: Record<string, unknown> } }>(
    `/objects/business/records/${encodeURIComponent(businessId)}?locationId=${encodeURIComponent(locationId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ properties }),
    },
  );
}

function normalizeTag(rawTag: any): GhlTag {
  return {
    id: String(rawTag?.id || rawTag?._id || rawTag?.tagId || rawTag?.name || ""),
    name: String(rawTag?.name || rawTag?.tag || ""),
    createdAt: rawTag?.createdAt || rawTag?.dateAdded || rawTag?.created_at || null,
    updatedAt: rawTag?.updatedAt || rawTag?.dateUpdated || rawTag?.updated_at || null,
  };
}

function getTagCollection(response: any) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.tags)) return response.tags;
  if (Array.isArray(response?.data?.tags)) return response.data.tags;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

export async function getLocationTags(locationId: string, options: { forceRefresh?: boolean } = {}) {
  return getCachedGhlReferenceData(
    "location-tags",
    locationId,
    async () => {
      const response = await apiClient<unknown>(`/locations/${encodeURIComponent(locationId)}/tags`);
      return getTagCollection(response)
        .map((tag: unknown) => normalizeTag(tag))
        .filter((tag: GhlTag) => tag.id && tag.name);
    },
    options,
  );
}

export async function createLocationTag(locationId: string, name: string) {
  const response = await apiClient<any>(`/locations/${encodeURIComponent(locationId)}/tags`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  clearCachedGhlReferenceData();
  return normalizeTag(response?.tag || response?.data?.tag || response?.data || response);
}

export async function updateLocationTag(locationId: string, tagId: string, name: string) {
  const response = await apiClient<any>(
    `/locations/${encodeURIComponent(locationId)}/tags/${encodeURIComponent(tagId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ name }),
    },
  );
  clearCachedGhlReferenceData();
  return normalizeTag(response?.tag || response?.data?.tag || response?.data || response);
}

export async function deleteLocationTag(locationId: string, tagId: string) {
  const response = await apiClient<{ ok?: boolean }>(`/locations/${encodeURIComponent(locationId)}/tags/${encodeURIComponent(tagId)}`, {
    method: "DELETE",
  });
  clearCachedGhlReferenceData();
  return response;
}

export async function addContactTags(contactId: string, tags: string[]) {
  return apiClient<{ tags?: string[] }>(`/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });
}

export async function removeContactTags(contactId: string, tags: string[]) {
  return apiClient<{ tags?: string[] }>(`/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: "DELETE",
    body: JSON.stringify({ tags }),
  });
}

export type SendGhlEmailPayload = {
  contactId: string;
  subject: string;
  html: string;
  message?: string;
  emailFrom?: string;
  emailTo?: string;
  conversationId?: string;
  replyMessageId?: string;
  emailReplyMode?: "reply" | "reply_all";
  attachments?: string[];
};

export async function sendGhlEmail(payload: SendGhlEmailPayload) {
  return apiClient<{
    messageId?: string;
    emailMessageId?: string;
    messageIds?: string[];
    message?: { id?: string; messageId?: string; emailMessageId?: string; conversationId?: string };
    conversationId?: string;
    conversation?: { id?: string };
    data?: unknown;
  }>(
    "/conversations/messages",
    {
      method: "POST",
      ghlVersion: "2021-04-15",
      body: JSON.stringify({
        type: "Email",
        ...payload,
      }),
    },
  );
}

export async function getCustomFields(locationId: string, options: { forceRefresh?: boolean } = {}) {
  return getCachedGhlReferenceData(
    "contact-custom-fields",
    locationId,
    () =>
      apiClient<{ customFields?: unknown[] }>(
        `/locations/${encodeURIComponent(locationId)}/customFields?model=contact`,
      ),
    options,
  );
}

export function getCachedCustomFieldsIfAvailable(locationId: string) {
  return getCachedGhlReferenceDataIfAvailable<{ customFields?: unknown[] }>("contact-custom-fields", locationId);
}

export async function createLocationCustomField(locationId: string, payload: Record<string, unknown>) {
  const response = await apiClient<{ customField?: unknown; field?: unknown }>(
    `/locations/${encodeURIComponent(locationId)}/customFields`,
    {
      method: "POST",
      ghlVersion: "2021-07-28",
      body: JSON.stringify({
        model: "contact",
        ...payload,
      }),
    },
  );
  clearCachedGhlReferenceData();
  return response;
}

export async function updateLocationCustomField(locationId: string, customFieldId: string, payload: Record<string, unknown>) {
  const response = await apiClient<{ customField?: unknown; field?: unknown }>(
    `/locations/${encodeURIComponent(locationId)}/customFields/${encodeURIComponent(customFieldId)}`,
    {
      method: "PUT",
      ghlVersion: "2021-07-28",
      body: JSON.stringify({
        model: "contact",
        ...payload,
      }),
    },
  );
  clearCachedGhlReferenceData();
  return response;
}

export async function deleteLocationCustomField(locationId: string, customFieldId: string) {
  const response = await apiClient(
    `/locations/${encodeURIComponent(locationId)}/customFields/${encodeURIComponent(customFieldId)}`,
    {
      method: "DELETE",
      ghlVersion: "2021-07-28",
    },
  );
  clearCachedGhlReferenceData();
  return response;
}

export async function createCalendar(payload: Record<string, unknown>) {
  return apiClient<{ calendar?: unknown }>("/calendars/", {
    method: "POST",
    ghlVersion: "2021-04-15",
    body: JSON.stringify(payload),
  });
}
