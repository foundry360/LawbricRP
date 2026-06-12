import { type DragEvent, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpDown,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
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
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DateTimePicker } from "@/components/DatePicker";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { SearchableSelect } from "@/components/SearchableSelect";
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
import { useColumnOrder, type ReorderableColumn } from "@/hooks/use-column-order";
import { useToast } from "@/hooks/use-toast";
import { getAppLocationContext, getCachedContactsIfAvailable, getContacts } from "@/lib/api";
import { type CaseRecord, listCases } from "@/lib/cases";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPersonName } from "@/lib/names";
import { supabase } from "@/lib/supabase";
import {
  type TaskRecord,
  createTask,
  deleteTask,
  formatTaskStatusLabel,
  generateTaskDueNotifications,
  listTasks,
  updateTask,
} from "@/lib/tasks";
import { getAssignableUsers, getUserId, getUserName, type AssignableUser } from "@/lib/users";
import { cn } from "@/lib/utils";

const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"];
const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];
const RELATED_TYPES = ["general", "case", "contact", "opportunity"];
const UNASSIGNED_USER_VALUE = "__unassigned__";
const TASK_VIEW_MODE_STORAGE_KEY = "lawbric.tasks.viewMode";
const TASK_PINNED_VIEW_MODE_STORAGE_KEY = "lawbric.tasks.pinnedViewMode";
const TASK_PINNED_VIEW_MODE_METADATA_KEY = "taskPinnedViewMode";
const TASK_STATUS_COLUMN_STYLES: Record<string, string> = {
  todo: "bg-sky-50",
  in_progress: "bg-blue-50",
  blocked: "bg-rose-50",
  done: "bg-emerald-50",
  cancelled: "bg-slate-100",
};

function getRelatedTypeLabel(type: string) {
  return type === "case" ? "Matter" : type;
}
type TaskListView = {
  id: string;
  name: string;
  system?: boolean;
  view?: "my" | "open" | "today" | "overdue" | "done";
  filters: {
    status?: string;
    priority?: string;
    relatedCaseId?: string;
    assignedUserId?: string;
  };
};

type TaskViewMode = "grid" | "list" | "kanban";

function isTaskViewMode(value: unknown): value is TaskViewMode {
  return value === "grid" || value === "list" || value === "kanban";
}

function getInitialTaskViewMode(): TaskViewMode {
  if (typeof window === "undefined") return "list";
  const pinnedViewMode = window.localStorage.getItem(TASK_PINNED_VIEW_MODE_STORAGE_KEY);
  if (isTaskViewMode(pinnedViewMode)) return pinnedViewMode;
  const savedViewMode = window.localStorage.getItem(TASK_VIEW_MODE_STORAGE_KEY);
  return isTaskViewMode(savedViewMode) ? savedViewMode : "list";
}

function getInitialPinnedTaskViewMode(): TaskViewMode | null {
  if (typeof window === "undefined") return null;
  const pinnedViewMode = window.localStorage.getItem(TASK_PINNED_VIEW_MODE_STORAGE_KEY);
  return isTaskViewMode(pinnedViewMode) ? pinnedViewMode : null;
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

const defaultTaskListViews: TaskListView[] = [
  { id: "all", name: "All Tasks", system: true, filters: {} },
  { id: "my", name: "My Tasks", system: true, view: "my", filters: {} },
  { id: "open", name: "Open", system: true, view: "open", filters: {} },
  { id: "today", name: "Due Today", system: true, view: "today", filters: {} },
  { id: "overdue", name: "Overdue", system: true, view: "overdue", filters: {} },
  { id: "done", name: "Completed", system: true, view: "done", filters: {} },
];

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function formatContactName(contact: any) {
  const name = `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim() || contact?.name || "";
  return formatPersonName(name) || contact?.email || "Unnamed contact";
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString();
}

function isTaskOverdue(task: TaskRecord) {
  if (!task.due_at || ["done", "cancelled"].includes(task.status)) return false;
  const dueDate = new Date(task.due_at);
  return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
}

function isPrivateTask(task: TaskRecord) {
  return task.metadata?.is_private === true;
}

function formatDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
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

function getTaskStatusClass(status: string) {
  switch (status) {
    case "done":
      return "bg-green-100 text-green-800";
    case "in_progress":
      return "bg-blue-100 text-blue-800";
    case "blocked":
      return "bg-red-100 text-red-800";
    case "cancelled":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-yellow-100 text-yellow-800";
  }
}

function getTaskPriorityClass(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-orange-100 text-orange-800";
    case "low":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function getRelatedLabel(task: TaskRecord) {
  if (task.related_type === "case" && task.case) return task.case.case_name;
  if (task.related_type === "contact") return formatPersonName(task.ghl_contact_name) || task.ghl_contact_id || "Contact";
  if (task.related_type === "opportunity") return task.ghl_opportunity_name || task.ghl_opportunity_id || "Opportunity";
  return "General";
}

function getMatterFilterLabel(value: string, cases: CaseRecord[]) {
  if (value === "All") return "All Matters";
  const caseRecord = cases.find((candidate) => candidate.id === value);
  return caseRecord?.case_name || "Unknown Matter";
}

function getRelatedPath(task: TaskRecord) {
  if (task.related_type === "case" && task.case_id) return `/case/${task.case_id}`;
  if ((task.related_type === "case" || task.related_type === "contact") && task.ghl_contact_id) {
    return `/contact/${task.ghl_contact_id}`;
  }
  return "";
}

function getAssignedName(task: TaskRecord, users: AssignableUser[] = []) {
  const matchedUser = task.assigned_user_id
    ? users.find((user) => getUserId(user) === task.assigned_user_id)
    : null;

  return task.assigned_user?.full_name
    ? formatPersonName(task.assigned_user.full_name)
    : task.assigned_user?.email || (matchedUser ? getUserName(matchedUser) : "Unassigned");
}

function getAssignedFilterLabel(value: string, users: AssignableUser[]) {
  if (value === "All") return "All Users";
  if (value === "unassigned") return "Unassigned";
  const user = users.find((candidate) => getUserId(candidate) === value);
  return user ? getUserName(user) : "Unknown User";
}

export function TasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<TaskRecord | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [activeListViewId, setActiveListViewId] = useState("all");
  const [listViews, setListViews] = useState<TaskListView[]>(defaultTaskListViews);
  const [isListViewPanelOpen, setIsListViewPanelOpen] = useState(false);
  const [editingListView, setEditingListView] = useState<TaskListView | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [relatedFilter, setRelatedFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [assignedUserFilter, setAssignedUserFilter] = useState("All");
  const [viewMode, setViewMode] = useState<TaskViewMode>(getInitialTaskViewMode);
  const [pinnedViewMode, setPinnedViewMode] = useState<TaskViewMode | null>(getInitialPinnedTaskViewMode);
  const [isSavingPinnedView, setIsSavingPinnedView] = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState("");
  const [updatingTaskStatusId, setUpdatingTaskStatusId] = useState<string | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<keyof TaskRecord>("due_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const loadingContactsRef = useRef(false);
  const routeTaskId = searchParams.get("taskId") || "";

  const loadData = async () => {
    setLoading(true);
    try {
      const context = await getAppLocationContext();
      const appLocationId = context.location?.id || "";
      const nextGhlLocationId = context.location?.ghlLocationId || "";
      setLocationId(appLocationId);
      setGhlLocationId(nextGhlLocationId);
      if (appLocationId) {
        await generateTaskDueNotifications(appLocationId).catch((error) => {
          console.error("Failed to generate task due notifications", error);
        });
      }

      const [{ data: authData }, taskRows, caseRows, assignableUsers] = await Promise.all([
        import("@/lib/supabase").then(({ supabase }) => supabase.auth.getUser()),
        listTasks({ locationId: appLocationId }),
        listCases({ locationId: appLocationId }),
        getAssignableUsers(),
      ]);

      setCurrentUserId(authData.user?.id || "");
      setTasks(taskRows);
      setCases(caseRows);
      setUsers(assignableUsers);
    } catch (error) {
      toast({
        title: "Tasks Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load tasks. Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadTaskPreferences = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userMetadata = session?.user?.user_metadata || {};
      const saved = userMetadata.taskListViews;
      if (Array.isArray(saved) && saved.length > 0) {
        setListViews([...defaultTaskListViews, ...saved.filter((view: TaskListView) => !view.system)]);
      }

      const savedPinnedViewMode = userMetadata[TASK_PINNED_VIEW_MODE_METADATA_KEY];
      if (isTaskViewMode(savedPinnedViewMode)) {
        setPinnedViewMode(savedPinnedViewMode);
        setViewMode(savedPinnedViewMode);
        window.localStorage.setItem(TASK_PINNED_VIEW_MODE_STORAGE_KEY, savedPinnedViewMode);
      } else {
        setPinnedViewMode(null);
        window.localStorage.removeItem(TASK_PINNED_VIEW_MODE_STORAGE_KEY);
      }
    };

    loadTaskPreferences().catch((error) => console.error("Failed to load task preferences from Supabase", error));
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!routeTaskId || loading || !locationId) return;

    let cancelled = false;

    const openTaskFromRoute = async () => {
      const existingTask = tasks.find((task) => task.id === routeTaskId);
      if (existingTask) {
        setEditingTask(existingTask);
        setIsTaskSheetOpen(true);
      } else {
        const { data, error } = await supabase
          .from("tasks")
          .select(`
            *,
            case:cases(id, case_number, case_name, primary_contact_name),
            assigned_user:profiles!tasks_assigned_user_id_fkey(id, full_name, email, avatar_url)
          `)
          .eq("location_id", locationId)
          .eq("id", routeTaskId)
          .is("deleted_at", null)
          .maybeSingle();

        if (cancelled) return;
        if (error) throw new Error(error.message);
        if (data) {
          const routedTask = data as TaskRecord;
          setTasks((current) => (current.some((task) => task.id === routedTask.id) ? current : [routedTask, ...current]));
          setEditingTask(routedTask);
          setIsTaskSheetOpen(true);
        }
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("taskId");
      setSearchParams(nextParams, { replace: true });
    };

    openTaskFromRoute().catch((error) => {
      if (cancelled) return;
      toast({
        title: "Task Not Opened",
        description: getUserFriendlyErrorMessage(error, "Could not open this task from the notification."),
        variant: "destructive",
      });
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("taskId");
      setSearchParams(nextParams, { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [loading, locationId, routeTaskId, searchParams, setSearchParams, tasks, toast]);

  const loadTaskContacts = useCallback(async () => {
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
        description: getUserFriendlyErrorMessage(error, "Could not load contacts for the task form."),
        variant: "destructive",
      });
    } finally {
      loadingContactsRef.current = false;
      setIsLoadingContacts(false);
    }
  }, [contacts.length, ghlLocationId, toast]);

  useEffect(() => {
    window.localStorage.setItem(TASK_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const handleTogglePinnedView = async () => {
    const nextPinnedViewMode = pinnedViewMode === viewMode ? null : viewMode;
    setPinnedViewMode(nextPinnedViewMode);
    if (nextPinnedViewMode) {
      window.localStorage.setItem(TASK_PINNED_VIEW_MODE_STORAGE_KEY, nextPinnedViewMode);
    } else {
      window.localStorage.removeItem(TASK_PINNED_VIEW_MODE_STORAGE_KEY);
    }

    setIsSavingPinnedView(true);
    try {
      await supabase.auth.updateUser({
        data: {
          [TASK_PINNED_VIEW_MODE_METADATA_KEY]: nextPinnedViewMode,
        },
      });
      toast({
        title: nextPinnedViewMode ? "Tasks View Pinned" : "Tasks View Unpinned",
        description: nextPinnedViewMode
          ? `Tasks will open in ${nextPinnedViewMode === "grid" ? "card" : nextPinnedViewMode} view.`
          : "Tasks will open in the last view used on this device.",
      });
    } catch (error) {
      setPinnedViewMode(pinnedViewMode);
      if (pinnedViewMode) {
        window.localStorage.setItem(TASK_PINNED_VIEW_MODE_STORAGE_KEY, pinnedViewMode);
      } else {
        window.localStorage.removeItem(TASK_PINNED_VIEW_MODE_STORAGE_KEY);
      }
      toast({
        title: "Pinned View Not Saved",
        description: getUserFriendlyErrorMessage(error, "Could not save your pinned Tasks view."),
        variant: "destructive",
      });
    } finally {
      setIsSavingPinnedView(false);
    }
  };

  const saveListViewsToSupabase = async (newListViews: TaskListView[]) => {
    setListViews(newListViews);
    const customViews = newListViews.filter((view) => !view.system);
    await supabase.auth.updateUser({ data: { taskListViews: customViews } }).catch((error) => {
      console.error("Failed to save task list views to Supabase", error);
    });
  };

  const activeListView = listViews.find((view) => view.id === activeListViewId) || listViews[0];
  const matterFilterOptions = useMemo(() => ["All", ...cases.map((caseRecord) => caseRecord.id)], [cases]);
  const activeFilterCount = [
    relatedFilter,
    statusFilter,
    priorityFilter,
    assignedUserFilter,
  ].filter((value) => value !== "All").length;

  const filteredTasks = useMemo(() => {
    const search = searchTerm.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return tasks.filter((task) => {
      const dueDate = task.due_at ? new Date(task.due_at) : null;
      const matchesSearch =
        task.title.toLowerCase().includes(search) ||
        (task.description || "").toLowerCase().includes(search) ||
        getRelatedLabel(task).toLowerCase().includes(search) ||
        getAssignedName(task, users).toLowerCase().includes(search);
      const matchesRelated =
        relatedFilter === "All" || (task.related_type === "case" && task.case_id === relatedFilter);
      const matchesStatus = statusFilter === "All" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "All" || task.priority === priorityFilter;
      const matchesAssigned =
        assignedUserFilter === "All" ||
        (assignedUserFilter === "unassigned" ? !task.assigned_user_id : task.assigned_user_id === assignedUserFilter);
      let matchesView = true;

      if (activeListView.view === "my") matchesView = task.assigned_user_id === currentUserId;
      if (activeListView.view === "open") matchesView = !["done", "cancelled"].includes(task.status);
      if (activeListView.view === "done") matchesView = task.status === "done";
      if (activeListView.view === "today") {
        matchesView = Boolean(dueDate && dueDate >= today && dueDate < tomorrow && task.status !== "done");
      }
      if (activeListView.view === "overdue") {
        matchesView = Boolean(dueDate && dueDate < today && task.status !== "done" && task.status !== "cancelled");
      }
      if (activeListView.filters.status && task.status !== activeListView.filters.status) matchesView = false;
      if (activeListView.filters.priority && task.priority !== activeListView.filters.priority) matchesView = false;
      if (activeListView.filters.relatedCaseId) {
        matchesView = task.related_type === "case" && task.case_id === activeListView.filters.relatedCaseId;
      }
      if (activeListView.filters.assignedUserId) {
        matchesView = activeListView.filters.assignedUserId === "unassigned"
          ? !task.assigned_user_id
          : task.assigned_user_id === activeListView.filters.assignedUserId;
      }

      return matchesSearch && matchesRelated && matchesStatus && matchesPriority && matchesAssigned && matchesView;
    });
  }, [activeListView, assignedUserFilter, currentUserId, priorityFilter, relatedFilter, searchTerm, statusFilter, tasks, users]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      const rawAValue = a[sortColumn] ?? "";
      const rawBValue = b[sortColumn] ?? "";
      let aValue: string | number = String(rawAValue).toLowerCase();
      let bValue: string | number = String(rawBValue).toLowerCase();

      if (sortColumn === "due_at" || sortColumn === "updated_at" || sortColumn === "created_at") {
        aValue = rawAValue ? new Date(String(rawAValue)).getTime() : Number.MAX_SAFE_INTEGER;
        bValue = rawBValue ? new Date(String(rawBValue)).getTime() : Number.MAX_SAFE_INTEGER;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredTasks, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedTasks.length / itemsPerPage);
  const safeTotalPages = Math.max(1, totalPages);
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = sortedTasks.length === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(effectiveCurrentPage * itemsPerPage, sortedTasks.length);
  const visiblePageItems = getVisiblePageItems(effectiveCurrentPage, safeTotalPages);
  const paginatedTasks = sortedTasks.slice((effectiveCurrentPage - 1) * itemsPerPage, effectiveCurrentPage * itemsPerPage);

  const handleSort = (column: keyof TaskRecord) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (column: keyof TaskRecord) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    return sortDirection === "asc" ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />;
  };

  const handleTaskSaved = (task: TaskRecord) => {
    setTasks((current) => {
      const exists = current.some((item) => item.id === task.id);
      return exists ? current.map((item) => (item.id === task.id ? task : item)) : [task, ...current];
    });
    setEditingTask(null);
    setIsTaskSheetOpen(false);
    loadData();
  };

  const handleTaskStatusChange = async (task: TaskRecord, status: string) => {
    if (task.status === status || updatingTaskStatusId) return;

    const previousTasks = tasks;
    const updatedAt = new Date().toISOString();
    setUpdatingTaskStatusId(task.id);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status,
              completed_at: status === "done" ? item.completed_at || updatedAt : null,
              updated_at: updatedAt,
            }
          : item,
      ),
    );

    try {
      const savedTask = await updateTask({ locationId, taskId: task.id, status });
      setTasks((current) => current.map((item) => (item.id === savedTask.id ? savedTask : item)));
      toast({ title: "Task Updated", description: `${savedTask.title} moved to ${formatTaskStatusLabel(status)}.` });
    } catch (error) {
      setTasks(previousTasks);
      toast({
        title: "Task Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not move this task. Please try again."),
        variant: "destructive",
      });
    } finally {
      setUpdatingTaskStatusId(null);
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeletingTask(true);
    try {
      await deleteTask({ locationId, taskId: taskToDelete.id });
      setTasks((current) => current.filter((task) => task.id !== taskToDelete.id));
      toast({ title: "Task Deleted", description: `${taskToDelete.title} was removed from normal views.` });
      setTaskToDelete(null);
    } catch (error) {
      toast({
        title: "Task Not Deleted",
        description: getUserFriendlyErrorMessage(error, "Could not delete this task. Please try again."),
        variant: "destructive",
      });
    } finally {
      setIsDeletingTask(false);
    }
  };

  return (
    <div className="flex flex-col space-y-6 p-6">
      <TaskSheet
        open={isTaskSheetOpen}
        onOpenChange={(open) => {
          setIsTaskSheetOpen(open);
          if (!open) setEditingTask(null);
        }}
        task={editingTask}
        cases={cases}
        contacts={contacts}
        isLoadingContacts={isLoadingContacts}
        onLoadContacts={loadTaskContacts}
        users={users}
        locationId={locationId}
        onSaved={handleTaskSaved}
      />
      <DeleteConfirmationDialog
        open={Boolean(taskToDelete)}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
        title="Delete task?"
        recordType="task"
        recordName={taskToDelete?.title}
        isDeleting={isDeletingTask}
        onConfirm={handleDeleteTask}
      />
      <TaskListViewSheet
        open={isListViewPanelOpen}
        onOpenChange={setIsListViewPanelOpen}
        editingListView={editingListView}
        users={users}
        cases={cases}
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
          <h2 className="shrink-0 text-2xl font-bold tracking-tight text-primary">Tasks</h2>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                      aria-label="List actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
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
                      window.setTimeout(() => document.getElementById("task-search")?.focus(), 100);
                    }
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Input
                  id="task-search"
                  placeholder="Search tasks..."
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
                <ControlTooltip label="Filter tasks">
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
                      <div className="text-sm font-semibold">Filter Tasks</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          setRelatedFilter("All");
                          setStatusFilter("All");
                          setPriorityFilter("All");
                          setAssignedUserFilter("All");
                          setCurrentPage(1);
                        }}
                      >
                        Clear
                      </Button>
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
                          {TASK_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              <span>{formatTaskStatusLabel(status)}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={priorityFilter} onValueChange={(value) => {
                        setPriorityFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any priority" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          <SelectItem value="All">Any Priority</SelectItem>
                          {TASK_PRIORITIES.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              <span className="capitalize">{priority}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Related To</Label>
                      <SearchableSelect
                        value={relatedFilter}
                        onValueChange={(value) => {
                          setRelatedFilter(value);
                          setCurrentPage(1);
                        }}
                        options={matterFilterOptions}
                        placeholder="All Matters"
                        searchPlaceholder="Search matters..."
                        emptyMessage="No matters found."
                        getOptionLabel={(value) => getMatterFilterLabel(value, cases)}
                        contentClassName="z-[150]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Assigned To</Label>
                      <Select value={assignedUserFilter} onValueChange={(value) => {
                        setAssignedUserFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <span className={cn(assignedUserFilter === "All" && "text-muted-foreground")}>
                            {getAssignedFilterLabel(assignedUserFilter, users)}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="z-[150] max-h-72 overflow-y-auto">
                          <SelectItem value="All">All Users</SelectItem>
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
                  setViewMode(value as TaskViewMode);
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
              <ControlTooltip label={pinnedViewMode === viewMode ? "Unpin this Tasks view" : "Pin this Tasks view"}>
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
                  aria-label={pinnedViewMode === viewMode ? "Unpin this Tasks view" : "Pin this Tasks view"}
                >
                  <Pin className={cn("h-4 w-4", pinnedViewMode === viewMode && "fill-current")} />
                </Button>
              </ControlTooltip>
            </>
          )}

          <ControlTooltip label="Add task">
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-[#0484C8]"
              onClick={() => {
                setEditingTask(null);
                setIsTaskSheetOpen(true);
              }}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </ControlTooltip>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading tasks...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-20 text-center">
          <div className="mb-4 rounded-full bg-muted/30 p-4 text-muted-foreground/50">
            <CheckSquare className="h-8 w-8" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-muted-foreground">No tasks found</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground/70">Get started by creating your first task.</p>
          <Button onClick={() => setIsTaskSheetOpen(true)} size="icon" className="h-12 w-12 rounded-full shadow-sm hover:bg-[#0484C8]">
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {paginatedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  users={users}
                  onEdit={() => {
                    setEditingTask(task);
                    setIsTaskSheetOpen(true);
                  }}
                  onDelete={() => setTaskToDelete(task)}
                />
              ))}
            </div>
          ) : viewMode === "kanban" ? (
            <TaskKanbanBoard
              tasks={sortedTasks}
              dragOverStatus={dragOverStatus}
              updatingTaskStatusId={updatingTaskStatusId}
              onDragOverStatus={setDragOverStatus}
              onStatusChange={handleTaskStatusChange}
              onEdit={(task) => {
                setEditingTask(task);
                setIsTaskSheetOpen(true);
              }}
              onDelete={setTaskToDelete}
            />
          ) : (
            <TaskTable
              tasks={paginatedTasks}
              users={users}
              navigate={navigate}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
              onEdit={(task) => {
                setEditingTask(task);
                setIsTaskSheetOpen(true);
              }}
            onDelete={setTaskToDelete}
            />
          )}

          {filteredTasks.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
              <CheckSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-foreground">No tasks found</h3>
              <p className="mt-1 text-muted-foreground">Try adjusting your search or filters.</p>
            </div>
          )}

          {viewMode !== "kanban" ? (
          <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
              {" - "}
              <span className="font-medium text-foreground">{lastVisibleRow}</span>
              {" of "}
              <span className="font-medium text-foreground">{sortedTasks.length}</span> tasks
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

function TaskCard({
  task,
  users,
  onEdit,
  onDelete,
}: {
  task: TaskRecord;
  users: AssignableUser[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="cursor-pointer overflow-hidden transition-all hover:border-primary/50 hover:shadow-md" onClick={onEdit}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 bg-muted/30 p-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-tight text-[#2384CA]">
                <span className="truncate">{task.title}</span>
                {isPrivateTask(task) ? <Eye className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Private task" /> : null}
              </h3>
              <Badge variant="outline" className={cn("shrink-0 border-transparent px-2 py-0 text-[10px] capitalize", getTaskStatusClass(task.status))}>
                {formatTaskStatusLabel(task.status)}
              </Badge>
            </div>
            <div className="mt-1 truncate text-xs capitalize text-muted-foreground">{(task.related_type || "general").replace(/_/g, " ")}</div>
          </div>
        </div>
        <TaskActions onView={onEdit} onEdit={onEdit} onDelete={onDelete} />
      </CardHeader>
      <CardContent className="space-y-1.5 p-3 pt-3">
        <TaskMeta label="Priority" value={task.priority} />
        <TaskMeta label="Related To" value={getRelatedLabel(task)} />
        <TaskMeta label="Assigned To" value={getAssignedName(task, users)} />
        <TaskMeta
          label="Due"
          value={formatDate(task.due_at)}
          valueClassName={cn(isTaskOverdue(task) && "font-medium text-red-600")}
        />
      </CardContent>
    </Card>
  );
}

function TaskKanbanBoard({
  tasks,
  dragOverStatus,
  updatingTaskStatusId,
  onDragOverStatus,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  tasks: TaskRecord[];
  dragOverStatus: string;
  updatingTaskStatusId: string | null;
  onDragOverStatus: (status: string) => void;
  onStatusChange: (task: TaskRecord, status: string) => void;
  onEdit: (task: TaskRecord) => void;
  onDelete: (task: TaskRecord) => void;
}) {
  const statuses = Array.from(
    new Set([...TASK_STATUSES, ...tasks.map((task) => task.status).filter(Boolean)]),
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>, status: string) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    const task = tasks.find((item) => item.id === taskId);
    onDragOverStatus("");
    if (task) onStatusChange(task, status);
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[32rem] overflow-x-auto pb-2">
      {statuses.map((status, index) => {
        const columnTasks = tasks.filter((task) => task.status === status);
        const isDragOver = dragOverStatus === status;

        return (
          <div
            key={status}
            className={cn(
              "flex min-w-[22rem] flex-1 flex-col border-y border-r bg-muted/20 transition-colors first:border-l",
              index === 0 && "overflow-hidden rounded-tl-md",
              index === statuses.length - 1 && "overflow-hidden rounded-tr-md",
              isDragOver && "border-[#0484C8] bg-[#F0F6FF]",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              onDragOverStatus(status);
            }}
            onDragLeave={() => {
              if (dragOverStatus === status) onDragOverStatus("");
            }}
            onDrop={(event) => handleDrop(event, status)}
          >
            <div
              className={cn(
                "relative z-10 flex h-10 items-center justify-between bg-[#0384C8] py-2 pl-3 pr-1 text-white",
                index === 0 && "rounded-tl-md",
                index === statuses.length - 1 && "rounded-tr-md",
              )}
            >
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-white">
                  {formatTaskStatusLabel(status)}
                </div>
                <Badge variant="outline" className="border-transparent bg-white/20 text-xs text-white">
                  {columnTasks.length}
                </Badge>
              </div>
              {index < statuses.length - 1 ? (
                <ChevronRight className="h-7 w-7 shrink-0 text-white" />
              ) : null}
            </div>

            <div className="flex flex-1 flex-col gap-3 p-3">
              {columnTasks.map((task) => (
                <KanbanTaskCard
                  key={task.id}
                  task={task}
                  updating={updatingTaskStatusId === task.id}
                  onEdit={() => onEdit(task)}
                  onDelete={() => onDelete(task)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanTaskCard({
  task,
  updating,
  onEdit,
  onDelete,
}: {
  task: TaskRecord;
  updating: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", task.id);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <Card
      draggable={!updating}
      className={cn(
        "cursor-grab overflow-hidden bg-background transition-all hover:border-primary/50 hover:shadow-md active:cursor-grabbing",
        updating && "cursor-wait opacity-60",
      )}
      onClick={onEdit}
      onDragStart={handleDragStart}
    >
      <CardHeader className="space-y-1.5 bg-muted/30 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold leading-tight text-[#2384CA]">
            <span className="truncate">{task.title}</span>
            {isPrivateTask(task) ? <Eye className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Private task" /> : null}
          </h3>
          <TaskActions
            onView={onEdit}
            onEdit={onEdit}
            onDelete={onDelete}
            triggerClassName="h-6 w-6 shrink-0"
            iconClassName="h-3.5 w-3.5"
          />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {getRelatedLabel(task)}
        </div>
        <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", isTaskOverdue(task) && "font-medium text-red-600")}>
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{formatDate(task.due_at)}</span>
        </div>
      </CardHeader>
    </Card>
  );
}

function TaskMeta({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn("truncate text-right text-foreground/80", valueClassName)}>{value}</span>
    </div>
  );
}

function TaskActions({
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
          className={cn("h-8 w-8 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white", triggerClassName)}
          aria-label="Task actions"
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

function TaskTable({
  tasks,
  users,
  navigate,
  handleSort,
  renderSortIcon,
  onEdit,
  onDelete,
}: {
  tasks: TaskRecord[];
  users: AssignableUser[];
  navigate: (path: string) => void;
  handleSort: (column: keyof TaskRecord) => void;
  renderSortIcon: (column: keyof TaskRecord) => ReactNode;
  onEdit: (task: TaskRecord) => void;
  onDelete: (task: TaskRecord) => void;
}) {
  const columns: Array<ReorderableColumn<keyof TaskRecord & string>> = [
    { key: "title", label: "Task" },
    { key: "related_type", label: "Related To" },
    { key: "assigned_user_id", label: "Assigned To" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "due_at", label: "Due" },
  ];
  const { orderedColumns, getColumnDragProps, shouldSuppressColumnClick } = useColumnOrder("lawbric.tableColumns.tasks", columns);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
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
          {tasks.map((task) => {
            const relatedPath = getRelatedPath(task);
            const renderCell = (column: keyof TaskRecord & string) => {
              switch (column) {
                case "title":
                  return (
                    <td key={column} className="px-4 py-2">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-primary">
                          <CheckSquare className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5 text-[#2384CA] hover:underline">
                            <span className="truncate">{task.title}</span>
                            {isPrivateTask(task) ? <Eye className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Private task" /> : null}
                          </div>
                          {task.description ? <div className="line-clamp-1 text-xs text-muted-foreground">{task.description}</div> : null}
                        </div>
                      </div>
                    </td>
                  );
                case "related_type":
                  return (
                    <td key={column} className="px-4 py-2 text-foreground/80">
                      {relatedPath ? (
                        <Link to={relatedPath} onClick={(event) => event.stopPropagation()} className="text-[#2384CA] hover:underline">
                          {getRelatedLabel(task)}
                        </Link>
                      ) : (
                        getRelatedLabel(task)
                      )}
                    </td>
                  );
                case "assigned_user_id":
                  return (
                    <td key={column} className="px-4 py-2 text-foreground/70">
                      <div className="flex items-center">
                        <User className="mr-2 h-3.5 w-3.5 shrink-0" />
                        <span>{getAssignedName(task, users)}</span>
                      </div>
                    </td>
                  );
                case "priority":
                  return (
                    <td key={column} className="px-4 py-2">
                      <Badge variant="outline" className={cn("border-transparent capitalize", getTaskPriorityClass(task.priority))}>
                        {task.priority}
                      </Badge>
                    </td>
                  );
                case "status":
                  return (
                    <td key={column} className="px-4 py-2">
                      <Badge variant="outline" className={cn("border-transparent capitalize", getTaskStatusClass(task.status))}>
                        {formatTaskStatusLabel(task.status)}
                      </Badge>
                    </td>
                  );
                case "due_at":
                  return (
                    <td key={column} className="px-4 py-2 text-foreground/70">
                      <div className={cn("flex items-center", isTaskOverdue(task) && "font-medium text-red-600")}>
                        <Calendar className="mr-2 h-3.5 w-3.5 shrink-0" />
                        <span>{formatDate(task.due_at)}</span>
                      </div>
                    </td>
                  );
                default:
                  return null;
              }
            };

            return (
              <tr
                key={task.id}
                className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
                onClick={() => onEdit(task)}
              >
                {orderedColumns.map((column) => renderCell(column.key))}
                <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                  <TaskActions
                    onView={() => onEdit(task)}
                    onEdit={() => onEdit(task)}
                    onDelete={() => onDelete(task)}
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

function TaskListViewSheet({
  open,
  onOpenChange,
  editingListView,
  users,
  cases,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingListView: TaskListView | null;
  users: AssignableUser[];
  cases: CaseRecord[];
  onSave: (listView: TaskListView) => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("All");
  const [priority, setPriority] = useState("All");
  const [relatedCaseId, setRelatedCaseId] = useState("All");
  const [assignedUserId, setAssignedUserId] = useState("All");
  const matterFilterOptions = useMemo(() => ["All", ...cases.map((caseRecord) => caseRecord.id)], [cases]);

  useEffect(() => {
    if (!open) return;

    setName(editingListView?.name || "");
    setStatus(editingListView?.filters.status || "All");
    setPriority(editingListView?.filters.priority || "All");
    setRelatedCaseId(editingListView?.filters.relatedCaseId || "All");
    setAssignedUserId(editingListView?.filters.assignedUserId || "All");
  }, [editingListView, open]);

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "List Name Required",
        description: "Please enter a name for this task list view.",
        variant: "destructive",
      });
      return;
    }

    onSave({
      id: editingListView?.id || Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      filters: {
        ...(status !== "All" && { status }),
        ...(priority !== "All" && { priority }),
        ...(relatedCaseId !== "All" && { relatedCaseId }),
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
            {editingListView ? "Update the filters for this task list view." : "Define filters to save a custom view of your tasks."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <Label htmlFor="task-list-name">
              List Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="task-list-name"
              placeholder="e.g. Urgent Client Tasks"
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
                  {TASK_STATUSES.map((taskStatus) => (
                    <SelectItem key={taskStatus} value={taskStatus}>
                      <span>{formatTaskStatusLabel(taskStatus)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any Priority</SelectItem>
                  {TASK_PRIORITIES.map((taskPriority) => (
                    <SelectItem key={taskPriority} value={taskPriority}>
                      <span className="capitalize">{taskPriority}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Related To</Label>
              <SearchableSelect
                value={relatedCaseId}
                onValueChange={setRelatedCaseId}
                options={matterFilterOptions}
                placeholder="All Matters"
                searchPlaceholder="Search matters..."
                emptyMessage="No matters found."
                getOptionLabel={(value) => getMatterFilterLabel(value, cases)}
              />
            </div>

            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger>
                  <span className={cn(assignedUserId === "All" && "text-muted-foreground")}>
                    {getAssignedFilterLabel(assignedUserId, users)}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value="All">All Users</SelectItem>
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
        </div>

        <div className="flex justify-between gap-3">
          {editingListView ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                onDelete(editingListView.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="hover:bg-[#0484C8]" onClick={handleSave}>{editingListView ? "Save Changes" : "Create List"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TaskSheet({
  open,
  onOpenChange,
  task,
  cases,
  contacts,
  isLoadingContacts,
  onLoadContacts,
  users,
  locationId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRecord | null;
  cases: CaseRecord[];
  contacts: any[];
  isLoadingContacts: boolean;
  onLoadContacts: () => Promise<void>;
  users: AssignableUser[];
  locationId: string;
  onSaved: (task: TaskRecord) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "todo",
    priority: "normal",
    dueAt: "",
    reminderAt: "",
    assignedUserId: "",
    relatedType: "general",
    caseId: "none",
    contactId: "none",
    opportunityId: "",
    opportunityName: "",
    isPrivate: false,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: task?.title || "",
      description: task?.description || "",
      status: task?.status || "todo",
      priority: task?.priority || "normal",
      dueAt: formatDateTimeInput(task?.due_at),
      reminderAt: formatDateTimeInput(task?.reminder_at),
      assignedUserId: task?.assigned_user_id || "",
      relatedType: task?.related_type || "general",
      caseId: task?.case_id || "none",
      contactId: task?.ghl_contact_id || "none",
      opportunityId: task?.ghl_opportunity_id || "",
      opportunityName: task?.ghl_opportunity_name || "",
      isPrivate: Boolean(task?.metadata?.is_private),
    });
  }, [open, task]);

  const selectedCase = cases.find((caseRecord) => caseRecord.id === form.caseId);
  const selectedContact = contacts.find((contact) => contact.id === form.contactId);
  const selectedUser = users.find((user) => getUserId(user) === form.assignedUserId);
  const userSelectOptions = useMemo(
    () => [UNASSIGNED_USER_VALUE, ...users.map((user) => getUserId(user)).filter(Boolean)],
    [users],
  );

  useEffect(() => {
    if (open && form.relatedType === "contact" && contacts.length === 0) {
      void onLoadContacts();
    }
  }, [contacts.length, form.relatedType, onLoadContacts, open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Task Title Required", description: "Please enter a task title.", variant: "destructive" });
      return;
    }
    if (form.relatedType === "case" && form.caseId === "none") {
      toast({ title: "Matter Required", description: "Please select a matter for this task.", variant: "destructive" });
      return;
    }
    if (form.relatedType === "contact" && form.contactId === "none") {
      toast({ title: "Contact Required", description: "Please select a contact for this task.", variant: "destructive" });
      return;
    }

    const privacyChanged = !task || form.isPrivate !== Boolean(task?.metadata?.is_private);
    const payload = {
      locationId,
      title: form.title,
      description: form.description,
      status: form.status,
      priority: form.priority,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
      assignedUserId: form.assignedUserId || null,
      relatedType: form.relatedType,
      caseId: form.relatedType === "case" ? form.caseId : null,
      ghlContactId:
        form.relatedType === "contact"
          ? form.contactId
          : form.relatedType === "case"
            ? selectedCase?.ghl_contact_id || null
            : null,
      ghlContactName:
        form.relatedType === "contact"
          ? selectedContact
            ? formatContactName(selectedContact)
            : ""
          : form.relatedType === "case"
            ? selectedCase?.primary_contact_name || null
            : null,
      ghlOpportunityId: form.relatedType === "opportunity" ? form.opportunityId : null,
      ghlOpportunityName: form.relatedType === "opportunity" ? form.opportunityName : null,
      ...(privacyChanged ? { metadata: { ...(task?.metadata || {}), is_private: form.isPrivate } } : {}),
    };

    setSubmitting(true);
    try {
      const savedTask = task ? await updateTask({ ...payload, taskId: task.id }) : await createTask(payload);
      onSaved(savedTask);
      toast({ title: task ? "Task Updated" : "Task Created", description: `${savedTask.title} has been saved.` });
    } catch (error) {
      toast({
        title: task ? "Task Not Updated" : "Task Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not save this task. Please try again."),
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
          <SheetTitle>{task ? "View Task" : "Create Task"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Task Title</Label>
            <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <SearchableSelect
                value={form.assignedUserId || UNASSIGNED_USER_VALUE}
                onValueChange={(assignedUserId) =>
                  setForm({
                    ...form,
                    assignedUserId: assignedUserId === UNASSIGNED_USER_VALUE ? "" : assignedUserId,
                  })
                }
                options={userSelectOptions}
                placeholder="Search and select user"
                searchPlaceholder="Search users..."
                emptyMessage="No users found."
                getOptionLabel={(userId) => {
                  if (userId === UNASSIGNED_USER_VALUE) return "Unassigned";
                  const user = users.find((candidate) => getUserId(candidate) === userId);
                  return user ? getUserName(user) : userId;
                }}
                className={cn(!selectedUser && "text-muted-foreground")}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:h-10">
              <Label htmlFor="task-private" className="cursor-pointer whitespace-nowrap text-sm">
                Private
              </Label>
              <button
                id="task-private"
                type="button"
                role="switch"
                aria-checked={form.isPrivate}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                  form.isPrivate ? "border-primary bg-primary" : "border-border bg-muted",
                )}
                onClick={() => setForm({ ...form, isPrivate: !form.isPrivate })}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                    form.isPrivate ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Related Type</Label>
              <Select
                value={form.relatedType}
                onValueChange={(relatedType) =>
                  {
                    if (relatedType === "contact") void onLoadContacts();
                    setForm({
                    ...form,
                    relatedType,
                    caseId: relatedType === "case" ? form.caseId : "none",
                    contactId: relatedType === "contact" ? form.contactId : "none",
                  });
                  }
                }
              >
                <SelectTrigger>
                  <span className="capitalize">{getRelatedTypeLabel(form.relatedType)}</span>
                </SelectTrigger>
                <SelectContent>
                  {RELATED_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="capitalize">{getRelatedTypeLabel(type)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(priority) => setForm({ ...form, priority })}>
                <SelectTrigger>
                  <span className="capitalize">{form.priority}</span>
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      <span className="capitalize">{priority}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.relatedType === "case" && (
            <div className="space-y-2">
              <Label>Matter</Label>
              <Select value={form.caseId} onValueChange={(caseId) => setForm({ ...form, caseId })}>
                <SelectTrigger>
                  <span className={cn(form.caseId === "none" && "text-muted-foreground")}>
                    {selectedCase ? selectedCase.case_name : "Select matter"}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value="none">Select matter</SelectItem>
                  {cases.map((caseRecord) => (
                    <SelectItem key={caseRecord.id} value={caseRecord.id}>
                      {caseRecord.case_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.relatedType === "contact" && (
            <div className="space-y-2">
              <Label>Contact</Label>
              <Select value={form.contactId} onValueChange={(contactId) => setForm({ ...form, contactId })}>
                <SelectTrigger>
                  <span className={cn(form.contactId === "none" && "text-muted-foreground")}>
                    {selectedContact ? formatContactName(selectedContact) : "Select contact"}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value="none">Select contact</SelectItem>
                  {isLoadingContacts ? (
                    <SelectItem value="loading-contacts" disabled>
                      Loading contacts...
                    </SelectItem>
                  ) : contacts.length > 0 ? (
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
          )}

          {form.relatedType === "opportunity" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Opportunity Name</Label>
                <Input value={form.opportunityName} onChange={(event) => setForm({ ...form, opportunityName: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Opportunity ID</Label>
                <Input value={form.opportunityId} onChange={(event) => setForm({ ...form, opportunityId: event.target.value })} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}>
                <SelectTrigger>
                  <span>{formatTaskStatusLabel(form.status)}</span>
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span>{formatTaskStatusLabel(status)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <DateTimePicker
                value={form.dueAt}
                onValueChange={(dueAt) => setForm({ ...form, dueAt })}
                placeholder="Select due date"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reminder Date</Label>
            <DateTimePicker
              value={form.reminderAt}
              onValueChange={(reminderAt) => setForm({ ...form, reminderAt })}
              placeholder="Select reminder date"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {task ? "Save Task" : "Create Task"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
