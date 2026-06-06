import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  Search,
  SquareKanban,
  Trash2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAppLocationContext, getContacts, getPipelines, type GhlPipeline, type GhlPipelineStage } from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import { type CaseRecord, createCase, deleteCase, listCases, updateCase } from "@/lib/cases";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPersonName } from "@/lib/names";
import { formatPhoneNumber } from "@/lib/phone";
import { listPipelineConfigs, type PipelineConfig } from "@/lib/pipeline-configs";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import { supabase } from "@/lib/supabase";
import { getAssignableUsers, getUserId, getUserName, type AssignableUser } from "@/lib/users";
import { cn } from "@/lib/utils";

const CASE_STATUSES = ["open", "pending", "closed", "archived"];
const CASE_TYPES = PRACTICE_AREAS;
const CASE_VIEW_MODE_STORAGE_KEY = "lawbric.matters.viewMode";
const CASE_PINNED_VIEW_MODE_STORAGE_KEY = "lawbric.matters.pinnedViewMode";
const CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY = "lawbric.matters.pinnedListViewId";
const CASE_PINNED_VIEW_MODE_METADATA_KEY = "casePinnedViewMode";
const CASE_PINNED_LIST_VIEW_ID_METADATA_KEY = "casePinnedListViewId";
const NO_PIPELINE_VALUE = "none";
const NO_STAGE_VALUE = "none";
type CaseListView = {
  id: string;
  name: string;
  system?: boolean;
  filters: {
    status?: string;
    caseType?: string;
    stage?: string;
    pipelineId?: string;
    assignedUserId?: string;
  };
};

type CaseViewMode = "grid" | "list" | "kanban";
type CasesPageSection = "matters" | "leads";

const SECTION_COPY: Record<
  CasesPageSection,
  {
    title: string;
    allLabel: string;
    addTooltip: string;
    loading: string;
    emptyTitle: string;
    emptyDescription: string;
    noResultsTitle: string;
    noResultsDescription: string;
    countLabel: string;
    pinNoun: string;
  }
> = {
  matters: {
    title: "Matters",
    allLabel: "All Matters",
    addTooltip: "Add matter",
    loading: "Loading matters...",
    emptyTitle: "No matters found",
    emptyDescription: "Get started by creating your first matter.",
    noResultsTitle: "No matters found",
    noResultsDescription: "Try adjusting your search or filters.",
    countLabel: "matters",
    pinNoun: "Matters",
  },
  leads: {
    title: "Leads",
    allLabel: "All Leads",
    addTooltip: "Add lead",
    loading: "Loading leads...",
    emptyTitle: "No leads found",
    emptyDescription: "Prospecting pipeline items will appear here once configured.",
    noResultsTitle: "No leads found",
    noResultsDescription: "Try adjusting your search or filters.",
    countLabel: "leads",
    pinNoun: "Leads",
  },
};

function isCaseViewMode(value: unknown): value is CaseViewMode {
  return value === "grid" || value === "list" || value === "kanban";
}

function getCaseViewModeLabel(value: CaseViewMode) {
  if (value === "grid") return "card";
  if (value === "kanban") return "kanban";
  return "list";
}

function getPipelineDisplayOrder(config?: PipelineConfig | null) {
  const order = config?.display_order ?? 0;
  return order > 0 ? order : Number.MAX_SAFE_INTEGER;
}

function sortPipelinesByDisplayOrder(pipelines: GhlPipeline[], configMap: Map<string, PipelineConfig>) {
  return [...pipelines].sort((a, b) => {
    const orderComparison = getPipelineDisplayOrder(configMap.get(a.id)) - getPipelineDisplayOrder(configMap.get(b.id));
    if (orderComparison !== 0) return orderComparison;
    return a.name.localeCompare(b.name);
  });
}

function getInitialCaseViewMode(): CaseViewMode {
  if (typeof window === "undefined") return "list";
  const pinnedViewMode = window.localStorage.getItem(CASE_PINNED_VIEW_MODE_STORAGE_KEY);
  if (isCaseViewMode(pinnedViewMode)) return pinnedViewMode;
  const savedViewMode = window.localStorage.getItem(CASE_VIEW_MODE_STORAGE_KEY);
  return isCaseViewMode(savedViewMode) ? savedViewMode : "list";
}

function getInitialPinnedCaseViewMode(): CaseViewMode | null {
  if (typeof window === "undefined") return null;
  const pinnedViewMode = window.localStorage.getItem(CASE_PINNED_VIEW_MODE_STORAGE_KEY);
  return isCaseViewMode(pinnedViewMode) ? pinnedViewMode : null;
}

function getInitialCaseListViewId() {
  if (typeof window === "undefined") return "all";
  return window.localStorage.getItem(CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY) || "all";
}

function getInitialPinnedCaseListViewId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY);
}

function ControlTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent className="left-1/2 -translate-x-1/2 whitespace-nowrap border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const defaultCaseListViews: CaseListView[] = [
  { id: "all", name: "All Matters", system: true, filters: {} },
];

function formatContactName(contact: any) {
  const name = `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim() || contact?.name || "";
  return formatPersonName(name) || contact?.email || "Unnamed contact";
}

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function getCaseStatusClass(status: string) {
  switch (status) {
    case "open":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "closed":
      return "bg-gray-100 text-gray-800";
    case "archived":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function getVisiblePageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

function formatDate(value?: string) {
  if (!value) return "Recently";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString();
}

function formatContactDisplayName(value?: string | null) {
  const name = value?.trim();
  if (!name) return "";
  return formatPersonName(name);
}

function getContactAvatarUrl(contact: any) {
  return (
    contact?.avatarUrl ||
    contact?.profilePhoto ||
    contact?.profilePicture ||
    contact?.photo ||
    contact?.imageUrl ||
    ""
  );
}

function getPipelineSelection(
  pipelines: GhlPipeline[],
  pipelineId?: string | null,
  pipelineStageId?: string | null,
) {
  const pipeline =
    pipelines.find((item) => item.id === pipelineId) ||
    pipelines.find((item) => (item.stages || []).some((stage) => stage.id === pipelineStageId));
  const stage =
    pipeline?.stages?.find((item) => item.id === pipelineStageId) ||
    pipeline?.stages?.[0] ||
    null;

  return {
    pipeline,
    stage,
    pipelineId: pipeline?.id || "",
    pipelineStageId: stage?.id || "",
    stageName: stage?.name || "",
  };
}

export function CasesPage({ section = "matters" }: { section?: CasesPageSection }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isLeadsSection = section === "leads";
  const sectionCopy = SECTION_COPY[section];
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [pipelines, setPipelines] = useState<GhlPipeline[]>([]);
  const [pipelineConfigs, setPipelineConfigs] = useState<PipelineConfig[]>([]);
  const [locationId, setLocationId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [assignedUserFilter, setAssignedUserFilter] = useState("All");
  const [viewMode, setViewMode] = useState<CaseViewMode>(getInitialCaseViewMode);
  const [pinnedViewMode, setPinnedViewMode] = useState<CaseViewMode | null>(getInitialPinnedCaseViewMode);
  const [pinnedListViewId, setPinnedListViewId] = useState<string | null>(getInitialPinnedCaseListViewId);
  const [isSavingPinnedView, setIsSavingPinnedView] = useState(false);
  const [activeListViewId, setActiveListViewId] = useState(getInitialCaseListViewId);
  const [listViews, setListViews] = useState<CaseListView[]>(defaultCaseListViews);
  const [isListViewPanelOpen, setIsListViewPanelOpen] = useState(false);
  const [editingListView, setEditingListView] = useState<CaseListView | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<keyof CaseRecord>("case_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [caseToEdit, setCaseToEdit] = useState<CaseRecord | null>(null);
  const [caseToDelete, setCaseToDelete] = useState<CaseRecord | null>(null);
  const [isDeletingCase, setIsDeletingCase] = useState(false);
  const [dragOverPipelineStageId, setDragOverPipelineStageId] = useState("");
  const [updatingCaseStageId, setUpdatingCaseStageId] = useState<string | null>(null);
  const updatingCaseStageRef = useRef<string | null>(null);

  useEffect(() => {
    const loadCasePreferences = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userMetadata = session?.user?.user_metadata || {};
      const saved = userMetadata.caseListViews;
      if (Array.isArray(saved) && saved.length > 0) {
        setListViews([...defaultCaseListViews, ...saved.filter((view: CaseListView) => !view.system)]);
      }

      const savedPinnedViewMode = userMetadata[CASE_PINNED_VIEW_MODE_METADATA_KEY];
      if (isCaseViewMode(savedPinnedViewMode)) {
        setPinnedViewMode(savedPinnedViewMode);
        setViewMode(savedPinnedViewMode);
        window.localStorage.setItem(CASE_PINNED_VIEW_MODE_STORAGE_KEY, savedPinnedViewMode);
      } else {
        setPinnedViewMode(null);
        window.localStorage.removeItem(CASE_PINNED_VIEW_MODE_STORAGE_KEY);
      }

      const savedPinnedListViewId = userMetadata[CASE_PINNED_LIST_VIEW_ID_METADATA_KEY];
      if (typeof savedPinnedListViewId === "string" && savedPinnedListViewId) {
        setPinnedListViewId(savedPinnedListViewId);
        setActiveListViewId(savedPinnedListViewId);
        window.localStorage.setItem(CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY, savedPinnedListViewId);
      } else {
        setPinnedListViewId(null);
        window.localStorage.removeItem(CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY);
      }
    };

    loadCasePreferences().catch((error) => console.error("Failed to load matter preferences from Supabase", error));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CASE_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const handleTogglePinnedView = async () => {
    const nextPinnedViewMode = isCurrentPinnedView ? null : viewMode;
    const nextPinnedListViewId = isCurrentPinnedView ? null : activeListViewId;
    setPinnedViewMode(nextPinnedViewMode);
    setPinnedListViewId(nextPinnedListViewId);
    if (nextPinnedViewMode) {
      window.localStorage.setItem(CASE_PINNED_VIEW_MODE_STORAGE_KEY, nextPinnedViewMode);
    } else {
      window.localStorage.removeItem(CASE_PINNED_VIEW_MODE_STORAGE_KEY);
    }
    if (nextPinnedListViewId) {
      window.localStorage.setItem(CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY, nextPinnedListViewId);
    } else {
      window.localStorage.removeItem(CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY);
    }

    setIsSavingPinnedView(true);
    try {
      await supabase.auth.updateUser({
        data: {
          [CASE_PINNED_VIEW_MODE_METADATA_KEY]: nextPinnedViewMode,
          [CASE_PINNED_LIST_VIEW_ID_METADATA_KEY]: nextPinnedListViewId,
        },
      });
      toast({
        title: nextPinnedViewMode ? `${sectionCopy.pinNoun} View Pinned` : `${sectionCopy.pinNoun} View Unpinned`,
        description: nextPinnedViewMode
          ? `${sectionCopy.pinNoun} will open in ${activeListView.name} ${getCaseViewModeLabel(nextPinnedViewMode)} view.`
          : `${sectionCopy.pinNoun} will open in the last view used on this device.`,
      });
    } catch (error) {
      setPinnedViewMode(pinnedViewMode);
      setPinnedListViewId(pinnedListViewId);
      if (pinnedViewMode) {
        window.localStorage.setItem(CASE_PINNED_VIEW_MODE_STORAGE_KEY, pinnedViewMode);
      } else {
        window.localStorage.removeItem(CASE_PINNED_VIEW_MODE_STORAGE_KEY);
      }
      if (pinnedListViewId) {
        window.localStorage.setItem(CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY, pinnedListViewId);
      } else {
        window.localStorage.removeItem(CASE_PINNED_LIST_VIEW_ID_STORAGE_KEY);
      }
      toast({
        title: "Pinned View Not Saved",
        description: getUserFriendlyErrorMessage(error, `Could not save your pinned ${sectionCopy.pinNoun} view.`),
        variant: "destructive",
      });
    } finally {
      setIsSavingPinnedView(false);
    }
  };

  const saveListViewsToSupabase = async (newListViews: CaseListView[]) => {
    setListViews(newListViews);
    const customViews = newListViews.filter((view) => !view.system);
    await supabase.auth.updateUser({ data: { caseListViews: customViews } }).catch((error) => {
      console.error("Failed to save case list views to Supabase", error);
    });
  };

  const loadCases = async () => {
    setLoading(true);
    try {
      const rows = await listCases({
        locationId,
      });
      setCases(rows);
    } catch (error) {
      toast({
        title: `${sectionCopy.pinNoun} Not Loaded`,
        description: getUserFriendlyErrorMessage(error, `Could not load ${sectionCopy.countLabel}. Please try again.`),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        const context = await getAppLocationContext();
        const appLocationId = context.location?.id || "";
        const ghlLocationId = context.location?.ghlLocationId || "";
        setLocationId(appLocationId);

        const [caseRows, contactResponse, assignableUsers, pipelineRows, pipelineConfigRows] = await Promise.all([
          listCases({ locationId: appLocationId }),
          ghlLocationId ? getContacts(ghlLocationId) : Promise.resolve({ contacts: [] }),
          getAssignableUsers(),
          ghlLocationId
            ? getPipelines(ghlLocationId).catch((error) => {
                toast({
                  title: "Pipelines Not Loaded",
                  description: getUserFriendlyErrorMessage(error, `Could not load GHL pipelines for the ${sectionCopy.pinNoun} Kanban.`),
                  variant: "destructive",
                });
                return [] as GhlPipeline[];
              })
            : Promise.resolve([] as GhlPipeline[]),
          appLocationId
            ? listPipelineConfigs(appLocationId).catch((error) => {
                toast({
                  title: "Pipeline Settings Not Loaded",
                  description: getUserFriendlyErrorMessage(error, "Could not load pipeline settings."),
                  variant: "destructive",
                });
                return [] as PipelineConfig[];
              })
            : Promise.resolve([] as PipelineConfig[]),
        ]);

        setCases(caseRows);
        setContacts(getArrayFromResponse(contactResponse, "contacts"));
        setUsers(assignableUsers);
        setPipelines(pipelineRows);
        setPipelineConfigs(pipelineConfigRows);
      } catch (error) {
        toast({
          title: `${sectionCopy.pinNoun} Not Loaded`,
          description: getUserFriendlyErrorMessage(error, `Could not load ${sectionCopy.countLabel} data. Please try again.`),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [sectionCopy.countLabel, sectionCopy.pinNoun, toast]);

  const pipelineConfigMap = useMemo(
    () => new Map(pipelineConfigs.map((config) => [config.ghl_pipeline_id, config])),
    [pipelineConfigs],
  );
  const matterPipelines = useMemo(
    () =>
      sortPipelinesByDisplayOrder(
        pipelines.filter((pipeline) => {
          const config = pipelineConfigMap.get(pipeline.id);
          return config?.is_active !== false && config?.classification !== "prospecting";
        }),
        pipelineConfigMap,
      ),
    [pipelineConfigMap, pipelines],
  );
  const prospectingPipelineIds = useMemo(
    () =>
      new Set(
        pipelineConfigs
          .filter((config) => config.classification === "prospecting" || config.is_active === false)
          .map((config) => config.ghl_pipeline_id),
      ),
    [pipelineConfigs],
  );
  const leadPipelineIds = useMemo(
    () =>
      new Set(
        pipelineConfigs
          .filter((config) => config.classification === "prospecting" && config.is_active !== false)
          .map((config) => config.ghl_pipeline_id),
      ),
    [pipelineConfigs],
  );
  const leadPipelineStageIds = useMemo(
    () =>
      new Set(
        pipelines
          .filter((pipeline) => leadPipelineIds.has(pipeline.id))
          .flatMap((pipeline) => (pipeline.stages || []).map((stage) => stage.id)),
      ),
    [pipelines, leadPipelineIds],
  );
  const leadPipelines = useMemo(
    () => sortPipelinesByDisplayOrder(pipelines.filter((pipeline) => leadPipelineIds.has(pipeline.id)), pipelineConfigMap),
    [leadPipelineIds, pipelineConfigMap, pipelines],
  );
  const sectionPipelines = isLeadsSection ? leadPipelines : matterPipelines;
  const prospectingPipelineStageIds = useMemo(
    () =>
      new Set(
        pipelines
          .filter((pipeline) => prospectingPipelineIds.has(pipeline.id))
          .flatMap((pipeline) => (pipeline.stages || []).map((stage) => stage.id)),
      ),
    [pipelines, prospectingPipelineIds],
  );
  const matterCases = useMemo(
    () =>
      cases.filter((caseRecord) => {
        if (isLeadsSection) {
          return Boolean(
            caseRecord.ghl_pipeline_id && leadPipelineIds.has(caseRecord.ghl_pipeline_id) ||
            caseRecord.ghl_pipeline_stage_id && leadPipelineStageIds.has(caseRecord.ghl_pipeline_stage_id),
          );
        }
        if (caseRecord.ghl_pipeline_id && prospectingPipelineIds.has(caseRecord.ghl_pipeline_id)) return false;
        if (caseRecord.ghl_pipeline_stage_id && prospectingPipelineStageIds.has(caseRecord.ghl_pipeline_stage_id)) return false;
        return true;
      }),
    [cases, isLeadsSection, leadPipelineIds, leadPipelineStageIds, prospectingPipelineIds, prospectingPipelineStageIds],
  );
  const sectionAllListView = useMemo<CaseListView>(
    () => ({ id: "all", name: sectionCopy.allLabel, system: true, filters: {} }),
    [sectionCopy.allLabel],
  );

  const pipelineListViews = useMemo<CaseListView[]>(
    () =>
      sectionPipelines.map((pipeline) => ({
        id: `pipeline:${pipeline.id}`,
        name: pipeline.name,
        system: true,
        filters: { pipelineId: pipeline.id },
      })),
    [sectionPipelines],
  );
  const displayListViews = useMemo(
    () =>
      viewMode === "kanban"
        ? pipelineListViews
        : [sectionAllListView, ...pipelineListViews, ...listViews.filter((view) => !view.system)],
    [listViews, pipelineListViews, sectionAllListView, viewMode],
  );
  const activeListView = displayListViews.find((view) => view.id === activeListViewId) || displayListViews[0] || sectionAllListView;
  const activePipeline = activeListView.filters.pipelineId
    ? sectionPipelines.find((pipeline) => pipeline.id === activeListView.filters.pipelineId)
    : null;
  const isCurrentPinnedView = pinnedViewMode === viewMode && pinnedListViewId === activeListViewId;

  useEffect(() => {
    if (viewMode === "kanban") {
      if (pipelineListViews.length === 0) return;
      if (!pipelineListViews.some((view) => view.id === activeListViewId)) {
        setActiveListViewId(pipelineListViews[0].id);
        setCurrentPage(1);
      }
      return;
    }

    if (!displayListViews.some((view) => view.id === activeListViewId)) {
      setActiveListViewId("all");
      setCurrentPage(1);
    }
  }, [activeListViewId, displayListViews, pipelineListViews, viewMode]);
  const caseTypeOptions = useMemo(
    () => [...new Set([...CASE_TYPES, ...matterCases.map((caseRecord) => caseRecord.case_type).filter(Boolean)])],
    [matterCases],
  );
  const stageOptions = useMemo(
    () => [...new Set(matterCases.map((caseRecord) => caseRecord.stage).filter(Boolean))],
    [matterCases],
  );
  const activeFilterCount = [
    typeFilter,
    statusFilter,
    stageFilter,
    assignedUserFilter,
  ].filter((value) => value !== "All").length;

  const filteredCases = useMemo(() => {
    const search = searchTerm.toLowerCase();

    return matterCases.filter((caseRecord) => {
      const matchesSearch =
        caseRecord.case_name.toLowerCase().includes(search) ||
        caseRecord.case_number.toLowerCase().includes(search) ||
        caseRecord.case_type.toLowerCase().includes(search) ||
        caseRecord.stage.toLowerCase().includes(search) ||
        (caseRecord.primary_contact_name || "").toLowerCase().includes(search);
      const matchesType = typeFilter === "All" || caseRecord.case_type === typeFilter;
      const matchesStatus = statusFilter === "All" || caseRecord.status === statusFilter;
      const matchesStage = stageFilter === "All" || caseRecord.stage === stageFilter;
      const matchesAssigned =
        assignedUserFilter === "All" ||
        (assignedUserFilter === "unassigned" ? !caseRecord.assigned_user_id : caseRecord.assigned_user_id === assignedUserFilter);
      let matchesListView = true;

      if (activeListView.filters.status && caseRecord.status !== activeListView.filters.status) matchesListView = false;
      if (activeListView.filters.caseType && caseRecord.case_type !== activeListView.filters.caseType) matchesListView = false;
      if (activeListView.filters.stage && caseRecord.stage !== activeListView.filters.stage) matchesListView = false;
      if (activeListView.filters.pipelineId) {
        const activePipeline = sectionPipelines.find((pipeline) => pipeline.id === activeListView.filters.pipelineId);
        const matchesPipeline =
          caseRecord.ghl_pipeline_id === activeListView.filters.pipelineId ||
          Boolean(
            activePipeline?.stages?.some((stage) => stage.id === caseRecord.ghl_pipeline_stage_id),
          );
        if (!matchesPipeline) matchesListView = false;
      }
      if (activeListView.filters.assignedUserId && caseRecord.assigned_user_id !== activeListView.filters.assignedUserId) {
        matchesListView = false;
      }

      return matchesSearch && matchesType && matchesStatus && matchesStage && matchesAssigned && matchesListView;
    });
  }, [activeListView, assignedUserFilter, matterCases, sectionPipelines, searchTerm, stageFilter, statusFilter, typeFilter]);

  const sortedCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => {
      let aValue = a[sortColumn] ?? "";
      let bValue = b[sortColumn] ?? "";

      if (typeof aValue === "string") aValue = aValue.toLowerCase();
      if (typeof bValue === "string") bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredCases, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedCases.length / itemsPerPage);
  const safeTotalPages = Math.max(1, totalPages);
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = sortedCases.length === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(effectiveCurrentPage * itemsPerPage, sortedCases.length);
  const visiblePageItems = getVisiblePageItems(effectiveCurrentPage, safeTotalPages);
  const paginatedCases = sortedCases.slice(
    (effectiveCurrentPage - 1) * itemsPerPage,
    effectiveCurrentPage * itemsPerPage,
  );

  const handleSort = (column: keyof CaseRecord) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (column: keyof CaseRecord) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    return sortDirection === "asc" ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />;
  };

  const handleCaseCreated = (caseRecord: CaseRecord) => {
    setCases((current) => [caseRecord, ...current]);
    setIsCreateOpen(false);
    navigate(`/case/${caseRecord.id}`);
  };

  const handleCaseSaved = (caseRecord: CaseRecord) => {
    setCases((current) => current.map((item) => (item.id === caseRecord.id ? { ...item, ...caseRecord } : item)));
    setCaseToEdit(null);
  };

  const handleDeleteCase = async () => {
    if (!caseToDelete) return;
    setIsDeletingCase(true);
    try {
      await deleteCase({ locationId, caseId: caseToDelete.id });
      setCases((current) => current.filter((caseRecord) => caseRecord.id !== caseToDelete.id));
      toast({ title: "Matter Deleted", description: `${caseToDelete.case_name} was permanently deleted.` });
      setCaseToDelete(null);
    } catch (error) {
      toast({
        title: "Matter Not Deleted",
        description: getUserFriendlyErrorMessage(error, "Could not delete this matter. Please try again."),
        variant: "destructive",
      });
    } finally {
      setIsDeletingCase(false);
    }
  };

  const handleCasePipelineStageChange = async (
    caseRecord: CaseRecord,
    pipeline: GhlPipeline,
    stage: GhlPipelineStage,
  ) => {
    if (updatingCaseStageRef.current) return;
    if (caseRecord.ghl_pipeline_id === pipeline.id && caseRecord.ghl_pipeline_stage_id === stage.id) return;

    const previousCases = cases;
    const nextStageName = stage.name || "Pipeline";
    updatingCaseStageRef.current = caseRecord.id;
    setUpdatingCaseStageId(caseRecord.id);
    setCases((current) =>
      current.map((item) =>
        item.id === caseRecord.id
          ? {
              ...item,
              stage: nextStageName,
              ghl_pipeline_id: pipeline.id,
              ghl_pipeline_stage_id: stage.id,
              metadata: {
                ...(item.metadata || {}),
                ghl_pipeline_name: pipeline.name,
                ghl_pipeline_stage_name: nextStageName,
              },
            }
          : item,
      ),
    );

    try {
      const updatedCase = await updateCase({
        caseId: caseRecord.id,
        stage: nextStageName,
        ghlPipelineId: pipeline.id,
        ghlPipelineStageId: stage.id,
        metadata: {
          ghl_pipeline_name: pipeline.name,
          ghl_pipeline_stage_name: nextStageName,
        },
      });
      setCases((current) => current.map((item) => (item.id === updatedCase.id ? { ...item, ...updatedCase } : item)));
    } catch (error) {
      setCases(previousCases);
      toast({
        title: "Matter Stage Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not move this matter to the selected pipeline stage."),
        variant: "destructive",
      });
    } finally {
      updatingCaseStageRef.current = null;
      setUpdatingCaseStageId(null);
      setDragOverPipelineStageId("");
    }
  };

  return (
    <div className="flex flex-col space-y-6 p-6">
      <CreateCaseSheet
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        contacts={contacts}
        users={users}
        pipelines={sectionPipelines}
        locationId={locationId}
        defaultPipelineId={activePipeline?.id || ""}
        recordLabel={isLeadsSection ? "Lead" : "Matter"}
        onCreated={handleCaseCreated}
      />
      <EditCaseSheet
        open={Boolean(caseToEdit)}
        onOpenChange={(open) => !open && setCaseToEdit(null)}
        caseRecord={caseToEdit}
        users={users}
        pipelines={sectionPipelines}
        recordLabel={isLeadsSection ? "Lead" : "Matter"}
        onSaved={handleCaseSaved}
      />
      <DeleteConfirmationDialog
        open={Boolean(caseToDelete)}
        onOpenChange={(open) => !open && setCaseToDelete(null)}
        title="Permanently delete matter?"
        recordType="matter"
        recordName={caseToDelete?.case_name}
        isDeleting={isDeletingCase}
        onConfirm={handleDeleteCase}
      />
      <CaseListViewSheet
        open={isListViewPanelOpen}
        onOpenChange={setIsListViewPanelOpen}
        editingListView={editingListView}
        users={users}
        caseTypes={caseTypeOptions}
        stages={stageOptions}
        onSave={(newListView) => {
          const updatedViews = editingListView
            ? listViews.map((view) => (view.id === newListView.id ? newListView : view))
            : [...listViews, newListView];
          saveListViewsToSupabase(updatedViews);
          setActiveListViewId(newListView.id);
        }}
        onDelete={(id) => {
          saveListViewsToSupabase(listViews.filter((view) => view.id !== id));
          setActiveListViewId("all");
        }}
      />

      <div className="flex w-full flex-col items-start justify-between gap-4 overflow-visible xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <h2 className="shrink-0 text-2xl font-bold tracking-tight text-primary">{sectionCopy.title}</h2>
          <Tabs
            value={activeListViewId}
            onValueChange={(value) => {
              setActiveListViewId(value);
              setCurrentPage(1);
            }}
            className="min-w-0 flex-1"
          >
            <div className="flex items-center gap-2">
              <TabsList className="h-10 flex-nowrap justify-start overflow-x-auto bg-transparent p-0">
                {displayListViews.slice(0, 6).map((view) => (
                  <TabsTrigger
                    key={view.id}
                    value={view.id}
                    className="whitespace-nowrap rounded-full px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                  >
                    {view.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {displayListViews.length > 6 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {displayListViews.slice(6).map((view) => (
                      <DropdownMenuItem
                        key={view.id}
                        onClick={() => {
                          setActiveListViewId(view.id);
                          setCurrentPage(1);
                        }}
                      >
                        {view.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-full px-3 text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                onClick={() => {
                  setEditingListView(null);
                  setIsListViewPanelOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Add List
              </Button>
            </div>
          </Tabs>
        </div>

        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-3 xl:w-auto">
          {activeListView && !activeListView.system && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 rounded-full px-4 text-muted-foreground"
              onClick={() => {
                setEditingListView(activeListView);
                setIsListViewPanelOpen(true);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit List
            </Button>
          )}
          {!loading && (
            <>
              <div
                className={`relative flex items-center transition-all duration-300 ${
                  isSearchExpanded || searchTerm ? "w-full sm:w-64" : "w-10"
                }`}
              >
                <Button
                  variant={isSearchExpanded || searchTerm ? "ghost" : "outline"}
                  size="icon"
                  className="absolute left-0 z-10 h-10 w-10 rounded-full"
                  onClick={() => {
                    if (!isSearchExpanded && !searchTerm) {
                      setIsSearchExpanded(true);
                      window.setTimeout(() => document.getElementById("case-search")?.focus(), 100);
                    }
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Input
                  id="case-search"
                  placeholder={`Search ${sectionCopy.countLabel}...`}
                  className={`h-10 rounded-full bg-background pl-10 transition-all duration-300 ${
                    isSearchExpanded || searchTerm ? "w-full opacity-100" : "w-0 border-0 p-0 opacity-0"
                  }`}
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setCurrentPage(1);
                  }}
                  onBlur={() => {
                    if (!searchTerm) setIsSearchExpanded(false);
                  }}
                />
              </div>

              <Popover>
                <ControlTooltip label={`Filter ${sectionCopy.countLabel}`}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "relative h-10 w-10 shrink-0 rounded-full",
                        activeFilterCount > 0 && "border-primary/40 bg-primary/10 text-primary",
                      )}
                    >
                      <Filter className="h-4 w-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                </ControlTooltip>
                <PopoverContent className="right-0 w-80 p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Filter {sectionCopy.title}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          setTypeFilter("All");
                          setStatusFilter("All");
                          setStageFilter("All");
                          setAssignedUserFilter("All");
                          setCurrentPage(1);
                        }}
                      >
                        Clear
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>Practice Area</Label>
                      <SearchableSelect
                        value={typeFilter}
                        onValueChange={(value) => {
                          setTypeFilter(value);
                          setCurrentPage(1);
                        }}
                        options={["All", ...caseTypeOptions]}
                        placeholder="Any practice area"
                        searchPlaceholder="Search practice areas..."
                        emptyMessage="No practice areas found."
                        getOptionLabel={(value) => (value === "All" ? "Any Practice Area" : value)}
                        contentClassName="z-[150]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={statusFilter} onValueChange={(value) => {
                        setStatusFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any status" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          <SelectItem value="All">Any Status</SelectItem>
                          {CASE_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              <span className="capitalize">{status}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Stage</Label>
                      <Select value={stageFilter} onValueChange={(value) => {
                        setStageFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any stage" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          <SelectItem value="All">Any Stage</SelectItem>
                          {stageOptions.map((stage) => (
                            <SelectItem key={stage} value={stage}>
                              <span className="capitalize">{stage.replace(/_/g, " ")}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Primary Attorney</Label>
                      <Select value={assignedUserFilter} onValueChange={(value) => {
                        setAssignedUserFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any attorney" />
                        </SelectTrigger>
                        <SelectContent className="z-[150] max-h-72 overflow-y-auto">
                          <SelectItem value="All">Any Attorney</SelectItem>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {users.map((user) => (
                            <SelectItem key={getUserId(user)} value={getUserId(user)}>
                              {getUserName(user)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Tabs
                value={viewMode}
                onValueChange={(value) => {
                  setViewMode(value as CaseViewMode);
                  setCurrentPage(1);
                }}
                className="hidden sm:block"
              >
                <TabsList className="h-10 rounded-full">
                  <ControlTooltip label="Kanban view">
                    <TabsTrigger value="kanban" className="rounded-full px-3">
                      <SquareKanban className="h-4 w-4" />
                    </TabsTrigger>
                  </ControlTooltip>
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
              <ControlTooltip label={isCurrentPinnedView ? `Unpin this ${sectionCopy.pinNoun} view` : `Pin this ${sectionCopy.pinNoun} view`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "hidden h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex",
                    isCurrentPinnedView && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                  )}
                  disabled={isSavingPinnedView}
                  onClick={handleTogglePinnedView}
                  aria-label={isCurrentPinnedView ? `Unpin this ${sectionCopy.pinNoun} view` : `Pin this ${sectionCopy.pinNoun} view`}
                >
                  <Pin className={cn("h-4 w-4", isCurrentPinnedView && "fill-current")} />
                </Button>
              </ControlTooltip>
            </>
          )}

          <ControlTooltip label={sectionCopy.addTooltip}>
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-[#0484C8]"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </ControlTooltip>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">{sectionCopy.loading}</span>
        </div>
      ) : matterCases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-20 text-center">
          <div className="mb-4 rounded-full bg-muted/30 p-4 text-muted-foreground/50">
            <Briefcase className="h-8 w-8" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-muted-foreground">{sectionCopy.emptyTitle}</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground/70">{sectionCopy.emptyDescription}</p>
          <Button onClick={() => setIsCreateOpen(true)} size="icon" className="h-12 w-12 rounded-full shadow-sm hover:bg-[#0484C8]">
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {paginatedCases.map((caseRecord) => (
              <CaseCard
                key={caseRecord.id}
                caseRecord={caseRecord}
                onNavigate={() => navigate(`/case/${caseRecord.id}`)}
                onEdit={() => setCaseToEdit(caseRecord)}
                onDelete={() => setCaseToDelete(caseRecord)}
              />
              ))}
            </div>
          ) : viewMode === "kanban" ? (
            <CasePipelineKanbanBoard
              cases={sortedCases}
              pipelines={activePipeline ? [activePipeline] : []}
              countLabel={sectionCopy.countLabel}
              sectionTitle={sectionCopy.title}
              navigate={navigate}
              dragOverPipelineStageId={dragOverPipelineStageId}
              updatingCaseStageId={updatingCaseStageId}
              onDragOverPipelineStage={setDragOverPipelineStageId}
              onStageChange={handleCasePipelineStageChange}
              onEdit={setCaseToEdit}
              onDelete={setCaseToDelete}
            />
          ) : (
            <CaseTable
              cases={paginatedCases}
              contacts={contacts}
              navigate={navigate}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
            onEdit={setCaseToEdit}
            onDelete={setCaseToDelete}
            />
          )}

          {filteredCases.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
              <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-foreground">{sectionCopy.noResultsTitle}</h3>
              <p className="mt-1 text-muted-foreground">{sectionCopy.noResultsDescription}</p>
            </div>
          )}

          {viewMode !== "kanban" ? (
          <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
              {" - "}
              <span className="font-medium text-foreground">{lastVisibleRow}</span>
              {" of "}
              <span className="font-medium text-foreground">{sortedCases.length}</span> {sectionCopy.countLabel}
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
                      className={cn(
                        "h-9 rounded-full px-3",
                        effectiveCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer",
                      )}
                    />
                  </PaginationItem>
                  {visiblePageItems.map((item, index) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${index}`} className="hidden px-1 text-muted-foreground sm:block">
                        ...
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item} className="hidden sm:block">
                        <PaginationLink
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            setCurrentPage(item);
                          }}
                          isActive={effectiveCurrentPage === item}
                          className="h-9 min-w-9 cursor-pointer rounded-full px-3"
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem className="sm:hidden">
                    <span className="flex h-9 items-center rounded-full px-3 text-sm text-muted-foreground">
                      Page {effectiveCurrentPage} of {safeTotalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setCurrentPage(Math.min(safeTotalPages, effectiveCurrentPage + 1));
                      }}
                      className={cn(
                        "h-9 rounded-full px-3",
                        effectiveCurrentPage === safeTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer",
                      )}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function getPipelineStageKey(pipelineId: string, stageId: string) {
  return `${pipelineId}:${stageId}`;
}

function caseMatchesPipelineStage(caseRecord: CaseRecord, pipeline: GhlPipeline, stage: GhlPipelineStage) {
  if (caseRecord.ghl_pipeline_stage_id !== stage.id) return false;
  return !caseRecord.ghl_pipeline_id || caseRecord.ghl_pipeline_id === pipeline.id;
}

function CasePipelineKanbanBoard({
  cases,
  pipelines,
  countLabel,
  sectionTitle,
  navigate,
  dragOverPipelineStageId,
  updatingCaseStageId,
  onDragOverPipelineStage,
  onStageChange,
  onEdit,
  onDelete,
}: {
  cases: CaseRecord[];
  pipelines: GhlPipeline[];
  countLabel: string;
  sectionTitle: string;
  navigate: (path: string) => void;
  dragOverPipelineStageId: string;
  updatingCaseStageId: string | null;
  onDragOverPipelineStage: (stageKey: string) => void;
  onStageChange: (caseRecord: CaseRecord, pipeline: GhlPipeline, stage: GhlPipelineStage) => void;
  onEdit: (caseRecord: CaseRecord) => void;
  onDelete: (caseRecord: CaseRecord) => void;
}) {
  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-16 text-center">
        <SquareKanban className="mb-4 h-10 w-10 text-muted-foreground/50" />
        <h3 className="text-lg font-medium text-foreground">No GHL pipelines found</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Configure pipelines in Tools, then refresh {sectionTitle} to use them here.
        </p>
      </div>
    );
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, pipeline: GhlPipeline, stage: GhlPipelineStage) => {
    event.preventDefault();
    event.stopPropagation();
    if (updatingCaseStageId) return;
    const caseId = event.dataTransfer.getData("text/plain");
    const caseRecord = cases.find((item) => item.id === caseId);
    onDragOverPipelineStage("");
    if (caseRecord) onStageChange(caseRecord, pipeline, stage);
  };

  return (
    <div className="space-y-6">
      {pipelines.map((pipeline) => {
        const stages = pipeline.stages || [];
        const pipelineCaseCount = cases.filter((caseRecord) =>
          stages.some((stage) => caseMatchesPipelineStage(caseRecord, pipeline, stage)),
        ).length;

        return (
          <section key={pipeline.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{pipeline.name}</h3>
              <Badge variant="outline" className="rounded-full">
                {pipelineCaseCount} {pipelineCaseCount === 1 ? countLabel.replace(/s$/, "") : countLabel}
              </Badge>
            </div>

            {stages.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                This GHL pipeline does not have stages yet.
              </div>
            ) : (
              <div className="flex h-[calc(100vh-13rem)] min-h-[32rem] overflow-x-auto pb-2">
                {stages.map((stage, index) => {
                  const stageKey = getPipelineStageKey(pipeline.id, stage.id);
                  const columnCases = cases.filter((caseRecord) => caseMatchesPipelineStage(caseRecord, pipeline, stage));
                  const isDragOver = dragOverPipelineStageId === stageKey;

                  return (
                    <div
                      key={stageKey}
                      className={cn(
                        "flex min-w-[18rem] flex-1 flex-col border-y border-r bg-muted/20 transition-colors first:border-l",
                        index === 0 && "overflow-hidden rounded-tl-md",
                        index === stages.length - 1 && "overflow-hidden rounded-tr-md",
                        isDragOver && "border-[#0484C8] bg-[#F0F6FF]",
                      )}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        onDragOverPipelineStage(stageKey);
                      }}
                      onDragLeave={() => {
                        if (dragOverPipelineStageId === stageKey) onDragOverPipelineStage("");
                      }}
                      onDrop={(event) => handleDrop(event, pipeline, stage)}
                    >
                      <div
                        className={cn(
                          "relative z-10 flex h-10 items-center justify-between bg-[#0384C8] py-2 pl-3 pr-1 text-white",
                          index === 0 && "rounded-tl-md",
                          index === stages.length - 1 && "rounded-tr-md",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-xs font-semibold uppercase tracking-wide text-white">
                            {stage.name}
                          </div>
                          <Badge variant="outline" className="border-transparent bg-white/20 text-xs text-white">
                            {columnCases.length}
                          </Badge>
                        </div>
                        {index < stages.length - 1 ? (
                          <ChevronRight className="h-7 w-7 shrink-0 text-white" />
                        ) : null}
                      </div>

                      <div className="flex flex-1 flex-col gap-3 p-3">
                        {columnCases.map((caseRecord) => (
                          <KanbanCaseCard
                            key={caseRecord.id}
                            caseRecord={caseRecord}
                            navigate={navigate}
                            updating={updatingCaseStageId === caseRecord.id}
                            onEdit={() => onEdit(caseRecord)}
                            onDelete={() => onDelete(caseRecord)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function KanbanCaseCard({
  caseRecord,
  navigate,
  updating,
  onEdit,
  onDelete,
}: {
  caseRecord: CaseRecord;
  navigate: (path: string) => void;
  updating: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const clientName = formatContactDisplayName(caseRecord.primary_contact_name) || caseRecord.ghl_contact_id || "No client";

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", caseRecord.id);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <Card
      draggable={!updating}
      className={cn(
        "cursor-grab overflow-hidden bg-background transition-all hover:border-primary/50 hover:shadow-md active:cursor-grabbing",
        updating && "cursor-wait opacity-60",
      )}
      onClick={() => navigate(`/case/${caseRecord.id}`)}
      onDragStart={handleDragStart}
    >
      <CardHeader className="space-y-1.5 bg-muted/30 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="min-w-0 truncate text-xs font-semibold leading-tight text-[#2384CA]">
            {caseRecord.case_name}
          </h3>
          <div onClick={(event) => event.stopPropagation()}>
            <CaseActions
              onView={() => navigate(`/case/${caseRecord.id}`)}
              onEdit={onEdit}
              onDelete={onDelete}
              triggerClassName="h-6 w-6 shrink-0"
              iconClassName="h-3.5 w-3.5"
            />
          </div>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {clientName}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{caseRecord.case_number}</span>
          <Badge variant="outline" className={cn("shrink-0 border-transparent px-2 py-0 text-[10px] capitalize", getCaseStatusClass(caseRecord.status))}>
            {caseRecord.status}
          </Badge>
        </div>
      </CardHeader>
    </Card>
  );
}

function CaseCard({
  caseRecord,
  onNavigate,
  onEdit,
  onDelete,
}: {
  caseRecord: CaseRecord;
  onNavigate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="cursor-pointer overflow-hidden transition-all hover:border-primary/50 hover:shadow-md" onClick={onNavigate}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 bg-muted/30 p-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
            <Briefcase className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-sm font-semibold capitalize leading-tight text-[#2384CA] hover:underline">
                <Link to={`/case/${caseRecord.id}`} onClick={(event) => event.stopPropagation()} className="block truncate">
                  {caseRecord.case_name}
                </Link>
              </h3>
              <Badge variant="outline" className={cn("shrink-0 border-transparent px-2 py-0 text-[10px] capitalize", getCaseStatusClass(caseRecord.status))}>
                {caseRecord.status}
              </Badge>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{caseRecord.case_number}</div>
          </div>
        </div>
        <CaseActions onView={onNavigate} onEdit={onEdit} onDelete={onDelete} />
      </CardHeader>
      <CardContent className="p-3 pt-3">
        <div className="space-y-1.5">
          <CaseMeta label="Practice Area" value={caseRecord.case_type} />
          <CaseMeta label="Stage" value={caseRecord.stage.replace(/_/g, " ")} />
          <CaseMeta label="Client" value={caseRecord.primary_contact_name || caseRecord.ghl_contact_id} />
          <CaseMeta label="Last Updated" value={formatDate(caseRecord.updated_at)} />
        </div>
      </CardContent>
    </Card>
  );
}

function CaseMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate text-right capitalize text-foreground/80">{value}</span>
    </div>
  );
}

function CaseActions({
  onView,
  onEdit,
  onDelete,
  triggerClassName,
  iconClassName,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  triggerClassName?: string;
  iconClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground", triggerClassName)}
        >
          <MoreVertical className={cn("h-4 w-4", iconClassName)} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
        >
          <Eye className="mr-2 h-4 w-4" />
          View
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CaseTable({
  cases,
  contacts,
  navigate,
  handleSort,
  renderSortIcon,
  onEdit,
  onDelete,
}: {
  cases: CaseRecord[];
  contacts: any[];
  navigate: (path: string) => void;
  handleSort: (column: keyof CaseRecord) => void;
  renderSortIcon: (column: keyof CaseRecord) => ReactNode;
  onEdit: (caseRecord: CaseRecord) => void;
  onDelete: (caseRecord: CaseRecord) => void;
}) {
  const columns: Array<[keyof CaseRecord, string]> = [
    ["case_name", "Matter"],
    ["primary_contact_name", "Client"],
    ["status", "Status"],
    ["case_type", "Practice Area"],
    ["stage", "Stage"],
    ["updated_at", "Last Updated"],
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            {columns.map(([column, label]) => (
              <th
                key={column}
                className="h-12 cursor-pointer px-4 py-4 font-medium transition-colors hover:bg-muted/80"
                onClick={() => handleSort(column)}
              >
                <div className="flex items-center">
                  {label} {renderSortIcon(column)}
                </div>
              </th>
            ))}
            <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((caseRecord) => {
            const matchedContact = contacts.find((contact) => {
              const contactName = formatContactName(contact);
              return (
                contact.id === caseRecord.ghl_contact_id ||
                contact.email && contact.email === caseRecord.primary_contact_email ||
                contactName && caseRecord.primary_contact_name &&
                  contactName.toLowerCase() === caseRecord.primary_contact_name.toLowerCase()
              );
            });
            const clientName = formatContactDisplayName(caseRecord.primary_contact_name) || caseRecord.ghl_contact_id;
            const clientAvatarUrl = getContactAvatarUrl(matchedContact);
            const clientInitials = getAvatarInitials(
              { fullName: clientName, email: caseRecord.primary_contact_email || matchedContact?.email },
              "C",
            );

            return (
            <tr
              key={caseRecord.id}
              className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
              onClick={() => navigate(`/case/${caseRecord.id}`)}
            >
              <td className="px-4 py-2">
                <div className="flex items-center space-x-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-primary">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div>
                    <Link to={`/case/${caseRecord.id}`} onClick={(event) => event.stopPropagation()} className="capitalize text-[#2384CA] hover:underline">
                      {caseRecord.case_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{caseRecord.case_number}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2 text-foreground/70">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    {clientAvatarUrl ? (
                      <AvatarImage src={clientAvatarUrl} alt={`${clientInitials} avatar`} />
                    ) : null}
                    <AvatarFallback className="bg-blue-50 text-xs text-primary">
                      {clientInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span>{clientName}</span>
                </div>
              </td>
              <td className="px-4 py-2">
                <Badge variant="outline" className={cn("border-transparent capitalize", getCaseStatusClass(caseRecord.status))}>
                  {caseRecord.status}
                </Badge>
              </td>
              <td className="px-4 py-2 text-foreground/80">{caseRecord.case_type}</td>
              <td className="px-4 py-2 capitalize text-foreground/80">{caseRecord.stage.replace(/_/g, " ")}</td>
              <td className="px-4 py-2 text-foreground/70">
                <div className="flex items-center">
                  <Calendar className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span>{formatDate(caseRecord.updated_at)}</span>
                </div>
              </td>
              <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <CaseActions
                  onView={() => navigate(`/case/${caseRecord.id}`)}
                  onEdit={() => onEdit(caseRecord)}
                  onDelete={() => onDelete(caseRecord)}
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

function CaseListViewSheet({
  open,
  onOpenChange,
  editingListView,
  users,
  caseTypes,
  stages,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingListView: CaseListView | null;
  users: AssignableUser[];
  caseTypes: string[];
  stages: string[];
  onSave: (listView: CaseListView) => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("All");
  const [caseType, setCaseType] = useState("All");
  const [stage, setStage] = useState("All");
  const [assignedUserId, setAssignedUserId] = useState("All");

  useEffect(() => {
    if (!open) return;

    setName(editingListView?.name || "");
    setStatus(editingListView?.filters.status || "All");
    setCaseType(editingListView?.filters.caseType || "All");
    setStage(editingListView?.filters.stage || "All");
    setAssignedUserId(editingListView?.filters.assignedUserId || "All");
  }, [editingListView, open]);

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "List Name Required",
        description: "Please enter a name for this matter list view.",
        variant: "destructive",
      });
      return;
    }

    onSave({
      id: editingListView?.id || Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      filters: {
        ...(status !== "All" && { status }),
        ...(caseType !== "All" && { caseType }),
        ...(stage !== "All" && { stage }),
        ...(assignedUserId !== "All" && { assignedUserId }),
      },
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editingListView ? "Edit List View" : "Create List View"}</SheetTitle>
          <SheetDescription>
            {editingListView ? "Update the filters for this matter list view." : "Define filters to save a custom view of your matters."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <Label htmlFor="case-list-name">
              List Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="case-list-name"
              placeholder="e.g. Active Litigation"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-4">
            <h4 className="border-b pb-2 text-sm font-medium text-muted-foreground">Filters</h4>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any Status</SelectItem>
                  {CASE_STATUSES.map((caseStatus) => (
                    <SelectItem key={caseStatus} value={caseStatus}>
                      <span className="capitalize">{caseStatus}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Practice Area</Label>
              <SearchableSelect
                value={caseType}
                onValueChange={setCaseType}
                options={["All", ...caseTypes]}
                placeholder="Any Practice Area"
                searchPlaceholder="Search practice areas..."
                emptyMessage="No practice areas found."
                getOptionLabel={(value) => (value === "All" ? "Any Practice Area" : value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any Stage</SelectItem>
                  {stages.map((option) => (
                    <SelectItem key={option} value={option}>
                      <span className="capitalize">{option.replace(/_/g, " ")}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assigned User</Label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Any User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any User</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={getUserId(user)} value={getUserId(user)}>
                      {getUserName(user)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mt-8 flex w-full items-center justify-between">
          {editingListView ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive/90"
              onClick={() => {
                onDelete(editingListView.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="hover:bg-[#0484C8]" onClick={handleSave}>{editingListView ? "Save Changes" : "Save List View"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreateCaseSheet({
  open,
  onOpenChange,
  contacts,
  users,
  pipelines,
  locationId,
  defaultPipelineId,
  recordLabel = "Matter",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: any[];
  users: AssignableUser[];
  pipelines: GhlPipeline[];
  locationId: string;
  defaultPipelineId?: string;
  recordLabel?: string;
  onCreated: (caseRecord: CaseRecord) => void;
}) {
  const { toast } = useToast();
  const defaultPipelineSelection = getPipelineSelection(pipelines, defaultPipelineId);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    caseNumber: "",
    caseName: "",
    caseType: CASE_TYPES[0],
    stage: defaultPipelineSelection.stageName || "intake",
    status: "open",
    pipelineId: defaultPipelineSelection.pipelineId,
    pipelineStageId: defaultPipelineSelection.pipelineStageId,
    contactId: "",
    assignedUserId: "",
    notes: "",
  });

  const selectedContact = contacts.find((contact) => contact.id === form.contactId);
  const selectedUser = users.find((user) => getUserId(user) === form.assignedUserId);
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === form.pipelineId);

  useEffect(() => {
    if (!open) return;
    const selection = getPipelineSelection(pipelines, defaultPipelineId);
    setForm((current) => ({
      ...current,
      pipelineId: selection.pipelineId,
      pipelineStageId: selection.pipelineStageId,
      stage: selection.stageName || current.stage || "intake",
    }));
  }, [defaultPipelineId, open, pipelines]);

  const resetForm = () => {
    const selection = getPipelineSelection(pipelines, defaultPipelineId);
    setForm({
      caseNumber: "",
      caseName: "",
      caseType: CASE_TYPES[0],
      stage: selection.stageName || "intake",
      status: "open",
      pipelineId: selection.pipelineId,
      pipelineStageId: selection.pipelineStageId,
      contactId: "",
      assignedUserId: "",
      notes: "",
    });
  };

  const handlePipelineChange = (pipelineId: string) => {
    if (pipelineId === NO_PIPELINE_VALUE) {
      setForm({ ...form, pipelineId: "", pipelineStageId: "", stage: "" });
      return;
    }

    const selection = getPipelineSelection(pipelines, pipelineId);
    setForm({
      ...form,
      pipelineId: selection.pipelineId,
      pipelineStageId: selection.pipelineStageId,
      stage: selection.stageName || form.stage,
    });
  };

  const handlePipelineStageChange = (pipelineStageId: string) => {
    if (!selectedPipeline || pipelineStageId === NO_STAGE_VALUE) {
      setForm({ ...form, pipelineStageId: "", stage: "" });
      return;
    }

    const stage = selectedPipeline.stages?.find((item) => item.id === pipelineStageId);
    setForm({
      ...form,
      pipelineStageId,
      stage: stage?.name || form.stage,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.contactId) {
      toast({ title: "Contact Required", description: "Please select a contact.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const caseRecord = await createCase({
        locationId,
        caseNumber: form.caseNumber,
        caseName: form.caseName,
        caseType: form.caseType,
        stage: form.stage,
        status: form.status,
        contactId: form.contactId,
        contactName: selectedContact ? formatContactName(selectedContact) : "",
        contactEmail: selectedContact?.email || "",
        contactPhone: formatPhoneNumber(selectedContact?.phone, ""),
        assignedUserId: form.assignedUserId || null,
        ghlPipelineId: form.pipelineId || null,
        ghlPipelineStageId: form.pipelineStageId || null,
        notes: form.notes,
        metadata: {
          assigned_user_name: selectedUser ? getUserName(selectedUser) : "",
          ...(selectedPipeline ? { ghl_pipeline_name: selectedPipeline.name } : {}),
          ...(form.pipelineStageId ? { ghl_pipeline_stage_name: form.stage } : {}),
          clientType: "contact",
          relatedRecordType: "contact",
          primaryContactId: form.contactId,
          primaryContactName: selectedContact ? formatContactName(selectedContact) : "",
        },
      });
      toast({ title: `${recordLabel} Created`, description: `${caseRecord.case_name} has been created.` });
      resetForm();
      onCreated(caseRecord);
    } catch (error) {
      toast({
        title: `${recordLabel} Not Created`,
        description: getUserFriendlyErrorMessage(error, `Could not create the ${recordLabel.toLowerCase()}. Please try again.`),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Create {recordLabel}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>{recordLabel} Number</Label>
            <Input
              value={form.caseNumber}
              onChange={(event) => setForm({ ...form, caseNumber: event.target.value })}
              placeholder="CASE-001"
            />
          </div>

          <div className="space-y-2">
            <Label>{recordLabel} Name</Label>
            <Input
              value={form.caseName}
              onChange={(event) => setForm({ ...form, caseName: event.target.value })}
              placeholder="Smith v. Acme"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Contact</Label>
            <Select value={form.contactId} onValueChange={(contactId) => setForm({ ...form, contactId })} required>
              <SelectTrigger>
                <span className={cn(!form.contactId && "text-muted-foreground")}>
                  {selectedContact ? formatContactName(selectedContact) : "Select contact"}
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {contacts.length > 0 ? (
                  contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {formatContactName(contact)}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-contacts" disabled>
                    No contacts available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Practice Area</Label>
              <SearchableSelect
                value={form.caseType}
                onValueChange={(caseType) => setForm({ ...form, caseType })}
                options={CASE_TYPES}
                placeholder="Select practice area"
                searchPlaceholder="Search practice areas..."
                emptyMessage="No practice areas found."
              />
            </div>
            <div className="space-y-2">
              <Label>Pipeline</Label>
              <Select value={form.pipelineId || NO_PIPELINE_VALUE} onValueChange={handlePipelineChange}>
                <SelectTrigger>
                  <span className={cn(!form.pipelineId && "text-muted-foreground")}>
                    {selectedPipeline?.name || "No pipeline"}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value={NO_PIPELINE_VALUE}>No Pipeline</SelectItem>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <Select
              value={form.pipelineStageId || NO_STAGE_VALUE}
              onValueChange={handlePipelineStageChange}
            >
              <SelectTrigger>
                <span className={cn(!form.pipelineStageId && "text-muted-foreground")}>
                  {form.stage || (selectedPipeline ? "No stages available" : "Select pipeline first")}
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {selectedPipeline?.stages?.length ? (
                  selectedPipeline.stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={NO_STAGE_VALUE} disabled>
                    No stages available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Primary Attorney</Label>
            <Select value={form.assignedUserId} onValueChange={(assignedUserId) => setForm({ ...form, assignedUserId })}>
              <SelectTrigger>
                <span className={cn(!form.assignedUserId && "text-muted-foreground")}>
                  {selectedUser ? getUserName(selectedUser) : "Unassigned"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {users.map((user) => (
                  <SelectItem key={getUserId(user)} value={getUserId(user)}>
                    {getUserName(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Internal Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder={`Optional context for this ${recordLabel.toLowerCase()}`}
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create {recordLabel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EditCaseSheet({
  open,
  onOpenChange,
  caseRecord,
  users,
  pipelines,
  recordLabel = "Matter",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseRecord: CaseRecord | null;
  users: AssignableUser[];
  pipelines: GhlPipeline[];
  recordLabel?: string;
  onSaved: (caseRecord: CaseRecord) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    caseNumber: "",
    caseName: "",
    caseType: CASE_TYPES[0],
    stage: "intake",
    status: "open",
    pipelineId: "",
    pipelineStageId: "",
    assignedUserId: "",
  });

  useEffect(() => {
    if (!caseRecord || !open) return;
    const selection = getPipelineSelection(pipelines, caseRecord.ghl_pipeline_id, caseRecord.ghl_pipeline_stage_id);
    setForm({
      caseNumber: caseRecord.case_number || "",
      caseName: caseRecord.case_name || "",
      caseType: caseRecord.case_type || CASE_TYPES[0],
      stage: caseRecord.stage || "intake",
      status: caseRecord.status || "open",
      pipelineId: selection.pipelineId,
      pipelineStageId: selection.pipelineStageId,
      assignedUserId: caseRecord.assigned_user_id || "",
    });
  }, [caseRecord, open, pipelines]);

  const caseTypeOptions = CASE_TYPES.includes(form.caseType) ? CASE_TYPES : [form.caseType, ...CASE_TYPES];
  const selectedUser = users.find((user) => getUserId(user) === form.assignedUserId);
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === form.pipelineId);

  const handlePipelineChange = (pipelineId: string) => {
    if (pipelineId === NO_PIPELINE_VALUE) {
      setForm({ ...form, pipelineId: "", pipelineStageId: "", stage: "" });
      return;
    }

    const selection = getPipelineSelection(pipelines, pipelineId);
    setForm({
      ...form,
      pipelineId: selection.pipelineId,
      pipelineStageId: selection.pipelineStageId,
      stage: selection.stageName || form.stage,
    });
  };

  const handlePipelineStageChange = (pipelineStageId: string) => {
    if (!selectedPipeline || pipelineStageId === NO_STAGE_VALUE) {
      setForm({ ...form, pipelineStageId: "", stage: "" });
      return;
    }

    const stage = selectedPipeline.stages?.find((item) => item.id === pipelineStageId);
    setForm({
      ...form,
      pipelineStageId,
      stage: stage?.name || form.stage,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!caseRecord) return;

    setSubmitting(true);
    try {
      const updatedCase = await updateCase({
        caseId: caseRecord.id,
        caseNumber: form.caseNumber,
        caseName: form.caseName,
        caseType: form.caseType,
        status: form.status,
        stage: form.stage,
        ghlPipelineId: form.pipelineId || null,
        ghlPipelineStageId: form.pipelineStageId || null,
        assignedUserId: form.assignedUserId || null,
        metadata: {
          ...(selectedPipeline ? { ghl_pipeline_name: selectedPipeline.name } : {}),
          ...(form.pipelineStageId ? { ghl_pipeline_stage_name: form.stage } : {}),
        },
      });
      onSaved(updatedCase);
      toast({ title: `${recordLabel} Updated`, description: `${updatedCase.case_name} has been saved.` });
    } catch (error) {
      toast({
        title: `${recordLabel} Not Updated`,
        description: getUserFriendlyErrorMessage(error, `Could not update this ${recordLabel.toLowerCase()}. Please try again.`),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit {recordLabel}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>{recordLabel} Number</Label>
            <Input
              value={form.caseNumber}
              onChange={(event) => setForm({ ...form, caseNumber: event.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{recordLabel} Name</Label>
            <Input
              value={form.caseName}
              onChange={(event) => setForm({ ...form, caseName: event.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Practice Area</Label>
            <SearchableSelect
              value={form.caseType}
              onValueChange={(caseType) => setForm({ ...form, caseType })}
              options={caseTypeOptions}
              placeholder="Select practice area"
              searchPlaceholder="Search practice areas..."
              emptyMessage="No practice areas found."
            />
          </div>

          <div className="space-y-2">
            <Label>Primary Attorney</Label>
            <Select value={form.assignedUserId} onValueChange={(assignedUserId) => setForm({ ...form, assignedUserId })}>
              <SelectTrigger>
                <span className={cn(!form.assignedUserId && "text-muted-foreground")}>
                  {selectedUser ? getUserName(selectedUser) : "Unassigned"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {users.map((user) => (
                  <SelectItem key={getUserId(user)} value={getUserId(user)}>
                    {getUserName(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Pipeline</Label>
            <Select value={form.pipelineId || NO_PIPELINE_VALUE} onValueChange={handlePipelineChange}>
              <SelectTrigger>
                <span className={cn(!form.pipelineId && "text-muted-foreground")}>
                  {selectedPipeline?.name || "No pipeline"}
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                <SelectItem value={NO_PIPELINE_VALUE}>No Pipeline</SelectItem>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}>
                <SelectTrigger>
                  <span className="capitalize">{form.status}</span>
                </SelectTrigger>
                <SelectContent>
                  {CASE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span className="capitalize">{status}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Stage</Label>
              <Select
                value={form.pipelineStageId || NO_STAGE_VALUE}
                onValueChange={handlePipelineStageChange}
              >
                <SelectTrigger>
                  <span className={cn(!form.pipelineStageId && "text-muted-foreground")}>
                    {form.stage || (selectedPipeline ? "No stages available" : "Select pipeline first")}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {selectedPipeline?.stages?.length ? (
                    selectedPipeline.stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value={NO_STAGE_VALUE} disabled>
                      No stages available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
