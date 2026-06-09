import { type DragEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpDown,
  Building2,
  Calendar,
  ChevronRight,
  Filter,
  IdCard,
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
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { getAppLocationContext, getCachedContactsIfAvailable, getContacts, getPipelines, hasPermission, type GhlPipeline } from "@/lib/api";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import {
  convertLeadToMatter,
  createLead,
  deleteLead,
  listLeads,
  LEAD_ACCOUNT_TYPE,
  updateLead,
  type LeadRecord,
} from "@/lib/leads";
import { formatPersonName } from "@/lib/names";
import { listPipelineConfigs, type PipelineConfig } from "@/lib/pipeline-configs";
import { supabase } from "@/lib/supabase";
import { getAssignableUsers, getUserId, getUserName, type AssignableUser } from "@/lib/users";
import { cn } from "@/lib/utils";

const LEAD_STATUSES = ["open", "converted", "lost"];
const LEAD_VIEW_MODE_STORAGE_KEY = "lawbric.leads.viewMode";
const LEAD_PINNED_VIEW_MODE_STORAGE_KEY = "lawbric.leads.pinnedViewMode";
const LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY = "lawbric.leads.pinnedListViewId";
const LEAD_PINNED_VIEW_MODE_METADATA_KEY = "leadPinnedViewMode";
const LEAD_PINNED_LIST_VIEW_ID_METADATA_KEY = "leadPinnedListViewId";
const NO_PIPELINE_VALUE = "none";
const NO_STAGE_VALUE = "none";
type LeadViewMode = "list" | "grid" | "kanban";
type LeadSortColumn = "lead_name" | "contact_name" | "status" | "stage" | "updated_at";
type LeadListView = {
  id: string;
  name: string;
  system?: boolean;
  filters: {
    pipelineId?: string;
    status?: string;
  };
};
const SYNTHETIC_LEAD_PREFIX = "contact:";

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
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

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatContactName(contact: any) {
  const name = `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim() || contact?.name || contact?.fullName || "";
  return formatPersonName(name) || contact?.email || "Unnamed contact";
}

function getContactEmail(contact: any) {
  return contact?.email || contact?.primaryEmail || "";
}

function getContactPhone(contact: any) {
  return contact?.phone || contact?.phoneNumber || contact?.primaryPhone || "";
}

function getContactId(contact: any) {
  return String(contact?.id || contact?._id || contact?.contactId || "");
}

function getContactRecordKind(contact: any) {
  const tags = Array.isArray(contact?.tags) ? contact.tags : [];
  const hasCompanyTag = tags.some((tag: string) => tag.toLowerCase() === "company");
  const hasPersonName = Boolean(String(`${contact?.firstName || ""} ${contact?.lastName || ""}`).trim());
  if (contact?.recordKind === "company" || hasCompanyTag || (!hasPersonName && contact?.companyName)) return "company";
  return "person";
}

function pipelineConfigMatchesLeadAccountType(config?: PipelineConfig | null) {
  const accountTypeRule = String(config?.account_type_rule || "").trim().toLowerCase();
  return accountTypeRule === LEAD_ACCOUNT_TYPE.toLowerCase();
}

function isLeadViewMode(value: unknown): value is LeadViewMode {
  return value === "list" || value === "grid" || value === "kanban";
}

function getInitialLeadViewMode(): LeadViewMode {
  if (typeof window === "undefined") return "list";
  const pinnedViewMode = window.localStorage.getItem(LEAD_PINNED_VIEW_MODE_STORAGE_KEY);
  if (isLeadViewMode(pinnedViewMode)) return pinnedViewMode;
  const savedViewMode = window.localStorage.getItem(LEAD_VIEW_MODE_STORAGE_KEY);
  return isLeadViewMode(savedViewMode) ? savedViewMode : "list";
}

function getInitialPinnedLeadViewMode(): LeadViewMode | null {
  if (typeof window === "undefined") return null;
  const pinnedViewMode = window.localStorage.getItem(LEAD_PINNED_VIEW_MODE_STORAGE_KEY);
  return isLeadViewMode(pinnedViewMode) ? pinnedViewMode : null;
}

function getInitialLeadListViewId() {
  if (typeof window === "undefined") return "all";
  return window.localStorage.getItem(LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY) || "all";
}

function getInitialPinnedLeadListViewId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY);
}

function isSyntheticLead(lead: LeadRecord) {
  return lead.id.startsWith(SYNTHETIC_LEAD_PREFIX);
}

function getLeadEmailDisplay(lead: LeadRecord) {
  return lead.contact_email || "No email address";
}

function isCompanyLead(lead: LeadRecord) {
  return lead.metadata?.contact_record_kind === "company";
}

function LeadContactAvatar({ lead, className, iconClassName }: { lead: LeadRecord; className?: string; iconClassName?: string }) {
  const Icon = isCompanyLead(lead) ? Building2 : IdCard;

  return (
    <Avatar className={cn("h-8 w-8 shrink-0", className)}>
      <AvatarFallback className="bg-blue-50 text-primary">
        <Icon className={cn("h-4 w-4", iconClassName)} />
      </AvatarFallback>
    </Avatar>
  );
}

function getLeadStatusClass(status: string) {
  switch (status) {
    case "open":
      return "bg-green-100 text-green-800";
    case "converted":
      return "bg-blue-100 text-blue-800";
    case "lost":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-yellow-100 text-yellow-800";
  }
}

function getPipelineSelection(pipelines: GhlPipeline[], pipelineId?: string | null, pipelineStageId?: string | null) {
  const pipeline =
    pipelines.find((item) => item.id === pipelineId) ||
    pipelines.find((item) => (item.stages || []).some((stage) => stage.id === pipelineStageId));
  const stage = pipeline?.stages?.find((item) => item.id === pipelineStageId) || pipeline?.stages?.[0] || null;

  return {
    pipeline,
    stage,
    pipelineId: pipeline?.id || "",
    pipelineStageId: stage?.id || "",
    stageName: stage?.name || "",
  };
}

function ControlTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent className="whitespace-nowrap border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white shadow-md">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function LeadsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [locationId, setLocationId] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [pipelines, setPipelines] = useState<GhlPipeline[]>([]);
  const [pipelineConfigs, setPipelineConfigs] = useState<PipelineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<LeadViewMode>(getInitialLeadViewMode);
  const [pinnedViewMode, setPinnedViewMode] = useState<LeadViewMode | null>(getInitialPinnedLeadViewMode);
  const [pinnedListViewId, setPinnedListViewId] = useState<string | null>(getInitialPinnedLeadListViewId);
  const [isSavingPinnedView, setIsSavingPinnedView] = useState(false);
  const [listViews, setListViews] = useState<LeadListView[]>([]);
  const [isListViewPanelOpen, setIsListViewPanelOpen] = useState(false);
  const [editingListView, setEditingListView] = useState<LeadListView | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [activeListViewId, setActiveListViewId] = useState(getInitialLeadListViewId);
  const [sortColumn, setSortColumn] = useState<LeadSortColumn>("lead_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<LeadRecord | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<LeadRecord | null>(null);
  const [leadToConvert, setLeadToConvert] = useState<LeadRecord | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);
  const [isConvertingLead, setIsConvertingLead] = useState(false);
  const [dragOverStageId, setDragOverStageId] = useState("");
  const [updatingLeadStageId, setUpdatingLeadStageId] = useState<string | null>(null);
  const [canDeleteLeads, setCanDeleteLeads] = useState(false);
  const [canCreateLeads, setCanCreateLeads] = useState(false);
  const [canEditLeads, setCanEditLeads] = useState(false);
  const [canConvertLeads, setCanConvertLeads] = useState(false);
  const updatingLeadStageRef = useRef<string | null>(null);
  const loadingContactsRef = useRef(false);

  useEffect(() => {
    Promise.all([
      hasPermission("leads.delete"),
      hasPermission("leads.create"),
      hasPermission("leads.edit"),
      hasPermission("leads.convert"),
    ])
      .then(([canDelete, canCreate, canEdit, canConvert]) => {
        setCanDeleteLeads(canDelete);
        setCanCreateLeads(canCreate);
        setCanEditLeads(canEdit);
        setCanConvertLeads(canConvert);
      })
      .catch((error) => {
        console.error("Failed to load lead permissions", error);
        setCanDeleteLeads(false);
        setCanCreateLeads(false);
        setCanEditLeads(false);
        setCanConvertLeads(false);
      });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LEAD_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    const loadLeadPreferences = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userMetadata = session?.user?.user_metadata || {};
      const saved = userMetadata.leadListViews;
      if (Array.isArray(saved)) setListViews(saved.filter((view: LeadListView) => !view.system));

      const savedPinnedViewMode = userMetadata[LEAD_PINNED_VIEW_MODE_METADATA_KEY];
      if (isLeadViewMode(savedPinnedViewMode)) {
        setPinnedViewMode(savedPinnedViewMode);
        setViewMode(savedPinnedViewMode);
        window.localStorage.setItem(LEAD_PINNED_VIEW_MODE_STORAGE_KEY, savedPinnedViewMode);
      } else {
        setPinnedViewMode(null);
        window.localStorage.removeItem(LEAD_PINNED_VIEW_MODE_STORAGE_KEY);
      }

      const savedPinnedListViewId = userMetadata[LEAD_PINNED_LIST_VIEW_ID_METADATA_KEY];
      if (typeof savedPinnedListViewId === "string" && savedPinnedListViewId) {
        setPinnedListViewId(savedPinnedListViewId);
        setActiveListViewId(savedPinnedListViewId);
        window.localStorage.setItem(LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY, savedPinnedListViewId);
      } else {
        setPinnedListViewId(null);
        window.localStorage.removeItem(LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY);
      }
    };

    loadLeadPreferences().catch((error) => console.error("Failed to load lead preferences from Supabase", error));
  }, []);

  const handleTogglePinnedView = async () => {
    const nextPinnedViewMode = isCurrentPinnedView ? null : viewMode;
    const nextPinnedListViewId = isCurrentPinnedView ? null : activeListViewId;
    setPinnedViewMode(nextPinnedViewMode);
    setPinnedListViewId(nextPinnedListViewId);

    if (nextPinnedViewMode) {
      window.localStorage.setItem(LEAD_PINNED_VIEW_MODE_STORAGE_KEY, nextPinnedViewMode);
    } else {
      window.localStorage.removeItem(LEAD_PINNED_VIEW_MODE_STORAGE_KEY);
    }

    if (nextPinnedListViewId) {
      window.localStorage.setItem(LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY, nextPinnedListViewId);
    } else {
      window.localStorage.removeItem(LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY);
    }

    setIsSavingPinnedView(true);
    try {
      await supabase.auth.updateUser({
        data: {
          [LEAD_PINNED_VIEW_MODE_METADATA_KEY]: nextPinnedViewMode,
          [LEAD_PINNED_LIST_VIEW_ID_METADATA_KEY]: nextPinnedListViewId,
        },
      });
      toast({
        title: nextPinnedViewMode ? "Leads View Pinned" : "Leads View Unpinned",
        description: nextPinnedViewMode
          ? `Leads will open in ${activeListView.name} ${nextPinnedViewMode} view.`
          : "Leads will open in the last view used on this device.",
      });
    } catch (error) {
      setPinnedViewMode(pinnedViewMode);
      setPinnedListViewId(pinnedListViewId);
      if (pinnedViewMode) {
        window.localStorage.setItem(LEAD_PINNED_VIEW_MODE_STORAGE_KEY, pinnedViewMode);
      } else {
        window.localStorage.removeItem(LEAD_PINNED_VIEW_MODE_STORAGE_KEY);
      }
      if (pinnedListViewId) {
        window.localStorage.setItem(LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY, pinnedListViewId);
      } else {
        window.localStorage.removeItem(LEAD_PINNED_LIST_VIEW_ID_STORAGE_KEY);
      }
      toast({
        title: "Pinned View Not Saved",
        description: getUserFriendlyErrorMessage(error, "Could not save your pinned Leads view."),
        variant: "destructive",
      });
    } finally {
      setIsSavingPinnedView(false);
    }
  };

  const saveListViewsToSupabase = async (newListViews: LeadListView[]) => {
    setListViews(newListViews);
    await supabase.auth.updateUser({ data: { leadListViews: newListViews } }).catch((error) => {
      console.error("Failed to save lead list views to Supabase", error);
    });
  };

  const loadLeadData = async () => {
    setLoading(true);
    try {
      const context = await getAppLocationContext();
      const appLocationId = context.location?.id || "";
      const nextGhlLocationId = context.location?.ghlLocationId || "";
      setLocationId(appLocationId);
      setGhlLocationId(nextGhlLocationId);

      const [leadRows, assignableUsers, pipelineRows, pipelineConfigRows] = await Promise.all([
        listLeads(appLocationId),
        getAssignableUsers(),
        nextGhlLocationId
          ? getPipelines(nextGhlLocationId).catch((error) => {
              toast({
                title: "Pipelines Not Loaded",
                description: getUserFriendlyErrorMessage(error, "Could not load lead pipelines."),
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

      setLeads(leadRows);
      setUsers(assignableUsers);
      setPipelines(pipelineRows);
      setPipelineConfigs(pipelineConfigRows);
    } catch (error) {
      toast({
        title: "Leads Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load leads data."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeadData();
  }, []);

  const loadLeadContacts = useCallback(async () => {
    if (!ghlLocationId || contacts.length > 0 || loadingContactsRef.current) return;
    loadingContactsRef.current = true;
    setIsLoadingContacts(true);
    try {
      const cachedContacts = getArrayFromResponse(getCachedContactsIfAvailable(ghlLocationId), "contacts");
      if (cachedContacts.length > 0) {
        setContacts(cachedContacts);
        return;
      }

      const contactResponse = await getContacts(ghlLocationId);
      setContacts(getArrayFromResponse(contactResponse, "contacts"));
    } catch (error) {
      toast({
        title: "Contacts Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load contacts for the Lead form."),
        variant: "destructive",
      });
    } finally {
      loadingContactsRef.current = false;
      setIsLoadingContacts(false);
    }
  }, [contacts.length, ghlLocationId, toast]);

  const pipelineConfigMap = useMemo(
    () => new Map(pipelineConfigs.map((config) => [config.ghl_pipeline_id, config])),
    [pipelineConfigs],
  );
  const leadPipelines = useMemo(
    () =>
      sortPipelinesByDisplayOrder(
        pipelines.filter((pipeline) => {
          const config = pipelineConfigMap.get(pipeline.id);
          return (
            config?.is_active !== false &&
            (config?.classification === "prospecting" || pipelineConfigMatchesLeadAccountType(config))
          );
        }),
        pipelineConfigMap,
      ),
    [pipelineConfigMap, pipelines],
  );

  const allLeadsListView = useMemo<LeadListView>(() => ({ id: "all", name: "All Leads", system: true, filters: {} }), []);
  const pipelineListViews = useMemo<LeadListView[]>(
    () =>
      leadPipelines.map((pipeline) => ({
        id: `pipeline:${pipeline.id}`,
        name: pipeline.name,
        system: true,
        filters: { pipelineId: pipeline.id },
      })),
    [leadPipelines],
  );
  const displayListViews = useMemo(
    () => (viewMode === "kanban" ? pipelineListViews : [allLeadsListView, ...pipelineListViews, ...listViews]),
    [allLeadsListView, listViews, pipelineListViews, viewMode],
  );
  const activeListView = displayListViews.find((view) => view.id === activeListViewId) || displayListViews[0] || allLeadsListView;
  const activePipeline = activeListView.filters.pipelineId
    ? leadPipelines.find((pipeline) => pipeline.id === activeListView.filters.pipelineId)
    : null;
  const isCurrentPinnedView = pinnedViewMode === viewMode && pinnedListViewId === activeListViewId;

  useEffect(() => {
    if (viewMode === "kanban") {
      if (pipelineListViews.length === 0) return;
      if (!pipelineListViews.some((view) => view.id === activeListViewId)) {
        setActiveListViewId(pipelineListViews[0].id);
      }
      return;
    }

    if (!displayListViews.some((view) => view.id === activeListViewId)) {
      setActiveListViewId("all");
    }
  }, [activeListViewId, displayListViews, pipelineListViews, viewMode]);

  const displayLeads = useMemo(() => {
    const contactsById = new Map(contacts.map((contact) => [getContactId(contact), contact]));
    return leads.map((lead) => {
      const contact = contactsById.get(lead.ghl_contact_id);
      const contactName = contact ? formatContactName(contact) : lead.contact_name || lead.lead_name;
      return {
        ...lead,
        lead_name: contactName || lead.lead_name,
        contact_name: contactName || lead.contact_name,
        contact_email: (contact && getContactEmail(contact)) || lead.contact_email,
        contact_phone: (contact && getContactPhone(contact)) || lead.contact_phone,
        metadata: {
          ...(lead.metadata || {}),
          ...(contact ? { contact_record_kind: getContactRecordKind(contact) } : {}),
        },
      };
    });
  }, [contacts, leads]);

  const visibleLeads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return displayLeads.filter((lead) => {
      if (statusFilter !== "All" && lead.status !== statusFilter) return false;
      if (activeListView.filters.status && lead.status !== activeListView.filters.status) return false;
      if (activeListView.filters.pipelineId) {
        const matchesPipeline =
          lead.ghl_pipeline_id === activeListView.filters.pipelineId ||
          Boolean(activePipeline?.stages?.some((stage) => stage.id === lead.ghl_pipeline_stage_id));
        if (!matchesPipeline) return false;
      }
      if (!normalizedSearch) return true;
      return [
        lead.lead_name,
        lead.contact_name || "",
        lead.contact_email || "",
        lead.contact_phone || "",
        lead.stage || "",
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [activeListView, activePipeline, displayLeads, searchTerm, statusFilter]);

  const sortedLeads = useMemo(() => {
    return [...visibleLeads].sort((a, b) => {
      const aValue = String(a[sortColumn] || "").toLowerCase();
      const bValue = String(b[sortColumn] || "").toLowerCase();
      const comparison = aValue.localeCompare(bValue);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [sortColumn, sortDirection, visibleLeads]);

  const handleSort = (column: LeadSortColumn) => {
    if (column === sortColumn) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  };

  const renderSortIcon = (column: LeadSortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-40" />;
    return <ArrowUpDown className={cn("ml-2 h-3.5 w-3.5", sortDirection === "desc" && "rotate-180")} />;
  };

  const activeFilterCount = [statusFilter].filter((value) => value !== "All").length;

  const handleLeadSaved = (lead: LeadRecord) => {
    setLeads((current) => {
      const existing = current.some((item) => item.id === lead.id);
      return existing ? current.map((item) => (item.id === lead.id ? lead : item)) : [lead, ...current];
    });
    setIsCreateOpen(false);
    setLeadToEdit(null);
    void loadLeadData();
  };

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    if (isSyntheticLead(leadToDelete)) return;
    setIsDeletingLead(true);
    try {
      await deleteLead(leadToDelete.id);
      setLeads((current) => current.filter((lead) => lead.id !== leadToDelete.id));
      setLeadToDelete(null);
      toast({ title: "Lead Deleted", description: "The lead has been removed from Lawbric." });
    } catch (error) {
      toast({
        title: "Lead Not Deleted",
        description: getUserFriendlyErrorMessage(error, "Could not delete this lead."),
        variant: "destructive",
      });
    } finally {
      setIsDeletingLead(false);
    }
  };

  const handleConvertLead = async () => {
    if (!leadToConvert) return;
    setIsConvertingLead(true);
    try {
      const savedLead = isSyntheticLead(leadToConvert)
        ? await createLead({
            locationId: leadToConvert.location_id,
            contactId: leadToConvert.ghl_contact_id,
            contactName: leadToConvert.contact_name || leadToConvert.lead_name,
            contactEmail: leadToConvert.contact_email || "",
            contactPhone: leadToConvert.contact_phone || "",
            status: leadToConvert.status,
            stage: leadToConvert.stage,
          })
        : leadToConvert;
      const result = await convertLeadToMatter(savedLead);
      setLeads((current) => current.map((lead) => (lead.id === result.lead.id ? result.lead : lead)));
      setLeadToConvert(null);
      toast({
        title: "Lead Converted",
        description: `${result.matter.case_name} is now a matter.`,
      });
      navigate(`/case/${result.matter.id}`);
    } catch (error) {
      toast({
        title: "Lead Not Converted",
        description: getUserFriendlyErrorMessage(error, "Could not convert this lead to a matter."),
        variant: "destructive",
      });
    } finally {
      setIsConvertingLead(false);
    }
  };

  const handleStageChange = async (lead: LeadRecord, pipeline: GhlPipeline, pipelineStageId: string) => {
    if (!canEditLeads) return;
    if (updatingLeadStageRef.current === lead.id) return;
    const stage = pipeline.stages?.find((item) => item.id === pipelineStageId);
    if (!stage || lead.ghl_pipeline_stage_id === pipelineStageId) return;

    updatingLeadStageRef.current = lead.id;
    setUpdatingLeadStageId(lead.id);
    try {
      const leadPayload = {
        ghlPipelineId: pipeline.id,
        ghlPipelineStageId: stage.id,
        stage: stage.name,
        contactId: lead.ghl_contact_id,
        contactName: lead.contact_name || lead.lead_name,
        contactEmail: lead.contact_email || "",
        contactPhone: lead.contact_phone || "",
        locationId: lead.location_id,
        metadata: {
          ghl_pipeline_name: pipeline.name,
          ghl_pipeline_stage_name: stage.name,
        },
      };
      const updatedLead = isSyntheticLead(lead) ? await createLead(leadPayload) : await updateLead(lead.id, leadPayload);
      handleLeadSaved(updatedLead);
      toast({ title: "Lead Stage Updated", description: `${updatedLead.lead_name} moved to ${stage.name}.` });
    } catch (error) {
      toast({
        title: "Lead Stage Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not update this lead stage."),
        variant: "destructive",
      });
    } finally {
      updatingLeadStageRef.current = null;
      setUpdatingLeadStageId(null);
      setDragOverStageId("");
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex w-full flex-col items-start justify-between gap-4 overflow-visible xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <h1 className="shrink-0 text-2xl font-bold tracking-tight text-primary">Leads</h1>
          <Tabs
            value={activeListView.id}
            onValueChange={(value) => setActiveListViewId(value)}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                      aria-label="List actions"
                      tooltip="List actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {displayListViews.slice(6).map((view) => (
                      <DropdownMenuItem key={view.id} onClick={() => setActiveListViewId(view.id)}>
                        {view.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <ControlTooltip label="Add list view">
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
              </ControlTooltip>
            </div>
          </Tabs>
        </div>

        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-3 xl:w-auto">
          {activeListView && !activeListView.system && (
            <ControlTooltip label="Edit list view">
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
            </ControlTooltip>
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
                  aria-label="Search leads"
                  tooltip="Search leads"
                  onClick={() => {
                    if (!isSearchExpanded && !searchTerm) {
                      setIsSearchExpanded(true);
                      window.setTimeout(() => document.getElementById("lead-search")?.focus(), 100);
                    }
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Input
                  id="lead-search"
                  placeholder="Search leads..."
                  className={`h-10 rounded-full bg-background pl-10 transition-all duration-300 ${
                    isSearchExpanded || searchTerm ? "w-full opacity-100" : "w-0 border-0 p-0 opacity-0"
                  }`}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onBlur={() => {
                    if (!searchTerm) setIsSearchExpanded(false);
                  }}
                />
              </div>

              <Popover>
                <ControlTooltip label="Filter leads">
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
                      <div className="text-sm font-semibold">Filter Leads</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={() => setStatusFilter("All")}
                      >
                        Clear
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any status" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          <SelectItem value="All">Any Status</SelectItem>
                          {LEAD_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              <span className="capitalize">{status}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as LeadViewMode)} className="hidden sm:block">
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
              <ControlTooltip label={isCurrentPinnedView ? "Unpin this Leads view" : "Pin this Leads view"}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "hidden h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white sm:inline-flex",
                    isCurrentPinnedView && "bg-primary/10 text-primary hover:bg-[#0484C8] hover:text-white",
                  )}
                  disabled={isSavingPinnedView}
                  onClick={handleTogglePinnedView}
                  aria-label={isCurrentPinnedView ? "Unpin this Leads view" : "Pin this Leads view"}
                >
                  <Pin className={cn("h-4 w-4", isCurrentPinnedView && "fill-current")} />
                </Button>
              </ControlTooltip>
            </>
          )}

          {canCreateLeads && (
            <ControlTooltip label="Add lead">
              <Button
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-[#0484C8]"
                onClick={() => setIsCreateOpen(true)}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </ControlTooltip>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading leads...</span>
        </div>
      ) : displayLeads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-20 text-center">
          <div className="mb-4 rounded-full bg-muted/30 p-4 text-muted-foreground/50">
            <UserRound className="h-8 w-8" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-muted-foreground">No leads found</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground/70">
            Create a lead to sync it to a pipeline opportunity.
          </p>
          {canCreateLeads && (
            <ControlTooltip label="Add lead">
              <Button onClick={() => setIsCreateOpen(true)} size="icon" className="h-12 w-12 rounded-full shadow-sm hover:bg-[#0484C8]">
                <Plus className="h-6 w-6" />
              </Button>
            </ControlTooltip>
          )}
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {sortedLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onEdit={() => setLeadToEdit(lead)}
                  canEdit={canEditLeads}
                  canConvert={canConvertLeads}
                  canDelete={canDeleteLeads}
                  onDelete={() => setLeadToDelete(lead)}
                  onConvert={() => setLeadToConvert(lead)}
                />
              ))}
            </div>
          ) : viewMode === "kanban" ? (
            <LeadKanbanBoard
              leads={sortedLeads}
              pipelines={activePipeline ? [activePipeline] : []}
              dragOverStageId={dragOverStageId}
              updatingLeadStageId={updatingLeadStageId}
              onDragOverStage={setDragOverStageId}
              onStageChange={handleStageChange}
              onEdit={setLeadToEdit}
              canEdit={canEditLeads}
              canConvert={canConvertLeads}
              canDelete={canDeleteLeads}
              onDelete={setLeadToDelete}
              onConvert={setLeadToConvert}
            />
          ) : (
            <LeadTable
              leads={sortedLeads}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
              onEdit={setLeadToEdit}
              canEdit={canEditLeads}
              canConvert={canConvertLeads}
              canDelete={canDeleteLeads}
              onDelete={setLeadToDelete}
              onConvert={setLeadToConvert}
            />
          )}

          {visibleLeads.length === 0 ? (
            <div className="mt-6 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
              <UserRound className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-foreground">No leads found</h3>
              <p className="mt-1 text-muted-foreground">Try adjusting your search or filters.</p>
            </div>
          ) : null}
        </>
      )}

      <LeadSheet
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        locationId={locationId}
        contacts={contacts}
        isLoadingContacts={isLoadingContacts}
        onLoadContacts={loadLeadContacts}
        users={users}
        pipelines={leadPipelines}
        onSaved={handleLeadSaved}
      />
      <LeadSheet
        open={Boolean(leadToEdit)}
        onOpenChange={(open) => {
          if (!open) setLeadToEdit(null);
        }}
        lead={leadToEdit}
        locationId={locationId}
        contacts={contacts}
        isLoadingContacts={isLoadingContacts}
        onLoadContacts={loadLeadContacts}
        users={users}
        pipelines={leadPipelines}
        onSaved={handleLeadSaved}
      />
      <DeleteConfirmationDialog
        open={Boolean(leadToDelete)}
        onOpenChange={(open) => {
          if (!open) setLeadToDelete(null);
        }}
        title="Delete Lead"
        recordName={leadToDelete?.lead_name || "Lead"}
        recordType="lead"
        onConfirm={handleDeleteLead}
        isDeleting={isDeletingLead}
      />
      <LeadListViewSheet
        open={isListViewPanelOpen}
        onOpenChange={setIsListViewPanelOpen}
        editingListView={editingListView}
        pipelines={leadPipelines}
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
      <Sheet
        open={Boolean(leadToConvert)}
        onOpenChange={(open) => {
          if (!open) setLeadToConvert(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
          <SheetHeader className="mb-6 space-y-1">
            <SheetTitle className="text-lg font-semibold">Convert Lead to Matter</SheetTitle>
            <SheetDescription>
              Convert <strong className="text-foreground">{leadToConvert?.lead_name || "this lead"}</strong> into a
              matter? The lead remains in Leads as converted.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => setLeadToConvert(null)} disabled={isConvertingLead}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConvertLead} disabled={isConvertingLead}>
              {isConvertingLead ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Convert
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LeadTable({
  leads,
  handleSort,
  renderSortIcon,
  onEdit,
  canEdit,
  canConvert,
  canDelete,
  onDelete,
  onConvert,
}: {
  leads: LeadRecord[];
  handleSort: (column: LeadSortColumn) => void;
  renderSortIcon: (column: LeadSortColumn) => ReactNode;
  onEdit: (lead: LeadRecord) => void;
  canEdit: boolean;
  canConvert: boolean;
  canDelete: boolean;
  onDelete: (lead: LeadRecord) => void;
  onConvert: (lead: LeadRecord) => void;
}) {
  const columns: Array<[LeadSortColumn, string]> = [
    ["lead_name", "Lead"],
    ["contact_name", "Contact"],
    ["status", "Status"],
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
          {leads.map((lead) => (
              <tr key={lead.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-primary">
                      <UserRound className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium capitalize text-[#2384CA]">{lead.lead_name}</div>
                      <div className="text-xs text-muted-foreground">{getLeadEmailDisplay(lead)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2 text-foreground/70">
                  <div className="flex items-center gap-3">
                    <LeadContactAvatar lead={lead} />
                    <div className="min-w-0">
                      <div className="truncate">{lead.contact_name || lead.ghl_contact_id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <Badge variant="outline" className={cn("border-transparent capitalize", getLeadStatusClass(lead.status))}>
                    {lead.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 capitalize text-foreground/80">{lead.stage || "No stage"}</td>
                <td className="px-4 py-2 text-foreground/70">
                  <div className="flex items-center">
                    <Calendar className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span>{formatDate(lead.updated_at)}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  <LeadActions lead={lead} onEdit={onEdit} canEdit={canEdit} canConvert={canConvert} canDelete={canDelete} onDelete={onDelete} onConvert={onConvert} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadListViewSheet({
  open,
  onOpenChange,
  editingListView,
  pipelines,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingListView: LeadListView | null;
  pipelines: GhlPipeline[];
  onSave: (listView: LeadListView) => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("All");
  const [pipelineId, setPipelineId] = useState("All");

  useEffect(() => {
    if (!open) return;
    setName(editingListView?.name || "");
    setStatus(editingListView?.filters.status || "All");
    setPipelineId(editingListView?.filters.pipelineId || "All");
  }, [editingListView, open]);

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "List Name Required",
        description: "Please enter a name for this lead list view.",
        variant: "destructive",
      });
      return;
    }

    onSave({
      id: editingListView?.id || Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      filters: {
        ...(status !== "All" && { status }),
        ...(pipelineId !== "All" && { pipelineId }),
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
            {editingListView ? "Update the filters for this lead list view." : "Define filters to save a custom view of your leads."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <Label htmlFor="lead-list-name">
              List Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lead-list-name"
              placeholder="e.g. New Leads"
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
                  {LEAD_STATUSES.map((leadStatus) => (
                    <SelectItem key={leadStatus} value={leadStatus}>
                      <span className="capitalize">{leadStatus}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Pipeline</Label>
              <Select value={pipelineId} onValueChange={setPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Pipeline" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value="All">Any Pipeline</SelectItem>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
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
              aria-label="Delete list view"
              tooltip="Delete list view"
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
            <Button className="hover:bg-[#0484C8]" onClick={handleSave}>
              {editingListView ? "Save Changes" : "Save List View"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LeadCard({
  lead,
  onEdit,
  canEdit,
  canConvert,
  canDelete,
  onDelete,
  onConvert,
}: {
  lead: LeadRecord;
  onEdit: () => void;
  canEdit: boolean;
  canConvert: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onConvert: () => void;
}) {
  return (
    <Card className="overflow-hidden transition-all hover:border-primary/50 hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-3 bg-muted/30 p-3">
        <div className="flex min-w-0 items-start gap-3">
          <LeadContactAvatar lead={lead} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-sm font-semibold capitalize leading-tight text-[#2384CA]">
                {lead.lead_name}
              </h3>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span className="truncate text-xs text-muted-foreground">{getLeadEmailDisplay(lead)}</span>
              <Badge variant="outline" className={cn("shrink-0 border-transparent px-2 py-0 text-[10px] capitalize", getLeadStatusClass(lead.status))}>
                {lead.status}
              </Badge>
            </div>
          </div>
        </div>
        <LeadActions lead={lead} onEdit={() => onEdit()} canEdit={canEdit} canConvert={canConvert} canDelete={canDelete} onDelete={() => onDelete()} onConvert={() => onConvert()} />
      </CardHeader>
      <CardContent className="p-3 pt-3">
        <div className="space-y-1.5">
          <LeadMeta label="Contact" value={lead.contact_name || lead.ghl_contact_id} />
          <LeadMeta label="Stage" value={lead.stage || "No stage"} />
          <LeadMeta label="Last Updated" value={formatDate(lead.updated_at)} />
        </div>
      </CardContent>
    </Card>
  );
}

function LeadMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate text-right capitalize text-foreground/80">{value}</span>
    </div>
  );
}

function LeadActions({
  lead,
  onEdit,
  canEdit,
  canConvert,
  canDelete,
  onDelete,
  onConvert,
  triggerClassName,
}: {
  lead: LeadRecord;
  onEdit: (lead: LeadRecord) => void;
  canEdit: boolean;
  canConvert: boolean;
  canDelete: boolean;
  onDelete: (lead: LeadRecord) => void;
  onConvert: (lead: LeadRecord) => void;
  triggerClassName?: string;
}) {
  const isConverted = Boolean(lead.converted_case_id) || lead.status === "converted";
  const isContactOnlyLead = isSyntheticLead(lead);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white", triggerClassName)}
          aria-label="Lead actions"
          tooltip="Lead actions"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-xs">
        {canEdit && (
          <DropdownMenuItem className="py-1.5 text-xs" onClick={() => onEdit(lead)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
        )}
        {canConvert && (
          <DropdownMenuItem
            className={cn("py-1.5 text-xs", isConverted && "pointer-events-none opacity-50")}
            onClick={() => {
              if (!isConverted) onConvert(lead);
            }}
          >
            <ArrowRight className="mr-2 h-3.5 w-3.5" />
            Convert to Matter
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            className={cn("py-1.5 text-xs", isContactOnlyLead && "pointer-events-none opacity-50")}
            onClick={() => {
              if (!isContactOnlyLead) onDelete(lead);
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeadKanbanBoard({
  leads,
  pipelines,
  dragOverStageId,
  updatingLeadStageId,
  onDragOverStage,
  onStageChange,
  onEdit,
  canEdit,
  canConvert,
  canDelete,
  onDelete,
  onConvert,
}: {
  leads: LeadRecord[];
  pipelines: GhlPipeline[];
  dragOverStageId: string;
  updatingLeadStageId: string | null;
  onDragOverStage: (stageId: string) => void;
  onStageChange: (lead: LeadRecord, pipeline: GhlPipeline, stageId: string) => void;
  onEdit: (lead: LeadRecord) => void;
  canEdit: boolean;
  canConvert: boolean;
  canDelete: boolean;
  onDelete: (lead: LeadRecord) => void;
  onConvert: (lead: LeadRecord) => void;
}) {
  if (pipelines.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
        <SquareKanban className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-medium text-foreground">No lead pipeline selected</h3>
        <p className="mt-1 text-muted-foreground">Configure a pipeline for Leads to use the Leads Kanban.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pipelines.map((pipeline) => {
        const stages = pipeline.stages || [];
        const stageIds = new Set(stages.map((stage) => stage.id));
        const pipelineLeads = leads.filter(
          (lead) => lead.ghl_pipeline_id === pipeline.id || stageIds.has(lead.ghl_pipeline_stage_id || ""),
        );

        return (
          <section key={pipeline.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{pipeline.name}</h3>
              <Badge variant="outline" className="rounded-full">
                {pipelineLeads.length} {pipelineLeads.length === 1 ? "lead" : "leads"}
              </Badge>
            </div>

            {stages.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                This pipeline does not have stages yet.
              </div>
            ) : (
              <div className="flex h-[calc(100vh-13rem)] min-h-[32rem] overflow-x-auto pb-2">
                {stages.map((stage, index) => {
                  const stageKey = `${pipeline.id}:${stage.id}`;
                  const stageLeads = pipelineLeads.filter((lead) => lead.ghl_pipeline_stage_id === stage.id);
                  const isDragOver = dragOverStageId === stageKey;
                  const isFirstStage = index === 0;
                  const isLastStage = index === stages.length - 1;

                  return (
                    <div
                      key={stageKey}
                      className={cn(
                        "flex min-w-[22rem] flex-1 flex-col border-y border-r bg-muted/20 transition-colors first:border-l",
                        isFirstStage && "overflow-hidden rounded-tl-md",
                        isLastStage && "overflow-hidden rounded-tr-md",
                        isDragOver && "border-[#0484C8] bg-[#F0F6FF]",
                      )}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = canEdit ? "move" : "none";
                        if (canEdit) onDragOverStage(stageKey);
                      }}
                      onDragLeave={() => {
                        if (dragOverStageId === stageKey) onDragOverStage("");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const leadId = event.dataTransfer.getData("text/plain");
                        const lead = leads.find((item) => item.id === leadId);
                        onDragOverStage("");
                        if (lead && canEdit) onStageChange(lead, pipeline, stage.id);
                      }}
                    >
                      <div
                        className={cn(
                          "relative z-10 flex h-10 items-center justify-between bg-[#0384C8] py-2 pl-3 pr-1 text-white",
                          isFirstStage && "rounded-tl-md",
                          isLastStage && "rounded-tr-md",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-xs font-semibold uppercase tracking-wide text-white">
                            {stage.name}
                          </div>
                          <Badge variant="outline" className="border-transparent bg-white/20 text-xs text-white">
                            {stageLeads.length}
                          </Badge>
                        </div>
                        {!isLastStage ? <ChevronRight className="h-7 w-7 shrink-0 text-white" /> : null}
                      </div>

                      <div className="flex flex-1 flex-col gap-3 p-3">
                        {stageLeads.map((lead) => (
                          <LeadKanbanCard
                            key={lead.id}
                            lead={lead}
                            isUpdating={updatingLeadStageId === lead.id}
                            onEdit={onEdit}
                            canEdit={canEdit}
                            canConvert={canConvert}
                            canDelete={canDelete}
                            onDelete={onDelete}
                            onConvert={onConvert}
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

function LeadKanbanCard({
  lead,
  isUpdating,
  onEdit,
  canEdit,
  canConvert,
  canDelete,
  onDelete,
  onConvert,
}: {
  lead: LeadRecord;
  isUpdating: boolean;
  onEdit: (lead: LeadRecord) => void;
  canEdit: boolean;
  canConvert: boolean;
  canDelete: boolean;
  onDelete: (lead: LeadRecord) => void;
  onConvert: (lead: LeadRecord) => void;
}) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", lead.id);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <Card
      draggable={!isUpdating && canEdit}
      onDragStart={handleDragStart}
      className={cn(
        "cursor-grab overflow-hidden bg-background transition-all hover:border-primary/50 hover:shadow-md active:cursor-grabbing",
        isUpdating && "cursor-wait opacity-60",
      )}
    >
      <CardHeader className="space-y-1.5 bg-muted/30 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <LeadContactAvatar lead={lead} className="h-7 w-7" iconClassName="h-3.5 w-3.5" />
            <h4 className="min-w-0 truncate text-xs font-semibold capitalize leading-tight text-[#2384CA]">{lead.lead_name}</h4>
          </div>
          <LeadActions
            lead={lead}
            onEdit={onEdit}
            canEdit={canEdit}
            canConvert={canConvert}
            canDelete={canDelete}
            onDelete={onDelete}
            onConvert={onConvert}
            triggerClassName="h-6 w-6 shrink-0"
          />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">{getLeadEmailDisplay(lead)}</span>
          <Badge variant="outline" className={cn("shrink-0 border-transparent capitalize", getLeadStatusClass(lead.status))}>
            {lead.status}
          </Badge>
        </div>
      </CardHeader>
    </Card>
  );
}

function LeadSheet({
  open,
  onOpenChange,
  lead,
  locationId,
  contacts,
  isLoadingContacts,
  onLoadContacts,
  users,
  pipelines,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: LeadRecord | null;
  locationId: string;
  contacts: any[];
  isLoadingContacts: boolean;
  onLoadContacts: () => Promise<void>;
  users: AssignableUser[];
  pipelines: GhlPipeline[];
  onSaved: (lead: LeadRecord) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    status: "open",
    contactId: "",
    assignedUserId: "",
    pipelineId: "",
    pipelineStageId: "",
    stage: "",
  });

  useEffect(() => {
    if (open && contacts.length === 0) {
      void onLoadContacts();
    }
  }, [contacts.length, onLoadContacts, open]);

  useEffect(() => {
    if (!open) return;
    if (lead) {
      const selection = getPipelineSelection(pipelines, lead.ghl_pipeline_id, lead.ghl_pipeline_stage_id);
      setForm({
        status: lead.status || "open",
        contactId: lead.ghl_contact_id || "",
        assignedUserId: lead.assigned_user_id || "",
        pipelineId: selection.pipelineId,
        pipelineStageId: selection.pipelineStageId,
        stage: selection.stageName || lead.stage || "",
      });
      return;
    }

    const defaultPipeline = pipelines[0] || null;
    const defaultStage = defaultPipeline?.stages?.[0] || null;
    setForm({
      status: "open",
      contactId: "",
      assignedUserId: "",
      pipelineId: defaultPipeline?.id || "",
      pipelineStageId: defaultStage?.id || "",
      stage: defaultStage?.name || "",
    });
  }, [lead, open, pipelines]);

  const contactOptions = useMemo(
    () =>
      contacts
        .map((contact) => String(contact?.id || contact?._id || contact?.contactId || ""))
        .filter(Boolean),
    [contacts],
  );
  const selectedContact = contacts.find((contact) => {
    const contactId = String(contact?.id || contact?._id || contact?.contactId || "");
    return contactId === form.contactId;
  });
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

  const handleContactChange = (contactId: string) => {
    setForm({
      ...form,
      contactId,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!locationId || !form.contactId) return;

    setSubmitting(true);
    try {
      const payload = {
        locationId,
        status: form.status,
        stage: form.stage,
        contactId: form.contactId,
        contactName: selectedContact ? formatContactName(selectedContact) : lead?.contact_name || "",
        contactEmail: selectedContact ? getContactEmail(selectedContact) : lead?.contact_email || "",
        contactPhone: selectedContact ? getContactPhone(selectedContact) : lead?.contact_phone || "",
        assignedUserId: form.assignedUserId || null,
        ghlPipelineId: form.pipelineId || null,
        ghlPipelineStageId: form.pipelineStageId || null,
        metadata: {
          ...(selectedPipeline ? { ghl_pipeline_name: selectedPipeline.name } : {}),
          ...(form.pipelineStageId ? { ghl_pipeline_stage_name: form.stage } : {}),
        },
      };
      const savedLead = lead && !isSyntheticLead(lead) ? await updateLead(lead.id, payload) : await createLead(payload);
      onSaved(savedLead);
      toast({ title: lead ? "Lead Updated" : "Lead Created", description: `${savedLead.lead_name} has been saved.` });
    } catch (error) {
      toast({
        title: lead ? "Lead Not Updated" : "Lead Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not save this lead."),
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
          <SheetTitle>{lead ? "Edit Lead" : "Add Lead"}</SheetTitle>
          <SheetDescription>
            Leads create pipeline opportunities only. A Matter is created when the lead is converted.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Contact</Label>
            <Select value={form.contactId} onValueChange={handleContactChange}>
              <SelectTrigger>
                <span className={cn(!form.contactId && "text-muted-foreground")}>
                  {selectedContact ? formatContactName(selectedContact) : lead?.contact_name || "Select contact"}
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {isLoadingContacts ? (
                  <SelectItem value="loading-contacts" disabled>
                    Loading contacts...
                  </SelectItem>
                ) : contactOptions.length > 0 ? (
                  contactOptions.map((contactId) => {
                    const contact = contacts.find((item) => String(item?.id || item?._id || item?.contactId || "") === contactId);
                    return (
                      <SelectItem key={contactId} value={contactId}>
                        {formatContactName(contact)}
                      </SelectItem>
                    );
                  })
                ) : (
                  <SelectItem value="no-contacts" disabled>
                    No contacts available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assigned Attorney</Label>
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
                  {LEAD_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span className="capitalize">{status}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={form.pipelineStageId || NO_STAGE_VALUE} onValueChange={handlePipelineStageChange}>
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
              {lead ? "Save Changes" : "Create Lead"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
