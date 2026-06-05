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

export async function getAppLocationContext(): Promise<AppLocationContext> {
  const { data, error } = await supabase.functions.invoke("app-location-context", {
    body: {},
  });

  if (error) {
    throw error;
  }

  return data as AppLocationContext;
}

export async function getActiveGhlLocationId(): Promise<string> {
  const context = await getAppLocationContext();
  return context.location?.ghlLocationId ?? "";
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

export async function getContacts(locationId: string) {
  return apiClient<{ contacts?: unknown[]; data?: unknown[] }>(
    `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
  );
}

export async function getContactsByBusinessId(businessId: string) {
  return apiClient<{ contacts?: unknown[]; data?: unknown[] }>(
    `/contacts/business/${encodeURIComponent(businessId)}`,
  );
}

export async function createContact(payload: Record<string, unknown>) {
  return apiClient<{ contact?: unknown }>("/contacts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateContact(contactId: string, payload: Record<string, unknown>) {
  return apiClient<{ contact?: unknown }>(`/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteContact(contactId: string) {
  return apiClient<{ ok: boolean }>(`/contacts/${encodeURIComponent(contactId)}`, {
    method: "DELETE",
  });
}

export async function addContactsToBusiness(locationId: string, contactIds: string[], businessId: string | null) {
  return apiClient<{ success?: boolean; ids?: string[] }>("/contacts/bulk/business", {
    method: "POST",
    body: JSON.stringify({
      locationId,
      ids: contactIds,
      businessId,
    }),
  });
}

export async function getBusinesses(locationId: string) {
  return apiClient<{ businesses?: GhlBusiness[]; data?: { businesses?: GhlBusiness[] } }>(
    `/businesses/?locationId=${encodeURIComponent(locationId)}&limit=100`,
  );
}

export async function getBusiness(businessId: string) {
  return apiClient<{ business?: GhlBusiness; buiseness?: GhlBusiness; data?: GhlBusiness }>(
    `/businesses/${encodeURIComponent(businessId)}`,
  );
}

export async function createBusiness(payload: Record<string, unknown>) {
  return apiClient<{ business?: GhlBusiness; buiseness?: GhlBusiness; data?: GhlBusiness }>("/businesses/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBusiness(businessId: string, payload: Record<string, unknown>) {
  return apiClient<{ business?: GhlBusiness; buiseness?: GhlBusiness; data?: GhlBusiness }>(
    `/businesses/${encodeURIComponent(businessId)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteBusiness(businessId: string) {
  return apiClient<{ ok?: boolean; success?: boolean }>(`/businesses/${encodeURIComponent(businessId)}`, {
    method: "DELETE",
  });
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

export async function getLocationTags(locationId: string) {
  const response = await apiClient<unknown>(`/locations/${encodeURIComponent(locationId)}/tags`);
  return getTagCollection(response)
    .map((tag: unknown) => normalizeTag(tag))
    .filter((tag: GhlTag) => tag.id && tag.name);
}

export async function createLocationTag(locationId: string, name: string) {
  const response = await apiClient<any>(`/locations/${encodeURIComponent(locationId)}/tags`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
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
  return normalizeTag(response?.tag || response?.data?.tag || response?.data || response);
}

export async function deleteLocationTag(locationId: string, tagId: string) {
  return apiClient<{ ok?: boolean }>(`/locations/${encodeURIComponent(locationId)}/tags/${encodeURIComponent(tagId)}`, {
    method: "DELETE",
  });
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

export async function getCustomFields(locationId: string) {
  return apiClient<{ customFields?: unknown[] }>(
    `/locations/${encodeURIComponent(locationId)}/customFields?model=contact`,
  );
}

export async function createLocationCustomField(locationId: string, payload: Record<string, unknown>) {
  return apiClient<{ customField?: unknown; field?: unknown }>(
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
}

export async function updateLocationCustomField(locationId: string, customFieldId: string, payload: Record<string, unknown>) {
  return apiClient<{ customField?: unknown; field?: unknown }>(
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
}

export async function deleteLocationCustomField(locationId: string, customFieldId: string) {
  return apiClient(
    `/locations/${encodeURIComponent(locationId)}/customFields/${encodeURIComponent(customFieldId)}`,
    {
      method: "DELETE",
      ghlVersion: "2021-07-28",
    },
  );
}

export async function createCalendar(payload: Record<string, unknown>) {
  return apiClient<{ calendar?: unknown }>("/calendars/", {
    method: "POST",
    ghlVersion: "2021-04-15",
    body: JSON.stringify(payload),
  });
}
