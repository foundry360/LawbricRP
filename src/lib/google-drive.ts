import { getAppLocationContext } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export type GoogleDriveIntegrationStatus = {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  authUrl?: string;
  integration?: {
    id: string;
    googleAccountEmail?: string | null;
    rootFolderId?: string | null;
    rootFolderUrl?: string | null;
    status?: string | null;
    tokenExpiresAt?: string | null;
    connectedAt?: string | null;
  } | null;
};

export type MatterDriveFolderResult = {
  ok: boolean;
  connected: boolean;
  rootFolderUrl?: string | null;
  rootFolderId?: string | null;
  folder?: {
    id: string;
    folderName: string;
    driveFolderId: string;
    webUrl?: string | null;
  } | null;
};

export type DriveBrowseItem = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  webViewLink?: string | null;
  modifiedTime?: string | null;
  size?: number | null;
};

export type DriveFolderListingResult = {
  ok: boolean;
  connected: boolean;
  folderId?: string | null;
  folderName?: string | null;
  items: DriveBrowseItem[];
  nextPageToken?: string | null;
};

export type VisibleMatterDriveFolder = {
  id: string;
  caseId: string;
  folderName: string;
  webUrl?: string | null;
  driveFolderId: string;
  matterName: string;
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
  return "Google Drive request failed";
}

async function invokeGoogleDriveFunction<T>(name: string, body: Record<string, unknown> = {}) {
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

let cachedGoogleDriveStatus: { data: GoogleDriveIntegrationStatus; expiresAt: number } | null = null;
let inFlightGoogleDriveStatus: Promise<GoogleDriveIntegrationStatus> | null = null;
const GOOGLE_DRIVE_STATUS_TTL_MS = 3 * 60 * 1000;

export function clearCachedGoogleDriveStatus() {
  cachedGoogleDriveStatus = null;
  inFlightGoogleDriveStatus = null;
}

export function getGoogleDriveStatus(returnUrl?: string) {
  const now = Date.now();
  if (cachedGoogleDriveStatus && cachedGoogleDriveStatus.expiresAt > now) {
    return Promise.resolve(cachedGoogleDriveStatus.data);
  }
  if (inFlightGoogleDriveStatus) return inFlightGoogleDriveStatus;

  inFlightGoogleDriveStatus = invokeGoogleDriveFunction<GoogleDriveIntegrationStatus>("google_drive_status", {
    ...(returnUrl ? { returnUrl } : {}),
  })
    .then((data) => {
      cachedGoogleDriveStatus = { data, expiresAt: Date.now() + GOOGLE_DRIVE_STATUS_TTL_MS };
      return data;
    })
    .finally(() => {
      inFlightGoogleDriveStatus = null;
    });

  return inFlightGoogleDriveStatus;
}

export function disconnectGoogleDrive() {
  clearCachedGoogleDriveStatus();
  return invokeGoogleDriveFunction<{ ok: boolean }>("google_drive_disconnect");
}

export function getMatterDriveFolder(caseId: string, createIfMissing = false) {
  return invokeGoogleDriveFunction<MatterDriveFolderResult>("google_drive_matter_folder", {
    caseId,
    createIfMissing,
  });
}

export function listGoogleDriveFolder(folderId: string, pageToken?: string) {
  return invokeGoogleDriveFunction<DriveFolderListingResult>("google_drive_list_folder", {
    folderId,
    ...(pageToken ? { pageToken } : {}),
  });
}

function getCaseDisplayName(caseRow: { case_number?: string | null; case_name?: string | null }) {
  const number = String(caseRow.case_number || "").trim();
  const name = String(caseRow.case_name || "Untitled Matter").trim();
  return number ? `${number} - ${name}` : name;
}

export async function listVisibleMatterDriveFolders() {
  const { data, error } = await supabase
    .from("matter_drive_folders")
    .select("id, case_id, folder_name, web_url, drive_folder_id, cases(case_number, case_name)")
    .order("folder_name");

  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((row) => {
    const caseRow = Array.isArray(row.cases) ? row.cases[0] : row.cases;
    if (!caseRow || typeof caseRow !== "object") return [];

    return [{
      id: row.id,
      caseId: row.case_id,
      folderName: row.folder_name,
      webUrl: row.web_url,
      driveFolderId: row.drive_folder_id,
      matterName: getCaseDisplayName(caseRow as { case_number?: string | null; case_name?: string | null }),
    } satisfies VisibleMatterDriveFolder];
  });
}
