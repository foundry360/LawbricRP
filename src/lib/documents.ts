import { getAppLocationContext, hasPermission } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { CaseRecord } from "@/lib/cases";

export type DocumentStorageType = "internal" | "gdrive" | "onedrive";

export type DocumentRecord = {
  id: string;
  location_id: string;
  case_id: string;
  matter_id?: string | null;
  name?: string | null;
  file_name?: string | null;
  document_type?: string | null;
  storage_type?: DocumentStorageType | string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_path?: string | null;
  external_file_id?: string | null;
  file_url?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  uploaded_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  case?: Pick<CaseRecord, "id" | "case_number" | "case_name"> | null;
  uploaded_user?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
  } | null;
  updated_user?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
  } | null;
};

export type DocumentCapabilities = {
  canView: boolean;
  canUpload: boolean;
  canEdit: boolean;
  canMove: boolean;
  canDelete: boolean;
  canManageFolders: boolean;
};

export type ExternalDocumentInput = {
  name: string;
  file_url: string;
  storage_type: Exclude<DocumentStorageType, "internal">;
  external_file_id?: string | null;
};

export type UploadDocumentOptions = {
  folderName?: string | null;
};

export type MoveDocumentOptions = {
  folderName?: string | null;
  skipRefetch?: boolean;
};

export type ViewDocumentResult = {
  url: string;
  storageType: DocumentStorageType | string;
  document?: DocumentRecord;
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
  return "Document request failed";
}

async function invokeDocumentFunction<T>(name: string, body: Record<string, unknown>) {
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

async function listDocumentsDirect(caseId?: string) {
  const locationId = await getLocationId();
  let query = supabase
    .from("documents")
    .select(`
      *,
      case:cases!documents_case_id_fkey(id, case_number, case_name),
      uploaded_user:profiles!documents_uploaded_by_fkey(id, full_name, email),
      updated_user:profiles!documents_updated_by_fkey(id, full_name, email)
    `)
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });

  if (caseId) query = query.eq("case_id", caseId);

  const { data, error } = await query;
  if (!error) return (data || []) as DocumentRecord[];

  let fallbackQuery = supabase
    .from("documents")
    .select("*")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });

  if (caseId) fallbackQuery = fallbackQuery.eq("case_id", caseId);

  const fallback = await fallbackQuery;
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data || []) as DocumentRecord[];
}

async function getDocumentDirect(documentId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select(`
      *,
      case:cases!documents_case_id_fkey(id, case_number, case_name),
      uploaded_user:profiles!documents_uploaded_by_fkey(id, full_name, email),
      updated_user:profiles!documents_updated_by_fkey(id, full_name, email)
    `)
    .eq("id", documentId)
    .maybeSingle();

  if (!error && data) return data as DocumentRecord;

  const fallback = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (fallback.error) throw new Error(fallback.error.message);
  if (!fallback.data) throw new Error("Document not found");
  return fallback.data as DocumentRecord;
}

function isTemporaryDatabaseLoadingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /database.*(loading|starting|starting up|initializing)|still loading/i.test(message);
}

function isMissingRpcError(error: unknown, functionName: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes(functionName) && /schema cache|does not exist|not found/i.test(message);
}

function waitForRetry(delayMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getDocumentName(document: Pick<DocumentRecord, "name" | "file_name">) {
  return document.name || document.file_name || "Untitled document";
}

export function getDocumentFolderName(document: Pick<DocumentRecord, "metadata">) {
  const folderName = document.metadata?.folder_name || document.metadata?.folderName || document.metadata?.folder;
  return typeof folderName === "string" ? folderName.trim() : "";
}

export function getStorageTypeLabel(storageType?: string | null) {
  switch (storageType) {
    case "gdrive":
      return "Google Drive";
    case "onedrive":
      return "OneDrive";
    default:
      return "Internal";
  }
}

export async function uploadDocument(file: File, matter_id: string, _user?: unknown, options: UploadDocumentOptions = {}) {
  const folderName = options.folderName?.trim();
  const data = await invokeDocumentFunction<{ document: DocumentRecord }>("upload_document", {
    caseId: matter_id,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    documentType: "other",
    metadata: folderName ? { folder_name: folderName } : {},
    contentBase64: await fileToBase64(file),
  });
  return data.document;
}

export async function createExternalDocument(data: ExternalDocumentInput, matter_id: string, _user?: unknown) {
  const response = await invokeDocumentFunction<{ document: DocumentRecord }>("create_external_document", {
    caseId: matter_id,
    name: data.name,
    fileUrl: data.file_url,
    storageType: data.storage_type,
    externalFileId: data.external_file_id || null,
  });
  return response.document;
}

export async function getDocumentsByMatter(matter_id: string, _user?: unknown) {
  try {
    const data = await invokeDocumentFunction<{ documents: DocumentRecord[] }>("list_documents", { caseId: matter_id });
    return data.documents || [];
  } catch (error) {
    console.warn("Falling back to direct document query", error);
    if (!await hasPermission("documents.view")) return [];
    return listDocumentsDirect(matter_id);
  }
}

export async function getAllDocuments(_user?: unknown) {
  try {
    const data = await invokeDocumentFunction<{ documents: DocumentRecord[] }>("list_documents", {});
    return data.documents || [];
  } catch (error) {
    console.warn("Falling back to direct document query", error);
    if (!await hasPermission("documents.view")) return [];
    return listDocumentsDirect();
  }
}

export async function getDocumentCapabilities() {
  try {
    const data = await invokeDocumentFunction<{ capabilities?: DocumentCapabilities }>("list_documents", { limit: 1 });
    return data.capabilities || { canView: false, canUpload: false, canEdit: false, canMove: false, canDelete: false, canManageFolders: false };
  } catch (error) {
    console.warn("Falling back to document permissions", error);
    const [canView, canUpload, canEdit, canMove, canDelete, canManageFolders] = await Promise.all([
      hasPermission("documents.view"),
      hasPermission("documents.upload"),
      hasPermission("documents.edit"),
      hasPermission("documents.move"),
      hasPermission("documents.delete"),
      hasPermission("folders.manage"),
    ]);
    return { canView, canUpload, canEdit, canMove, canDelete, canManageFolders };
  }
}

export async function viewDocument(document_id: string, _user?: unknown): Promise<ViewDocumentResult> {
  try {
    const data = await invokeDocumentFunction<ViewDocumentResult>("get_document_url", {
      documentId: document_id,
    });
    if (
      data.document &&
      (
        !data.document.case ||
        (data.document.uploaded_by && !data.document.uploaded_user) ||
        (data.document.updated_by && !data.document.updated_user)
      )
    ) {
      try {
        return { ...data, document: await getDocumentDirect(document_id) };
      } catch (hydrateError) {
        console.warn("Could not hydrate document metadata", hydrateError);
      }
    }
    return data;
  } catch (error) {
    console.warn("Falling back to direct document URL lookup", error);
    if (!await hasPermission("documents.view")) throw new Error("You do not have permission to view matter documents.");
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select(`
        *,
        case:cases!documents_case_id_fkey(id, case_number, case_name),
        uploaded_user:profiles!documents_uploaded_by_fkey(id, full_name, email),
        updated_user:profiles!documents_updated_by_fkey(id, full_name, email)
      `)
      .eq("id", document_id)
      .maybeSingle();

    if (documentError) throw new Error(documentError.message);
    if (!document) throw new Error("Document not found");

    if (document.storage_type && document.storage_type !== "internal") {
      if (!document.file_url) throw new Error("External document URL is missing");
      return { url: document.file_url, storageType: document.storage_type, document: document as DocumentRecord };
    }

    const bucket = document.storage_bucket || "documents";
    const path = document.file_path || document.storage_path;
    if (!path) throw new Error("Document file path is missing");

    const { data, error: signedUrlError } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (signedUrlError) throw new Error(signedUrlError.message);
    return { url: data.signedUrl, storageType: "internal", document: document as DocumentRecord };
  }
}

export async function moveDocument(document_id: string, matter_id: string, options: MoveDocumentOptions = {}) {
  const folderName = options.folderName?.trim() || null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.rpc("move_document", {
      target_document_id: document_id,
      target_matter_id: matter_id,
      target_folder_name: folderName,
    });

    if (!error) {
      if (options.skipRefetch) return null as unknown as DocumentRecord;
      return getDocumentDirect(document_id);
    }

    lastError = new Error(error.message);
    if (!isTemporaryDatabaseLoadingError(lastError) || attempt === 2) break;
    await waitForRetry(750 * (attempt + 1));
  }

  if (lastError) throw lastError;
  if (options.skipRefetch) return null as unknown as DocumentRecord;
  return getDocumentDirect(document_id);
}

export async function renameDocument(document_id: string, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Document name is required");

  const { error } = await supabase.rpc("rename_document", {
    target_document_id: document_id,
    target_name: normalizedName,
  });

  if (error) throw new Error(error.message);
  return getDocumentDirect(document_id);
}

export async function renameDocumentFolder(documentIds: string[], matter_id: string, folderName: string | null) {
  const targetDocumentIds = Array.from(new Set(documentIds.filter(Boolean)));
  const normalizedFolderName = folderName?.trim() || null;

  if (targetDocumentIds.length === 0) throw new Error("No documents selected");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.rpc("rename_document_folder", {
      target_document_ids: targetDocumentIds,
      target_matter_id: matter_id,
      target_folder_name: normalizedFolderName,
    });

    if (!error) return (data || []) as DocumentRecord[];

    lastError = new Error(error.message);
    if (isMissingRpcError(lastError, "rename_document_folder")) {
      for (const documentId of targetDocumentIds) {
        await moveDocument(documentId, matter_id, { folderName: normalizedFolderName, skipRefetch: true });
      }
      return [];
    }

    if (!isTemporaryDatabaseLoadingError(lastError) || attempt === 2) break;
    await waitForRetry(750 * (attempt + 1));
  }

  if (lastError) throw lastError;
  return [];
}

export async function deleteDocument(document_id: string, _user?: unknown) {
  return invokeDocumentFunction<{ ok: boolean; documentId: string }>("delete_document", { documentId: document_id });
}
