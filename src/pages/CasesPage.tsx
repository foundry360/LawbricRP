import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronUp,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAppLocationContext, getContacts } from "@/lib/api";
import { type CaseRecord, createCase, listCases } from "@/lib/cases";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { getAssignableUsers, getUserId, getUserName, type AssignableUser } from "@/lib/users";
import { cn } from "@/lib/utils";

const CASE_STATUSES = ["open", "pending", "closed", "archived"];
const CASE_TYPES = ["General", "Litigation", "Family", "Immigration", "Estate", "Criminal"];
type CaseListView = {
  id: string;
  name: string;
  system?: boolean;
  filters: {
    status?: string;
    caseType?: string;
    stage?: string;
    assignedUserId?: string;
  };
};

const defaultCaseListViews: CaseListView[] = [
  { id: "all", name: "All Cases", system: true, filters: {} },
  { id: "open", name: "Open", system: true, filters: { status: "open" } },
  { id: "pending", name: "Pending", system: true, filters: { status: "pending" } },
  { id: "closed", name: "Closed", system: true, filters: { status: "closed" } },
  { id: "archived", name: "Archived", system: true, filters: { status: "archived" } },
];

function formatContactName(contact: any) {
  return (
    `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim() ||
    contact?.name ||
    contact?.email ||
    "Unnamed contact"
  );
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

export function CasesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [locationId, setLocationId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [assignedUserFilter, setAssignedUserFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [activeListViewId, setActiveListViewId] = useState("all");
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

  useEffect(() => {
    const loadListViews = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const saved = session?.user?.user_metadata?.caseListViews;
      if (Array.isArray(saved) && saved.length > 0) {
        setListViews([...defaultCaseListViews, ...saved.filter((view: CaseListView) => !view.system)]);
      }
    };

    loadListViews().catch((error) => console.error("Failed to load case list views from Supabase", error));
  }, []);

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
        title: "Cases Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load cases. Please try again."),
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

        const [caseRows, contactResponse, assignableUsers] = await Promise.all([
          listCases({ locationId: appLocationId }),
          ghlLocationId ? getContacts(ghlLocationId) : Promise.resolve({ contacts: [] }),
          getAssignableUsers(),
        ]);

        setCases(caseRows);
        setContacts(getArrayFromResponse(contactResponse, "contacts"));
        setUsers(assignableUsers);
      } catch (error) {
        toast({
          title: "Cases Not Loaded",
          description: getUserFriendlyErrorMessage(error, "Could not load case data. Please try again."),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [toast]);

  const activeListView = listViews.find((view) => view.id === activeListViewId) || listViews[0];
  const caseTypeOptions = useMemo(
    () => [...new Set([...CASE_TYPES, ...cases.map((caseRecord) => caseRecord.case_type).filter(Boolean)])],
    [cases],
  );
  const stageOptions = useMemo(
    () => [...new Set(cases.map((caseRecord) => caseRecord.stage).filter(Boolean))],
    [cases],
  );
  const activeFilterCount = [
    typeFilter,
    statusFilter,
    stageFilter,
    assignedUserFilter,
  ].filter((value) => value !== "All").length;

  const filteredCases = useMemo(() => {
    const search = searchTerm.toLowerCase();

    return cases.filter((caseRecord) => {
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
      if (activeListView.filters.assignedUserId && caseRecord.assigned_user_id !== activeListView.filters.assignedUserId) {
        matchesListView = false;
      }

      return matchesSearch && matchesType && matchesStatus && matchesStage && matchesAssigned && matchesListView;
    });
  }, [activeListView, assignedUserFilter, cases, searchTerm, stageFilter, statusFilter, typeFilter]);

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

  return (
    <div className="flex flex-col space-y-6 p-6">
      <CreateCaseSheet
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        contacts={contacts}
        users={users}
        locationId={locationId}
        onCreated={handleCaseCreated}
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
          <h2 className="shrink-0 text-2xl font-bold tracking-tight text-primary">Cases</h2>
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
                {listViews.slice(0, 6).map((view) => (
                  <TabsTrigger
                    key={view.id}
                    value={view.id}
                    className="whitespace-nowrap rounded-full px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                  >
                    {view.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {listViews.length > 6 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {listViews.slice(6).map((view) => (
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
                className="h-8 shrink-0 rounded-full px-3 text-muted-foreground"
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
                  placeholder="Search cases..."
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
                <PopoverContent className="right-0 w-80 p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Filter Cases</div>
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
                      <Select value={typeFilter} onValueChange={(value) => {
                        setTypeFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any practice area" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          <SelectItem value="All">Any Practice Area</SelectItem>
                          {caseTypeOptions.map((caseType) => (
                            <SelectItem key={caseType} value={caseType}>
                              {caseType}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  setViewMode(value as "grid" | "list");
                  setCurrentPage(1);
                }}
                className="hidden sm:block"
              >
                <TabsList className="h-10 rounded-full">
                  <TabsTrigger value="grid" className="rounded-full px-3">
                    <LayoutGrid className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="list" className="rounded-full px-3">
                    <List className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}

          <Button
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading cases...</span>
        </div>
      ) : cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-20 text-center">
          <div className="mb-4 rounded-full bg-muted/30 p-4 text-muted-foreground/50">
            <Briefcase className="h-8 w-8" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-muted-foreground">No cases found</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground/70">Get started by creating your first case.</p>
          <Button onClick={() => setIsCreateOpen(true)} size="icon" className="h-12 w-12 rounded-full shadow-sm">
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {paginatedCases.map((caseRecord) => (
                <CaseCard key={caseRecord.id} caseRecord={caseRecord} onNavigate={() => navigate(`/case/${caseRecord.id}`)} />
              ))}
            </div>
          ) : (
            <CaseTable
              cases={paginatedCases}
              navigate={navigate}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
            />
          )}

          {filteredCases.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
              <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-foreground">No cases found</h3>
              <p className="mt-1 text-muted-foreground">Try adjusting your search or filters.</p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
              {" - "}
              <span className="font-medium text-foreground">{lastVisibleRow}</span>
              {" of "}
              <span className="font-medium text-foreground">{sortedCases.length}</span> cases
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
        </>
      )}
    </div>
  );
}

function CaseCard({ caseRecord, onNavigate }: { caseRecord: CaseRecord; onNavigate: () => void }) {
  return (
    <Card className="cursor-pointer overflow-hidden transition-all hover:border-primary/50 hover:shadow-md" onClick={onNavigate}>
      <CardHeader className="flex flex-row items-start justify-between bg-muted/30 pb-4">
        <div>
          <h3 className="mb-1.5 text-lg capitalize leading-none text-[#2384CA] hover:underline">
            <Link to={`/case/${caseRecord.id}`} onClick={(event) => event.stopPropagation()}>
              {caseRecord.case_name}
            </Link>
          </h3>
          <div className="text-sm text-muted-foreground">{caseRecord.case_number}</div>
        </div>
        <CaseActions onView={onNavigate} />
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-3">
          <Badge variant="outline" className={cn("border-transparent capitalize", getCaseStatusClass(caseRecord.status))}>
            {caseRecord.status}
          </Badge>
          <div className="mt-3 space-y-2 border-t pt-3">
            <CaseMeta label="Practice Area" value={caseRecord.case_type} />
            <CaseMeta label="Stage" value={caseRecord.stage.replace(/_/g, " ")} />
            <CaseMeta label="Client" value={caseRecord.primary_contact_name || caseRecord.ghl_contact_id} />
            <CaseMeta label="Last Updated" value={formatDate(caseRecord.updated_at)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CaseMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-right capitalize text-foreground/80">{value}</span>
    </div>
  );
}

function CaseActions({ onView }: { onView: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
        >
          View
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CaseTable({
  cases,
  navigate,
  handleSort,
  renderSortIcon,
}: {
  cases: CaseRecord[];
  navigate: (path: string) => void;
  handleSort: (column: keyof CaseRecord) => void;
  renderSortIcon: (column: keyof CaseRecord) => ReactNode;
}) {
  const columns: Array<[keyof CaseRecord, string]> = [
    ["case_name", "Case"],
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
          {cases.map((caseRecord) => (
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
                <div className="flex items-center">
                  <User className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span>{caseRecord.primary_contact_name || caseRecord.ghl_contact_id}</span>
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
                <CaseActions onView={() => navigate(`/case/${caseRecord.id}`)} />
              </td>
            </tr>
          ))}
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
        description: "Please enter a name for this case list view.",
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
            {editingListView ? "Update the filters for this case list view." : "Define filters to save a custom view of your cases."}
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
              <Select value={caseType} onValueChange={setCaseType}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Practice Area" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any Practice Area</SelectItem>
                  {caseTypes.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button onClick={handleSave}>{editingListView ? "Save Changes" : "Save List View"}</Button>
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
  locationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: any[];
  users: AssignableUser[];
  locationId: string;
  onCreated: (caseRecord: CaseRecord) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    caseNumber: "",
    caseName: "",
    caseType: "General",
    stage: "intake",
    status: "open",
    contactId: "",
    assignedUserId: "",
    notes: "",
  });

  const selectedContact = contacts.find((contact) => contact.id === form.contactId);
  const selectedUser = users.find((user) => getUserId(user) === form.assignedUserId);

  const resetForm = () => {
    setForm({
      caseNumber: "",
      caseName: "",
      caseType: "General",
      stage: "intake",
      status: "open",
      contactId: "",
      assignedUserId: "",
      notes: "",
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.contactId) {
      toast({ title: "Contact Required", description: "Please select a GHL contact.", variant: "destructive" });
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
        notes: form.notes,
        metadata: {
          assigned_user_name: selectedUser ? getUserName(selectedUser) : "",
        },
      });
      toast({ title: "Case Created", description: `${caseRecord.case_name} has been created.` });
      resetForm();
      onCreated(caseRecord);
    } catch (error) {
      toast({
        title: "Case Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not create the case. Please try again."),
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
          <SheetTitle>Create Case</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Case Number</Label>
            <Input
              value={form.caseNumber}
              onChange={(event) => setForm({ ...form, caseNumber: event.target.value })}
              placeholder="CASE-001"
            />
          </div>

          <div className="space-y-2">
            <Label>Case Name</Label>
            <Input
              value={form.caseName}
              onChange={(event) => setForm({ ...form, caseName: event.target.value })}
              placeholder="Smith v. Acme"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>GHL Contact</Label>
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
              <Label>Case Type</Label>
              <Select value={form.caseType} onValueChange={(caseType) => setForm({ ...form, caseType })}>
                <SelectTrigger>
                  <span>{form.caseType}</span>
                </SelectTrigger>
                <SelectContent>
                  {CASE_TYPES.map((caseType) => (
                    <SelectItem key={caseType} value={caseType}>
                      {caseType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Input value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} />
            </div>
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
              placeholder="Optional context for this case"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Case
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
