import type { RequestContext } from "./case-utils.ts";

type GoogleDriveConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
};

type GoogleDriveIntegration = {
  id: string;
  location_id: string;
  google_account_email?: string | null;
  root_folder_id?: string | null;
  root_folder_url?: string | null;
  shared_drive_id?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  scopes?: string[] | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MatterDriveFolder = {
  id: string;
  location_id: string;
  case_id: string;
  drive_folder_id: string;
  folder_name: string;
  web_url?: string | null;
};

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "openid",
  "email",
  "profile",
];

const FULL_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function parseGrantedScopes(scope?: string | null) {
  return (scope || "").split(/\s+/).filter(Boolean);
}

export function assertGoogleDriveScopesGranted(scope?: string | null) {
  const granted = parseGrantedScopes(scope);
  if (!granted.includes(FULL_DRIVE_SCOPE)) {
    throw new Error(
      "Google did not grant full Drive access. In Google Cloud Console go to APIs & Services → OAuth consent screen → Edit app → Scopes, add the Google Drive scope (.../auth/drive), save, then click Connect again.",
    );
  }
}

function getEnv(name: string) {
  return Deno.env.get(name) || "";
}

export function getGoogleDriveConfig(): GoogleDriveConfig | null {
  const clientId = getEnv("GOOGLE_DRIVE_CLIENT_ID") || getEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_DRIVE_CLIENT_SECRET") || getEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = getEnv("GOOGLE_DRIVE_REDIRECT_URI");
  const stateSecret = getEnv("GOOGLE_DRIVE_STATE_SECRET") || getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!clientId || !clientSecret || !redirectUri || !stateSecret) return null;
  return { clientId, clientSecret, redirectUri, stateSecret };
}

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToString(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function signStatePayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createGoogleDriveState(context: RequestContext, returnUrl?: string | null) {
  const config = getGoogleDriveConfig();
  if (!config) throw new Error("Google Drive OAuth is not configured.");
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    locationId: context.location.id,
    userId: context.user.id,
    returnUrl: normalizeGoogleDriveReturnUrl(returnUrl) || undefined,
    nonce: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  })));
  return `${payload}.${await signStatePayload(payload, config.stateSecret)}`;
}

export async function verifyGoogleDriveState(state: string) {
  const config = getGoogleDriveConfig();
  if (!config) throw new Error("Google Drive OAuth is not configured.");
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state.");
  const expectedSignature = await signStatePayload(payload, config.stateSecret);
  if (signature !== expectedSignature) throw new Error("Invalid OAuth state signature.");
  const parsed = JSON.parse(base64UrlToString(payload));
  if (!parsed.locationId || !parsed.userId || !parsed.exp || Date.now() > Number(parsed.exp)) {
    throw new Error("OAuth state expired.");
  }
  return parsed as { locationId: string; userId: string; returnUrl?: string };
}

function validateOAuthReturnUrl(returnUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".vercel.app")) return true;

  for (const allowedUrl of [getEnv("LAWBRIC_APP_URL"), getEnv("GOOGLE_DRIVE_APP_RETURN_URL")]) {
    if (!allowedUrl) continue;
    try {
      if (new URL(allowedUrl).hostname.toLowerCase() === host) return true;
    } catch {
      // Ignore invalid env values.
    }
  }

  return false;
}

export function normalizeGoogleDriveReturnUrl(returnUrl?: string | null) {
  const fallback = getEnv("LAWBRIC_APP_URL") || getEnv("GOOGLE_DRIVE_APP_RETURN_URL");
  const candidate = (returnUrl || fallback || "").trim();
  if (!candidate || !validateOAuthReturnUrl(candidate)) return null;
  return candidate.replace(/\/+$/, "");
}

export async function getGoogleDriveAuthUrl(context: RequestContext, returnUrl?: string | null) {
  const config = getGoogleDriveConfig();
  if (!config) return "";
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: await createGoogleDriveState(context, returnUrl),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleDriveCode(code: string) {
  const config = getGoogleDriveConfig();
  if (!config) throw new Error("Google Drive OAuth is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const detail = data?.error_description || data?.error || "Google OAuth token exchange failed.";
    if (detail === "invalid_grant") {
      throw new Error("This Google sign-in link has already been used. Close the tab, return to Lawbric, and click Connect again.");
    }
    throw new Error(detail);
  }
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
}

export async function getGoogleAccountEmail(tokens: { access_token: string; id_token?: string }) {
  if (tokens.id_token) {
    try {
      const payloadSegment = tokens.id_token.split(".")[1];
      if (payloadSegment) {
        const payload = JSON.parse(base64UrlToString(payloadSegment));
        if (typeof payload.email === "string") return payload.email;
      }
    } catch {
      // Fall back to userinfo below.
    }
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const data = await response.json();
  if (!response.ok) return "";
  return typeof data?.email === "string" ? data.email : "";
}

function parseTokenExpiresAtMs(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) return parsed;

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const retry = new Date(normalized).getTime();
  return Number.isNaN(retry) ? 0 : retry;
}

async function refreshIntegrationAccessToken(context: RequestContext, integration: GoogleDriveIntegration) {
  const config = getGoogleDriveConfig();
  if (!config) throw new Error("Google Drive OAuth is not configured.");
  if (!integration.refresh_token) throw new Error("Google Drive refresh token is missing.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: integration.refresh_token,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error_description || data?.error || "Google Drive token refresh failed.");

  const tokenExpiresAt = new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString();
  const { data: updatedIntegration, error } = await context.supabase
    .from("google_drive_integrations")
    .update({
      access_token: data.access_token,
      token_expires_at: tokenExpiresAt,
      status: "connected",
    })
    .eq("location_id", integration.location_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return updatedIntegration as GoogleDriveIntegration;
}

export async function getConnectedGoogleDriveIntegration(context: RequestContext) {
  const { data, error } = await context.supabase
    .from("google_drive_integrations")
    .select("*")
    .eq("location_id", context.location.id)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as GoogleDriveIntegration | null;
}

export async function getValidGoogleDriveAccessToken(context: RequestContext, integration: GoogleDriveIntegration) {
  const expiresAt = parseTokenExpiresAtMs(integration.token_expires_at);
  if (integration.access_token && expiresAt > Date.now() + 60_000) {
    return { integration, accessToken: integration.access_token };
  }
  const updatedIntegration = await refreshIntegrationAccessToken(context, integration);
  return { integration: updatedIntegration, accessToken: String(updatedIntegration.access_token || "") };
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveRequest(accessToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = data?.error?.message || data?.error_description;
    const apiReason = Array.isArray(data?.error?.errors) ? data.error.errors[0]?.reason : undefined;
    throw new Error([apiMessage, apiReason].filter(Boolean).join(" — ") || "Google Drive request failed.");
  }
  return data;
}

async function getDriveFolderById(accessToken: string, folderId: string) {
  try {
    const folder = await driveRequest(
      accessToken,
      `/files/${encodeURIComponent(folderId)}?fields=id,name,webViewLink,trashed,mimeType`,
    );
    if (folder.trashed || folder.mimeType !== DRIVE_FOLDER_MIME_TYPE) return null;
    return folder;
  } catch {
    return null;
  }
}

async function findDriveFolder(accessToken: string, name: string, parentId?: string | null) {
  const parentClause = parentId ? ` and '${escapeDriveQueryValue(parentId)}' in parents` : "";
  const q = [
    `name = '${escapeDriveQueryValue(name)}'`,
    `mimeType = '${DRIVE_FOLDER_MIME_TYPE}'`,
    "trashed = false",
    parentClause,
  ].join(" ");
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,webViewLink)",
    pageSize: "10",
    corpora: "user",
    spaces: "drive",
  });
  const data = await driveRequest(accessToken, `/files?${params.toString()}`);
  return Array.isArray(data.files) ? data.files[0] || null : null;
}

async function createDriveFolder(accessToken: string, name: string, parentId?: string | null) {
  return driveRequest(accessToken, "/files?fields=id,name,webViewLink", {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
}

export async function ensureGoogleDriveRootFolder(
  context: RequestContext,
  integration: GoogleDriveIntegration,
  options?: { accessToken?: string },
) {
  let accessToken = options?.accessToken || "";
  let currentIntegration = integration;

  if (!accessToken) {
    const tokenState = await getValidGoogleDriveAccessToken(context, integration);
    accessToken = tokenState.accessToken;
    currentIntegration = tokenState.integration;
  }

  if (!accessToken) throw new Error("Google Drive access token is missing.");

  let folder = currentIntegration.root_folder_id
    ? await getDriveFolderById(accessToken, currentIntegration.root_folder_id)
    : null;

  if (!folder) {
    try {
      folder = await findDriveFolder(accessToken, "Lawbric");
    } catch (findError) {
      console.error("Google Drive folder search failed:", findError);
    }
  }

  if (!folder) {
    folder = await createDriveFolder(accessToken, "Lawbric");
  }

  if (!folder?.id) throw new Error("Google Drive did not return a folder id.");
  const normalizedFolder = normalizeDriveFolderRef(folder);
  if (!normalizedFolder) throw new Error("Google Drive did not return a folder id.");

  if (
    currentIntegration.root_folder_id === normalizedFolder.id &&
    currentIntegration.root_folder_url === (normalizedFolder.webViewLink || null)
  ) {
    return {
      integration: currentIntegration,
      accessToken,
      folder: normalizedFolder,
    };
  }

  const { data: updatedIntegration, error } = await context.supabase
    .from("google_drive_integrations")
    .update({
      root_folder_id: normalizedFolder.id,
      root_folder_url: normalizedFolder.webViewLink || null,
      status: "connected",
    })
    .eq("location_id", currentIntegration.location_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    integration: updatedIntegration as GoogleDriveIntegration,
    accessToken,
    folder: normalizedFolder,
  };
}

function getMatterFolderName(caseRow: any) {
  const number = String(caseRow.case_number || "").trim();
  const name = String(caseRow.case_name || "Untitled Matter").trim();
  return `${number ? `${number} - ` : ""}${name}`
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim()
    .slice(0, 180);
}

function getMatterFolderCandidateNames(caseRow: any) {
  const folderName = getMatterFolderName(caseRow);
  const caseNumber = String(caseRow.case_number || "").trim();
  const names = [folderName];
  if (caseNumber && caseNumber !== folderName) names.push(caseNumber);
  return names;
}

function normalizeDriveFolderRef(folder: { id?: string; name?: string; webViewLink?: string | null } | null) {
  if (!folder?.id) return null;
  return {
    id: folder.id,
    name: folder.name || "Folder",
    webViewLink: folder.webViewLink || null,
  };
}

async function listChildDriveFolders(accessToken: string, parentId: string) {
  const items: Array<{ id: string; name: string; webViewLink?: string | null }> = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      q: `'${escapeDriveQueryValue(parentId)}' in parents and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`,
      fields: "nextPageToken,files(id,name,webViewLink)",
      pageSize: "100",
      corpora: "user",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await driveRequest(accessToken, `/files?${params.toString()}`);
    for (const file of Array.isArray(data.files) ? data.files : []) {
      if (file?.id && file?.name) {
        items.push({ id: file.id, name: file.name, webViewLink: file.webViewLink || null });
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return items;
}

async function findDriveFolderInParent(accessToken: string, name: string, parentId: string) {
  if (!parentId) return null;

  try {
    const match = await findDriveFolder(accessToken, name, parentId);
    if (match?.id) return normalizeDriveFolderRef(match);
  } catch (error) {
    console.error("Drive folder search failed; falling back to listing:", error);
  }

  const children = await listChildDriveFolders(accessToken, parentId);
  return normalizeDriveFolderRef(children.find((child) => child.name === name) || null);
}

export async function getMatterDriveFolder(context: RequestContext, caseId: string) {
  const { data, error } = await context.supabase
    .from("matter_drive_folders")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as MatterDriveFolder | null;
}

export async function ensureMatterDriveFolder(context: RequestContext, caseRow: any) {
  const existingFolder = await getMatterDriveFolder(context, caseRow.id);
  if (existingFolder) return existingFolder;

  const integration = await getConnectedGoogleDriveIntegration(context);
  if (!integration) return null;

  const { accessToken, folder: rootFolder } = await ensureGoogleDriveRootFolder(context, integration);
  const rootFolderId = rootFolder?.id;
  if (!rootFolderId) throw new Error("Google Drive root folder is unavailable.");

  const candidateNames = getMatterFolderCandidateNames(caseRow);
  let driveFolder = null;
  for (const candidateName of candidateNames) {
    driveFolder = await findDriveFolderInParent(accessToken, candidateName, rootFolderId);
    if (driveFolder) break;
  }

  if (!driveFolder) {
    driveFolder = normalizeDriveFolderRef(
      await createDriveFolder(accessToken, candidateNames[0], rootFolderId),
    );
  }

  if (!driveFolder?.id) throw new Error("Google Drive did not return a matter folder id.");

  const folderName = candidateNames.includes(driveFolder.name)
    ? driveFolder.name
    : candidateNames[0];
  const { data, error } = await context.supabase
    .from("matter_drive_folders")
    .insert({
      location_id: context.location.id,
      case_id: caseRow.id,
      drive_folder_id: driveFolder.id,
      folder_name: folderName,
      web_url: driveFolder.webViewLink || null,
      created_by: context.user.id,
    })
    .select("*")
    .single();

  if (error) {
    const currentFolder = await getMatterDriveFolder(context, caseRow.id);
    if (currentFolder) return currentFolder;
    throw new Error(error.message);
  }

  await context.supabase
    .from("cases")
    .update({
      metadata: {
        ...(caseRow.metadata && typeof caseRow.metadata === "object" ? caseRow.metadata : {}),
        googleDriveFolderId: driveFolder.id,
        googleDriveFolderUrl: driveFolder.webViewLink || null,
      },
    })
    .eq("id", caseRow.id);

  return data as MatterDriveFolder;
}

export type DriveBrowseItem = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  webViewLink?: string | null;
  modifiedTime?: string | null;
  size?: number | null;
};

export type DriveFolderListing = {
  folderId: string;
  folderName: string;
  items: DriveBrowseItem[];
  nextPageToken?: string | null;
};

async function getAllowedDriveFolderIds(context: RequestContext, integration: GoogleDriveIntegration) {
  const allowed = new Set<string>();
  if (integration.root_folder_id) allowed.add(integration.root_folder_id);

  const { data: matterFolders, error } = await context.supabase
    .from("matter_drive_folders")
    .select("drive_folder_id, case_id")
    .eq("location_id", context.location.id);

  if (error) throw new Error(error.message);

  for (const row of matterFolders ?? []) {
    if (row.drive_folder_id) allowed.add(row.drive_folder_id);
  }

  return allowed;
}

async function canAccessDriveFolder(
  context: RequestContext,
  accessToken: string,
  folderId: string,
  integration: GoogleDriveIntegration,
) {
  const allowed = await getAllowedDriveFolderIds(context, integration);
  if (allowed.has(folderId)) return true;

  let currentId = folderId;
  for (let depth = 0; depth < 25; depth += 1) {
    const metadata = await driveRequest(
      accessToken,
      `/files/${encodeURIComponent(currentId)}?fields=id,parents`,
    );
    const parents = Array.isArray(metadata.parents) ? metadata.parents : [];
    if (parents.some((parentId: string) => allowed.has(parentId))) return true;
    if (parents.length === 0) break;
    currentId = parents[0];
  }

  return false;
}

export async function assertCanAccessDriveFolder(
  context: RequestContext,
  accessToken: string,
  folderId: string,
  integration: GoogleDriveIntegration,
) {
  const allowed = await canAccessDriveFolder(context, accessToken, folderId, integration);
  if (!allowed) throw new Error("You do not have access to this Google Drive folder.");
}

export async function listDriveFolderChildren(
  accessToken: string,
  folderId: string,
  pageToken?: string | null,
  pageSize = 100,
) {
  const q = `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size,iconLink)",
    orderBy: "folder,name",
    pageSize: String(pageSize),
    corpora: "user",
    spaces: "drive",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const data = await driveRequest(accessToken, `/files?${params.toString()}`);
  const files = Array.isArray(data.files) ? data.files : [];

  return {
    items: files.map((file: any) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      isFolder: file.mimeType === DRIVE_FOLDER_MIME_TYPE,
      webViewLink: file.webViewLink || null,
      modifiedTime: file.modifiedTime || null,
      size: file.size ? Number(file.size) : null,
    })) as DriveBrowseItem[],
    nextPageToken: data.nextPageToken || null,
  };
}

export async function getDriveFolderName(accessToken: string, folderId: string) {
  const data = await driveRequest(
    accessToken,
    `/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType`,
  );
  return typeof data.name === "string" ? data.name : "Folder";
}

const GOOGLE_APPS_EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "application/pdf",
  "application/vnd.google-apps.spreadsheet": "application/pdf",
  "application/vnd.google-apps.presentation": "application/pdf",
  "application/vnd.google-apps.drawing": "application/pdf",
};

function canPreviewDriveMimeType(mimeType?: string | null) {
  const normalized = String(mimeType || "").toLowerCase();
  if (!normalized) return false;
  if (GOOGLE_APPS_EXPORT_MIME[normalized]) return true;
  if (normalized === "application/pdf") return true;
  if (normalized.startsWith("image/")) return true;
  if (normalized.startsWith("text/")) return true;
  return false;
}

async function driveBinaryRequest(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const apiMessage = data?.error?.message || data?.error_description;
    throw new Error(apiMessage || "Google Drive download failed.");
  }
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, mimeType };
}

export async function getDriveFilePreviewContent(accessToken: string, fileId: string) {
  const metadata = await driveRequest(
    accessToken,
    `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,trashed`,
  );
  if (metadata.trashed) throw new Error("This Google Drive file has been deleted.");

  const sourceMime = typeof metadata.mimeType === "string" ? metadata.mimeType : "application/octet-stream";
  const exportMime = GOOGLE_APPS_EXPORT_MIME[sourceMime];

  if (exportMime) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`;
    const result = await driveBinaryRequest(accessToken, exportUrl);
    return { bytes: result.bytes, mimeType: exportMime, name: metadata.name || "document" };
  }

  if (!canPreviewDriveMimeType(sourceMime)) {
    throw new Error("This Google Drive file type cannot be previewed inline.");
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const result = await driveBinaryRequest(accessToken, downloadUrl);
  return {
    bytes: result.bytes,
    mimeType: result.mimeType || sourceMime,
    name: metadata.name || "document",
  };
}

function sanitizeDriveUploadName(fileName: string) {
  return fileName.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || "document";
}

export async function ensureDriveChildFolder(
  accessToken: string,
  parentFolderId: string,
  folderName?: string | null,
) {
  const normalizedName = String(folderName || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim()
    .slice(0, 180);
  if (!normalizedName) return parentFolderId;

  const existing = await findDriveFolderInParent(accessToken, normalizedName, parentFolderId);
  if (existing?.id) return existing.id;

  const created = normalizeDriveFolderRef(await createDriveFolder(accessToken, normalizedName, parentFolderId));
  return created?.id || parentFolderId;
}

export async function uploadDriveFile(
  accessToken: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
  parentFolderId: string,
) {
  const metadata = JSON.stringify({
    name: sanitizeDriveUploadName(fileName),
    parents: [parentFolderId],
  });
  const form = new FormData();
  form.append("metadata", new Blob([metadata], { type: "application/json" }));
  form.append("file", new Blob([bytes], { type: mimeType || "application/octet-stream" }));

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType,size",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = data?.error?.message || data?.error_description;
    const apiReason = Array.isArray(data?.error?.errors) ? data.error.errors[0]?.reason : undefined;
    throw new Error([apiMessage, apiReason].filter(Boolean).join(" — ") || "Google Drive upload failed.");
  }

  return {
    id: data.id as string,
    name: typeof data.name === "string" ? data.name : sanitizeDriveUploadName(fileName),
    webViewLink: typeof data.webViewLink === "string" ? data.webViewLink : null,
    mimeType: typeof data.mimeType === "string" ? data.mimeType : mimeType,
    size: data.size ? Number(data.size) : bytes.length,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function googleDriveCallbackResponse(success: boolean, message: string, returnUrl?: string | null) {
  const normalizedReturnUrl = normalizeGoogleDriveReturnUrl(returnUrl);
  if (normalizedReturnUrl) {
    const redirectTarget = new URL(`${normalizedReturnUrl}/tools/connected-apps`);
    redirectTarget.searchParams.set("google_drive", success ? "connected" : "error");
    if (message) redirectTarget.searchParams.set("google_drive_message", message);
    return Response.redirect(redirectTarget.toString(), 302);
  }

  return googleDriveCallbackHtml(success, message);
}

export function googleDriveCallbackHtml(success: boolean, message: string) {
  const title = success ? "Google Drive connected" : "Google Drive connection failed";
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return new Response(`<!doctype html>
<html>
  <head><title>${safeTitle}</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 24px;">
    <h2>${safeTitle}</h2>
    <p>${safeMessage}</p>
    <p>You can close this tab and return to Lawbric.</p>
  </body>
</html>`, { headers: { "Content-Type": "text/html" }, status: success ? 200 : 400 });
}
