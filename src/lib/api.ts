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
  return invokeGhlHandoff<T>("api", {
    endpoint,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    version: init?.ghlVersion,
  });
}

export async function getContacts(locationId: string) {
  return apiClient<{ contacts?: unknown[]; data?: unknown[] }>(
    `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
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

export async function getCustomFields(locationId: string) {
  return apiClient<{ customFields?: unknown[] }>(
    `/locations/${encodeURIComponent(locationId)}/customFields`,
  );
}

export async function createCalendar(payload: Record<string, unknown>) {
  return apiClient<{ calendar?: unknown }>("/calendars/", {
    method: "POST",
    ghlVersion: "2021-04-15",
    body: JSON.stringify(payload),
  });
}
