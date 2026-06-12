import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { ArrowUpDown, ExternalLink, FileArchive, FileImage, FileSpreadsheet, FileText, Filter, Folder, FolderOpen, LayoutGrid, List, Loader2, MoreVertical, Pencil, Pin, Plus, Search, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useColumnOrder, type ReorderableColumn } from "@/hooks/use-column-order";
import { useToast } from "@/hooks/use-toast";
import { listCases, type CaseRecord } from "@/lib/cases";
import {
  deleteDocument,
  getAllDocuments,
  getDocumentCapabilities,
  getDocumentFolderName,
  getDocumentName,
  getStorageTypeLabel,
  moveDocument,
  renameDocument,
  uploadDocument,
  type DocumentCapabilities,
  type DocumentRecord,
} from "@/lib/documents";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const ALL_MATTERS = "all";
const ALL_STORAGE_TYPES = "all";
const UNFILED_FOLDER_NAME = "Unfiled";
const DOCUMENT_VIEW_MODE_STORAGE_KEY = "lawbric.documents.viewMode";
const DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY = "lawbric.documents.pinnedViewMode";
const DOCUMENT_PINNED_VIEW_MODE_METADATA_KEY = "documentPinnedViewMode";
const DOCUMENT_DISPLAY_MODE_STORAGE_KEY = "lawbric.documents.displayMode";
const DOCUMENT_LIST_VIEWS = [
  { id: "all", name: "All Documents", storageType: ALL_STORAGE_TYPES },
  { id: "internal", name: "Internal", storageType: "internal" },
  { id: "gdrive", name: "Google Drive", storageType: "gdrive" },
  { id: "onedrive", name: "OneDrive", storageType: "onedrive" },
] as const;

type DocumentViewMode = "list" | "grid";
type DocumentDisplayMode = "files" | "folders";
type DocumentSortColumn = "name" | "matter" | "folder" | "storage_type" | "uploaded_by" | "created_at";
type DocumentMatterGroupSortColumn = "matter" | "folders" | "documents" | "latest_upload";
type DocumentFolderGroupSortColumn = "folder" | "documents" | "latest_upload";
type DocumentFolderGroup = {
  id: string;
  folderName: string;
  matterId: string;
  matterName: string;
  documents: DocumentRecord[];
};
type DocumentMatterGroup = {
  id: string;
  matterId: string;
  matterName: string;
  folders: DocumentFolderGroup[];
  documents: DocumentRecord[];
};

function isDocumentViewMode(value: unknown): value is DocumentViewMode {
  return value === "list" || value === "grid";
}

function getInitialDocumentViewMode(): DocumentViewMode {
  if (typeof window === "undefined") return "list";
  const pinnedViewMode = window.localStorage.getItem(DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY);
  if (isDocumentViewMode(pinnedViewMode)) return pinnedViewMode;
  const savedViewMode = window.localStorage.getItem(DOCUMENT_VIEW_MODE_STORAGE_KEY);
  return isDocumentViewMode(savedViewMode) ? savedViewMode : "list";
}

function getInitialPinnedDocumentViewMode(): DocumentViewMode | null {
  if (typeof window === "undefined") return null;
  const pinnedViewMode = window.localStorage.getItem(DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY);
  return isDocumentViewMode(pinnedViewMode) ? pinnedViewMode : null;
}

function isDocumentDisplayMode(value: unknown): value is DocumentDisplayMode {
  return value === "files" || value === "folders";
}

function getInitialDocumentDisplayMode(): DocumentDisplayMode {
  if (typeof window === "undefined") return "files";
  const savedDisplayMode = window.localStorage.getItem(DOCUMENT_DISPLAY_MODE_STORAGE_KEY);
  return isDocumentDisplayMode(savedDisplayMode) ? savedDisplayMode : "files";
}

function ControlTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent className="left-1/2 -translate-x-1/2 whitespace-nowrap border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white shadow-md">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function getVisiblePageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) items.push("ellipsis");
    items.push(page);
  });

  return items;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getMatterName(document: DocumentRecord) {
  return document.case?.case_name || document.case?.case_number || "Unknown matter";
}

function getCaseDisplayName(caseRecord: CaseRecord) {
  return caseRecord.case_number
    ? `${caseRecord.case_name} (${caseRecord.case_number})`
    : caseRecord.case_name;
}

function getUploadedBy(document: DocumentRecord) {
  return document.uploaded_user?.full_name || document.uploaded_user?.email || "Unknown user";
}

function getDisplayFolderName(document: DocumentRecord) {
  return getDocumentFolderName(document) || UNFILED_FOLDER_NAME;
}

function getDocumentExtension(document: DocumentRecord) {
  const name = getDocumentName(document).toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() || "" : "";
  return extension;
}

function getDocumentTypeIconInfo(document: DocumentRecord) {
  const mimeType = String(document.mime_type || "").toLowerCase();
  const extension = getDocumentExtension(document);
  if (document.storage_type && document.storage_type !== "internal") {
    return { Icon: ExternalLink, className: "text-sky-600" };
  }
  if (mimeType.includes("pdf") || extension === "pdf") {
    return { Icon: FileText, className: "text-red-600" };
  }
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "heic"].includes(extension)) {
    return { Icon: FileImage, className: "text-purple-600" };
  }
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("csv") ||
    ["xls", "xlsx", "csv"].includes(extension)
  ) {
    return { Icon: FileSpreadsheet, className: "text-green-600" };
  }
  if (mimeType.includes("zip") || mimeType.includes("compressed") || ["zip", "rar", "7z", "gz"].includes(extension)) {
    return { Icon: FileArchive, className: "text-amber-600" };
  }
  return { Icon: FileText, className: "text-primary" };
}

function DocumentTypeIcon({ documentRecord, className = "h-4 w-4" }: { documentRecord: DocumentRecord; className?: string }) {
  const { Icon, className: iconClassName } = getDocumentTypeIconInfo(documentRecord);
  return <Icon className={cn(className, iconClassName)} />;
}

function getDocumentFolderGroupId(document: DocumentRecord) {
  const matterId = document.case_id || document.matter_id || document.case?.id || "unknown";
  return `${matterId}::${getDisplayFolderName(document)}`;
}

function getLatestDocumentDate(documents: DocumentRecord[]) {
  return documents.reduce((latestDate, document) => {
    const nextDate = document.created_at || "";
    return nextDate > latestDate ? nextDate : latestDate;
  }, "");
}

export function DocumentsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [capabilities, setCapabilities] = useState<DocumentCapabilities>({
    canView: false,
    canUpload: false,
    canEdit: false,
    canMove: false,
    canDelete: false,
    canManageFolders: false,
  });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<DocumentViewMode>(getInitialDocumentViewMode);
  const [pinnedViewMode, setPinnedViewMode] = useState<DocumentViewMode | null>(getInitialPinnedDocumentViewMode);
  const [isSavingPinnedView, setIsSavingPinnedView] = useState(false);
  const [displayMode, setDisplayMode] = useState<DocumentDisplayMode>(getInitialDocumentDisplayMode);
  const [activeListViewId, setActiveListViewId] = useState("all");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [matterFilter, setMatterFilter] = useState(ALL_MATTERS);
  const [storageTypeFilter, setStorageTypeFilter] = useState(ALL_STORAGE_TYPES);
  const [selectedMatterGroupId, setSelectedMatterGroupId] = useState<string | null>(null);
  const [selectedFolderGroupId, setSelectedFolderGroupId] = useState<string | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<DocumentSortColumn>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [matterGroupSortColumn, setMatterGroupSortColumn] = useState<DocumentMatterGroupSortColumn>("matter");
  const [matterGroupSortDirection, setMatterGroupSortDirection] = useState<"asc" | "desc">("asc");
  const [folderGroupSortColumn, setFolderGroupSortColumn] = useState<DocumentFolderGroupSortColumn>("folder");
  const [folderGroupSortDirection, setFolderGroupSortDirection] = useState<"asc" | "desc">("asc");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [documentToRename, setDocumentToRename] = useState<DocumentRecord | null>(null);
  const [documentToMove, setDocumentToMove] = useState<DocumentRecord | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const [documentRows, documentCapabilities, caseRows] = await Promise.all([
        getAllDocuments(),
        getDocumentCapabilities(),
        listCases({ limit: 500 }),
      ]);
      setDocuments(documentRows);
      setCapabilities(documentCapabilities);
      setCases(caseRows);
    } catch (error) {
      toast({
        title: "Documents Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load documents. Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    const loadDocumentPreferences = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const savedPinnedViewMode = session?.user?.user_metadata?.[DOCUMENT_PINNED_VIEW_MODE_METADATA_KEY];

      if (isDocumentViewMode(savedPinnedViewMode)) {
        setPinnedViewMode(savedPinnedViewMode);
        setViewMode(savedPinnedViewMode);
        window.localStorage.setItem(DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY, savedPinnedViewMode);
      } else {
        setPinnedViewMode(null);
        window.localStorage.removeItem(DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY);
      }
    };

    loadDocumentPreferences().catch((error) => console.error("Failed to load document preferences", error));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DOCUMENT_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    window.localStorage.setItem(DOCUMENT_DISPLAY_MODE_STORAGE_KEY, displayMode);
  }, [displayMode]);

  const matterOptions = useMemo(() => {
    const map = new Map<string, string>();
    cases.forEach((caseRecord) => {
      map.set(caseRecord.id, getCaseDisplayName(caseRecord));
    });
    documents.forEach((document) => {
      const matterId = document.case_id || document.matter_id || document.case?.id;
      if (matterId) map.set(matterId, getMatterName(document));
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cases, documents]);

  const activeListView = DOCUMENT_LIST_VIEWS.find((view) => view.id === activeListViewId) || DOCUMENT_LIST_VIEWS[0];
  const activeFilterCount = [matterFilter, storageTypeFilter].filter((value) => value !== ALL_MATTERS && value !== ALL_STORAGE_TYPES).length;

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return documents.filter((document) => {
      const matterId = document.case_id || document.matter_id || document.case?.id;
      const storageType = document.storage_type || "internal";
      const listViewStorageType = activeListView.storageType;
      const folderName = getDisplayFolderName(document).toLowerCase();
      const matterName = getMatterName(document).toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        getDocumentName(document).toLowerCase().includes(normalizedSearch) ||
        folderName.includes(normalizedSearch) ||
        matterName.includes(normalizedSearch);
      const matchesMatter = matterFilter === ALL_MATTERS || matterId === matterFilter;
      const matchesStorage = storageTypeFilter === ALL_STORAGE_TYPES || storageType === storageTypeFilter;
      const matchesListView = listViewStorageType === ALL_STORAGE_TYPES || storageType === listViewStorageType;
      return matchesSearch && matchesMatter && matchesStorage && matchesListView;
    });
  }, [activeListView.storageType, documents, matterFilter, searchTerm, storageTypeFilter]);

  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((a, b) => {
      const getSortValue = (document: DocumentRecord) => {
        switch (sortColumn) {
          case "name":
            return getDocumentName(document);
          case "matter":
            return getMatterName(document);
          case "folder":
            return getDisplayFolderName(document);
          case "storage_type":
            return getStorageTypeLabel(document.storage_type);
          case "uploaded_by":
            return getUploadedBy(document);
          default:
            return document.created_at || "";
        }
      };

      const firstValue = String(getSortValue(a)).toLowerCase();
      const secondValue = String(getSortValue(b)).toLowerCase();
      const comparison = firstValue.localeCompare(secondValue);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredDocuments, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage);

  const folderGroups = useMemo<DocumentFolderGroup[]>(() => {
    const groupMap = new Map<string, DocumentFolderGroup>();

    sortedDocuments.forEach((document) => {
      const matterId = document.case_id || document.matter_id || document.case?.id || "unknown";
      const matterName = getMatterName(document);
      const folderName = getDisplayFolderName(document);
      const groupKey = getDocumentFolderGroupId(document);
      const existingGroup = groupMap.get(groupKey);

      if (existingGroup) {
        existingGroup.documents.push(document);
      } else {
        groupMap.set(groupKey, {
          id: groupKey,
          folderName,
          matterId,
          matterName,
          documents: [document],
        });
      }
    });

    return [...groupMap.values()].sort((a, b) => {
      const getSortValue = (folderGroup: DocumentFolderGroup) => {
        switch (folderGroupSortColumn) {
          case "documents":
            return folderGroup.documents.length;
          case "latest_upload":
            return getLatestDocumentDate(folderGroup.documents);
          default:
            return folderGroup.folderName;
        }
      };

      const firstValue = getSortValue(a);
      const secondValue = getSortValue(b);
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : String(firstValue).toLowerCase().localeCompare(String(secondValue).toLowerCase());
      return folderGroupSortDirection === "asc" ? comparison : -comparison;
    });
  }, [folderGroupSortColumn, folderGroupSortDirection, sortedDocuments]);

  const matterGroups = useMemo<DocumentMatterGroup[]>(() => {
    const groupMap = new Map<string, DocumentMatterGroup>();

    folderGroups.forEach((folderGroup) => {
      const existingGroup = groupMap.get(folderGroup.matterId);
      if (existingGroup) {
        existingGroup.folders.push(folderGroup);
        existingGroup.documents.push(...folderGroup.documents);
      } else {
        groupMap.set(folderGroup.matterId, {
          id: folderGroup.matterId,
          matterId: folderGroup.matterId,
          matterName: folderGroup.matterName,
          folders: [folderGroup],
          documents: [...folderGroup.documents],
        });
      }
    });

    return [...groupMap.values()].sort((a, b) => {
      const getSortValue = (matterGroup: DocumentMatterGroup) => {
        switch (matterGroupSortColumn) {
          case "folders":
            return matterGroup.folders.length;
          case "documents":
            return matterGroup.documents.length;
          case "latest_upload":
            return getLatestDocumentDate(matterGroup.documents);
          default:
            return matterGroup.matterName;
        }
      };

      const firstValue = getSortValue(a);
      const secondValue = getSortValue(b);
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : String(firstValue).toLowerCase().localeCompare(String(secondValue).toLowerCase());
      return matterGroupSortDirection === "asc" ? comparison : -comparison;
    });
  }, [folderGroups, matterGroupSortColumn, matterGroupSortDirection]);

  const selectedMatterGroup = selectedMatterGroupId
    ? matterGroups.find((matterGroup) => matterGroup.id === selectedMatterGroupId) || null
    : null;
  const selectedFolderGroup = selectedFolderGroupId
    ? folderGroups.find((folderGroup) => folderGroup.id === selectedFolderGroupId) || null
    : null;
  const documentsToDisplay = selectedFolderGroup ? selectedFolderGroup.documents : sortedDocuments;
  const foldersToDisplay = selectedMatterGroup ? selectedMatterGroup.folders : folderGroups;
  const displayTotalCount = selectedFolderGroup
    ? documentsToDisplay.length
    : displayMode === "folders"
      ? selectedMatterGroup ? foldersToDisplay.length : matterGroups.length
      : sortedDocuments.length;
  const displayTotalPages = Math.ceil(displayTotalCount / itemsPerPage);
  const safeTotalPages = Math.max(1, displayTotalPages || totalPages);
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = displayTotalCount === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(effectiveCurrentPage * itemsPerPage, displayTotalCount);
  const visiblePageItems = getVisiblePageItems(effectiveCurrentPage, safeTotalPages);
  const paginatedDocumentsToDisplay = documentsToDisplay.slice(
    (effectiveCurrentPage - 1) * itemsPerPage,
    effectiveCurrentPage * itemsPerPage,
  );
  const paginatedMatterGroups = matterGroups.slice(
    (effectiveCurrentPage - 1) * itemsPerPage,
    effectiveCurrentPage * itemsPerPage,
  );
  const paginatedFolderGroups = foldersToDisplay.slice(
    (effectiveCurrentPage - 1) * itemsPerPage,
    effectiveCurrentPage * itemsPerPage,
  );

  useEffect(() => {
    if (selectedMatterGroupId && !matterGroups.some((matterGroup) => matterGroup.id === selectedMatterGroupId)) {
      setSelectedMatterGroupId(null);
      setSelectedFolderGroupId(null);
      return;
    }
    if (selectedFolderGroupId && !folderGroups.some((folderGroup) => folderGroup.id === selectedFolderGroupId)) {
      setSelectedFolderGroupId(null);
    }
  }, [folderGroups, matterGroups, selectedFolderGroupId, selectedMatterGroupId]);

  const handleSort = (column: DocumentSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === "created_at" ? "desc" : "asc");
  };

  const renderSortIcon = (column: DocumentSortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/50" />;
    return <ArrowUpDown className={cn("ml-2 h-3.5 w-3.5 text-primary", sortDirection === "desc" && "rotate-180")} />;
  };

  const handleTogglePinnedView = async () => {
    const nextPinnedViewMode = pinnedViewMode === viewMode ? null : viewMode;
    const previousPinnedViewMode = pinnedViewMode;

    setPinnedViewMode(nextPinnedViewMode);
    if (nextPinnedViewMode) {
      window.localStorage.setItem(DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY, nextPinnedViewMode);
    } else {
      window.localStorage.removeItem(DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY);
    }

    setIsSavingPinnedView(true);
    try {
      await supabase.auth.updateUser({
        data: {
          [DOCUMENT_PINNED_VIEW_MODE_METADATA_KEY]: nextPinnedViewMode,
        },
      });
      toast({
        title: nextPinnedViewMode ? "Documents View Pinned" : "Documents View Unpinned",
        description: nextPinnedViewMode
          ? `Documents will open in ${nextPinnedViewMode === "grid" ? "card" : "list"} view.`
          : "Documents will open in the last view used on this device.",
      });
    } catch (error) {
      setPinnedViewMode(previousPinnedViewMode);
      if (previousPinnedViewMode) {
        window.localStorage.setItem(DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY, previousPinnedViewMode);
      } else {
        window.localStorage.removeItem(DOCUMENT_PINNED_VIEW_MODE_STORAGE_KEY);
      }
      toast({
        title: "Pinned View Not Saved",
        description: getUserFriendlyErrorMessage(error, "Could not save your pinned Documents view."),
        variant: "destructive",
      });
    } finally {
      setIsSavingPinnedView(false);
    }
  };

  const handleMatterGroupSort = (column: DocumentMatterGroupSortColumn) => {
    if (matterGroupSortColumn === column) {
      setMatterGroupSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setMatterGroupSortColumn(column);
      setMatterGroupSortDirection(column === "latest_upload" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const renderMatterGroupSortIcon = (column: DocumentMatterGroupSortColumn) => {
    if (matterGroupSortColumn !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/50" />;
    return <ArrowUpDown className={cn("ml-2 h-3.5 w-3.5 text-primary", matterGroupSortDirection === "desc" && "rotate-180")} />;
  };

  const handleFolderGroupSort = (column: DocumentFolderGroupSortColumn) => {
    if (folderGroupSortColumn === column) {
      setFolderGroupSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setFolderGroupSortColumn(column);
      setFolderGroupSortDirection(column === "latest_upload" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const renderFolderGroupSortIcon = (column: DocumentFolderGroupSortColumn) => {
    if (folderGroupSortColumn !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/50" />;
    return <ArrowUpDown className={cn("ml-2 h-3.5 w-3.5 text-primary", folderGroupSortDirection === "desc" && "rotate-180")} />;
  };

  const handleViewDocument = async (document: DocumentRecord) => {
    navigate(`/documents/${document.id}`, { state: { documentViewerOrigin: "globalDocuments" } });
  };

  const handleDeleteDocument = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDocument(documentToDelete.id);
      setDocuments((current) => current.filter((document) => document.id !== documentToDelete.id));
      setDocumentToDelete(null);
      toast({ title: "Document Deleted", description: "The document has been removed." });
    } catch (error) {
      toast({ title: "Document Not Deleted", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDocumentCreated = (documentRecord: DocumentRecord) => {
    setDocuments((current) => [documentRecord, ...current.filter((document) => document.id !== documentRecord.id)]);
    setCurrentPage(1);
  };

  const handleDocumentMoved = (documentRecord: DocumentRecord) => {
    setDocuments((current) => current.map((document) => document.id === documentRecord.id ? documentRecord : document));
    setDocumentToMove(null);
    setSelectedFolderGroupId(null);
    setCurrentPage(1);
  };

  const handleDocumentRenamed = (documentRecord: DocumentRecord) => {
    setDocuments((current) => current.map((document) => document.id === documentRecord.id ? documentRecord : document));
    setDocumentToRename(null);
  };

  const handleMatterOpen = (matterGroupId: string) => {
    setSelectedMatterGroupId(matterGroupId);
    setSelectedFolderGroupId(null);
    setDisplayMode("folders");
    setCurrentPage(1);
  };

  const handleFolderOpen = (folderGroupId: string) => {
    const folderGroup = folderGroups.find((group) => group.id === folderGroupId);
    if (folderGroup) setSelectedMatterGroupId(folderGroup.matterId);
    setSelectedFolderGroupId(folderGroupId);
    setDisplayMode("folders");
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <GlobalUploadDocumentSheet
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        matterOptions={matterOptions}
        documents={documents}
        onSaved={handleDocumentCreated}
      />
      <RenameDocumentSheet
        documentRecord={documentToRename}
        open={Boolean(documentToRename)}
        onOpenChange={(open) => {
          if (!open) setDocumentToRename(null);
        }}
        onSaved={handleDocumentRenamed}
      />
      <MoveDocumentSheet
        documentRecord={documentToMove}
        open={Boolean(documentToMove)}
        onOpenChange={(open) => {
          if (!open) setDocumentToMove(null);
        }}
        matterOptions={matterOptions}
        documents={documents}
        onSaved={handleDocumentMoved}
      />
      <DeleteConfirmationDialog
        open={Boolean(documentToDelete)}
        onOpenChange={(open) => {
          if (!open) setDocumentToDelete(null);
        }}
        title="Delete document?"
        recordType="document"
        recordName={documentToDelete ? getDocumentName(documentToDelete) : ""}
        isDeleting={isDeleting}
        onConfirm={handleDeleteDocument}
      />

      <div className="mb-6 flex w-full flex-col items-start justify-between gap-4 overflow-visible xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <h1 className="shrink-0 text-2xl font-bold tracking-tight text-primary">Documents</h1>
          <Tabs
            value={activeListView.id}
            onValueChange={(value) => {
              setActiveListViewId(value);
              setSelectedMatterGroupId(null);
              setSelectedFolderGroupId(null);
              setCurrentPage(1);
            }}
            className="min-w-0 flex-1"
          >
            <TabsList className="h-10 flex-nowrap justify-start overflow-x-auto bg-transparent p-0">
              {DOCUMENT_LIST_VIEWS.map((view) => (
                <TabsTrigger
                  key={view.id}
                  value={view.id}
                  className="whitespace-nowrap rounded-full px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  {view.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-3 xl:w-auto">
          <div
            className={`relative flex items-center transition-all duration-300 ${
              isSearchExpanded || searchTerm ? "w-full sm:w-64" : "w-10"
            }`}
          >
            <Button
              variant={isSearchExpanded || searchTerm ? "ghost" : "outline"}
              size="icon"
              className="absolute left-0 z-10 h-10 w-10 rounded-full"
              aria-label="Search documents"
              tooltip="Search documents"
              onClick={() => {
                if (!isSearchExpanded && !searchTerm) {
                  setIsSearchExpanded(true);
                  window.setTimeout(() => document.getElementById("document-search")?.focus(), 100);
                }
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Input
              id="document-search"
              placeholder="Search documents..."
              className={`h-10 rounded-full bg-background pl-10 transition-all duration-300 ${
                isSearchExpanded || searchTerm ? "w-full opacity-100" : "w-0 border-0 p-0 opacity-0"
              }`}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSelectedMatterGroupId(null);
                setSelectedFolderGroupId(null);
                setCurrentPage(1);
              }}
              onBlur={() => {
                if (!searchTerm) setIsSearchExpanded(false);
              }}
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "relative h-10 w-10 shrink-0 rounded-full",
                  activeFilterCount > 0 && "border-primary/40 bg-primary/10 text-primary",
                )}
                title="Filter documents"
              >
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="right-0 top-full z-[220] mt-2 w-80 p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Filter Documents</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setMatterFilter(ALL_MATTERS);
                      setStorageTypeFilter(ALL_STORAGE_TYPES);
                      setSelectedMatterGroupId(null);
                      setSelectedFolderGroupId(null);
                      setCurrentPage(1);
                    }}
                  >
                    Clear
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Matter</Label>
                  <SearchableSelect
                    value={matterFilter}
                    onValueChange={(value) => {
                      setMatterFilter(value);
                      setSelectedMatterGroupId(null);
                      setSelectedFolderGroupId(null);
                      setCurrentPage(1);
                    }}
                    options={[ALL_MATTERS, ...matterOptions.map(([id]) => id)]}
                    placeholder="Select or search for a matter"
                    searchPlaceholder="Search matters..."
                    emptyMessage="No matters found."
                    getOptionLabel={(value) => (
                      value === ALL_MATTERS
                        ? "Any Matter"
                        : matterOptions.find(([id]) => id === value)?.[1] || "Unknown Matter"
                    )}
                    contentClassName="z-[220]"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={storageTypeFilter}
                    onValueChange={(value) => {
                      setStorageTypeFilter(value);
                      setSelectedMatterGroupId(null);
                      setSelectedFolderGroupId(null);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <span className={storageTypeFilter === ALL_STORAGE_TYPES ? "text-muted-foreground" : undefined}>
                        {storageTypeFilter === ALL_STORAGE_TYPES ? "Any Type" : getStorageTypeLabel(storageTypeFilter)}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[150]">
                      <SelectItem value={ALL_STORAGE_TYPES}>Any Type</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="gdrive">Google Drive</SelectItem>
                      <SelectItem value="onedrive">OneDrive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as DocumentViewMode)} className="hidden sm:block">
            <TabsList className="h-10 rounded-full">
              <ControlTooltip label="List view">
                <TabsTrigger value="list" className="rounded-full px-3">
                  <List className="h-4 w-4" />
                </TabsTrigger>
              </ControlTooltip>
              <ControlTooltip label="Card view">
                <TabsTrigger value="grid" className="rounded-full px-3">
                  <LayoutGrid className="h-4 w-4" />
                </TabsTrigger>
              </ControlTooltip>
            </TabsList>
          </Tabs>

          <Tabs
            value={displayMode}
            onValueChange={(value) => {
              setDisplayMode(value as DocumentDisplayMode);
              setSelectedMatterGroupId(null);
              setSelectedFolderGroupId(null);
              setCurrentPage(1);
            }}
            className="hidden sm:block"
          >
            <TabsList className="h-10 rounded-full">
              <ControlTooltip label="Files">
                <TabsTrigger value="files" className="rounded-full px-3">
                  <FileText className="h-4 w-4" />
                </TabsTrigger>
              </ControlTooltip>
              <ControlTooltip label="Folders">
                <TabsTrigger value="folders" className="rounded-full px-3">
                  <Folder className="h-4 w-4" />
                </TabsTrigger>
              </ControlTooltip>
            </TabsList>
          </Tabs>
          <ControlTooltip label={pinnedViewMode === viewMode ? "Unpin this Documents view" : "Pin this Documents view"}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "hidden h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white sm:inline-flex",
                pinnedViewMode === viewMode && "bg-primary/10 text-primary hover:bg-[#0484C8] hover:text-white",
              )}
              disabled={isSavingPinnedView}
              onClick={handleTogglePinnedView}
              aria-label={pinnedViewMode === viewMode ? "Unpin this Documents view" : "Pin this Documents view"}
            >
              <Pin className={cn("h-4 w-4", pinnedViewMode === viewMode && "fill-current")} />
            </Button>
          </ControlTooltip>

          {capabilities.canUpload ? (
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-[#0484C8]"
              aria-label="Add document"
              title="Add document"
              onClick={() => setIsUploadOpen(true)}
            >
              <Plus className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-20 text-center">
          <div className="mb-4 rounded-full bg-muted/30 p-4 text-muted-foreground/50">
            <FileText className="h-8 w-8" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-muted-foreground">No documents found</h3>
          {capabilities.canUpload ? (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button type="button" className="rounded-full" onClick={() => setIsUploadOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {selectedFolderGroup ? (
            <>
              <nav aria-label="Document folder breadcrumb" className="mb-4 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <button
                  type="button"
                  className="shrink-0 font-medium text-[#2384CA] hover:underline"
                  onClick={() => {
                    setSelectedMatterGroupId(null);
                    setSelectedFolderGroupId(null);
                    setCurrentPage(1);
                  }}
                >
                  Matters
                </button>
                <span className="shrink-0">/</span>
                {selectedMatterGroup ? (
                  <>
                    <button
                      type="button"
                      className="min-w-0 truncate font-medium text-[#2384CA] hover:underline"
                      onClick={() => {
                        setSelectedFolderGroupId(null);
                        setCurrentPage(1);
                      }}
                    >
                      {selectedMatterGroup.matterName}
                    </button>
                    <span className="shrink-0">/</span>
                  </>
                ) : null}
                <span className="truncate font-medium text-foreground">{selectedFolderGroup.folderName}</span>
                <span className="shrink-0 text-xs">({selectedFolderGroup.documents.length} {selectedFolderGroup.documents.length === 1 ? "document" : "documents"})</span>
              </nav>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {paginatedDocumentsToDisplay.map((documentRecord) => (
                    <DocumentCard
                      key={documentRecord.id}
                      documentRecord={documentRecord}
                      canEdit={capabilities.canEdit}
                      canMove={capabilities.canMove}
                      canDelete={capabilities.canDelete}
                      onView={() => handleViewDocument(documentRecord)}
                      onEdit={() => setDocumentToRename(documentRecord)}
                      onMove={() => setDocumentToMove(documentRecord)}
                      onDelete={() => setDocumentToDelete(documentRecord)}
                    />
                  ))}
                </div>
              ) : (
                <DocumentTable
                  documents={paginatedDocumentsToDisplay}
                  canEdit={capabilities.canEdit}
                  canMove={capabilities.canMove}
                  canDelete={capabilities.canDelete}
                  onView={handleViewDocument}
                  onEdit={setDocumentToRename}
                  onMove={setDocumentToMove}
                  onDelete={setDocumentToDelete}
                  onFolderOpen={handleFolderOpen}
                  handleSort={handleSort}
                  renderSortIcon={renderSortIcon}
                />
              )}
            </>
          ) : displayMode === "folders" ? (
            selectedMatterGroup ? (
              <>
                <nav aria-label="Document matter breadcrumb" className="mb-4 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <button
                    type="button"
                    className="shrink-0 font-medium text-[#2384CA] hover:underline"
                    onClick={() => {
                      setSelectedMatterGroupId(null);
                      setCurrentPage(1);
                    }}
                  >
                    Matters
                  </button>
                  <span className="shrink-0">/</span>
                  <span className="truncate font-medium text-foreground">{selectedMatterGroup.matterName}</span>
                  <span className="shrink-0 text-xs">({selectedMatterGroup.folders.length} {selectedMatterGroup.folders.length === 1 ? "folder" : "folders"})</span>
                </nav>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {paginatedFolderGroups.map((folderGroup) => (
                      <DocumentFolderCard
                        key={folderGroup.id}
                        folderGroup={folderGroup}
                        onOpenFolder={() => handleFolderOpen(folderGroup.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <DocumentFolderList
                    folderGroups={paginatedFolderGroups}
                    onOpenFolder={handleFolderOpen}
                    handleSort={handleFolderGroupSort}
                    renderSortIcon={renderFolderGroupSortIcon}
                  />
                )}
              </>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {paginatedMatterGroups.map((matterGroup) => (
                  <DocumentMatterFolderCard
                    key={matterGroup.id}
                    matterGroup={matterGroup}
                    onOpenMatter={() => handleMatterOpen(matterGroup.id)}
                  />
                ))}
              </div>
            ) : (
              <DocumentMatterFolderList
                matterGroups={paginatedMatterGroups}
                onOpenMatter={handleMatterOpen}
                handleSort={handleMatterGroupSort}
                renderSortIcon={renderMatterGroupSortIcon}
              />
            )
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {paginatedDocumentsToDisplay.map((documentRecord) => (
                <DocumentCard
                  key={documentRecord.id}
                  documentRecord={documentRecord}
                  canEdit={capabilities.canEdit}
                  canMove={capabilities.canMove}
                  canDelete={capabilities.canDelete}
                  onView={() => handleViewDocument(documentRecord)}
                  onEdit={() => setDocumentToRename(documentRecord)}
                  onMove={() => setDocumentToMove(documentRecord)}
                  onDelete={() => setDocumentToDelete(documentRecord)}
                />
              ))}
            </div>
          ) : (
            <DocumentTable
              documents={paginatedDocumentsToDisplay}
              canEdit={capabilities.canEdit}
              canMove={capabilities.canMove}
              canDelete={capabilities.canDelete}
              onView={handleViewDocument}
              onEdit={setDocumentToRename}
              onMove={setDocumentToMove}
              onDelete={setDocumentToDelete}
              onFolderOpen={handleFolderOpen}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
            />
          )}

          {filteredDocuments.length === 0 ? (
            <div className="mt-6 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-foreground">No documents found</h3>
              <p className="mt-1 text-muted-foreground">Try adjusting your search or filters.</p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
              {" - "}
              <span className="font-medium text-foreground">{lastVisibleRow}</span>
              {" of "}
              <span className="font-medium text-foreground">{displayTotalCount}</span>{" "}
              {selectedFolderGroup || displayMode !== "folders" ? "documents" : selectedMatterGroup ? "folders" : "matters"}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center justify-between gap-2 text-muted-foreground sm:justify-start">
                <span>Rows per page</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-[78px] rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="min-w-[78px]">
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="75">75</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Pagination className="mx-0 w-full justify-end sm:w-auto">
                <PaginationContent className="justify-end">
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setCurrentPage(Math.max(1, effectiveCurrentPage - 1));
                      }}
                      className={cn(effectiveCurrentPage === 1 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                  {visiblePageItems.map((page, index) => (
                    <PaginationItem key={`${page}-${index}`}>
                      {page === "ellipsis" ? (
                        <span className="px-2 text-muted-foreground">...</span>
                      ) : (
                        <PaginationLink
                          href="#"
                          isActive={page === effectiveCurrentPage}
                          onClick={(event) => {
                            event.preventDefault();
                            setCurrentPage(page);
                          }}
                        >
                          {page}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setCurrentPage(Math.min(safeTotalPages, effectiveCurrentPage + 1));
                      }}
                      className={cn(effectiveCurrentPage === safeTotalPages && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DocumentTypeBadge({ documentRecord }: { documentRecord: DocumentRecord }) {
  return (
    <Badge variant="outline" className="capitalize">
      {getStorageTypeLabel(documentRecord.storage_type)}
    </Badge>
  );
}

function GlobalUploadDocumentSheet({
  open,
  onOpenChange,
  matterOptions,
  documents,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterOptions: Array<[string, string]>;
  documents: DocumentRecord[];
  onSaved: (documentRecord: DocumentRecord) => void;
}) {
  const { toast } = useToast();
  const [matterId, setMatterId] = useState("");
  const [folderName, setFolderName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setMatterId("");
      setFolderName("");
      setFile(null);
      setIsDraggingFile(false);
    }
  }, [open]);

  const folderOptions = useMemo(() => {
    const folders = new Set<string>();
    documents.forEach((document) => {
      const documentMatterId = document.case_id || document.matter_id || document.case?.id;
      const documentFolderName = getDocumentFolderName(document);
      if (matterId && documentMatterId === matterId && documentFolderName) folders.add(documentFolderName);
    });
    return [...folders].sort((a, b) => a.localeCompare(b));
  }, [documents, matterId]);

  const handleSubmit = async () => {
    if (!matterId || !file) return;
    setSubmitting(true);
    try {
      const documentRecord = await uploadDocument(file, matterId, undefined, { folderName });
      onSaved(documentRecord);
      onOpenChange(false);
      toast({ title: "Document Uploaded", description: "The document has been added to the selected matter." });
    } catch (error) {
      toast({ title: "Document Not Uploaded", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) setFile(droppedFile);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 shadow-none sm:max-w-md">
        <SheetHeader className="mb-6 space-y-1">
          <SheetTitle className="text-lg font-semibold">Upload Document</SheetTitle>
        </SheetHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Matter</Label>
            <SearchableSelect
              value={matterId}
              onValueChange={setMatterId}
              options={matterOptions.map(([id]) => id)}
              placeholder={matterOptions.length === 0 ? "No accessible matters" : "Select or search for a matter"}
              searchPlaceholder="Search matters..."
              emptyMessage="No matters found."
              getOptionLabel={(value) => matterOptions.find(([id]) => id === value)?.[1] || "Unknown Matter"}
              disabled={matterOptions.length === 0}
              contentClassName="z-[220]"
            />
          </div>
          <div className="space-y-2">
            <Label>Folder</Label>
            <Input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Folder name"
            />
            {folderOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {folderOptions.slice(0, 6).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                    onClick={() => setFolderName(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>File</Label>
            <div
              role="button"
              tabIndex={0}
              className={cn(
                "flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/10 px-4 py-6 text-center transition-colors",
                isDraggingFile && "border-primary bg-primary/10",
                file && "border-primary/50 bg-primary/5",
              )}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleFileDrop}
            >
              <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium text-foreground">
                {file ? file.name : "Drag and drop a file here"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {file ? "Click to choose a different file" : "or click to choose a file"}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 rounded-full"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </div>
          </div>
        </div>
        <SheetFooter className="shadow-none">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!matterId || !file || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MoveDocumentSheet({
  documentRecord,
  open,
  onOpenChange,
  matterOptions,
  documents,
  onSaved,
}: {
  documentRecord: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterOptions: Array<[string, string]>;
  documents: DocumentRecord[];
  onSaved: (documentRecord: DocumentRecord) => void;
}) {
  const { toast } = useToast();
  const [matterId, setMatterId] = useState("");
  const [folderName, setFolderName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && documentRecord) {
      setMatterId(documentRecord.case_id || documentRecord.matter_id || documentRecord.case?.id || "");
      setFolderName(getDocumentFolderName(documentRecord));
    }
    if (!open) {
      setMatterId("");
      setFolderName("");
    }
  }, [documentRecord, open]);

  const folderOptions = useMemo(() => {
    const folders = new Set<string>();
    documents.forEach((document) => {
      const documentMatterId = document.case_id || document.matter_id || document.case?.id;
      const documentFolderName = getDocumentFolderName(document);
      if (matterId && documentMatterId === matterId && documentFolderName) folders.add(documentFolderName);
    });
    return [...folders].sort((a, b) => a.localeCompare(b));
  }, [documents, matterId]);

  const handleSubmit = async () => {
    if (!documentRecord || !matterId) return;
    setSubmitting(true);
    try {
      const movedDocument = await moveDocument(documentRecord.id, matterId, { folderName });
      onSaved(movedDocument);
      toast({ title: "Document Moved", description: "The document location has been updated." });
    } catch (error) {
      toast({ title: "Document Not Moved", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 shadow-none sm:max-w-md">
        <SheetHeader className="mb-6 space-y-1">
          <SheetTitle className="text-lg font-semibold">Move Document</SheetTitle>
          <SheetDescription className="truncate">
            {documentRecord ? getDocumentName(documentRecord) : "Update this document's matter and folder."}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Matter</Label>
            <SearchableSelect
              value={matterId}
              onValueChange={setMatterId}
              options={matterOptions.map(([id]) => id)}
              placeholder={matterOptions.length === 0 ? "No accessible matters" : "Select or search for a matter"}
              searchPlaceholder="Search matters..."
              emptyMessage="No matters found."
              getOptionLabel={(value) => matterOptions.find(([id]) => id === value)?.[1] || "Unknown Matter"}
              disabled={matterOptions.length === 0}
              contentClassName="z-[220]"
            />
          </div>
          <div className="space-y-2">
            <Label>Folder</Label>
            <Input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Folder name"
            />
            {folderOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {folderOptions.slice(0, 6).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                    onClick={() => setFolderName(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <SheetFooter className="shadow-none">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!documentRecord || !matterId || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
            Move
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function RenameDocumentSheet({
  documentRecord,
  open,
  onOpenChange,
  onSaved,
}: {
  documentRecord: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (documentRecord: DocumentRecord) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && documentRecord) setName(getDocumentName(documentRecord));
    if (!open) setName("");
  }, [documentRecord, open]);

  const handleSubmit = async () => {
    if (!documentRecord || !name.trim()) return;
    setSubmitting(true);
    try {
      const renamedDocument = await renameDocument(documentRecord.id, name);
      onSaved(renamedDocument);
      toast({ title: "Document Updated", description: "The document name has been updated." });
    } catch (error) {
      toast({ title: "Document Not Updated", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 shadow-none sm:max-w-md">
        <SheetHeader className="mb-6 space-y-1">
          <SheetTitle className="text-lg font-semibold">Rename Document</SheetTitle>
        </SheetHeader>
        <div className="space-y-2">
          <Label>Document Name</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Document name" />
        </div>
        <SheetFooter className="shadow-none">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!documentRecord || !name.trim() || submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DocumentViewIcon({ documentRecord }: { documentRecord: DocumentRecord }) {
  return <DocumentTypeIcon documentRecord={documentRecord} className="mr-2 h-4 w-4" />;
}

function DocumentActionMenu({
  documentRecord,
  canEdit,
  canMove,
  canDelete,
  onView,
  onEdit,
  onMove,
  onDelete,
  className,
}: {
  documentRecord: DocumentRecord;
  canEdit: boolean;
  canMove: boolean;
  canDelete: boolean;
  onView: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground", className)}
          aria-label="Document actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
        >
          <DocumentViewIcon documentRecord={documentRecord} />
          View
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
        )}
        {canMove && (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onMove();
            }}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Move
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DocumentCard({
  documentRecord,
  canEdit,
  canMove,
  canDelete,
  onView,
  onEdit,
  onMove,
  onDelete,
}: {
  documentRecord: DocumentRecord;
  canEdit: boolean;
  canMove: boolean;
  canDelete: boolean;
  onView: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="group cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md" onClick={onView}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <DocumentTypeIcon documentRecord={documentRecord} />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-xs font-semibold text-foreground group-hover:text-primary">
                {getDocumentName(documentRecord)}
              </CardTitle>
              <RouterLink
                to={`/case/${documentRecord.case_id || documentRecord.matter_id}`}
                className="mt-1 block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {getMatterName(documentRecord)}
              </RouterLink>
            </div>
          </div>
          <DocumentActionMenu
            documentRecord={documentRecord}
            canEdit={canEdit}
            canMove={canMove}
            canDelete={canDelete}
            onView={onView}
            onEdit={onEdit}
            onMove={onMove}
            onDelete={onDelete}
            className="h-7 w-7"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Uploaded by</span>
            <span className="truncate text-right font-medium">{getUploadedBy(documentRecord)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Folder</span>
            <span className="truncate text-right">{getDisplayFolderName(documentRecord)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Created</span>
            <span className="truncate text-right">{formatDateTime(documentRecord.created_at)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentMatterFolderCard({ matterGroup, onOpenMatter }: { matterGroup: DocumentMatterGroup; onOpenMatter: () => void }) {
  return (
    <Card className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md" onClick={onOpenMatter}>
      <CardHeader className="p-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-xs font-semibold">
                <button type="button" className="max-w-full truncate text-left text-[#2384CA] hover:underline" onClick={onOpenMatter}>
                  {matterGroup.matterName}
                </button>
              </CardTitle>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {matterGroup.folders.length} {matterGroup.folders.length === 1 ? "folder" : "folders"}
              </div>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 px-2 py-0 text-[10px]">{matterGroup.documents.length} files</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
        Latest upload {formatDateTime(getLatestDocumentDate(matterGroup.documents))}
      </CardContent>
    </Card>
  );
}

function DocumentMatterFolderList({
  matterGroups,
  onOpenMatter,
  handleSort,
  renderSortIcon,
}: {
  matterGroups: DocumentMatterGroup[];
  onOpenMatter: (matterGroupId: string) => void;
  handleSort: (column: DocumentMatterGroupSortColumn) => void;
  renderSortIcon: (column: DocumentMatterGroupSortColumn) => ReactNode;
}) {
  const columns: Array<ReorderableColumn<DocumentMatterGroupSortColumn>> = [
    { key: "matter", label: "Matter" },
    { key: "folders", label: "Folders" },
    { key: "documents", label: "Documents" },
    { key: "latest_upload", label: "Latest Upload" },
  ];
  const { orderedColumns, getColumnDragProps, shouldSuppressColumnClick } = useColumnOrder("lawbric.tableColumns.documentMatterGroups", columns);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[44%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
          <col className="w-[18%]" />
          <col className="w-[6%]" />
        </colgroup>
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            {orderedColumns.map((column) => (
              <th
                key={column.key}
                className="h-12 cursor-grab px-4 py-4 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                {...getColumnDragProps(column.key)}
                onClick={() => {
                  if (shouldSuppressColumnClick()) return;
                  handleSort(column.key);
                }}
              >
                <div className="flex items-center">
                  {column.label} {renderSortIcon(column.key)}
                </div>
              </th>
            ))}
            <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {matterGroups.map((matterGroup) => {
            const renderCell = (column: DocumentMatterGroupSortColumn) => {
              switch (column) {
                case "matter":
                  return (
                    <td key={column} className="min-w-0 px-4 py-2">
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-3 text-left font-medium text-[#2384CA] hover:underline"
                        onClick={() => onOpenMatter(matterGroup.id)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                          <FolderOpen className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 truncate">{matterGroup.matterName}</span>
                      </button>
                    </td>
                  );
                case "folders":
                  return <td key={column} className="px-4 py-2 text-foreground/70">{matterGroup.folders.length}</td>;
                case "documents":
                  return <td key={column} className="px-4 py-2 text-foreground/70">{matterGroup.documents.length}</td>;
                case "latest_upload":
                  return <td key={column} className="px-4 py-2 text-foreground/70">{formatDateTime(getLatestDocumentDate(matterGroup.documents))}</td>;
                default:
                  return null;
              }
            };

            return (
            <tr
              key={matterGroup.id}
              className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
              onClick={() => onOpenMatter(matterGroup.id)}
            >
              {orderedColumns.map((column) => renderCell(column.key))}
              <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Matter document folder actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onOpenMatter(matterGroup.id)}>
                      <FolderOpen className="mr-2 h-4 w-4" />
                      View
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DocumentFolderCard({ folderGroup, onOpenFolder }: { folderGroup: DocumentFolderGroup; onOpenFolder: () => void }) {
  return (
    <Card className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md" onClick={onOpenFolder}>
      <CardHeader className="p-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-xs font-semibold">
                <button type="button" className="max-w-full truncate text-left text-[#2384CA] hover:underline" onClick={onOpenFolder}>
                  {folderGroup.folderName}
                </button>
              </CardTitle>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {folderGroup.documents.length} {folderGroup.documents.length === 1 ? "document" : "documents"}
              </div>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 px-2 py-0 text-[10px]">
            {formatDateTime(getLatestDocumentDate(folderGroup.documents))}
          </Badge>
        </div>
      </CardHeader>
    </Card>
  );
}

function DocumentFolderList({
  folderGroups,
  onOpenFolder,
  handleSort,
  renderSortIcon,
}: {
  folderGroups: DocumentFolderGroup[];
  onOpenFolder: (folderGroupId: string) => void;
  handleSort: (column: DocumentFolderGroupSortColumn) => void;
  renderSortIcon: (column: DocumentFolderGroupSortColumn) => ReactNode;
}) {
  const columns: Array<ReorderableColumn<DocumentFolderGroupSortColumn>> = [
    { key: "folder", label: "Folder" },
    { key: "documents", label: "Documents" },
    { key: "latest_upload", label: "Latest Upload" },
  ];
  const { orderedColumns, getColumnDragProps, shouldSuppressColumnClick } = useColumnOrder("lawbric.tableColumns.documentFolders", columns);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[50%]" />
          <col className="w-[18%]" />
          <col className="w-[24%]" />
          <col className="w-[8%]" />
        </colgroup>
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            {orderedColumns.map((column) => (
              <th
                key={column.key}
                className="h-12 cursor-grab px-4 py-4 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                {...getColumnDragProps(column.key)}
                onClick={() => {
                  if (shouldSuppressColumnClick()) return;
                  handleSort(column.key);
                }}
              >
                <div className="flex items-center">
                  {column.label} {renderSortIcon(column.key)}
                </div>
              </th>
            ))}
            <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {folderGroups.map((folderGroup) => {
            const renderCell = (column: DocumentFolderGroupSortColumn) => {
              switch (column) {
                case "folder":
                  return (
                    <td key={column} className="min-w-0 px-4 py-2">
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-3 text-left font-medium text-[#2384CA] hover:underline"
                        onClick={() => onOpenFolder(folderGroup.id)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                          <FolderOpen className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 truncate">{folderGroup.folderName}</span>
                      </button>
                    </td>
                  );
                case "documents":
                  return <td key={column} className="px-4 py-2 text-foreground/70">{folderGroup.documents.length}</td>;
                case "latest_upload":
                  return <td key={column} className="px-4 py-2 text-foreground/70">{formatDateTime(getLatestDocumentDate(folderGroup.documents))}</td>;
                default:
                  return null;
              }
            };

            return (
            <tr
              key={folderGroup.id}
              className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
              onClick={() => onOpenFolder(folderGroup.id)}
            >
              {orderedColumns.map((column) => renderCell(column.key))}
              <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Folder actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onOpenFolder(folderGroup.id)}>
                      <FolderOpen className="mr-2 h-4 w-4" />
                      View
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DocumentTable({
  documents,
  canEdit,
  canMove,
  canDelete,
  onView,
  onEdit,
  onMove,
  onDelete,
  onFolderOpen,
  handleSort,
  renderSortIcon,
}: {
  documents: DocumentRecord[];
  canEdit: boolean;
  canMove: boolean;
  canDelete: boolean;
  onView: (documentRecord: DocumentRecord) => void;
  onEdit: (documentRecord: DocumentRecord) => void;
  onMove: (documentRecord: DocumentRecord) => void;
  onDelete: (documentRecord: DocumentRecord) => void;
  onFolderOpen: (folderGroupId: string) => void;
  handleSort: (column: DocumentSortColumn) => void;
  renderSortIcon: (column: DocumentSortColumn) => ReactNode;
}) {
  const columns: Array<ReorderableColumn<DocumentSortColumn>> = [
    { key: "name", label: "Name" },
    { key: "matter", label: "Matter" },
    { key: "folder", label: "Folder" },
    { key: "storage_type", label: "Type" },
    { key: "uploaded_by", label: "Uploaded By" },
    { key: "created_at", label: "Created" },
  ];
  const { orderedColumns, getColumnDragProps, shouldSuppressColumnClick } = useColumnOrder("lawbric.tableColumns.documents", columns);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[20%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[11%]" />
          <col className="w-[5%]" />
        </colgroup>
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            {orderedColumns.map((column) => (
              <th
                key={column.key}
                className="h-12 cursor-grab px-4 py-4 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                {...getColumnDragProps(column.key)}
                onClick={() => {
                  if (shouldSuppressColumnClick()) return;
                  handleSort(column.key);
                }}
              >
                <div className="flex items-center">
                  {column.label} {renderSortIcon(column.key)}
                </div>
              </th>
            ))}
            <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((documentRecord) => {
            const renderCell = (column: DocumentSortColumn) => {
              switch (column) {
                case "name":
                  return (
                    <td key={column} className="min-w-0 px-4 py-2">
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-3 font-medium text-[#2384CA] hover:underline"
                        onClick={() => onView(documentRecord)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                          <DocumentTypeIcon documentRecord={documentRecord} />
                        </span>
                        <span className="min-w-0 truncate">{getDocumentName(documentRecord)}</span>
                      </button>
                    </td>
                  );
                case "matter":
                  return (
                    <td key={column} className="min-w-0 px-4 py-2">
                      <RouterLink to={`/case/${documentRecord.case_id || documentRecord.matter_id}`} className="block truncate text-[#2384CA] hover:underline">
                        {getMatterName(documentRecord)}
                      </RouterLink>
                    </td>
                  );
                case "folder":
                  return (
                    <td key={column} className="px-4 py-2 text-foreground/70">
                      <button
                        type="button"
                        className="flex max-w-full items-center gap-2 text-left text-[#2384CA] hover:underline"
                        onClick={() => onFolderOpen(getDocumentFolderGroupId(documentRecord))}
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{getDisplayFolderName(documentRecord)}</span>
                      </button>
                    </td>
                  );
                case "storage_type":
                  return (
                    <td key={column} className="px-4 py-2">
                      <DocumentTypeBadge documentRecord={documentRecord} />
                    </td>
                  );
                case "uploaded_by":
                  return <td key={column} className="px-4 py-2 text-foreground/70">{getUploadedBy(documentRecord)}</td>;
                case "created_at":
                  return <td key={column} className="px-4 py-2 text-foreground/70">{formatDateTime(documentRecord.created_at)}</td>;
                default:
                  return null;
              }
            };

            return (
            <tr key={documentRecord.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
              {orderedColumns.map((column) => renderCell(column.key))}
              <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <DocumentActionMenu
                  documentRecord={documentRecord}
                  canEdit={canEdit}
                  canMove={canMove}
                  canDelete={canDelete}
                  onView={() => onView(documentRecord)}
                  onEdit={() => onEdit(documentRecord)}
                  onMove={() => onMove(documentRecord)}
                  onDelete={() => onDelete(documentRecord)}
                />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
