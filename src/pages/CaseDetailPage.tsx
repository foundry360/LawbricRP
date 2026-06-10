import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpDown,
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  DollarSign,
  ExternalLink,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Link2,
  Loader2,
  Mail,
  MoreVertical,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/DatePicker";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NoteRichTextBody, NoteRichTextEditor } from "@/components/NoteRichText";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UserLink } from "@/components/UserLink";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getActiveGhlLocationId, getAppLocationContext, getContacts, getPipelines, type GhlPipeline } from "@/lib/api";
import {
  addCaseParty,
  createCaseEvent,
  createCaseNote,
  createCaseTask,
  deleteCaseNote,
  getCase,
  listCases,
  type CaseRecord,
  type CaseDetail,
  updateCase,
  updateCaseParty,
  updateCaseNote,
} from "@/lib/cases";
import {
  createExternalDocument,
  deleteDocument,
  getAllDocuments,
  getDocumentCapabilities,
  getDocumentFolderName,
  getDocumentName,
  getStorageTypeLabel,
  moveDocument,
  renameDocument,
  renameDocumentFolder,
  uploadDocument,
  type DocumentCapabilities,
  type DocumentRecord,
  type DocumentStorageType,
} from "@/lib/documents";
import { deleteTask, formatTaskStatusLabel, updateTask } from "@/lib/tasks";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPersonName } from "@/lib/names";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import { getAssignableUsers, getUserId, getUserName, type AssignableUser } from "@/lib/users";
import { cn } from "@/lib/utils";

const CASE_DETAIL_TAB_TRIGGER_CLASS =
  "rounded-none border-b-2 border-border py-3 text-muted-foreground/70 data-[state=active]:border-[#2384CA] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
const CASE_TYPE_OPTIONS = PRACTICE_AREAS;
const CASE_STATUS_OPTIONS = ["open", "pending", "closed", "archived"];
const NO_PIPELINE_VALUE = "none";
const NO_STAGE_VALUE = "none";
const UNASSIGNED_USER_VALUE = "__unassigned__";
const ALL_MATTER_DOCUMENT_STORAGE_TYPES = "all";
const ALL_MATTER_DOCUMENT_FOLDERS = "all";
const ALL_MATTER_CONTACT_TYPES = "all";
const ALL_MATTER_CONTACT_ROLES = "all";
const ALL_MATTER_TASK_STATUSES = "all";
const ALL_MATTER_TASK_PRIORITIES = "all";
const ALL_MATTER_TASK_ASSIGNEES = "all";
const UNFILED_FOLDER_NAME = "Unfiled";
const TASK_STATUS_OPTIONS = ["todo", "in_progress", "blocked", "done", "cancelled"];
const TASK_PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"];
const MATTER_CONTACT_TYPE_OPTIONS = [
  "Related Contact",
  "Client",
  "Family Member",
  "Attorney",
  "Opposing Party",
  "Witness",
  "Expert",
  "Medical Provider",
  "Insurance",
  "Court",
  "Other",
];
const MATTER_CONTACT_ROLE_OPTIONS = [
  "Associated Contact",
  "Spouse",
  "Parent",
  "Child",
  "Guardian",
  "Referring Attorney",
  "Co-Counsel",
  "Opposing Counsel",
  "Witness",
  "Expert Witness",
  "Treating Provider",
  "Adjuster",
  "Court Clerk",
  "Other",
];
type MatterTaskSortColumn = "title" | "assigned_to" | "priority" | "status" | "due_at";
type MatterDocumentDisplayMode = "documents" | "folders";
type MatterDocumentSortColumn = "name" | "storage_type" | "folder" | "created_at";
type MatterDocumentFolderSortColumn = "folder" | "matter" | "documents" | "latest_uploaded" | "last_user_edit";
type MatterDocumentFolderGroup = {
  id: string;
  folderName: string;
  documents: DocumentRecord[];
};

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
    pipelineId: pipeline?.id || "",
    pipelineStageId: stage?.id || "",
    stageName: stage?.name || "",
  };
}

async function loadMatterPipelines() {
  const context = await getAppLocationContext();
  const ghlLocationId = context.location?.ghlLocationId || "";
  return ghlLocationId ? getPipelines(ghlLocationId) : [];
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getCaseDisplayName(caseRecord: Pick<CaseRecord, "case_name" | "case_number">) {
  return caseRecord.case_number
    ? `${caseRecord.case_name} (${caseRecord.case_number})`
    : caseRecord.case_name;
}

function formatDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function formatTaskDate(value?: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(date);
  dueDate.setHours(0, 0, 0, 0);

  const dayDifference = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Tomorrow";
  if (dayDifference === -1) return "Yesterday";
  if (dayDifference > 1) return `In ${dayDifference} days`;
  return `${Math.abs(dayDifference)} days ago`;
}

function isCompletedTask(task: any) {
  return ["done", "completed"].includes(String(task.status || "").toLowerCase());
}

function getMatterTaskAssignedInfo(task: any, users: AssignableUser[]) {
  const assignedUserId = task.assigned_user?.id || task.assigned_user_id || "";
  const matchedUser = users.find((user) => getUserId(user) === assignedUserId);
  const assignedUserName =
    (task.assigned_user?.full_name ? formatPersonName(task.assigned_user.full_name) : "") ||
    task.assigned_user?.email ||
    (matchedUser ? getUserName(matchedUser) : "");
  const assignedUserEmail = task.assigned_user?.email || matchedUser?.email;
  const assignedUserAvatar =
    task.assigned_user?.avatar_url ||
    task.assigned_user?.profilePhoto ||
    matchedUser?.avatar_url ||
    matchedUser?.profilePhoto ||
    "";

  return { assignedUserId, matchedUser, assignedUserName, assignedUserEmail, assignedUserAvatar };
}

function getStatusClass(status: string) {
  switch (status) {
    case "open":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "closed":
      return "bg-gray-100 text-gray-800";
    case "done":
    case "completed":
      return "bg-blue-100 text-blue-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function money(amountCents?: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((amountCents || 0) / 100);
}

function formatContactAddress(rawContact: any) {
  return [
    rawContact?.address1,
    [rawContact?.city, `${rawContact?.state || ""} ${rawContact?.postalCode || ""}`.trim()]
      .filter(Boolean)
      .join(", "),
    rawContact?.country === "US" ? "United States" : rawContact?.country,
  ]
    .filter(Boolean)
    .join("\n") || "Not set";
}

function normalizeMatterContactMatch(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function getMatterContactId(contact: any) {
  return String(contact?.id || contact?._id || contact?.contactId || "");
}

function getMatterContactName(contact: any) {
  const rawName = `${contact?.firstName || ""} ${contact?.lastName || ""}`.trim() || contact?.name || contact?.fullName || "";
  return formatPersonName(rawName) || contact?.email || "Unnamed contact";
}

function getMatterContactEmail(contact: any) {
  return contact?.email || contact?.primaryEmail || "";
}

function getMatterContactPhone(contact: any) {
  return contact?.phone || contact?.primaryPhone || "";
}

function getMatterContactOptionLabel(contact?: any) {
  if (!contact) return "";
  const name = getMatterContactName(contact);
  const email = getMatterContactEmail(contact);
  return `${name}${email ? ` (${email})` : ""}`;
}

function getMatterPartyDisplayName(party: any) {
  return formatPersonName(party?.name || "") || party?.email || party?.phone || "Unnamed contact";
}

function getPaginationItems(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    if (index > 0 && page - sortedPages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });

  return items;
}

function getDisplayFolderName(document: DocumentRecord) {
  return getDocumentFolderName(document) || UNFILED_FOLDER_NAME;
}

function getDocumentExtension(document: DocumentRecord) {
  const name = getDocumentName(document).toLowerCase();
  return name.includes(".") ? name.split(".").pop() || "" : "";
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

function getDocumentUserName(document?: DocumentRecord | null) {
  return (
    document?.updated_user?.full_name ||
    document?.updated_user?.email ||
    document?.uploaded_user?.full_name ||
    document?.uploaded_user?.email ||
    "Unknown user"
  );
}

function getDocumentUserId(document?: DocumentRecord | null) {
  return document?.updated_user?.id || document?.updated_by || document?.uploaded_user?.id || document?.uploaded_by || "";
}

function formatDocumentCount(count: number) {
  return `${count} ${count === 1 ? "document" : "documents"}`;
}

function getVisiblePageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    if (index > 0 && page - sortedPages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });

  return items;
}

function getNoteAuthorName(note: { created_by?: string | null }, users: AssignableUser[]) {
  if (!note.created_by) return "Unknown user";
  const matchedUser = users.find((user) => getUserId(user) === note.created_by);
  return matchedUser ? getUserName(matchedUser) : "Unknown user";
}

export function CaseDetailPage() {
  const { caseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<any | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [isNoteSheetOpen, setIsNoteSheetOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [noteSheetMode, setNoteSheetMode] = useState<"view" | "edit" | "create">("create");
  const [activeDetailTab, setActiveDetailTab] = useState("dashboard");
  const [contactAddress, setContactAddress] = useState("Not set");
  const [users, setUsers] = useState<AssignableUser[]>([]);

  const loadCase = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const caseDetail = await getCase(caseId);
      setDetail(caseDetail);
      setContactAddress("Not set");

      if (caseDetail.case.ghl_contact_id) {
        try {
          const data: any = await apiClient(`/contacts/${encodeURIComponent(caseDetail.case.ghl_contact_id)}`);
          const rawContact = data.contact || data.data?.contact || data.data || data;
          setContactAddress(formatContactAddress(rawContact));
        } catch (error) {
          console.error("Failed to load contact address", error);
        }
      }
    } catch (error) {
      toast({
        title: "Matter Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load this matter. Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCase();
  }, [caseId]);

  useEffect(() => {
    const requestedTab = (location.state as { activeDetailTab?: string } | null)?.activeDetailTab;
    if (requestedTab) setActiveDetailTab(requestedTab);
  }, [location.state]);

  useEffect(() => {
    getAssignableUsers()
      .then(setUsers)
      .catch((error) => console.error("Failed to load assignable users", error));
  }, []);

  const handleDeleteMatterNote = async (note: any) => {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;

    try {
      await deleteCaseNote({ noteId: note.id });
      setSelectedNote(null);
      setNoteSheetMode("create");
      await loadCase();
      toast({ title: "Note Deleted", description: "The matter note has been deleted." });
    } catch (error) {
      toast({
        title: "Note Not Deleted",
        description: getUserFriendlyErrorMessage(error, "Could not delete this matter note. Please try again."),
        variant: "destructive",
      });
    }
  };

  const handleDeleteMatterTask = async () => {
    if (!taskToDelete || !detail) return;
    setIsDeletingTask(true);
    try {
      await deleteTask({ locationId: detail.case.location_id, taskId: taskToDelete.id });
      setTaskToDelete(null);
      await loadCase();
      toast({ title: "Task Deleted", description: `${taskToDelete.title} was permanently deleted.` });
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

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto w-full px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-16 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Briefcase className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-foreground">Matter not found</h3>
          <p className="mb-6 max-w-md text-muted-foreground">
            The matter you are looking for might have been deleted or does not exist.
          </p>
          <Link to="/cases" className="text-sm text-primary hover:underline">
            Back to matters
          </Link>
        </div>
      </div>
    );
  }

  const assignedUserName =
    detail.assignments.find((assignment) => assignment.is_primary)?.assigned_user?.full_name ||
    detail.assignments.find((assignment) => assignment.is_primary)?.assigned_user?.email ||
    detail.assignments[0]?.assigned_user?.full_name ||
    detail.assignments[0]?.assigned_user?.email ||
    detail.contactAssignment?.assigned_user?.full_name ||
    detail.contactAssignment?.assigned_user?.email ||
    "Unassigned";
  const assignedUserId =
    detail.assignments.find((assignment) => assignment.is_primary)?.assigned_user_id ||
    detail.assignments[0]?.assigned_user_id ||
    detail.case.assigned_user_id ||
    detail.contactAssignment?.assigned_user_id ||
    "";
  const sourceAttorneyUserId = detail.case.source_attorney_user_id || "";
  const sourceAttorneyMetadataName =
    typeof detail.case.metadata?.source_attorney_name === "string" ? detail.case.metadata.source_attorney_name.trim() : "";
  const sourceAttorneyUser =
    users.find((user) => getUserId(user) === sourceAttorneyUserId) ||
    users.find(
      (user) =>
        sourceAttorneyMetadataName &&
        getUserName(user).toLowerCase() === sourceAttorneyMetadataName.toLowerCase(),
    );
  const sourceAttorneyLinkUserId = sourceAttorneyUserId || (sourceAttorneyUser ? getUserId(sourceAttorneyUser) : "");
  const sourceAttorneyName = sourceAttorneyUser ? getUserName(sourceAttorneyUser) : sourceAttorneyMetadataName || "Unassigned";
  const contactEmail = detail.case.primary_contact_email || "";
  const contactPhone = detail.case.primary_contact_phone || "";
  const clientName = formatPersonName(detail.case.primary_contact_name) || detail.case.ghl_contact_id || "Unknown contact";

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] w-full flex-col overflow-hidden px-4 pb-2 pt-2 sm:px-6">
      <EditCaseSheet
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        detail={detail}
        users={users}
        assignedUserId={assignedUserId}
        onSaved={(caseRecord) => {
          setDetail({ ...detail, case: caseRecord });
          loadCase();
        }}
      />
      <CreateMatterTaskSheet
        open={isCreateTaskOpen}
        onOpenChange={(open) => {
          setIsCreateTaskOpen(open);
          if (!open) setSelectedTask(null);
        }}
        task={selectedTask}
        detail={detail}
        users={users}
        defaultAssignedUserId={assignedUserId}
        onCreated={loadCase}
      />
      <DeleteConfirmationDialog
        open={Boolean(taskToDelete)}
        onOpenChange={(open) => {
          if (!open) setTaskToDelete(null);
        }}
        title="Permanently delete task?"
        recordType="task"
        recordName={taskToDelete?.title}
        isDeleting={isDeletingTask}
        onConfirm={handleDeleteMatterTask}
      />
      <MatterNoteSheet
        open={isNoteSheetOpen}
        onOpenChange={(open) => {
          setIsNoteSheetOpen(open);
          if (!open) {
            setSelectedNote(null);
            setNoteSheetMode("create");
          }
        }}
        detail={detail}
        noteRecord={selectedNote}
        mode={noteSheetMode}
        users={users}
        onChanged={() => {
          setSelectedNote(null);
          setNoteSheetMode("create");
          loadCase();
        }}
      />
      <div className="shrink-0 border-b border-border pb-4">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-background bg-blue-50 text-primary shadow-sm">
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="mr-1 text-2xl font-bold text-foreground">{detail.case.case_name}</h1>
                <Badge variant="outline" className="h-6 shrink-0 border-transparent bg-gray-100 px-3 font-semibold text-gray-900">
                  {detail.case.case_type}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("h-6 shrink-0 border-transparent px-3 capitalize", getStatusClass(detail.case.status))}
                >
                  {detail.case.status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex w-full gap-3 md:w-auto md:justify-self-end">
            <Button
              size="icon"
              className="h-10 w-10 rounded-full p-0"
              disabled={!contactEmail}
              title="Email"
              aria-label="Email"
              onClick={() => {
                if (contactEmail) window.location.href = `mailto:${contactEmail}`;
              }}
            >
              <Mail className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
              disabled={!contactPhone}
              title="Call"
              aria-label="Call"
              onClick={() => {
                if (contactPhone) window.location.href = `tel:${contactPhone}`;
              }}
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
              title="Edit"
              aria-label="Edit"
              onClick={() => setIsEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
              title="Add Task"
              aria-label="Add Task"
              onClick={() => {
                setSelectedTask(null);
                setIsCreateTaskOpen(true);
              }}
            >
              <CheckSquare className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
              title="Add Note"
              aria-label="Add Note"
              onClick={() => {
                setSelectedNote(null);
                setNoteSheetMode("create");
                setIsNoteSheetOpen(true);
              }}
            >
              <NotebookPen className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden border-b border-border lg:grid-cols-[25fr_75fr] lg:divide-x lg:divide-border">
        <div className="hover-scrollbar h-full overflow-y-auto py-6 lg:pr-6">
          <div className="mb-2 border-b border-border pb-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Link to="/cases" className="text-muted-foreground transition-colors hover:text-foreground" title="Back to matters">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              Matter Details
            </h2>
          </div>
          <Accordion type="multiple" defaultValue={["case", "client", "system"]} className="w-full">
            <AccordionItem value="case">
              <AccordionTrigger>Matter Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <DetailRow label="Matter Number" value={detail.case.case_number} />
                  <DetailRow label="Practice Area" value={detail.case.case_type} />
                  <DetailRow label="Lead Attorney" value={<UserLink userId={assignedUserId} name={assignedUserName} />} />
                  <DetailRow
                    label="Source Attorney"
                    value={<UserLink userId={sourceAttorneyLinkUserId} user={sourceAttorneyUser} name={sourceAttorneyName} />}
                  />
                  <DetailRow label="Status" value={detail.case.status} className="capitalize" />
                  <DetailRow label="Stage" value={detail.case.stage.replace(/_/g, " ")} className="capitalize" />
                  <DetailRow label="Opened" value={formatDateTime(detail.case.created_at)} />
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="client">
              <AccordionTrigger>Client Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <DetailRow
                    label="Name"
                    value={
                      <Link to={`/contact/${detail.case.ghl_contact_id}`} className="text-[#2384CA] hover:underline">
                        {clientName}
                      </Link>
                    }
                  />
                  <DetailRow label="Email" value={detail.case.primary_contact_email || "Not set"} />
                  <DetailRow label="Phone" value={detail.case.primary_contact_phone || "Not set"} />
                  <DetailRow label="Address" value={contactAddress} className="whitespace-pre-line" />
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="system">
              <AccordionTrigger>System Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <DetailRow label="Lead Attorney" value={<UserLink userId={assignedUserId} name={assignedUserName} />} />
                  <DetailRow label="Updated" value={formatDateTime(detail.case.updated_at)} />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="h-full overflow-hidden lg:px-6">
          <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab} className="flex h-full min-h-0 w-full flex-col">
            <div className="shrink-0 bg-background pb-4 pt-6">
              <TabsList className="grid h-auto w-full grid-cols-4 rounded-none bg-transparent p-0 xl:grid-cols-8">
                <TabsTrigger value="dashboard" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Dashboard</TabsTrigger>
                <TabsTrigger value="tasks" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Tasks</TabsTrigger>
                <TabsTrigger value="contacts" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Contacts</TabsTrigger>
                <TabsTrigger value="notes" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Notes</TabsTrigger>
                <TabsTrigger value="timeline" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Timeline</TabsTrigger>
                <TabsTrigger value="events" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Events</TabsTrigger>
                <TabsTrigger value="documents" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Documents</TabsTrigger>
                <TabsTrigger value="financials" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Financials</TabsTrigger>
              </TabsList>
            </div>

            <div className="hover-scrollbar min-h-0 flex-1 overflow-y-auto pb-6">
              <TabsContent value="dashboard" className="m-0">
                <MatterDashboardTab detail={detail} />
              </TabsContent>
              <TabsContent value="tasks" className="m-0">
                <TasksTab
                  detail={detail}
                  users={users}
                  onTaskClick={(task) => {
                    setSelectedTask(task);
                    setIsCreateTaskOpen(true);
                  }}
                  onTaskCreate={() => {
                    setSelectedTask(null);
                    setIsCreateTaskOpen(true);
                  }}
                  onTaskDelete={setTaskToDelete}
                />
              </TabsContent>
              <TabsContent value="contacts" className="m-0">
                <ContactsTab detail={detail} onChanged={loadCase} />
              </TabsContent>
              <TabsContent value="notes" className="m-0">
                <NotesTab
                  detail={detail}
                  users={users}
                  onViewNote={(note) => {
                    setSelectedNote(note);
                    setNoteSheetMode("view");
                    setIsNoteSheetOpen(true);
                  }}
                  onEditNote={(note) => {
                    setSelectedNote(note);
                    setNoteSheetMode("edit");
                    setIsNoteSheetOpen(true);
                  }}
                  onDeleteNote={handleDeleteMatterNote}
                />
              </TabsContent>
              <TabsContent value="timeline" className="m-0">
                <TimelineTab detail={detail} onChanged={loadCase} />
              </TabsContent>
              <TabsContent value="events" className="m-0">
                <EventsTab detail={detail} onChanged={loadCase} />
              </TabsContent>
              <TabsContent value="documents" className="m-0">
                <DocumentsTab
                  detail={detail}
                  onChanged={loadCase}
                  onDocumentView={(document) =>
                    navigate(`/documents/${document.id}`, {
                      state: { documentViewerOrigin: "matterDocuments", caseId: detail.case.id },
                    })
                  }
                />
              </TabsContent>
              <TabsContent value="financials" className="m-0">
                <FinancialsTab detail={detail} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function EditCaseSheet({
  open,
  onOpenChange,
  detail,
  users,
  assignedUserId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: CaseDetail;
  users: AssignableUser[];
  assignedUserId: string;
  onSaved: (caseRecord: CaseDetail["case"]) => void;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [pipelines, setPipelines] = useState<GhlPipeline[]>([]);
  const [form, setForm] = useState({
    caseNumber: detail.case.case_number,
    caseName: detail.case.case_name,
    caseType: detail.case.case_type,
    status: detail.case.status,
    stage: detail.case.stage,
    pipelineId: detail.case.ghl_pipeline_id || "",
    pipelineStageId: detail.case.ghl_pipeline_stage_id || "",
    assignedUserId,
    sourceAttorneyUserId: detail.case.source_attorney_user_id || "",
  });

  useEffect(() => {
    if (!open) return;
    const selection = getPipelineSelection(pipelines, detail.case.ghl_pipeline_id, detail.case.ghl_pipeline_stage_id);
    setForm({
      caseNumber: detail.case.case_number,
      caseName: detail.case.case_name,
      caseType: detail.case.case_type,
      status: detail.case.status,
      stage: detail.case.stage,
      pipelineId: selection.pipelineId,
      pipelineStageId: selection.pipelineStageId,
      assignedUserId,
      sourceAttorneyUserId: detail.case.source_attorney_user_id || "",
    });
  }, [
    assignedUserId,
    detail.case.case_name,
    detail.case.case_number,
    detail.case.case_type,
    detail.case.ghl_pipeline_id,
    detail.case.ghl_pipeline_stage_id,
    detail.case.source_attorney_user_id,
    detail.case.stage,
    detail.case.status,
    open,
    pipelines,
  ]);

  useEffect(() => {
    if (!open) return;
    loadMatterPipelines()
      .then(setPipelines)
      .catch((error) => {
        console.error("Could not load matter pipelines", error);
        setPipelines([]);
      });
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.caseName.trim() || !form.caseNumber.trim()) {
      toast({
        title: "Matter Details Required",
        description: "Please enter both a matter number and matter name.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const caseRecord = await updateCase({
        caseId: detail.case.id,
        caseNumber: form.caseNumber,
        caseName: form.caseName,
        caseType: form.caseType,
        status: form.status,
        stage: form.stage,
        ghlPipelineId: form.pipelineId || null,
        ghlPipelineStageId: form.pipelineStageId || null,
        assignedUserId: form.assignedUserId || null,
        sourceAttorneyUserId: form.sourceAttorneyUserId || null,
        metadata: {
          source_attorney_name: selectedSourceAttorney ? getUserName(selectedSourceAttorney) : "",
          ...(selectedPipeline ? { ghl_pipeline_name: selectedPipeline.name } : {}),
          ...(form.pipelineStageId ? { ghl_pipeline_stage_name: form.stage } : {}),
        },
      });
      onSaved(caseRecord);
      onOpenChange(false);
      toast({ title: "Matter Updated", description: "Matter details have been saved." });
    } catch (error) {
      toast({
        title: "Matter Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not update this matter. Please try again."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const caseTypeOptions = CASE_TYPE_OPTIONS.includes(form.caseType) ? CASE_TYPE_OPTIONS : [form.caseType, ...CASE_TYPE_OPTIONS];
  const selectedUser = users.find((user) => getUserId(user) === form.assignedUserId);
  const selectedSourceAttorney = users.find((user) => getUserId(user) === form.sourceAttorneyUserId);
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Matter Details</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Matter Number</Label>
            <Input
              value={form.caseNumber}
              onChange={(event) => setForm({ ...form, caseNumber: event.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Matter Name</Label>
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
            <Label>Lead Attorney</Label>
            <Select value={form.assignedUserId} onValueChange={(nextAssignedUserId) => setForm({ ...form, assignedUserId: nextAssignedUserId })}>
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
            <Label>Source Attorney</Label>
            <Select
              value={form.sourceAttorneyUserId}
              onValueChange={(sourceAttorneyUserId) => setForm({ ...form, sourceAttorneyUserId })}
            >
              <SelectTrigger>
                <span className={cn(!form.sourceAttorneyUserId && "text-muted-foreground")}>
                  {selectedSourceAttorney ? getUserName(selectedSourceAttorney) : "Unassigned"}
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
                <span className={!form.pipelineId ? "text-muted-foreground" : undefined}>
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
                  {CASE_STATUS_OPTIONS.map((status) => (
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

function CreateMatterTaskSheet({
  open,
  onOpenChange,
  task,
  detail,
  users,
  defaultAssignedUserId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any | null;
  detail: CaseDetail;
  users: AssignableUser[];
  defaultAssignedUserId: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: "",
    dueAt: "",
    reminderAt: "",
    status: "todo",
    priority: "normal",
    assignedUserId: defaultAssignedUserId || "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const selectedUser = users.find((user) => getUserId(user) === form.assignedUserId);
  const userSelectOptions = useMemo(
    () => [UNASSIGNED_USER_VALUE, ...users.map((user) => getUserId(user)).filter(Boolean)],
    [users],
  );

  useEffect(() => {
    if (!open) return;

    setForm({
      title: task?.title || "",
      dueAt: formatDateTimeInput(task?.due_at),
      reminderAt: formatDateTimeInput(task?.reminder_at),
      status: task?.status || "todo",
      priority: task?.priority || "normal",
      assignedUserId: task?.assigned_user_id || defaultAssignedUserId || "",
      description: task?.description || "",
    });
  }, [defaultAssignedUserId, open, task]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Task Title Required", description: "Please enter a task title.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      if (task) {
        await updateTask({
          taskId: task.id,
          caseId: detail.case.id,
          title: form.title,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
          status: form.status,
          priority: form.priority,
          assignedUserId: form.assignedUserId || null,
          description: form.description,
          relatedType: "case",
        });
      } else {
        await createCaseTask({
          caseId: detail.case.id,
          title: form.title,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
          status: form.status,
          priority: form.priority,
          assignedUserId: form.assignedUserId || null,
          description: form.description,
        });
      }
      onCreated();
      onOpenChange(false);
      toast({
        title: task ? "Task Updated" : "Task Created",
        description: task ? `${form.title} has been saved.` : `${form.title} has been added to this matter.`,
      });
    } catch (error) {
      toast({
        title: task ? "Task Not Updated" : "Task Not Created",
        description: getUserFriendlyErrorMessage(error, `Could not ${task ? "update" : "create"} this task. Please try again.`),
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
          <SheetTitle>{task ? "View Task" : "Create Task"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Task Title</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
          </div>

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

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}>
              <SelectTrigger>
                <span>{formatTaskStatusLabel(form.status)}</span>
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span>{formatTaskStatusLabel(status)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <DateTimePicker
                value={form.dueAt}
                onValueChange={(dueAt) => setForm({ ...form, dueAt })}
                placeholder="Select due date"
              />
            </div>
            <div className="space-y-2">
              <Label>Reminder</Label>
              <DateTimePicker
                value={form.reminderAt}
                onValueChange={(reminderAt) => setForm({ ...form, reminderAt })}
                placeholder="Select reminder"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(priority) => setForm({ ...form, priority })}>
              <SelectTrigger>
                <span className="capitalize">{form.priority}</span>
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITY_OPTIONS.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    <span className="capitalize">{priority}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Description"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting || !form.title.trim()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {task ? "Save Task" : "Create Task"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function MatterNoteSheet({
  open,
  onOpenChange,
  detail,
  noteRecord,
  mode,
  users,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: CaseDetail;
  noteRecord?: any | null;
  mode: "view" | "edit" | "create";
  users: AssignableUser[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isViewingNote = Boolean(noteRecord) && mode === "view";
  const isEditingNote = Boolean(noteRecord) && mode === "edit";
  const sheetTitle = isViewingNote ? "View Note" : isEditingNote ? "Edit Note" : "Add Note";

  useEffect(() => {
    if (open) setNote(noteRecord?.body || "");
  }, [open, noteRecord]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) {
      toast({ title: "Note Required", description: "Please enter a note.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      if (isEditingNote) {
        await updateCaseNote({ noteId: noteRecord.id, body: note });
      } else {
        await createCaseNote({ caseId: detail.case.id, body: note });
      }
      onChanged();
      onOpenChange(false);
      toast({ title: isEditingNote ? "Note Updated" : "Note Created", description: "The matter note has been saved." });
    } catch (error) {
      toast({
        title: isEditingNote ? "Note Not Updated" : "Note Not Added",
        description: getUserFriendlyErrorMessage(error, "Could not save this matter note. Please try again."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader className="flex flex-row items-center justify-start gap-2">
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Note</Label>
            <NoteRichTextEditor value={note} onChange={setNote} readOnly={isViewingNote} placeholder="Add a matter note" />
            {noteRecord ? (
              <p className="text-xs text-muted-foreground">
                Created by {getNoteAuthorName(noteRecord, users)} · {formatDateTime(noteRecord?.created_at)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {isViewingNote ? "Close" : "Cancel"}
            </Button>
            {!isViewingNote ? (
              <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting || !note.trim()}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isEditingNote ? "Save Changes" : "Save Note"}
              </Button>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function MatterDashboardTab({
  detail,
}: {
  detail: CaseDetail;
}) {
  const activeTasks = detail.tasks.filter((task) => !isCompletedTask(task));
  const completedTasks = detail.tasks.filter(isCompletedTask);
  const overdueTasks = activeTasks.filter((task) => {
    if (!task.due_at) return false;
    const dueDate = new Date(task.due_at);
    return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
  });
  const dashboardTasks = [...activeTasks]
    .sort((first, second) => {
      const firstDue = first.due_at ? new Date(first.due_at).getTime() : Number.POSITIVE_INFINITY;
      const secondDue = second.due_at ? new Date(second.due_at).getTime() : Number.POSITIVE_INFINITY;
      return firstDue - secondDue;
    })
    .slice(0, 5);
  const relatedContactCount = detail.parties.filter((party) => {
    const primaryValues = [detail.case.ghl_contact_id, detail.case.primary_contact_email, detail.case.primary_contact_name]
      .map((value) => normalizeMatterContactMatch(value))
      .filter(Boolean);
    const partyValues = [party.ghl_contact_id, party.email, party.name].map((value) => normalizeMatterContactMatch(value));
    return !partyValues.some((value) => value && primaryValues.includes(value));
  }).length;
  const financialTotal = detail.financials.reduce((total, entry) => total + Number(entry.amount_cents || 0), 0);
  const recentActivity = [...detail.timeline]
    .sort((first, second) => String(second.occurred_at || "").localeCompare(String(first.occurred_at || "")))
    .slice(0, 5);
  const recentDocuments = [...((detail.documents || []) as DocumentRecord[])]
    .sort((first, second) => String(second.created_at || "").localeCompare(String(first.created_at || "")))
    .slice(0, 5);
  const stats = [
    { label: "Open Tasks", value: activeTasks.length, icon: CheckSquare },
    { label: "Overdue", value: overdueTasks.length, icon: Clock },
    { label: "Contacts", value: relatedContactCount + 1, icon: Users },
    { label: "Documents", value: detail.documents.length, icon: FileText },
    { label: "Notes", value: detail.notes.length, icon: NotebookPen },
    { label: "Financials", value: money(financialTotal, detail.financials[0]?.currency || "USD"), icon: DollarSign },
  ];

  return (
    <div className="space-y-4 pt-8">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="min-h-[104px]">
            <div className="flex min-h-[104px] items-center gap-3 px-4 py-6">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs text-muted-foreground">{label}</div>
                <div className="truncate text-lg font-semibold text-foreground">{value}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="order-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Recent Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentDocuments.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">No recent documents.</div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[40%]" />
                    <col className="w-[18%]" />
                    <col className="w-[42%]" />
                  </colgroup>
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="h-10 px-3 py-3 font-medium">Document</th>
                      <th className="h-10 px-3 py-3 font-medium">Folder</th>
                      <th className="h-10 px-3 py-3 font-medium">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDocuments.map((document) => (
                      <tr key={document.id} className="border-b last:border-0">
                        <td className="min-w-0 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <DocumentTypeIcon documentRecord={document} className="h-[18px] w-[18px] shrink-0" />
                            <span className="truncate font-medium text-[#2384CA]">{getDocumentName(document)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-foreground/70">
                          <div className="truncate">{getDisplayFolderName(document)}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground/70">{formatDateTime(document.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="order-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="h-4 w-4" />
              Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardTasks.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">No active tasks.</div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[42%]" />
                    <col className="w-[18%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="h-10 px-3 py-3 font-medium">Task</th>
                      <th className="h-10 px-3 py-3 font-medium">Priority</th>
                      <th className="h-10 px-3 py-3 font-medium">Status</th>
                      <th className="h-10 px-3 py-3 font-medium">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardTasks.map((task) => (
                      <tr key={task.id} className="border-b last:border-0">
                        <td className="min-w-0 px-3 py-2">
                          <div className="truncate font-medium text-[#2384CA]">{task.title}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="capitalize">{task.priority || "normal"}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={cn("whitespace-nowrap border-transparent capitalize", getStatusClass(task.status))}>
                            {formatTaskStatusLabel(task.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-foreground/70">{formatTaskDate(task.due_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <NotebookPen className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">No recent activity.</div>
          ) : (
            <div className="divide-y">
              {recentActivity.map((item) => (
                <div key={`${item.type}-${item.id}`} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{item.title}</div>
                      {item.body ? <div className="line-clamp-1 text-sm text-muted-foreground">{item.body}</div> : null}
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">{item.type}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.occurred_at)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ContactsTab({ detail, onChanged }: { detail: CaseDetail; onChanged: () => void | Promise<void> }) {
  const navigate = useNavigate();
  const clientName = formatPersonName(detail.case.primary_contact_name) || detail.case.ghl_contact_id || "Unknown contact";
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [typeFilter, setTypeFilter] = useState(ALL_MATTER_CONTACT_TYPES);
  const [roleFilter, setRoleFilter] = useState(ALL_MATTER_CONTACT_ROLES);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [isAddRelatedContactOpen, setIsAddRelatedContactOpen] = useState(false);
  const [partyToEdit, setPartyToEdit] = useState<any | null>(null);
  const primaryContactMatchValues = new Set(
    [detail.case.ghl_contact_id, detail.case.primary_contact_email, detail.case.primary_contact_name]
      .map((value) => normalizeMatterContactMatch(value))
      .filter(Boolean),
  );
  const associatedContacts = detail.parties.filter((party) => {
    const values = [party.ghl_contact_id, party.email, party.name].map((value) => normalizeMatterContactMatch(value));
    return !values.some((value) => value && primaryContactMatchValues.has(value));
  });
  const contactRows = [
    {
      id: `primary-${detail.case.id}`,
      isPrimary: true,
      contactId: detail.case.ghl_contact_id || "",
      name: clientName,
      type: "Primary Contact",
      role: "Primary",
      emailOrPhone: detail.case.primary_contact_email || detail.case.primary_contact_phone || "Not set",
      email: detail.case.primary_contact_email || "",
      phone: detail.case.primary_contact_phone || "",
      party: null,
    },
    ...associatedContacts.map((party) => ({
      id: String(party.id || `${party.ghl_contact_id || ""}-${party.email || ""}-${party.name || ""}`),
      isPrimary: false,
      contactId: String(party.ghl_contact_id || ""),
      name: getMatterPartyDisplayName(party),
      type: party.party_type || "Related Contact",
      role: party.role || "Associated Contact",
      emailOrPhone: party.email || party.phone || "Not set",
      email: party.email || "",
      phone: party.phone || "",
      party,
    })),
  ];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const typeOptions = Array.from(new Set([...MATTER_CONTACT_TYPE_OPTIONS, ...contactRows.map((row) => row.type).filter(Boolean)]));
  const roleOptions = Array.from(new Set([...MATTER_CONTACT_ROLE_OPTIONS, ...contactRows.map((row) => row.role).filter(Boolean)]));
  const filteredContactRows = contactRows.filter((row) => {
    const matchesSearch = !normalizedSearch ||
      [row.name, row.type, row.role, row.emailOrPhone].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
    const matchesType = typeFilter === ALL_MATTER_CONTACT_TYPES || row.type === typeFilter;
    const matchesRole = roleFilter === ALL_MATTER_CONTACT_ROLES || row.role === roleFilter;
    return matchesSearch && matchesType && matchesRole;
  });
  const displayTotalCount = filteredContactRows.length;
  const safeTotalPages = Math.max(1, Math.ceil(displayTotalCount / itemsPerPage));
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = displayTotalCount === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(displayTotalCount, effectiveCurrentPage * itemsPerPage);
  const visiblePageItems = getPaginationItems(effectiveCurrentPage, safeTotalPages);
  const paginatedContactRows = filteredContactRows.slice(firstVisibleRow === 0 ? 0 : firstVisibleRow - 1, lastVisibleRow);
  const activeFilterCount = Number(typeFilter !== ALL_MATTER_CONTACT_TYPES) + Number(roleFilter !== ALL_MATTER_CONTACT_ROLES);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, roleFilter, detail.parties.length]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-muted-foreground">
          Contacts <span className="font-medium text-foreground">({contactRows.length})</span>
        </div>
        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-3 lg:w-auto">
          <div
            className={`relative flex items-center transition-all duration-300 ${
              isSearchExpanded || searchQuery ? "w-full sm:w-64" : "w-10"
            }`}
          >
            <Button
              type="button"
              variant={isSearchExpanded || searchQuery ? "ghost" : "outline"}
              size="icon"
              className="absolute left-0 z-10 h-10 w-10 rounded-full"
              aria-label="Search contacts"
              title="Search contacts"
              onClick={() => {
                if (!isSearchExpanded && !searchQuery) {
                  setIsSearchExpanded(true);
                  window.setTimeout(() => document.getElementById("matter-contact-search")?.focus(), 100);
                }
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Input
              id="matter-contact-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search contacts..."
              className={`h-10 rounded-full bg-background pl-10 transition-all duration-300 ${
                isSearchExpanded || searchQuery ? "w-full opacity-100" : "w-0 border-0 p-0 opacity-0"
              }`}
              onBlur={() => {
                if (!searchQuery) setIsSearchExpanded(false);
              }}
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "relative h-10 w-10 shrink-0 rounded-full",
                  activeFilterCount > 0 && "border-primary/40 bg-primary/10 text-primary",
                )}
                aria-label="Filter contacts"
                title="Filter contacts"
              >
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="right-0 top-full mt-2 w-80 p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Filter Contacts</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setTypeFilter(ALL_MATTER_CONTACT_TYPES);
                      setRoleFilter(ALL_MATTER_CONTACT_ROLES);
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <span className={typeFilter === ALL_MATTER_CONTACT_TYPES ? "text-muted-foreground" : undefined}>
                        {typeFilter === ALL_MATTER_CONTACT_TYPES ? "Any Type" : typeFilter}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                      <SelectItem value={ALL_MATTER_CONTACT_TYPES}>Any Type</SelectItem>
                      {typeOptions.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger>
                      <span className={roleFilter === ALL_MATTER_CONTACT_ROLES ? "text-muted-foreground" : undefined}>
                        {roleFilter === ALL_MATTER_CONTACT_ROLES ? "Any Role" : roleFilter}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                      <SelectItem value={ALL_MATTER_CONTACT_ROLES}>Any Role</SelectItem>
                      {roleOptions.map((roleOption) => (
                        <SelectItem key={roleOption} value={roleOption}>{roleOption}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-[#0484C8]"
            aria-label="Add related contact"
            title="Add related contact"
            onClick={() => setIsAddRelatedContactOpen(true)}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="h-12 px-4 py-4 font-medium">Contact</th>
              <th className="h-12 px-4 py-4 font-medium">Type</th>
              <th className="h-12 px-4 py-4 font-medium">Role</th>
              <th className="h-12 px-4 py-4 font-medium">Email / Phone</th>
              <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedContactRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="max-w-xs px-4 py-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary",
                        !row.isPrimary && "text-[11px] font-medium",
                      )}>
                        {row.isPrimary ? <UserRound className="h-4 w-4" /> : getAvatarInitials({ fullName: row.name, email: row.email }, "C")}
                      </div>
                      <div className="min-w-0">
                        {row.contactId ? (
                          <Link
                            to={`/contact/${row.contactId}`}
                            className="block truncate font-medium text-[#2384CA] hover:underline"
                          >
                            {row.name}
                          </Link>
                        ) : (
                          <div className="truncate font-medium text-foreground">{row.name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 capitalize text-foreground/70">
                    <div className="truncate">{row.type}</div>
                  </td>
                  <td className="px-4 py-2">
                    {row.isPrimary ? (
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-xs font-medium text-primary">
                        Primary
                      </Badge>
                    ) : (
                      <div className="truncate text-foreground/70">{row.role}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-foreground/70">
                    <div className="truncate">{row.emailOrPhone}</div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`${row.name} contact actions`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {row.party ? (
                          <DropdownMenuItem onClick={() => setPartyToEdit(row.party)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        ) : null}
                        {row.contactId ? (
                          <DropdownMenuItem onClick={() => navigate(`/contact/${row.contactId}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                        ) : null}
                        {row.email ? (
                          <DropdownMenuItem onClick={() => { window.location.href = `mailto:${row.email}`; }}>
                            <Mail className="mr-2 h-4 w-4" />
                            Email
                          </DropdownMenuItem>
                        ) : null}
                        {row.phone ? (
                          <DropdownMenuItem onClick={() => { window.location.href = `tel:${row.phone}`; }}>
                            <Phone className="mr-2 h-4 w-4" />
                            Call
                          </DropdownMenuItem>
                        ) : null}
                        {!row.contactId && !row.email && !row.phone ? (
                          <div className="px-2 py-2 text-sm text-muted-foreground">No actions available</div>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}

            {displayTotalCount === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No contacts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {displayTotalCount > 0 ? (
        <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
            {" - "}
            <span className="font-medium text-foreground">{lastVisibleRow}</span>
            {" of "}
            <span className="font-medium text-foreground">{displayTotalCount}</span> contacts
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
                    <PaginationItem key={`contacts-ellipsis-${index}`} className="hidden px-1 text-muted-foreground sm:block">
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

      <AddRelatedContactSheet
        detail={detail}
        open={isAddRelatedContactOpen}
        onOpenChange={setIsAddRelatedContactOpen}
        onSaved={onChanged}
      />
      <EditRelatedContactSheet
        detail={detail}
        party={partyToEdit}
        open={Boolean(partyToEdit)}
        onOpenChange={(open) => {
          if (!open) setPartyToEdit(null);
        }}
        onSaved={onChanged}
      />
    </>
  );
}

function AddRelatedContactSheet({
  detail,
  open,
  onOpenChange,
  onSaved,
}: {
  detail: CaseDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [partyType, setPartyType] = useState("Related Contact");
  const [role, setRole] = useState("Associated Contact");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const existingContactIds = useMemo(
    () => new Set(
      [detail.case.ghl_contact_id, ...detail.parties.map((party) => party.ghl_contact_id)]
        .filter(Boolean)
        .map((value) => String(value)),
    ),
    [detail.case.ghl_contact_id, detail.parties],
  );
  const existingContactEmails = useMemo(
    () => new Set(
      [detail.case.primary_contact_email, ...detail.parties.map((party) => party.email)]
        .map((value) => normalizeMatterContactMatch(value))
        .filter(Boolean),
    ),
    [detail.case.primary_contact_email, detail.parties],
  );
  const contactOptions = useMemo(
    () => contacts.filter((contact) => {
      const contactId = getMatterContactId(contact);
      const email = normalizeMatterContactMatch(getMatterContactEmail(contact));
      return contactId && !existingContactIds.has(contactId) && (!email || !existingContactEmails.has(email));
    }),
    [contacts, existingContactEmails, existingContactIds],
  );
  const selectedContact = contacts.find((contact) => getMatterContactId(contact) === selectedContactId);

  useEffect(() => {
    if (!open) {
      setSelectedContactId("");
      setPartyType("Related Contact");
      setRole("Associated Contact");
      return;
    }

    let cancelled = false;
    setLoadingContacts(true);
    getActiveGhlLocationId()
      .then((ghlLocationId) => {
        if (!ghlLocationId) throw new Error("GHL location is not configured.");
        return getContacts(ghlLocationId);
      })
      .then((response: any) => {
        if (cancelled) return;
        const nextContacts = Array.isArray(response?.contacts)
          ? response.contacts
          : Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response?.data?.contacts)
              ? response.data.contacts
              : [];
        setContacts(nextContacts);
      })
      .catch((error) => {
        if (cancelled) return;
        toast({
          title: "Contacts Not Loaded",
          description: getUserFriendlyErrorMessage(error, "Could not load contacts. Please try again."),
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingContacts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSubmit = async () => {
    if (!selectedContact) return;
    setSubmitting(true);
    try {
      await addCaseParty({
        caseId: detail.case.id,
        contactId: selectedContactId,
        name: getMatterContactName(selectedContact),
        email: getMatterContactEmail(selectedContact) || null,
        phone: getMatterContactPhone(selectedContact) || null,
        partyType,
        role,
      });
      await onSaved();
      onOpenChange(false);
      toast({ title: "Related Contact Added", description: "The contact has been added to this matter." });
    } catch (error) {
      toast({
        title: "Related Contact Not Added",
        description: getUserFriendlyErrorMessage(error, "Could not add this contact to the matter. Please try again."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 shadow-none sm:max-w-md">
        <SheetHeader className="mb-6 space-y-1">
          <SheetTitle className="text-lg font-semibold">Add Related Contact</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Contact</Label>
            <SearchableSelect
              value={selectedContactId}
              onValueChange={setSelectedContactId}
              options={contactOptions.map((contact) => getMatterContactId(contact))}
              placeholder={loadingContacts ? "Loading contacts..." : "Select contact"}
              searchPlaceholder="Search contacts..."
              emptyMessage={loadingContacts ? "Loading contacts..." : "No contacts found."}
              disabled={loadingContacts}
              getOptionLabel={(contactId) =>
                getMatterContactOptionLabel(contacts.find((contact) => getMatterContactId(contact) === contactId)) || contactId
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={partyType} onValueChange={setPartyType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                {MATTER_CONTACT_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                {MATTER_CONTACT_ROLE_OPTIONS.map((roleOption) => (
                  <SelectItem key={roleOption} value={roleOption}>{roleOption}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="shadow-none">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!selectedContactId || submitting}>
            {submitting ? "Adding..." : "Add Related Contact"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function EditRelatedContactSheet({
  detail,
  party,
  open,
  onOpenChange,
  onSaved,
}: {
  detail: CaseDetail;
  party: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [partyType, setPartyType] = useState("Related Contact");
  const [role, setRole] = useState("Associated Contact");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentPartyId = String(party?.id || "");
  const existingContactIds = useMemo(
    () => new Set(
      [detail.case.ghl_contact_id, ...detail.parties.filter((item) => String(item.id || "") !== currentPartyId).map((item) => item.ghl_contact_id)]
        .filter(Boolean)
        .map((value) => String(value)),
    ),
    [currentPartyId, detail.case.ghl_contact_id, detail.parties],
  );
  const existingContactEmails = useMemo(
    () => new Set(
      [
        detail.case.primary_contact_email,
        ...detail.parties
          .filter((item) => String(item.id || "") !== currentPartyId)
          .map((item) => item.email),
      ]
        .map((value) => normalizeMatterContactMatch(value))
        .filter(Boolean),
    ),
    [currentPartyId, detail.case.primary_contact_email, detail.parties],
  );
  const contactOptions = useMemo(
    () => contacts.filter((contact) => {
      const contactId = getMatterContactId(contact);
      const email = normalizeMatterContactMatch(getMatterContactEmail(contact));
      return contactId && !existingContactIds.has(contactId) && (!email || !existingContactEmails.has(email));
    }),
    [contacts, existingContactEmails, existingContactIds],
  );
  const selectedContact = contacts.find((contact) => getMatterContactId(contact) === selectedContactId);

  useEffect(() => {
    if (!open || !party) {
      setSelectedContactId("");
      setPartyType("Related Contact");
      setRole("Associated Contact");
      return;
    }

    setSelectedContactId(String(party.ghl_contact_id || ""));
    setPartyType(party.party_type || "Related Contact");
    setRole(party.role || "Associated Contact");

    let cancelled = false;
    setLoadingContacts(true);
    getActiveGhlLocationId()
      .then((ghlLocationId) => {
        if (!ghlLocationId) throw new Error("GHL location is not configured.");
        return getContacts(ghlLocationId);
      })
      .then((response: any) => {
        if (cancelled) return;
        const nextContacts = Array.isArray(response?.contacts)
          ? response.contacts
          : Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response?.data?.contacts)
              ? response.data.contacts
              : [];
        setContacts(nextContacts);
      })
      .catch((error) => {
        if (cancelled) return;
        toast({
          title: "Contacts Not Loaded",
          description: getUserFriendlyErrorMessage(error, "Could not load contacts. Please try again."),
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingContacts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, party]);

  const handleSubmit = async () => {
    if (!party) return;
    const nextContact = selectedContact || null;
    setSubmitting(true);
    try {
      await updateCaseParty({
        caseId: detail.case.id,
        partyId: party.id,
        contactId: selectedContactId || null,
        name: nextContact ? getMatterContactName(nextContact) : getMatterPartyDisplayName(party),
        email: nextContact ? getMatterContactEmail(nextContact) || null : party.email || null,
        phone: nextContact ? getMatterContactPhone(nextContact) || null : party.phone || null,
        partyType,
        role,
        metadata: party.metadata || {},
      });
      await onSaved();
      onOpenChange(false);
      toast({ title: "Related Contact Updated", description: "The related contact has been saved." });
    } catch (error) {
      toast({
        title: "Related Contact Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not update this related contact. Please try again."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 shadow-none sm:max-w-md">
        <SheetHeader className="mb-6 space-y-1">
          <SheetTitle className="text-lg font-semibold">Edit Related Contact</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Contact</Label>
            <SearchableSelect
              value={selectedContactId}
              onValueChange={setSelectedContactId}
              options={contactOptions.map((contact) => getMatterContactId(contact))}
              placeholder={loadingContacts ? "Loading contacts..." : "Select contact"}
              searchPlaceholder="Search contacts..."
              emptyMessage={loadingContacts ? "Loading contacts..." : "No contacts found."}
              disabled={loadingContacts}
              getOptionLabel={(contactId) =>
                getMatterContactOptionLabel(contacts.find((contact) => getMatterContactId(contact) === contactId)) ||
                (contactId === String(party?.ghl_contact_id || "") ? getMatterPartyDisplayName(party) : contactId)
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={partyType} onValueChange={setPartyType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                {MATTER_CONTACT_TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                {MATTER_CONTACT_ROLE_OPTIONS.map((roleOption) => (
                  <SelectItem key={roleOption} value={roleOption}>{roleOption}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="shadow-none">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!party || submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function NotesTab({
  detail,
  users,
  onViewNote,
  onEditNote,
  onDeleteNote,
}: {
  detail: CaseDetail;
  users: AssignableUser[];
  onViewNote: (note: any) => void;
  onEditNote: (note: any) => void;
  onDeleteNote: (note: any) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="h-4 w-4" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MatterNoteList notes={detail.notes} users={users} onViewNote={onViewNote} onEditNote={onEditNote} onDeleteNote={onDeleteNote} />
      </CardContent>
    </Card>
  );
}

function TimelineTab({ detail, onChanged }: { detail: CaseDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await createCaseNote({ caseId: detail.case.id, body: note });
      setNote("");
      onChanged();
    } catch (error) {
      toast({ title: "Note Not Added", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <NotebookPen className="h-4 w-4" />
            Add Note
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <NoteRichTextEditor value={note} onChange={setNote} placeholder="Add a matter note" />
          <Button className="w-full" disabled={submitting || !note.trim()} onClick={handleAddNote}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Note
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Unified Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.timeline.length === 0 ? (
            <EmptyState icon={NotebookPen} text="No timeline activity yet." />
          ) : (
            detail.timeline.map((item) => (
              <div key={`${item.type}-${item.id}`} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{item.title}</div>
                  <Badge variant="outline" className="capitalize">{item.type}</Badge>
                </div>
                {item.body ? (
                  item.type === "note" ? (
                    <NoteRichTextBody value={item.body} className="mt-1 text-sm text-muted-foreground" />
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  )
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(item.occurred_at)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TasksTab({
  detail,
  users,
  onTaskClick,
  onTaskCreate,
  onTaskDelete,
}: {
  detail: CaseDetail;
  users: AssignableUser[];
  onTaskClick: (task: any) => void;
  onTaskCreate: () => void;
  onTaskDelete: (task: any) => void;
}) {
  const [sortColumn, setSortColumn] = useState<MatterTaskSortColumn>("due_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState(ALL_MATTER_TASK_STATUSES);
  const [priorityFilter, setPriorityFilter] = useState(ALL_MATTER_TASK_PRIORITIES);
  const [assigneeFilter, setAssigneeFilter] = useState(ALL_MATTER_TASK_ASSIGNEES);

  const sortTasks = (tasks: any[]) => {
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    return [...tasks].sort((a, b) => {
      const getSortValue = (task: any) => {
        switch (sortColumn) {
          case "assigned_to":
            return getMatterTaskAssignedInfo(task, users).assignedUserName || "Unassigned";
          case "priority":
            return priorityOrder[String(task.priority || "normal").toLowerCase()] ?? 99;
          case "status":
            return formatTaskStatusLabel(task.status);
          case "due_at":
            return task.due_at ? new Date(task.due_at).getTime() : Number.POSITIVE_INFINITY;
          default:
            return task.title || "";
        }
      };

      const firstValue = getSortValue(a);
      const secondValue = getSortValue(b);
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : String(firstValue).toLowerCase().localeCompare(String(secondValue).toLowerCase());

      return sortDirection === "asc" ? comparison : -comparison;
    });
  };

  const assigneeOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    detail.tasks.forEach((task) => {
      const { assignedUserId, assignedUserName } = getMatterTaskAssignedInfo(task, users);
      optionMap.set(assignedUserId || UNASSIGNED_USER_VALUE, assignedUserName || "Unassigned");
    });
    return [...optionMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [detail.tasks, users]);
  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return sortTasks(detail.tasks.filter((task) => {
      const { assignedUserId, assignedUserName } = getMatterTaskAssignedInfo(task, users);
      const taskAssigneeValue = assignedUserId || UNASSIGNED_USER_VALUE;
      const matchesSearch = !normalizedSearch ||
        [
          task.title,
          task.description,
          assignedUserName,
          task.priority,
          formatTaskStatusLabel(task.status),
          formatTaskDate(task.due_at),
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
      const matchesStatus = statusFilter === ALL_MATTER_TASK_STATUSES || String(task.status || "") === statusFilter;
      const matchesPriority = priorityFilter === ALL_MATTER_TASK_PRIORITIES || String(task.priority || "normal") === priorityFilter;
      const matchesAssignee = assigneeFilter === ALL_MATTER_TASK_ASSIGNEES || taskAssigneeValue === assigneeFilter;
      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee;
    }));
  }, [assigneeFilter, detail.tasks, priorityFilter, searchTerm, sortColumn, sortDirection, statusFilter, users]);
  const activeFilterCount =
    Number(statusFilter !== ALL_MATTER_TASK_STATUSES) +
    Number(priorityFilter !== ALL_MATTER_TASK_PRIORITIES) +
    Number(assigneeFilter !== ALL_MATTER_TASK_ASSIGNEES);

  const handleSort = (column: MatterTaskSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  const renderSortIcon = (column: MatterTaskSortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/50" />;
    return <ArrowUpDown className={cn("ml-2 h-3.5 w-3.5 text-primary", sortDirection === "desc" && "rotate-180")} />;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-muted-foreground">
          Tasks <span className="font-medium text-foreground">({detail.tasks.length})</span>
        </div>
        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-3 lg:w-auto">
          <div
            className={`relative flex items-center transition-all duration-300 ${
              isSearchExpanded || searchTerm ? "w-full sm:w-64" : "w-10"
            }`}
          >
            <Button
              type="button"
              variant={isSearchExpanded || searchTerm ? "ghost" : "outline"}
              size="icon"
              className="absolute left-0 z-10 h-10 w-10 rounded-full"
              aria-label="Search tasks"
              title="Search tasks"
              onClick={() => {
                if (!isSearchExpanded && !searchTerm) {
                  setIsSearchExpanded(true);
                  window.setTimeout(() => document.getElementById("matter-task-search")?.focus(), 100);
                }
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Input
              id="matter-task-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search tasks..."
              className={`h-10 rounded-full bg-background pl-10 transition-all duration-300 ${
                isSearchExpanded || searchTerm ? "w-full opacity-100" : "w-0 border-0 p-0 opacity-0"
              }`}
              onBlur={() => {
                if (!searchTerm) setIsSearchExpanded(false);
              }}
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "relative h-10 w-10 shrink-0 rounded-full",
                  activeFilterCount > 0 && "border-primary/40 bg-primary/10 text-primary",
                )}
                aria-label="Filter tasks"
                title="Filter tasks"
              >
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="right-0 top-full mt-2 w-80 p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Filter Tasks</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setStatusFilter(ALL_MATTER_TASK_STATUSES);
                      setPriorityFilter(ALL_MATTER_TASK_PRIORITIES);
                      setAssigneeFilter(ALL_MATTER_TASK_ASSIGNEES);
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <span className={statusFilter === ALL_MATTER_TASK_STATUSES ? "text-muted-foreground" : undefined}>
                        {statusFilter === ALL_MATTER_TASK_STATUSES ? "Any Status" : formatTaskStatusLabel(statusFilter)}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[150]">
                      <SelectItem value={ALL_MATTER_TASK_STATUSES}>Any Status</SelectItem>
                      {TASK_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>{formatTaskStatusLabel(status)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger>
                      <span className={priorityFilter === ALL_MATTER_TASK_PRIORITIES ? "text-muted-foreground" : "capitalize"}>
                        {priorityFilter === ALL_MATTER_TASK_PRIORITIES ? "Any Priority" : priorityFilter}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[150]">
                      <SelectItem value={ALL_MATTER_TASK_PRIORITIES}>Any Priority</SelectItem>
                      {TASK_PRIORITY_OPTIONS.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          <span className="capitalize">{priority}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger>
                      <span className={assigneeFilter === ALL_MATTER_TASK_ASSIGNEES ? "text-muted-foreground" : undefined}>
                        {assigneeFilter === ALL_MATTER_TASK_ASSIGNEES
                          ? "Any Assignee"
                          : assigneeOptions.find(([value]) => value === assigneeFilter)?.[1] || "Unassigned"}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                      <SelectItem value={ALL_MATTER_TASK_ASSIGNEES}>Any Assignee</SelectItem>
                      {assigneeOptions.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-[#0484C8]"
            aria-label="Add task"
            title="Add task"
            onClick={onTaskCreate}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <MatterTaskList
        tasks={filteredTasks}
        users={users}
        onTaskClick={onTaskClick}
        onTaskDelete={onTaskDelete}
        handleSort={handleSort}
        renderSortIcon={renderSortIcon}
      />
    </div>
  );
}

function MatterTaskList({
  tasks,
  users,
  onTaskClick,
  onTaskDelete,
  handleSort,
  renderSortIcon,
}: {
  tasks: any[];
  users: AssignableUser[];
  onTaskClick: (task: any) => void;
  onTaskDelete: (task: any) => void;
  handleSort: (column: MatterTaskSortColumn) => void;
  renderSortIcon: (column: MatterTaskSortColumn) => ReactNode;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const displayTotalCount = tasks.length;
  const safeTotalPages = Math.max(1, Math.ceil(displayTotalCount / itemsPerPage));
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = displayTotalCount === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(displayTotalCount, effectiveCurrentPage * itemsPerPage);
  const visiblePageItems = getPaginationItems(effectiveCurrentPage, safeTotalPages);
  const paginatedTasks = tasks.slice(firstVisibleRow === 0 ? 0 : firstVisibleRow - 1, lastVisibleRow);
  const columns: Array<[MatterTaskSortColumn, string]> = [
    ["title", "Task"],
    ["assigned_to", "Assigned To"],
    ["priority", "Priority"],
    ["status", "Status"],
    ["due_at", "Due Date"],
  ];

  useEffect(() => {
    setCurrentPage(1);
  }, [tasks.length, itemsPerPage]);

  if (tasks.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">No tasks found.</div>;
  }

  return (
    <>
      <div className="overflow-x-auto pt-3">
        <table className="w-full min-w-[760px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[8%]" />
          </colgroup>
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
            {paginatedTasks.map((task) => {
              const {
                assignedUserId,
                matchedUser,
                assignedUserName,
                assignedUserEmail,
                assignedUserAvatar,
              } = getMatterTaskAssignedInfo(task, users);
              const completed = isCompletedTask(task);
              const dueLabel = formatTaskDate(task.due_at);

              return (
                <tr
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
                  onClick={() => onTaskClick(task)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onTaskClick(task);
                    }
                  }}
                >
                  <td className="max-w-xs px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                        <CheckSquare className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className={cn("truncate font-medium text-[#2384CA]", completed && "text-muted-foreground line-through")}>
                          {task.title}
                        </div>
                        {task.description ? <div className="line-clamp-1 text-xs text-muted-foreground">{task.description}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-foreground/70">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        {assignedUserAvatar ? (
                          <AvatarImage
                            src={assignedUserAvatar}
                            alt={`${getAvatarInitials(
                              { fullName: assignedUserName || "Unassigned", email: assignedUserEmail },
                              "U",
                            )} avatar`}
                          />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-[11px] font-medium text-primary">
                          {getAvatarInitials(
                            { fullName: assignedUserName || "Unassigned", email: assignedUserEmail },
                            "U",
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 truncate" onClick={(event) => event.stopPropagation()}>
                        <UserLink
                          userId={assignedUserId}
                          user={matchedUser}
                          name={assignedUserName || "Unassigned"}
                          stopPropagation
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="capitalize">
                      {task.priority || "normal"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={cn("border-transparent capitalize", getStatusClass(task.status))}>
                      {formatTaskStatusLabel(task.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-foreground/70">
                    <div className="flex items-center">
                      <Clock className="mr-2 h-3.5 w-3.5 shrink-0" />
                      <span>{dueLabel}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Task actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onTaskClick(task)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onTaskDelete(task)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
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

      <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground">
          Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
          {" - "}
          <span className="font-medium text-foreground">{lastVisibleRow}</span>
          {" of "}
          <span className="font-medium text-foreground">{displayTotalCount}</span> tasks
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
                  <PaginationItem key={`tasks-ellipsis-${index}`} className="hidden px-1 text-muted-foreground sm:block">
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
  );
}

function MatterNoteList({
  notes,
  users,
  onViewNote,
  onEditNote,
  onDeleteNote,
}: {
  notes: any[];
  users: AssignableUser[];
  onViewNote: (note: any) => void;
  onEditNote: (note: any) => void;
  onDeleteNote: (note: any) => void;
}) {
  if (notes.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">No notes found.</div>;
  }

  return (
    <div className="divide-y pt-3">
      {notes.map((note) => (
        <div
          key={note.id || note.created_at}
          role="button"
          tabIndex={0}
          className="block w-full cursor-pointer py-3 text-left first:pt-0 last:pb-0 transition-colors hover:bg-muted/30"
          onClick={() => onViewNote(note)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onViewNote(note);
            }
          }}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <NotebookPen className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <NoteRichTextBody value={note.body || "Untitled note"} className="line-clamp-3 text-sm text-foreground" />
              <div className="mt-1 text-xs text-muted-foreground">
                Created by {getNoteAuthorName(note, users)} · {formatDateTime(note.created_at)}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Note actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onViewNote(note);
                  }}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditNote(note);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteNote(note);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventsTab({ detail, onChanged }: { detail: CaseDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", startAt: "", endAt: "", eventType: "case", description: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.title.trim() || !form.startAt) return;
    setSubmitting(true);
    try {
      await createCaseEvent({
        caseId: detail.case.id,
        ...form,
        startAt: new Date(form.startAt).toISOString(),
        endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
      });
      setForm({ title: "", startAt: "", endAt: "", eventType: "case", description: "" });
      onChanged();
    } catch (error) {
      toast({ title: "Event Not Created", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TwoColumnTab title="Create Event" icon={Calendar} action={<Button disabled={submitting || !form.title.trim() || !form.startAt} onClick={submit}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create Event</Button>}>
      <div className="space-y-3">
        <Input placeholder="Event title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <DateTimePicker
            value={form.startAt}
            onValueChange={(startAt) => setForm({ ...form, startAt })}
            placeholder="Select start date"
          />
          <DateTimePicker
            value={form.endAt}
            onValueChange={(endAt) => setForm({ ...form, endAt })}
            placeholder="Select end date"
          />
        </div>
        <Input placeholder="Event type" value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })} />
        <Textarea placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </div>
      <ListCard title="Events" items={detail.events} emptyIcon={Calendar} emptyText="No events yet." render={(event) => (
        <Row title={event.title} meta={`${event.event_type} · ${formatDateTime(event.start_at)}`} badge={event.status} />
      )} />
    </TwoColumnTab>
  );
}

function DocumentsTab({
  detail,
  onChanged,
  onDocumentView,
}: {
  detail: CaseDetail;
  onChanged: () => void;
  onDocumentView: (document: DocumentRecord) => void;
}) {
  const { toast } = useToast();
  const [capabilities, setCapabilities] = useState<DocumentCapabilities>({
    canView: false,
    canUpload: false,
    canEdit: false,
    canMove: false,
    canDelete: false,
    canManageFolders: false,
  });
  const [capabilitiesLoaded, setCapabilitiesLoaded] = useState(false);
  const [matterOptions, setMatterOptions] = useState<Array<[string, string]>>([[detail.case.id, getCaseDisplayName(detail.case)]]);
  const [accessibleDocuments, setAccessibleDocuments] = useState<DocumentRecord[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [documentToRename, setDocumentToRename] = useState<DocumentRecord | null>(null);
  const [documentToMove, setDocumentToMove] = useState<DocumentRecord | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentRecord | null>(null);
  const [folderToEdit, setFolderToEdit] = useState<MatterDocumentFolderGroup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [displayMode, setDisplayMode] = useState<MatterDocumentDisplayMode>("documents");
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [storageTypeFilter, setStorageTypeFilter] = useState(ALL_MATTER_DOCUMENT_STORAGE_TYPES);
  const [folderFilter, setFolderFilter] = useState(ALL_MATTER_DOCUMENT_FOLDERS);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<MatterDocumentSortColumn>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [folderSortColumn, setFolderSortColumn] = useState<MatterDocumentFolderSortColumn>("folder");
  const [folderSortDirection, setFolderSortDirection] = useState<"asc" | "desc">("asc");
  const documents = (detail.documents || []) as DocumentRecord[];

  const folderOptions = useMemo(() => {
    const folders = new Set<string>();
    documents.forEach((document) => folders.add(getDisplayFolderName(document)));
    return [...folders].sort((a, b) => a.localeCompare(b));
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return documents.filter((document) => {
      const folderName = getDisplayFolderName(document);
      const storageType = document.storage_type || "internal";
      const matchesSearch =
        !normalizedSearch ||
        getDocumentName(document).toLowerCase().includes(normalizedSearch) ||
        folderName.toLowerCase().includes(normalizedSearch);
      const matchesStorage = storageTypeFilter === ALL_MATTER_DOCUMENT_STORAGE_TYPES || storageType === storageTypeFilter;
      const matchesFolder = folderFilter === ALL_MATTER_DOCUMENT_FOLDERS || folderName === folderFilter;
      return matchesSearch && matchesStorage && matchesFolder;
    });
  }, [documents, folderFilter, searchTerm, storageTypeFilter]);

  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((a, b) => {
      const getSortValue = (document: DocumentRecord) => {
        switch (sortColumn) {
          case "name":
            return getDocumentName(document);
          case "storage_type":
            return getStorageTypeLabel(document.storage_type);
          case "folder":
            return getDisplayFolderName(document);
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

  const folderGroups = useMemo<MatterDocumentFolderGroup[]>(() => {
    const groupMap = new Map<string, MatterDocumentFolderGroup>();
    sortedDocuments.forEach((document) => {
      const folderName = getDisplayFolderName(document);
      const existingGroup = groupMap.get(folderName);
      if (existingGroup) {
        existingGroup.documents.push(document);
      } else {
        groupMap.set(folderName, { id: folderName, folderName, documents: [document] });
      }
    });
    return [...groupMap.values()].sort((a, b) => {
      const getLatestDocument = (folderGroup: MatterDocumentFolderGroup) => [...folderGroup.documents].sort((first, second) =>
        String(second.created_at || "").localeCompare(String(first.created_at || "")),
      )[0];
      const getLastEditedDocument = (folderGroup: MatterDocumentFolderGroup) => [...folderGroup.documents].sort((first, second) =>
        String(second.updated_at || second.created_at || "").localeCompare(String(first.updated_at || first.created_at || "")),
      )[0];
      const getSortValue = (folderGroup: MatterDocumentFolderGroup) => {
        const latestDocument = getLatestDocument(folderGroup);
        const lastEditedDocument = getLastEditedDocument(folderGroup);
        switch (folderSortColumn) {
          case "matter":
            return getCaseDisplayName(detail.case);
          case "documents":
            return folderGroup.documents.length;
          case "latest_uploaded":
            return latestDocument?.created_at || "";
          case "last_user_edit":
            return getDocumentUserName(lastEditedDocument);
          default:
            return folderGroup.folderName;
        }
      };

      const firstValue = getSortValue(a);
      const secondValue = getSortValue(b);
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : String(firstValue).toLowerCase().localeCompare(String(secondValue).toLowerCase());
      return folderSortDirection === "asc" ? comparison : -comparison;
    });
  }, [detail.case, folderSortColumn, folderSortDirection, sortedDocuments]);
  const selectedFolderGroup = selectedFolderName
    ? folderGroups.find((folderGroup) => folderGroup.folderName === selectedFolderName) || null
    : null;
  const documentsToDisplay = selectedFolderGroup ? selectedFolderGroup.documents : sortedDocuments;
  const displayTotalCount = displayMode === "folders" && !selectedFolderGroup ? folderGroups.length : documentsToDisplay.length;
  const displayTotalPages = Math.ceil(displayTotalCount / itemsPerPage);
  const safeTotalPages = Math.max(1, displayTotalPages);
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = displayTotalCount === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(effectiveCurrentPage * itemsPerPage, displayTotalCount);
  const visiblePageItems = getVisiblePageItems(effectiveCurrentPage, safeTotalPages);
  const paginatedFolderGroups = folderGroups.slice(
    (effectiveCurrentPage - 1) * itemsPerPage,
    effectiveCurrentPage * itemsPerPage,
  );
  const paginatedDocumentsToDisplay = documentsToDisplay.slice(
    (effectiveCurrentPage - 1) * itemsPerPage,
    effectiveCurrentPage * itemsPerPage,
  );

  const activeFilterCount = [storageTypeFilter, folderFilter].filter(
    (value) => value !== ALL_MATTER_DOCUMENT_STORAGE_TYPES && value !== ALL_MATTER_DOCUMENT_FOLDERS,
  ).length;

  useEffect(() => {
    setCurrentPage(1);
  }, [displayMode, folderFilter, searchTerm, selectedFolderName, storageTypeFilter]);

  const handleSort = (column: MatterDocumentSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortColumn(column);
    setSortDirection(column === "created_at" ? "desc" : "asc");
  };

  const renderSortIcon = (column: MatterDocumentSortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/50" />;
    return <ArrowUpDown className={cn("ml-2 h-3.5 w-3.5 text-primary", sortDirection === "desc" && "rotate-180")} />;
  };

  const handleFolderSort = (column: MatterDocumentFolderSortColumn) => {
    if (folderSortColumn === column) {
      setFolderSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setFolderSortColumn(column);
    setFolderSortDirection(column === "latest_uploaded" ? "desc" : "asc");
  };

  const renderFolderSortIcon = (column: MatterDocumentFolderSortColumn) => {
    if (folderSortColumn !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/50" />;
    return <ArrowUpDown className={cn("ml-2 h-3.5 w-3.5 text-primary", folderSortDirection === "desc" && "rotate-180")} />;
  };

  useEffect(() => {
    getDocumentCapabilities()
      .then(setCapabilities)
      .catch((error) => console.error("Failed to load document permissions", error))
      .finally(() => setCapabilitiesLoaded(true));
  }, []);

  useEffect(() => {
    Promise.all([listCases({ limit: 500 }), getAllDocuments()])
      .then(([caseRows, documentRows]) => {
        const map = new Map<string, string>();
        map.set(detail.case.id, getCaseDisplayName(detail.case));
        caseRows.forEach((caseRecord) => map.set(caseRecord.id, getCaseDisplayName(caseRecord)));
        setMatterOptions([...map.entries()].sort((a, b) => a[1].localeCompare(b[1])));
        setAccessibleDocuments(documentRows);
      })
      .catch((error) => {
        console.error("Failed to load document move options", error);
        setMatterOptions([[detail.case.id, getCaseDisplayName(detail.case)]]);
        setAccessibleDocuments(documents);
      });
  }, [detail.case, documents]);

  const handleViewDocument = async (document: DocumentRecord) => {
    onDocumentView(document);
  };

  const handleDeleteDocument = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDocument(documentToDelete.id);
      setDocumentToDelete(null);
      onChanged();
      toast({ title: "Document Deleted", description: "The matter document has been deleted." });
    } catch (error) {
      toast({ title: "Document Not Deleted", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDocumentMoved = () => {
    setDocumentToMove(null);
    onChanged();
  };

  const handleDocumentRenamed = () => {
    setDocumentToRename(null);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <UploadDocumentDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        matterId={detail.case.id}
        documents={documents}
        onSaved={onChanged}
      />
      <RenameMatterDocumentSheet
        documentRecord={documentToRename}
        open={Boolean(documentToRename)}
        onOpenChange={(open) => {
          if (!open) setDocumentToRename(null);
        }}
        onSaved={handleDocumentRenamed}
      />
      <MoveMatterDocumentSheet
        documentRecord={documentToMove}
        open={Boolean(documentToMove)}
        onOpenChange={(open) => {
          if (!open) setDocumentToMove(null);
        }}
        matterOptions={matterOptions}
        documents={accessibleDocuments.length > 0 ? accessibleDocuments : documents}
        onSaved={handleDocumentMoved}
      />
      <EditMatterDocumentFolderSheet
        folderGroup={folderToEdit}
        matterId={detail.case.id}
        open={Boolean(folderToEdit)}
        onOpenChange={(open) => {
          if (!open) setFolderToEdit(null);
        }}
        onSaved={() => {
          setFolderToEdit(null);
          onChanged();
        }}
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

      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {selectedFolderGroup ? (
            <nav aria-label="Document folder breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <button
                type="button"
                className="shrink-0 font-medium text-[#2384CA] hover:underline"
                onClick={() => setSelectedFolderName(null)}
              >
                Folders
              </button>
              <span className="shrink-0">/</span>
              <span className="truncate font-medium text-foreground">
                {selectedFolderGroup.folderName}
              </span>
              <span className="shrink-0 text-xs">({formatDocumentCount(selectedFolderGroup.documents.length)})</span>
            </nav>
          ) : (
            <div />
          )}
          <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-3 lg:w-auto">
            <div
              className={`relative flex items-center transition-all duration-300 ${
                isSearchExpanded || searchTerm ? "w-full sm:w-64" : "w-10"
              }`}
            >
              <Button
                type="button"
                variant={isSearchExpanded || searchTerm ? "ghost" : "outline"}
                size="icon"
                className="absolute left-0 z-10 h-10 w-10 rounded-full"
                aria-label="Search documents"
                title="Search documents"
                onClick={() => {
                  if (!isSearchExpanded && !searchTerm) {
                    setIsSearchExpanded(true);
                    window.setTimeout(() => document.getElementById("matter-document-search")?.focus(), 100);
                  }
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
              <Input
                id="matter-document-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search documents..."
                className={`h-10 rounded-full bg-background pl-10 transition-all duration-300 ${
                  isSearchExpanded || searchTerm ? "w-full opacity-100" : "w-0 border-0 p-0 opacity-0"
                }`}
                onBlur={() => {
                  if (!searchTerm) setIsSearchExpanded(false);
                }}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    "relative h-10 w-10 shrink-0 rounded-full",
                    activeFilterCount > 0 && "border-primary/40 bg-primary/10 text-primary",
                  )}
                  aria-label="Filter documents"
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
              <PopoverContent className="right-0 top-full mt-2 w-80 p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Filter Documents</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => {
                        setStorageTypeFilter(ALL_MATTER_DOCUMENT_STORAGE_TYPES);
                        setFolderFilter(ALL_MATTER_DOCUMENT_FOLDERS);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={storageTypeFilter} onValueChange={setStorageTypeFilter}>
                      <SelectTrigger>
                        <span className={storageTypeFilter === ALL_MATTER_DOCUMENT_STORAGE_TYPES ? "text-muted-foreground" : undefined}>
                          {storageTypeFilter === ALL_MATTER_DOCUMENT_STORAGE_TYPES ? "Any Type" : getStorageTypeLabel(storageTypeFilter)}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="z-[150]">
                        <SelectItem value={ALL_MATTER_DOCUMENT_STORAGE_TYPES}>Any Type</SelectItem>
                        <SelectItem value="internal">Internal</SelectItem>
                        <SelectItem value="gdrive">Google Drive</SelectItem>
                        <SelectItem value="onedrive">OneDrive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Folder</Label>
                    <Select value={folderFilter} onValueChange={setFolderFilter}>
                      <SelectTrigger>
                        <span className={folderFilter === ALL_MATTER_DOCUMENT_FOLDERS ? "text-muted-foreground" : undefined}>
                          {folderFilter === ALL_MATTER_DOCUMENT_FOLDERS ? "Any Folder" : folderFilter}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                        <SelectItem value={ALL_MATTER_DOCUMENT_FOLDERS}>Any Folder</SelectItem>
                        {folderOptions.map((folderName) => (
                          <SelectItem key={folderName} value={folderName}>{folderName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Tabs
              value={displayMode}
              onValueChange={(value) => {
                setDisplayMode(value as MatterDocumentDisplayMode);
                setSelectedFolderName(null);
              }}
            >
              <TabsList className="h-10 rounded-full">
                <TabsTrigger value="documents" className="rounded-full px-3">
                  <FileText className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="folders" className="rounded-full px-3">
                  <FolderOpen className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {!capabilitiesLoaded ? null : capabilities.canUpload ? (
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-[#0484C8]"
                aria-label="Upload document"
                title="Upload document"
                onClick={() => setIsUploadOpen(true)}
              >
                <Upload className="h-5 w-5" />
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">You have view-only document access for this matter.</p>
            )}
          </div>
        </div>

        {documents.length === 0 ? (
          <EmptyState icon={FileText} text="No documents yet." />
        ) : sortedDocuments.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground">No documents found</h3>
            <p className="mt-1 text-muted-foreground">Try adjusting your search or filters.</p>
          </div>
        ) : displayMode === "folders" && !selectedFolderGroup ? (
          <div className="overflow-hidden">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[27%]" />
                <col className="w-[11%]" />
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  {([
                    ["folder", "Folder", "pl-4 pr-1"],
                    ["matter", "Matter", "pl-1 pr-4"],
                    ["documents", "Documents", "pl-3 pr-1"],
                    ["latest_uploaded", "Latest Upload", "pl-1 pr-3"],
                    ["last_user_edit", "Last User Edit", "pl-3 pr-1"],
                  ] as Array<[MatterDocumentFolderSortColumn, string, string]>).map(([column, label, paddingClass]) => (
                    <th
                      key={column}
                      className={cn("h-12 cursor-pointer py-4 font-medium transition-colors hover:bg-muted/80", paddingClass)}
                      onClick={() => handleFolderSort(column)}
                    >
                      <div className="flex items-center">
                        {label} {renderFolderSortIcon(column)}
                      </div>
                    </th>
                  ))}
                  <th className="h-12 py-4 pl-1 pr-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFolderGroups.map((folderGroup) => {
                  const latestDocument = [...folderGroup.documents].sort((a, b) =>
                    String(b.created_at || "").localeCompare(String(a.created_at || "")),
                  )[0];
                  const lastEditedDocument = [...folderGroup.documents].sort((a, b) =>
                    String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")),
                  )[0];
                  return (
                    <tr
                      key={folderGroup.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
                      onClick={() => setSelectedFolderName(folderGroup.folderName)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedFolderName(folderGroup.folderName);
                        }
                      }}
                    >
                      <td className="max-w-xs py-2 pl-4 pr-1">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                            <FolderOpen className="h-4 w-4" />
                          </span>
                          <span className="truncate font-medium text-[#2384CA] hover:underline">{folderGroup.folderName}</span>
                        </div>
                      </td>
                      <td className="min-w-0 py-2 pl-1 pr-4 text-foreground/70">
                        <div className="min-w-0">
                          <Link to={`/case/${detail.case.id}`} className="block truncate font-medium text-[#2384CA] hover:underline">
                            {detail.case.case_name}
                          </Link>
                          <div className="truncate text-xs text-muted-foreground">{detail.case.case_number}</div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-2 pl-3 pr-1 text-foreground/70">{folderGroup.documents.length}</td>
                      <td className="py-2 pl-1 pr-3 text-foreground/70">
                        <div className="truncate">
                          {latestDocument ? formatDateTime(latestDocument.created_at) : "Not set"}
                        </div>
                      </td>
                      <td className="py-2 pl-3 pr-1 text-foreground/70">
                        <div className="truncate" onClick={(event) => event.stopPropagation()}>
                          <UserLink
                            userId={getDocumentUserId(lastEditedDocument)}
                            user={lastEditedDocument?.updated_user || lastEditedDocument?.uploaded_user}
                            name={getDocumentUserName(lastEditedDocument)}
                            stopPropagation
                          />
                        </div>
                      </td>
                      <td className="py-2 pl-1 pr-3 text-right" onClick={(event) => event.stopPropagation()}>
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
                            <DropdownMenuItem onClick={() => setSelectedFolderName(folderGroup.folderName)}>
                              <FolderOpen className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            {capabilities.canManageFolders && (
                              <DropdownMenuItem onClick={() => setFolderToEdit(folderGroup)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[22%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  {([
                    ["name", "Name"],
                    ["storage_type", "Type"],
                    ["folder", "Folder"],
                    ["created_at", "Uploaded"],
                  ] as Array<[MatterDocumentSortColumn, string]>).map(([column, label]) => (
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
                {paginatedDocumentsToDisplay.map((document) => (
                  <tr key={document.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="min-w-0 px-4 py-2">
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-3 font-medium text-[#2384CA] hover:underline"
                        onClick={() => handleViewDocument(document)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                          <DocumentTypeIcon documentRecord={document} />
                        </span>
                        <span className="min-w-0 truncate">{getDocumentName(document)}</span>
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="capitalize">{getStorageTypeLabel(document.storage_type)}</Badge>
                    </td>
                    <td className="px-4 py-2 text-foreground/70">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{getDisplayFolderName(document)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-foreground/70">
                      <div className="flex items-center">
                        <Calendar className="mr-2 h-3.5 w-3.5 shrink-0" />
                        <span>{formatDateTime(document.created_at)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDocument(document)}>
                            {document.storage_type === "internal" ? (
                              <Eye className="mr-2 h-4 w-4" />
                            ) : (
                              <ExternalLink className="mr-2 h-4 w-4" />
                            )}
                            View
                          </DropdownMenuItem>
                          {capabilities.canEdit && (
                            <DropdownMenuItem onClick={() => setDocumentToRename(document)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                          )}
                          {capabilities.canMove && (
                            <DropdownMenuItem onClick={() => setDocumentToMove(document)}>
                              <FolderOpen className="mr-2 h-4 w-4" />
                              Move
                            </DropdownMenuItem>
                          )}
                          {capabilities.canDelete && (
                            <DropdownMenuItem onClick={() => setDocumentToDelete(document)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        {displayTotalCount > 0 ? (
          <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
              {" - "}
              <span className="font-medium text-foreground">{lastVisibleRow}</span>
              {" of "}
              <span className="font-medium text-foreground">{displayTotalCount}</span>{" "}
              {displayMode === "folders" && !selectedFolderGroup ? "folders" : "documents"}
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
      </div>
    </div>
  );
}

function MoveMatterDocumentSheet({
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
  onSaved: () => void;
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
      await moveDocument(documentRecord.id, matterId, { folderName });
      onSaved();
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

function RenameMatterDocumentSheet({
  documentRecord,
  open,
  onOpenChange,
  onSaved,
}: {
  documentRecord: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
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
      await renameDocument(documentRecord.id, name);
      onSaved();
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

function EditMatterDocumentFolderSheet({
  folderGroup,
  matterId,
  open,
  onOpenChange,
  onSaved,
}: {
  folderGroup: MatterDocumentFolderGroup | null;
  matterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [folderName, setFolderName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && folderGroup) setFolderName(folderGroup.folderName === UNFILED_FOLDER_NAME ? "" : folderGroup.folderName);
    if (!open) setFolderName("");
  }, [folderGroup, open]);

  const handleSubmit = async () => {
    if (!folderGroup) return;
    setSubmitting(true);
    try {
      await renameDocumentFolder(folderGroup.documents.map((document) => document.id), matterId, folderName);
      onSaved();
      toast({ title: "Folder Updated", description: "The folder name has been updated." });
    } catch (error) {
      toast({ title: "Folder Not Updated", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 shadow-none sm:max-w-md">
        <SheetHeader className="mb-6 space-y-1">
          <SheetTitle className="text-lg font-semibold">Edit Folder</SheetTitle>
        </SheetHeader>
        <div className="space-y-2">
          <Label>Folder</Label>
          <Input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="Folder name"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to move these documents to Unfiled.
          </p>
        </div>
        <SheetFooter className="shadow-none">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!folderGroup || submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function UploadDocumentDialog({
  open,
  onOpenChange,
  matterId,
  documents,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterId: string;
  documents: DocumentRecord[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [folderName, setFolderName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
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
      if (documentMatterId === matterId && documentFolderName) folders.add(documentFolderName);
    });
    return [...folders].sort((a, b) => a.localeCompare(b));
  }, [documents, matterId]);

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      await uploadDocument(file, matterId, undefined, { folderName });
      onOpenChange(false);
      onSaved();
      toast({ title: "Document Uploaded", description: "The document has been added to this matter." });
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
              <div className="max-w-full truncate px-2 text-sm font-medium text-foreground">
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
          <Button type="button" onClick={handleSubmit} disabled={!file || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ExternalDocumentDialog({
  open,
  onOpenChange,
  matterId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [storageType, setStorageType] = useState<Exclude<DocumentStorageType, "internal">>("gdrive");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setFileUrl("");
      setStorageType("gdrive");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim() || !fileUrl.trim()) return;
    setSubmitting(true);
    try {
      await createExternalDocument(
        {
          name: name.trim(),
          file_url: fileUrl.trim(),
          storage_type: storageType,
        },
        matterId,
      );
      onOpenChange(false);
      onSaved();
      toast({ title: "External Document Added", description: "The link has been attached to this matter." });
    } catch (error) {
      toast({ title: "Document Not Added", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add External Document</DialogTitle>
          <DialogDescription>Attach a Google Drive or OneDrive URL to this matter.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Engagement letter" />
          </div>
          <div className="space-y-2">
            <Label>URL</Label>
            <Input value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={storageType} onValueChange={(value) => setStorageType(value as Exclude<DocumentStorageType, "internal">)}>
              <SelectTrigger>
                <span>{getStorageTypeLabel(storageType)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gdrive">Google Drive</SelectItem>
                <SelectItem value="onedrive">OneDrive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!name.trim() || !fileUrl.trim() || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Add Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinancialsTab({ detail }: { detail: CaseDetail }) {
  return (
    <ListCard title="Financials" items={detail.financials} emptyIcon={DollarSign} emptyText="No financial entries yet." render={(entry) => (
      <Row title={entry.description} meta={`${entry.entry_type} · ${entry.status} · ${money(entry.amount_cents, entry.currency)}`} />
    )} />
  );
}

function DetailRow({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
      <span className="whitespace-nowrap font-medium text-foreground/70">{label}</span>
      <span className={cn("col-span-2 break-words", className)}>{value}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
      <Icon className="mb-2 h-8 w-8 opacity-40" />
      {text}
    </div>
  );
}

function TwoColumnTab({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof FileText;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  const childArray = Array.isArray(children) ? children : [children];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {childArray[0]}
          {action}
        </CardContent>
      </Card>
      {childArray[1]}
    </div>
  );
}

function ListCard({
  title,
  items,
  emptyIcon,
  emptyText,
  render,
}: {
  title: string;
  items: any[];
  emptyIcon: typeof FileText;
  emptyText: string;
  render: (item: any) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? <EmptyState icon={emptyIcon} text={emptyText} /> : items.map((item) => <div key={item.id}>{render(item)}</div>)}
      </CardContent>
    </Card>
  );
}

function Row({ title, meta, badge }: { title: string; meta?: string; badge?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{title}</div>
        {badge ? <Badge variant="outline" className="capitalize">{badge}</Badge> : null}
      </div>
      {meta ? <div className="mt-1 text-sm text-muted-foreground">{meta}</div> : null}
    </div>
  );
}
