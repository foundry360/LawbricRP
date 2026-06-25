import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUpDown,
  Briefcase,
  Calendar,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
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
  MailOpen,
  Maximize2,
  MoreVertical,
  NotebookPen,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Reply,
  Search,
  Send,
  Trash2,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker, DateTimePicker } from "@/components/DatePicker";
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
import { useColumnOrder, type ReorderableColumn } from "@/hooks/use-column-order";
import { useToast } from "@/hooks/use-toast";
import { apiClient, createContact, getActiveGhlLocationId, getAppLocationContext, getContacts, getPipelines, type GhlPipeline } from "@/lib/api";
import {
  addCaseParty,
  createCaseEvent,
  createCaseNote,
  createCaseTask,
  deleteCaseCommunication,
  deleteCaseNote,
  getCase,
  listCases,
  type CaseRecord,
  type CaseDetail,
  sendCaseCommunication,
  updateCase,
  updateCaseCommunication,
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
  uploadGoogleDriveDocument,
  viewDocument,
  type DocumentCapabilities,
  type DocumentRecord,
  type DocumentStorageType,
} from "@/lib/documents";
import { getGoogleDriveStatus, getMatterDriveFolder, type MatterDriveFolderResult } from "@/lib/google-drive";
import { deleteTask, formatTaskStatusLabel, updateTask } from "@/lib/tasks";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPersonName } from "@/lib/names";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import { supabase } from "@/lib/supabase";
import { getAssignableUsers, getUserId, getUserName, type AssignableUser } from "@/lib/users";
import { cn } from "@/lib/utils";

const CASE_DETAIL_TAB_TRIGGER_CLASS =
  "rounded-none border-b-2 border-border py-3 text-muted-foreground/70 data-[state=active]:border-b-4 data-[state=active]:border-[#2384CA] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
const CASE_TYPE_OPTIONS = PRACTICE_AREAS;
const CASE_STATUS_OPTIONS = ["open", "pending", "closed", "archived"];
const MATTER_LIFECYCLE_TIMELINE_COLORS = ["bg-slate-600", "bg-sky-800", "bg-sky-500", "bg-sky-300", "bg-cyan-500", "bg-blue-700"];
const EMAIL_SIGNATURE_MESSAGE_SPACE_HTML = "<div><br></div><div><br></div>";
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
const ALL_MATTER_NOTE_AUTHORS = "all";
const ALL_MATTER_NOTE_TYPES = "all";
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
function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getEmailSignatureStyle(textSize: string) {
  switch (textSize) {
    case "small":
      return "font-size: 12px; line-height: 1.45;";
    case "large":
      return "font-size: 16px; line-height: 1.55;";
    case "x-large":
      return "font-size: 18px; line-height: 1.6;";
    default:
      return "font-size: 14px; line-height: 1.5;";
  }
}
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

function getNextPipelineStageName(caseRecord: CaseRecord, pipelines: GhlPipeline[]) {
  const pipeline = pipelines.find((item) => item.id === caseRecord.ghl_pipeline_id) ||
    pipelines.find((item) => (item.stages || []).some((stage) => stage.id === caseRecord.ghl_pipeline_stage_id));

  if (!pipeline?.stages?.length) return "Not set";

  const orderedStages = [...pipeline.stages].sort((first, second) => {
    const firstPosition = typeof first.position === "number" ? first.position : Number.POSITIVE_INFINITY;
    const secondPosition = typeof second.position === "number" ? second.position : Number.POSITIVE_INFINITY;
    return firstPosition - secondPosition;
  });
  const currentStageIndex = orderedStages.findIndex((stage) => stage.id === caseRecord.ghl_pipeline_stage_id) !== -1
    ? orderedStages.findIndex((stage) => stage.id === caseRecord.ghl_pipeline_stage_id)
    : orderedStages.findIndex((stage) => stage.name.toLowerCase() === String(caseRecord.stage || "").toLowerCase());

  if (currentStageIndex === -1) return "Not set";
  return orderedStages[currentStageIndex + 1]?.name || "No next stage";
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

function formatDateOnly(value?: string | null) {
  if (!value) return "Not set";
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function formatDateInput(value?: string | null) {
  if (!value) return "";
  const [datePart] = value.split("T");
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
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

function isPrivateTask(task: any) {
  return task?.metadata?.is_private === true;
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

function formatMatterLifecycleLabel(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "Not set";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getMatterDaysOpen(caseRecord: CaseRecord) {
  const createdAt = new Date(caseRecord.opened_at || caseRecord.created_at);
  if (Number.isNaN(createdAt.getTime())) return 0;

  const start = new Date(createdAt);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

function formatMatterTimelineDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit", year: "numeric" }).format(date);
}

function getMatterTimelineStageLabel(value?: string | null) {
  const label = formatMatterLifecycleLabel(value);
  return label === "Not set" ? "No Stage" : label;
}

function formatMatterTimelineDuration(duration: number) {
  const days = Math.floor(duration / 86_400_000);
  if (days < 1) return "< 1 Day";
  return `${days} ${days === 1 ? "Day" : "Days"}`;
}

function getMatterLifecycleSegments(caseRecord: CaseRecord, events: any[]) {
  const startDate = new Date(caseRecord.opened_at || caseRecord.created_at);
  const endDate = new Date(caseRecord.closed_at || new Date());
  const startTime = Number.isNaN(startDate.getTime()) ? Date.now() : startDate.getTime();
  const endTime = Number.isNaN(endDate.getTime()) || endDate.getTime() < startTime ? Date.now() : endDate.getTime();
  const stageChangeEvents = [...(events || [])]
    .filter((event) => event?.event_type === "stage_change")
    .map((event) => ({ ...event, eventTime: new Date(event.start_at || event.created_at).getTime() }))
    .filter((event) => Number.isFinite(event.eventTime) && event.eventTime >= startTime && event.eventTime <= endTime)
    .sort((first, second) => first.eventTime - second.eventTime);

  const timelineSegments: Array<{ label: string; duration: number }> = [];
  let currentStageLabel = stageChangeEvents[0]
    ? getMatterTimelineStageLabel(stageChangeEvents[0].metadata?.previous_stage)
    : getMatterTimelineStageLabel(caseRecord.stage);
  let cursor = startTime;

  stageChangeEvents.forEach((event) => {
    const duration = Math.max(0, event.eventTime - cursor);
    if (duration > 0) timelineSegments.push({ label: currentStageLabel, duration });
    currentStageLabel = getMatterTimelineStageLabel(event.metadata?.stage);
    cursor = event.eventTime;
  });

  const finalDuration = Math.max(0, endTime - cursor);
  if (finalDuration > 0 || timelineSegments.length === 0) {
    timelineSegments.push({ label: currentStageLabel, duration: finalDuration });
  }

  const mergedSegments = timelineSegments.reduce<Array<{ label: string; duration: number }>>((segments, segment) => {
    const previousSegment = segments[segments.length - 1];
    if (previousSegment?.label === segment.label) {
      previousSegment.duration += segment.duration;
      return segments;
    }
    return [...segments, segment];
  }, []);
  const totalDuration = mergedSegments.reduce((total, segment) => total + segment.duration, 0);

  return mergedSegments.map((segment, index) => {
    const percent = totalDuration > 0 ? (segment.duration / totalDuration) * 100 : 100;
    return {
      key: `${segment.label}-${index}`,
      label: segment.label,
      colorClassName: MATTER_LIFECYCLE_TIMELINE_COLORS[index % MATTER_LIFECYCLE_TIMELINE_COLORS.length],
      duration: segment.duration,
      durationLabel: formatMatterTimelineDuration(segment.duration),
      percent,
    };
  });
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

function getRawGhlContact(response: any) {
  return response?.contact || response?.data?.contact || response?.data || response || null;
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

function mergeLivePrimaryContact(caseRecord: CaseRecord, contact: any): CaseRecord {
  if (!contact) return caseRecord;
  return {
    ...caseRecord,
    primary_contact_name: getMatterContactName(contact) || null,
    primary_contact_email: getMatterContactEmail(contact) || null,
    primary_contact_phone: getMatterContactPhone(contact) || null,
  };
}

function mergeLiveMatterParty(party: any, contact: any) {
  if (!contact) return party;
  return {
    ...party,
    name: getMatterContactName(contact) || party.name || null,
    email: getMatterContactEmail(contact) || null,
    phone: getMatterContactPhone(contact) || null,
  };
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

function getNotePreviewText(value?: string | null) {
  if (!value) return "Untitled note";

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(value, "text/html");
    return doc.body.textContent?.replace(/\s+/g, " ").trim() || "Untitled note";
  }

  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "Untitled note";
}

function getNoteSubject(note?: any | null) {
  const subject = typeof note?.metadata?.subject === "string" ? note.metadata.subject.trim() : "";
  return subject || "Untitled note";
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
  const [communicationComposeRequested, setCommunicationComposeRequested] = useState(false);
  const [isMatterDetailsCollapsed, setIsMatterDetailsCollapsed] = useState(false);
  const [contactAddress, setContactAddress] = useState("Not set");
  const [users, setUsers] = useState<AssignableUser[]>([]);

  const loadCase = async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const caseDetail = await getCase(caseId);
      setContactAddress("Not set");
      const contactIds = [
        caseDetail.case.ghl_contact_id,
        ...caseDetail.parties.map((party) => party.ghl_contact_id),
      ]
        .filter(Boolean)
        .map((value) => String(value));
      const uniqueContactIds = Array.from(new Set(contactIds));
      const liveContactEntries = await Promise.all(
        uniqueContactIds.map(async (contactId) => {
          try {
            const data = await apiClient(`/contacts/${encodeURIComponent(contactId)}`);
            return [contactId, getRawGhlContact(data)] as const;
          } catch (error) {
            console.error("Failed to load live contact details", error);
            return [contactId, null] as const;
          }
        }),
      );
      const liveContactsById = new Map(liveContactEntries);
      const primaryContact = caseDetail.case.ghl_contact_id
        ? liveContactsById.get(caseDetail.case.ghl_contact_id)
        : null;

      setDetail({
        ...caseDetail,
        case: mergeLivePrimaryContact(caseDetail.case, primaryContact),
        parties: caseDetail.parties.map((party) =>
          mergeLiveMatterParty(party, party.ghl_contact_id ? liveContactsById.get(String(party.ghl_contact_id)) : null),
        ),
      });

      if (primaryContact) {
        setContactAddress(formatContactAddress(primaryContact));
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

  const openTaskSheet = (task: any) => {
    setSelectedTask(task);
    setIsCreateTaskOpen(true);
  };

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
      toast({ title: "Task Deleted", description: `${taskToDelete.title} was removed from normal views.` });
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
        title="Delete task?"
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
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
          <nav className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
            <Link to="/cases" className="font-medium text-[#2384CA] transition-colors hover:text-[#1b6da8]">
              Matters
            </Link>
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span className="max-w-[180px] truncate text-foreground">{detail.case.case_name}</span>
          </nav>
          <h1 className="min-w-0 truncate text-center text-xl font-bold text-foreground">{detail.case.case_name}</h1>
          <div className="flex w-full gap-3 md:w-auto md:justify-self-end">
            <Button
              size="icon"
              className="h-10 w-10 rounded-full p-0"
              title="Email"
              aria-label="Email"
              onClick={() => {
                setActiveDetailTab("communications");
                setCommunicationComposeRequested(true);
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

      <div
        className={cn(
          "grid flex-1 grid-cols-1 overflow-hidden border-b border-border lg:divide-x lg:divide-border",
          isMatterDetailsCollapsed ? "lg:grid-cols-[3rem_minmax(0,1fr)]" : "lg:grid-cols-[22fr_78fr]",
        )}
      >
        <div
          className={cn(
            "hover-scrollbar h-full overflow-y-auto py-6",
            isMatterDetailsCollapsed ? "flex justify-center px-1" : "lg:pr-6",
          )}
        >
          {isMatterDetailsCollapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-muted text-muted-foreground hover:bg-[#2384CA] hover:text-white"
              aria-label="Expand matter details"
              onClick={() => setIsMatterDetailsCollapsed(false)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-3 border-b border-border pb-3">
                <h2 className="text-lg font-semibold">Matter Details</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-muted text-muted-foreground hover:bg-[#2384CA] hover:text-white"
                  aria-label="Collapse matter details"
                  onClick={() => setIsMatterDetailsCollapsed(true)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
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
                      <DetailRow label="Opened" value={formatDateTime(detail.case.opened_at || detail.case.created_at)} />
                      <DetailRow label="Filing Deadline" value={formatDateOnly(detail.case.statute_of_limitations_at)} />
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
            </>
          )}
        </div>

        <div className="h-full overflow-hidden lg:px-6">
          <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab} className="flex h-full min-h-0 w-full flex-col">
            <div className="shrink-0 bg-background pb-4 pt-6">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-transparent p-0 md:grid-cols-5 xl:grid-cols-9">
                <TabsTrigger value="dashboard" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <Briefcase className="mr-2 h-4 w-4" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="tasks" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="contacts" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <Users className="mr-2 h-4 w-4" />
                  Contacts
                </TabsTrigger>
                <TabsTrigger value="notes" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <NotebookPen className="mr-2 h-4 w-4" />
                  Notes
                </TabsTrigger>
                <TabsTrigger value="communications" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <Mail className="mr-2 h-4 w-4 shrink-0" />
                  Conversations
                </TabsTrigger>
                <TabsTrigger value="timeline" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <Clock className="mr-2 h-4 w-4" />
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="events" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Events
                </TabsTrigger>
                <TabsTrigger value="documents" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <FileText className="mr-2 h-4 w-4" />
                  Documents
                </TabsTrigger>
                <TabsTrigger value="financials" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Financials
                </TabsTrigger>
              </TabsList>
            </div>

            <div
              className={cn(
                "min-h-0 flex-1",
                activeDetailTab === "communications"
                  ? "overflow-hidden pb-0"
                  : "hover-scrollbar overflow-y-auto pb-6",
              )}
            >
              <TabsContent value="dashboard" className="m-0">
                <MatterDashboardTab
                  detail={detail}
                  onTabChange={setActiveDetailTab}
                  onTaskClick={openTaskSheet}
                />
              </TabsContent>
              <TabsContent value="tasks" className="m-0">
                <TasksTab
                  detail={detail}
                  users={users}
                  onTaskClick={openTaskSheet}
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
                  onCreateNote={() => {
                    setSelectedNote(null);
                    setNoteSheetMode("create");
                    setIsNoteSheetOpen(true);
                  }}
                  onDeleteNote={handleDeleteMatterNote}
                />
              </TabsContent>
              <TabsContent value="communications" className="m-0 h-full min-h-0">
                <CommunicationsTab
                  detail={detail}
                  composeRequested={communicationComposeRequested}
                  onComposeHandled={() => setCommunicationComposeRequested(false)}
                  onCommunicationsRefreshed={(communications) => {
                    setDetail((current) =>
                      current
                        ? {
                          ...current,
                          communications,
                        }
                        : current
                    );
                  }}
                  onCommunicationCreated={(communication) => {
                    setDetail((current) =>
                      current
                        ? {
                          ...current,
                          communications: [
                            communication,
                            ...current.communications.filter((item: any) => String(item.id) !== String(communication.id)),
                          ],
                        }
                        : current
                    );
                  }}
                  onCommunicationUpdated={(communication) => {
                    setDetail((current) =>
                      current
                        ? {
                          ...current,
                          communications: current.communications.map((item: any) =>
                            String(item.id) === String(communication.id) ? communication : item
                          ),
                        }
                        : current
                    );
                  }}
                  onCommunicationDeleted={(communicationId) => {
                    setDetail((current) =>
                      current
                        ? {
                          ...current,
                          communications: current.communications.filter((item: any) => String(item.id) !== String(communicationId)),
                        }
                        : current
                    );
                  }}
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
    statuteOfLimitationsAt: formatDateInput(detail.case.statute_of_limitations_at),
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
      statuteOfLimitationsAt: formatDateInput(detail.case.statute_of_limitations_at),
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
    detail.case.statute_of_limitations_at,
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
        statuteOfLimitationsAt: form.statuteOfLimitationsAt || null,
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
            <Label>Filing Deadline</Label>
            <DatePicker
              value={form.statuteOfLimitationsAt}
              onValueChange={(statuteOfLimitationsAt) => setForm({ ...form, statuteOfLimitationsAt })}
              placeholder="Select filing deadline"
              displayMonth="long"
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
    isPrivate: false,
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
      isPrivate: Boolean(task?.metadata?.is_private),
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
      const privacyChanged = !task || form.isPrivate !== Boolean(task?.metadata?.is_private);
      const metadata = { ...(task?.metadata || {}), is_private: form.isPrivate };

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
          ...(privacyChanged ? { metadata } : {}),
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
          metadata,
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
              <Label htmlFor="matter-task-private" className="cursor-pointer whitespace-nowrap text-sm">
                Private
              </Label>
              <button
                id="matter-task-private"
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
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isViewingNote = Boolean(noteRecord) && mode === "view";
  const isEditingNote = Boolean(noteRecord) && mode === "edit";
  const sheetTitle = isViewingNote ? "View Note" : isEditingNote ? "Edit Note" : "Add Note";

  useEffect(() => {
    if (open) {
      setSubject(typeof noteRecord?.metadata?.subject === "string" ? noteRecord.metadata.subject : "");
      setNote(noteRecord?.body || "");
    }
  }, [open, noteRecord]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) {
      toast({ title: "Note Required", description: "Please enter a note.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const trimmedSubject = subject.trim();
      const nextMetadata = { ...(noteRecord?.metadata || {}) };
      if (trimmedSubject) nextMetadata.subject = trimmedSubject;
      else delete nextMetadata.subject;

      if (isEditingNote) {
        await updateCaseNote({
          noteId: noteRecord.id,
          subject,
          body: note,
          metadata: nextMetadata,
        });
      } else {
        await createCaseNote({
          caseId: detail.case.id,
          subject,
          body: note,
          metadata: trimmedSubject ? { subject: trimmedSubject } : {},
        });
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
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              readOnly={isViewingNote}
              placeholder="Subject"
            />
          </div>
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
  onTabChange,
  onTaskClick,
}: {
  detail: CaseDetail;
  onTabChange: (tab: string) => void;
  onTaskClick: (task: any) => void;
}) {
  const [matterPipelines, setMatterPipelines] = useState<GhlPipeline[]>([]);
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
  const daysOpen = getMatterDaysOpen(detail.case);
  const lifecycleSegments = getMatterLifecycleSegments(detail.case, detail.events);
  const visibleLifecycleSegments = lifecycleSegments.filter((stage) => stage.percent > 0);
  const currentLifecycleSegment = visibleLifecycleSegments[visibleLifecycleSegments.length - 1];
  const currentLifecycleSegmentKey = currentLifecycleSegment?.key;
  const openedDateLabel = formatMatterTimelineDate(detail.case.opened_at || detail.case.created_at);
  const nextStageLabel = getNextPipelineStageName(detail.case, matterPipelines);
  const stats = [
    { label: "Open Tasks", value: activeTasks.length, icon: CheckSquare },
    { label: "Overdue", value: overdueTasks.length, icon: Clock },
    { label: "Contacts", value: relatedContactCount + 1, icon: Users },
    { label: "Documents", value: detail.documents.length, icon: FileText },
    { label: "Notes", value: detail.notes.length, icon: NotebookPen },
    { label: "Financials", value: money(financialTotal, detail.financials[0]?.currency || "USD"), icon: DollarSign },
  ];
  type DashboardTaskColumn = "task" | "priority" | "status" | "due_at";
  type DashboardActivityColumn = "activity" | "type" | "date";
  type DashboardDocumentColumn = "document" | "folder" | "uploaded";
  const dashboardTaskColumns: Array<ReorderableColumn<DashboardTaskColumn>> = [
    { key: "task", label: "Task" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "due_at", label: "Due Date" },
  ];
  const dashboardActivityColumns: Array<ReorderableColumn<DashboardActivityColumn>> = [
    { key: "activity", label: "Activity" },
    { key: "type", label: "Type" },
    { key: "date", label: "Date" },
  ];
  const dashboardDocumentColumns: Array<ReorderableColumn<DashboardDocumentColumn>> = [
    { key: "document", label: "Document" },
    { key: "folder", label: "Folder" },
    { key: "uploaded", label: "Uploaded" },
  ];
  const {
    orderedColumns: orderedDashboardTaskColumns,
    getColumnDragProps: getDashboardTaskColumnDragProps,
  } = useColumnOrder("lawbric.tableColumns.matterDashboardTasks", dashboardTaskColumns);
  const {
    orderedColumns: orderedDashboardActivityColumns,
    getColumnDragProps: getDashboardActivityColumnDragProps,
  } = useColumnOrder("lawbric.tableColumns.matterDashboardActivity", dashboardActivityColumns);
  const {
    orderedColumns: orderedDashboardDocumentColumns,
    getColumnDragProps: getDashboardDocumentColumnDragProps,
  } = useColumnOrder("lawbric.tableColumns.matterDashboardDocuments", dashboardDocumentColumns);

  useEffect(() => {
    let cancelled = false;

    loadMatterPipelines()
      .then((pipelines) => {
        if (!cancelled) setMatterPipelines(pipelines);
      })
      .catch((error) => {
        console.warn("Could not load matter timeline pipeline stages", error);
        if (!cancelled) setMatterPipelines([]);
      });

    return () => {
      cancelled = true;
    };
  }, [detail.case.ghl_pipeline_id, detail.case.ghl_pipeline_stage_id]);

  return (
    <div className="space-y-4 pt-3">
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Briefcase className="h-3.5 w-3.5" />
              Matter Timeline
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-[#2384CA] hover:bg-transparent hover:text-[#2384CA]"
              onClick={() => onTabChange("timeline")}
            >
              View full timeline
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Days Open: <span className="font-medium text-foreground">{daysOpen}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Opened: {openedDateLabel}</span>
              <span>Today</span>
            </div>
            <div className="space-y-2">
              <div className="flex h-5 overflow-hidden rounded-sm bg-muted">
                {visibleLifecycleSegments.map((stage) => {
                  const isCurrentStage = stage.key === currentLifecycleSegmentKey;

                  return (
                    <div
                      key={stage.key}
                      className={cn(
                        "flex min-w-[8px] shrink-0 items-center justify-center border-r border-background last:border-r-0",
                        stage.colorClassName,
                      )}
                      style={{ flexBasis: `${stage.percent}%` }}
                      aria-label={`${stage.label}: ${stage.durationLabel}`}
                    >
                      {isCurrentStage ? <Check className="h-3 w-3 text-white" /> : null}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Current Stage:</span>
                <span className={cn("h-2.5 w-2.5 rounded-[2px]", currentLifecycleSegment?.colorClassName || "bg-muted-foreground")} />
                <span className="font-medium text-foreground">
                  {currentLifecycleSegment?.label || getMatterTimelineStageLabel(detail.case.stage)}
                </span>
                <span>{currentLifecycleSegment?.durationLabel || "< 1 Day"}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Next Stage:</span>
                <span className="font-medium text-foreground">{nextStageLabel}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="h-4 w-4" />
              Tasks
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-[#2384CA] hover:bg-transparent hover:text-[#2384CA]"
              onClick={() => onTabChange("tasks")}
            >
              View all tasks
            </Button>
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
                      {orderedDashboardTaskColumns.map((column) => (
                        <th
                          key={column.key}
                          className="h-10 cursor-grab px-3 py-3 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                          {...getDashboardTaskColumnDragProps(column.key)}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardTasks.map((task) => {
                      const renderCell = (column: DashboardTaskColumn) => {
                        switch (column) {
                          case "task":
                            return (
                              <td key={column} className="min-w-0 px-3 py-2">
                                <div className="flex min-w-0 items-center gap-1.5 font-medium text-[#2384CA]">
                                  <span className="truncate">{task.title}</span>
                                  {isPrivateTask(task) ? <Eye className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Private task" /> : null}
                                </div>
                              </td>
                            );
                          case "priority":
                            return (
                              <td key={column} className="px-3 py-2">
                                <Badge variant="outline" className="capitalize">{task.priority || "normal"}</Badge>
                              </td>
                            );
                          case "status":
                            return (
                              <td key={column} className="px-3 py-2">
                                <Badge variant="outline" className={cn("whitespace-nowrap border-transparent capitalize", getStatusClass(task.status))}>
                                  {formatTaskStatusLabel(task.status)}
                                </Badge>
                              </td>
                            );
                          case "due_at":
                            return <td key={column} className="px-3 py-2 text-foreground/70">{formatTaskDate(task.due_at)}</td>;
                          default:
                            return null;
                        }
                      };

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
                        {orderedDashboardTaskColumns.map((column) => renderCell(column.key))}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

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
              <div className="overflow-hidden">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[50%]" />
                    <col className="w-[20%]" />
                    <col className="w-[30%]" />
                  </colgroup>
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      {orderedDashboardActivityColumns.map((column) => (
                        <th
                          key={column.key}
                          className="h-10 cursor-grab px-3 py-3 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                          {...getDashboardActivityColumnDragProps(column.key)}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.map((item) => {
                      const renderCell = (column: DashboardActivityColumn) => {
                        switch (column) {
                          case "activity":
                            return (
                              <td key={column} className="min-w-0 px-3 py-2">
                                <div className="truncate font-medium text-foreground">{item.title}</div>
                              </td>
                            );
                          case "type":
                            return (
                              <td key={column} className="px-3 py-2">
                                <Badge variant="outline" className="capitalize">{item.type}</Badge>
                              </td>
                            );
                          case "date":
                            return <td key={column} className="whitespace-nowrap px-3 py-2 text-foreground/70">{formatDateTime(item.occurred_at)}</td>;
                          default:
                            return null;
                        }
                      };

                      return (
                        <tr key={`${item.type}-${item.id}`} className="border-b last:border-0">
                          {orderedDashboardActivityColumns.map((column) => renderCell(column.key))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Recent Documents
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-[#2384CA] hover:bg-transparent hover:text-[#2384CA]"
              onClick={() => onTabChange("documents")}
            >
              View all documents
            </Button>
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
                      {orderedDashboardDocumentColumns.map((column) => (
                        <th
                          key={column.key}
                          className="h-10 cursor-grab px-3 py-3 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                          {...getDashboardDocumentColumnDragProps(column.key)}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentDocuments.map((document) => {
                      const renderCell = (column: DashboardDocumentColumn) => {
                        switch (column) {
                          case "document":
                            return (
                              <td key={column} className="min-w-0 px-3 py-2">
                                <div className="truncate font-medium text-[#2384CA]">{getDocumentName(document)}</div>
                              </td>
                            );
                          case "folder":
                            return (
                              <td key={column} className="px-3 py-2 text-foreground/70">
                                <div className="truncate">{getDisplayFolderName(document)}</div>
                              </td>
                            );
                          case "uploaded":
                            return <td key={column} className="whitespace-nowrap px-3 py-2 text-foreground/70">{formatDateTime(document.created_at)}</td>;
                          default:
                            return null;
                        }
                      };

                      return (
                        <tr key={document.id} className="border-b last:border-0">
                          {orderedDashboardDocumentColumns.map((column) => renderCell(column.key))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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
  type MatterContactColumn = "contact" | "type" | "role" | "emailOrPhone";
  const columns: Array<ReorderableColumn<MatterContactColumn>> = [
    { key: "contact", label: "Contact" },
    { key: "type", label: "Type" },
    { key: "role", label: "Role" },
    { key: "emailOrPhone", label: "Email / Phone" },
  ];
  const { orderedColumns, getColumnDragProps } = useColumnOrder("lawbric.tableColumns.matterContacts", columns);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, roleFilter, detail.parties.length]);

  return (
    <>
      <Card className="mt-3">
        <CardContent>
      <div className="mb-4 flex flex-col gap-3 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Users className="h-4 w-4" />
          <span className="font-medium text-foreground">Contacts ({contactRows.length})</span>
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
              {orderedColumns.map((column) => (
                <th
                  key={column.key}
                  className="h-12 cursor-grab px-4 py-4 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                  {...getColumnDragProps(column.key)}
                >
                  {column.label}
                </th>
              ))}
              <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedContactRows.map((row) => {
              const renderCell = (column: MatterContactColumn) => {
                switch (column) {
                  case "contact":
                    return (
                      <td key={column} className="max-w-xs px-4 py-2">
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
                    );
                  case "type":
                    return (
                      <td key={column} className="px-4 py-2 capitalize text-foreground/70">
                        <div className="truncate">{row.type}</div>
                      </td>
                    );
                  case "role":
                    return (
                      <td key={column} className="px-4 py-2">
                        {row.isPrimary ? (
                          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-xs font-medium text-primary">
                            Primary
                          </Badge>
                        ) : (
                          <div className="truncate text-foreground/70">{row.role}</div>
                        )}
                      </td>
                    );
                  case "emailOrPhone":
                    return (
                      <td key={column} className="px-4 py-2 text-foreground/70">
                        <div className="truncate">{row.emailOrPhone}</div>
                      </td>
                    );
                  default:
                    return null;
                }
              };

              return (
                <tr
                  key={row.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  {orderedColumns.map((column) => renderCell(column.key))}
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
              );
            })}

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
        </CardContent>
      </Card>

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
  onCreateNote,
  onDeleteNote,
}: {
  detail: CaseDetail;
  users: AssignableUser[];
  onViewNote: (note: any) => void;
  onEditNote: (note: any) => void;
  onCreateNote: () => void;
  onDeleteNote: (note: any) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [authorFilter, setAuthorFilter] = useState(ALL_MATTER_NOTE_AUTHORS);
  const [typeFilter, setTypeFilter] = useState(ALL_MATTER_NOTE_TYPES);
  const authorOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    detail.notes.forEach((note) => {
      optionMap.set(note.created_by || UNASSIGNED_USER_VALUE, getNoteAuthorName(note, users));
    });
    return [...optionMap.entries()].sort((first, second) => first[1].localeCompare(second[1]));
  }, [detail.notes, users]);
  const typeOptions = useMemo(() => {
    return Array.from(new Set(detail.notes.map((note) => String(note.note_type || "case")).filter(Boolean))).sort();
  }, [detail.notes]);
  const filteredNotes = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return detail.notes.filter((note) => {
      const authorValue = note.created_by || UNASSIGNED_USER_VALUE;
      const authorName = getNoteAuthorName(note, users);
      const typeValue = String(note.note_type || "case");
      const matchesSearch = !normalizedSearch ||
        [
          getNoteSubject(note),
          getNotePreviewText(note.body),
          authorName,
          typeValue,
          formatDateTime(note.created_at),
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
      const matchesAuthor = authorFilter === ALL_MATTER_NOTE_AUTHORS || authorValue === authorFilter;
      const matchesType = typeFilter === ALL_MATTER_NOTE_TYPES || typeValue === typeFilter;
      return matchesSearch && matchesAuthor && matchesType;
    });
  }, [authorFilter, detail.notes, searchTerm, typeFilter, users]);
  const activeFilterCount =
    Number(authorFilter !== ALL_MATTER_NOTE_AUTHORS) +
    Number(typeFilter !== ALL_MATTER_NOTE_TYPES);

  return (
    <Card className="mt-3">
      <CardContent>
      <div className="flex flex-col gap-3 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <NotebookPen className="h-4 w-4" />
            <span className="font-medium text-foreground">Notes ({detail.notes.length})</span>
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
              aria-label="Search notes"
              title="Search notes"
              onClick={() => {
                if (!isSearchExpanded && !searchTerm) {
                  setIsSearchExpanded(true);
                  window.setTimeout(() => document.getElementById("matter-note-search")?.focus(), 100);
                }
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Input
              id="matter-note-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search notes..."
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
                aria-label="Filter notes"
                title="Filter notes"
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
                  <div className="text-sm font-semibold">Filter Notes</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setAuthorFilter(ALL_MATTER_NOTE_AUTHORS);
                      setTypeFilter(ALL_MATTER_NOTE_TYPES);
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Created By</Label>
                  <Select value={authorFilter} onValueChange={setAuthorFilter}>
                    <SelectTrigger>
                      <span className={authorFilter === ALL_MATTER_NOTE_AUTHORS ? "text-muted-foreground" : undefined}>
                        {authorFilter === ALL_MATTER_NOTE_AUTHORS
                          ? "Any Author"
                          : authorOptions.find(([value]) => value === authorFilter)?.[1] || "Unknown user"}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                      <SelectItem value={ALL_MATTER_NOTE_AUTHORS}>Any Author</SelectItem>
                      {authorOptions.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <span className={typeFilter === ALL_MATTER_NOTE_TYPES ? "text-muted-foreground" : "capitalize"}>
                        {typeFilter === ALL_MATTER_NOTE_TYPES ? "Any Type" : typeFilter}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                      <SelectItem value={ALL_MATTER_NOTE_TYPES}>Any Type</SelectItem>
                      {typeOptions.map((type) => (
                        <SelectItem key={type} value={type}>
                          <span className="capitalize">{type}</span>
                        </SelectItem>
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
            aria-label="Add note"
            title="Add note"
            onClick={onCreateNote}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <MatterNoteList notes={filteredNotes} users={users} onViewNote={onViewNote} onEditNote={onEditNote} onDeleteNote={onDeleteNote} />
      </CardContent>
    </Card>
  );
}

function getMatterCommunicationRecipients(detail: CaseDetail) {
  const recipients: Array<{ key: string; contactId: string; name: string; email: string; source: string }> = [];
  const addRecipient = (contactId?: string | null, name?: string | null, email?: string | null, source = "Related Contact") => {
    const normalizedEmail = String(email || "").trim();
    const normalizedContactId = String(contactId || "").trim();
    if (!normalizedEmail || !normalizedContactId) return;
    const key = `${normalizedContactId}:${normalizedEmail.toLowerCase()}`;
    if (recipients.some((recipient) => recipient.key === key)) return;
    recipients.push({
      key,
      contactId: normalizedContactId,
      name: formatPersonName(name) || normalizedEmail,
      email: normalizedEmail,
      source,
    });
  };

  addRecipient(detail.case.ghl_contact_id, detail.case.primary_contact_name, detail.case.primary_contact_email, "Primary Contact");
  detail.parties.forEach((party) => addRecipient(party.ghl_contact_id, party.name, party.email, String(party.relationship_type || party.role || party.type || "Related Contact")));

  return recipients;
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function CommunicationAttachmentList({
  localAttachments,
  matterDocuments,
  onRemoveLocal,
  onRemoveMatterDocument,
}: {
  localAttachments: File[];
  matterDocuments: DocumentRecord[];
  onRemoveLocal: (attachmentId: string) => void;
  onRemoveMatterDocument: (documentId: string) => void;
}) {
  if (localAttachments.length === 0 && matterDocuments.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Attachments</div>
      <div className="space-y-2">
        {localAttachments.map((attachment) => {
          const attachmentId = `${attachment.name}-${attachment.lastModified}-${attachment.size}`;
          return (
            <div key={attachmentId} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{attachment.name}</div>
                  <div className="text-xs text-muted-foreground">{formatAttachmentSize(attachment.size)}</div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => onRemoveLocal(attachmentId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        {matterDocuments.map((document) => (
          <div key={document.id} className="flex items-center justify-between gap-3 rounded-md border bg-blue-50/60 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-[#2384CA]" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{getDocumentName(document)}</div>
                <div className="text-xs text-muted-foreground">
                  Matter document{document.size_bytes ? ` · ${formatAttachmentSize(Number(document.size_bytes))}` : ""}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
              aria-label={`Remove ${getDocumentName(document)}`}
              onClick={() => onRemoveMatterDocument(document.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function getCommunicationRecipientsLabel(communication: any) {
  const recipients = Array.isArray(communication?.recipients) ? communication.recipients : [];
  const names = recipients
    .map((recipient: any) => String(recipient?.name || recipient?.email || "").trim())
    .filter(Boolean);
  return names.join(", ") || communication?.participant_name || communication?.participant || "Unknown recipient";
}

function getCommunicationIdList(...values: unknown[]) {
  return Array.from(
    new Set(
      values.flatMap((value) => Array.isArray(value) ? value : [value])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function cleanInboundPlainTextMarkup(value: string) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/(^|\s)>\s*\[?https?:\/\/email\.lc\.[^\]\s]+]?\s*/gi, "\n")
    .split("\n")
    .filter((line) => {
      const trimmedLine = line.trim();
      const unquotedLine = trimmedLine.replace(/^>\s?/, "").trim();
      if (!unquotedLine) return true;
      if (/^\[?https?:\/\/email\.lc\.[^\]\s]+]?\s*$/i.test(unquotedLine)) return false;
      if (/^https?:\/\/email\.lc\.[^\s]+$/i.test(unquotedLine)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInboundCommunicationText(communication: any, value: string) {
  const metadata = communication?.metadata && typeof communication.metadata === "object" ? communication.metadata : {};
  const direction = String(communication?.direction || metadata.direction || "").toLowerCase();
  const status = String(communication?.status || "").toLowerCase();
  const isInboundEmail = (direction.includes("inbound") || status === "received") &&
    String(communication?.channel || communication?.type || "email").toLowerCase() === "email";
  return isInboundEmail ? cleanInboundPlainTextMarkup(value) : value;
}

function getCommunicationReadState(communication: any, direction: string, status: string) {
  const metadata = communication?.metadata && typeof communication.metadata === "object" ? communication.metadata : {};
  const readStateValues = [
    communication?.is_read,
    communication?.isRead,
    metadata.is_read,
    metadata.isRead,
  ];

  for (const value of readStateValues) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && /^(true|false)$/i.test(value.trim())) {
      return value.trim().toLowerCase() === "true";
    }
  }

  return direction === "outbound" || status === "sent";
}

function isVisibleMatterCommunication(communication: any) {
  return !communication?.deleted_at && !communication?.deletedAt;
}

function normalizeMatterCommunication(communication: any) {
  const occurredAt = communication?.occurred_at || communication?.occurredAt || communication?.created_at || new Date().toISOString();
  const sender = Array.isArray(communication?.created_user)
    ? communication.created_user[0] || {}
    : communication?.created_user || communication?.sender || {};
  const metadata = communication?.metadata && typeof communication.metadata === "object" ? communication.metadata : {};
  const senderEmail = String(sender?.email || communication?.senderEmail || metadata.senderEmail || metadata.fromEmail || "");
  const direction = String(communication?.direction || metadata.direction || "");
  const status = String(communication?.status || "sent");
  const isRead = getCommunicationReadState(communication, direction, status);
  const senderName = String(
    sender?.full_name ||
      sender?.name ||
      communication?.senderName ||
      metadata.senderName ||
      senderEmail ||
      "Lawbric User",
  );
  return {
    id: String(communication?.id || crypto.randomUUID()),
    type: String(communication?.channel || communication?.type || "email"),
    direction,
    subject: String(communication?.subject || "No subject"),
    preview: String(cleanInboundCommunicationText(communication, communication?.preview || "") || ""),
    body: typeof communication?.body === "string" ? cleanInboundCommunicationText(communication, communication.body) : undefined,
    message: typeof communication?.message === "string" ? cleanInboundCommunicationText(communication, communication.message) : undefined,
    html: typeof communication?.html === "string" ? cleanInboundCommunicationText(communication, communication.html) : undefined,
    recipients: Array.isArray(communication?.recipients) ? communication.recipients : [],
    attachments: Array.isArray(communication?.attachments) ? communication.attachments : [],
    participant: getCommunicationRecipientsLabel(communication),
    senderName,
    senderEmail,
    senderAvatarUrl: String(sender?.avatar_url || sender?.avatarUrl || metadata.senderAvatarUrl || ""),
    ghlMessageIds: getCommunicationIdList(communication?.ghl_message_ids, communication?.ghlMessageIds),
    ghlConversationIds: getCommunicationIdList(communication?.ghl_conversation_ids, communication?.ghlConversationIds),
    status,
    isRead,
    readAt: String(communication?.read_at || communication?.readAt || metadata.readAt || ""),
    occurredAt,
    date: formatDateTime(occurredAt),
  };
}

function CommunicationsTab({
  detail,
  composeRequested = false,
  onComposeHandled,
  onCommunicationsRefreshed,
  onCommunicationCreated,
  onCommunicationUpdated,
  onCommunicationDeleted,
}: {
  detail: CaseDetail;
  composeRequested?: boolean;
  onComposeHandled?: () => void;
  onCommunicationsRefreshed?: (communications: any[]) => void;
  onCommunicationCreated?: (communication: any) => void;
  onCommunicationUpdated?: (communication: any) => void;
  onCommunicationDeleted?: (communicationId: string) => void;
}) {
  const { toast } = useToast();
  const recipients = useMemo(() => getMatterCommunicationRecipients(detail), [detail]);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [isDocumentPickerOpen, setIsDocumentPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [communicationActionId, setCommunicationActionId] = useState<string>("");
  const [isRecipientInputFocused, setIsRecipientInputFocused] = useState(false);
  const [selectedCommunicationId, setSelectedCommunicationId] = useState<string>("");
  const [replyContext, setReplyContext] = useState<{
    communicationId: string;
    senderName: string;
    senderEmail: string;
    subject: string;
    ghlMessageIds: string[];
    ghlConversationIds: string[];
  } | null>(null);
  const [emailSignature, setEmailSignature] = useState({
    enabled: false,
    html: "",
    logoUrl: "",
    textSize: "normal",
  });
  const [draft, setDraft] = useState({
    toRecipientKeys: [] as string[],
    customRecipientEmails: [] as string[],
    fromEmail: "",
    subject: "",
    body: "",
  });
  const [customRecipientInput, setCustomRecipientInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachedDocumentIds, setAttachedDocumentIds] = useState<string[]>([]);
  const selectedMatterRecipients = recipients.filter((recipient) => draft.toRecipientKeys.includes(recipient.key));
  const visibleDetailCommunications = useMemo(
    () => (detail.communications || []).filter(isVisibleMatterCommunication),
    [detail.communications],
  );
  const knownRecipientOptions = useMemo(() => {
    const optionMap = new Map<string, {
      key: string;
      contactId: string;
      name: string;
      email: string;
      source: string;
    }>();
    recipients.forEach((recipient) => {
      optionMap.set(recipient.email.trim().toLowerCase(), recipient);
    });
    visibleDetailCommunications.forEach((communication: any) => {
      const communicationRecipients = Array.isArray(communication?.recipients) ? communication.recipients : [];
      communicationRecipients.forEach((recipient: any) => {
        const email = String(recipient?.email || "").trim();
        if (!email) return;
        const normalizedEmail = email.toLowerCase();
        if (optionMap.has(normalizedEmail)) return;
        optionMap.set(normalizedEmail, {
          key: `history:${normalizedEmail}`,
          contactId: String(recipient?.contactId || recipient?.contact_id || ""),
          name: String(recipient?.name || "").trim(),
          email,
          source: "Previous Email",
        });
      });
    });
    return Array.from(optionMap.values()).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  }, [visibleDetailCommunications, recipients]);
  const customRecipients = draft.customRecipientEmails.map((email) => ({
    key: `custom:${email}`,
    contactId: knownRecipientOptions.find((recipient) => recipient.email.trim().toLowerCase() === email.trim().toLowerCase())?.contactId || "",
    name: knownRecipientOptions.find((recipient) => recipient.email.trim().toLowerCase() === email.trim().toLowerCase())?.name || email,
    email,
    source: knownRecipientOptions.find((recipient) => recipient.email.trim().toLowerCase() === email.trim().toLowerCase())?.source || "Custom Email",
    isCustom: true,
  }));
  const selectedRecipients = [...selectedMatterRecipients, ...customRecipients];
  const recipientSuggestions = useMemo(() => {
    const normalizedInput = customRecipientInput.trim().toLowerCase();
    const selectedEmails = new Set(selectedRecipients.map((recipient) => recipient.email.trim().toLowerCase()));
    return knownRecipientOptions
      .filter((recipient) => !selectedEmails.has(recipient.email.trim().toLowerCase()))
      .filter((recipient) => {
        if (!normalizedInput) return true;
        return `${recipient.name} ${recipient.email} ${recipient.source}`.toLowerCase().includes(normalizedInput);
      })
      .slice(0, 6);
  }, [customRecipientInput, knownRecipientOptions, selectedRecipients]);
  const matterDocuments = (detail.documents || []) as DocumentRecord[];
  const attachedMatterDocuments = matterDocuments.filter((document) => attachedDocumentIds.includes(document.id));
  const [sentCommunications, setSentCommunications] = useState<Array<{
    id: string;
    type: string;
    direction?: string;
    subject: string;
    preview: string;
    body?: string;
    message?: string;
    html?: string;
    recipients?: any[];
    attachments?: any[];
    participant: string;
    senderName?: string;
    senderEmail?: string;
    senderAvatarUrl?: string;
    ghlMessageIds?: string[];
    ghlConversationIds?: string[];
    status: string;
    isRead: boolean;
    readAt?: string;
    occurredAt: string;
    date: string;
  }>>(() => visibleDetailCommunications.map(normalizeMatterCommunication));
  const communications: Array<{
    id: string;
    type: string;
    direction?: string;
    subject: string;
    preview: string;
    body?: string;
    message?: string;
    html?: string;
    recipients?: any[];
    attachments?: any[];
    participant: string;
    senderName?: string;
    senderEmail?: string;
    senderAvatarUrl?: string;
    ghlMessageIds?: string[];
    ghlConversationIds?: string[];
    status: string;
    isRead: boolean;
    readAt?: string;
    occurredAt: string;
    date: string;
  }> = sentCommunications;
  const typeOptions = Array.from(new Set(["email", ...communications.map((communication) => communication.type)])).sort();
  const statusOptions = Array.from(new Set(["sent", "received", "draft", ...communications.map((communication) => communication.status)])).sort();
  const activeFilterCount = Number(typeFilter !== "all") + Number(statusFilter !== "all");
  const hasCommunicationListFilters = Boolean(searchTerm.trim()) || activeFilterCount > 0;
  const clearCommunicationListFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setStatusFilter("all");
  };
  const filteredCommunications = communications.filter((communication) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesSearch = !normalizedSearch || [
      communication.type,
      communication.subject,
      communication.preview,
      communication.participant,
      communication.status,
      communication.date,
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
    const matchesType = typeFilter === "all" || communication.type === typeFilter;
    const matchesStatus = statusFilter === "all" || communication.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });
  const sortedCommunications = useMemo(() => {
    return [...filteredCommunications].sort((a, b) => {
      const firstValue = new Date(a.occurredAt || a.date || 0).getTime();
      const secondValue = new Date(b.occurredAt || b.date || 0).getTime();
      return secondValue - firstValue;
    });
  }, [filteredCommunications]);
  const communicationGroups = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - todayStart.getDay());
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(weekStart.getDate() - 7);
    const lastMonthStart = new Date(todayStart);
    lastMonthStart.setDate(todayStart.getDate() - 30);
    const groupDefinitions = [
      { key: "today", label: "Today" },
      { key: "yesterday", label: "Yesterday" },
      { key: "this-week", label: "This Week" },
      { key: "last-week", label: "Last Week" },
      { key: "last-month", label: "Last Month" },
      { key: "older", label: "Older" },
    ];
    const groups = new Map(groupDefinitions.map((group) => [group.key, [] as typeof sortedCommunications]));

    sortedCommunications.forEach((communication) => {
      const communicationDate = new Date(communication.occurredAt || communication.date || 0);
      const time = communicationDate.getTime();
      let key = "older";
      if (!Number.isNaN(time)) {
        if (communicationDate >= todayStart) key = "today";
        else if (communicationDate >= yesterdayStart) key = "yesterday";
        else if (communicationDate >= weekStart) key = "this-week";
        else if (communicationDate >= lastWeekStart) key = "last-week";
        else if (communicationDate >= lastMonthStart) key = "last-month";
      }
      groups.get(key)?.push(communication);
    });

    return groupDefinitions
      .map((group) => ({ ...group, communications: groups.get(group.key) || [] }))
      .filter((group) => group.communications.length > 0);
  }, [sortedCommunications]);
  const selectedCommunication = sortedCommunications.find((communication) => communication.id === selectedCommunicationId) || null;

  useEffect(() => {
    setDraft((current) => {
      const availableKeys = new Set(recipients.map((recipient) => recipient.key));
      const selectedKeys = current.toRecipientKeys.filter((key) => availableKeys.has(key));
      return { ...current, toRecipientKeys: selectedKeys };
    });
  }, [recipients]);

  useEffect(() => {
    setSentCommunications(visibleDetailCommunications.map(normalizeMatterCommunication));
  }, [visibleDetailCommunications]);

  useEffect(() => {
    let cancelled = false;

    const refreshCommunications = async () => {
      const { data, error } = await supabase
        .from("case_communications")
        .select("*, created_user:profiles!case_communications_created_by_fkey(id, full_name, email, avatar_url)")
        .eq("case_id", detail.case.id)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to refresh matter conversations", error);
        return;
      }

      const communications = data || [];
      setSentCommunications((current) => {
        const currentIds = new Set(current.map((communication) => communication.id));
        const hasNewInbound = communications.some((communication: any) =>
          !currentIds.has(String(communication.id)) &&
          String(communication.direction || "").toLowerCase() === "inbound"
        );

        if (hasNewInbound) {
          setSearchTerm("");
          setTypeFilter("all");
          setStatusFilter("all");
        }

        return communications.map(normalizeMatterCommunication);
      });
      onCommunicationsRefreshed?.(communications);
    };

    void refreshCommunications();

    const intervalId = window.setInterval(() => {
      void refreshCommunications();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [detail.case.id]);

  const loadEmailSignature = async (userId?: string) => {
    const profileUserId = userId || (await supabase.auth.getUser()).data.user?.id;
    if (!profileUserId) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("email_signature_enabled, email_signature_html, email_signature_logo_url, email_signature_text_size")
      .eq("id", profileUserId)
      .maybeSingle();
    setEmailSignature({
      enabled: Boolean(profile?.email_signature_enabled),
      html: profile?.email_signature_html || "",
      logoUrl: profile?.email_signature_logo_url || "",
      textSize: profile?.email_signature_text_size || "normal",
    });
  };

  useEffect(() => {
    if (!composeRequested) return;
    setIsComposerExpanded(false);
    setReplyContext(null);
    setCustomRecipientInput("");
    setDraft((current) => ({
      ...current,
      toRecipientKeys: [],
      customRecipientEmails: [],
    }));
    setIsComposerOpen(true);
    onComposeHandled?.();
  }, [composeRequested, onComposeHandled]);

  useEffect(() => {
    if (sortedCommunications.length === 0) {
      if (selectedCommunicationId) setSelectedCommunicationId("");
      return;
    }
    if (!sortedCommunications.some((communication) => communication.id === selectedCommunicationId)) {
      setSelectedCommunicationId(sortedCommunications[0].id);
    }
  }, [selectedCommunicationId, sortedCommunications]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const email = data.user?.email || "";
      if (email) setDraft((current) => current.fromEmail ? current : { ...current, fromEmail: email });
      await loadEmailSignature(data.user?.id);
    });
  }, []);

  useEffect(() => {
    if (!isComposerOpen && !isComposerExpanded) return;
    loadEmailSignature();
  }, [isComposerExpanded, isComposerOpen]);

  const getAttachmentId = (attachment: File) => `${attachment.name}-${attachment.lastModified}-${attachment.size}`;
  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setAttachments((current) => {
      const existingIds = new Set(current.map(getAttachmentId));
      const nextFiles = files.filter((file) => !existingIds.has(getAttachmentId(file)));
      return [...current, ...nextFiles];
    });
    event.target.value = "";
  };
  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => getAttachmentId(attachment) !== attachmentId));
  };
  const attachMatterDocument = (documentId: string) => {
    setAttachedDocumentIds((current) => current.includes(documentId) ? current : [...current, documentId]);
  };
  const removeMatterDocumentAttachment = (documentId: string) => {
    setAttachedDocumentIds((current) => current.filter((id) => id !== documentId));
  };
  const getCommunicationBodyText = (value = draft.body) =>
    typeof DOMParser !== "undefined"
      ? new DOMParser().parseFromString(String(value || ""), "text/html").body.textContent?.replace(/\s+/g, " ").trim() || ""
      : String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const getCommunicationPreview = (communication: typeof communications[number]) =>
    getCommunicationBodyText(communication.preview || communication.body || communication.message || communication.html || "");
  const bodyContainsEmailSignature = (value: string) => /data-lawbric-email-signature=["']true["']/i.test(value);
  const buildEmailSignatureHtml = () => {
    if (!emailSignature.enabled) return "";
    const signatureParts: string[] = [];
    if (emailSignature.logoUrl) {
      signatureParts.push(
        `<p><img src="${escapeHtmlAttribute(emailSignature.logoUrl)}" alt="Email signature logo" width="160" /></p>`,
      );
    }
    if (emailSignature.html) signatureParts.push(emailSignature.html);
    if (signatureParts.length === 0) return "";
    const textSize = escapeHtmlAttribute(emailSignature.textSize || "normal");
    const style = escapeHtmlAttribute(getEmailSignatureStyle(emailSignature.textSize));
    return `<div data-lawbric-email-signature="true" data-lawbric-email-signature-text-size="${textSize}" style="${style}">${signatureParts.join("")}</div>`;
  };
  const getEmailBodyWithSignature = () => {
    const signatureHtml = buildEmailSignatureHtml();
    if (!signatureHtml || bodyContainsEmailSignature(draft.body)) return draft.body;
    return `${draft.body}${EMAIL_SIGNATURE_MESSAGE_SPACE_HTML}${signatureHtml}`;
  };
  useEffect(() => {
    if (!isComposerOpen && !isComposerExpanded) return;
    const signatureHtml = buildEmailSignatureHtml();
    if (!signatureHtml) return;
    setDraft((current) => {
      if (bodyContainsEmailSignature(current.body)) return current;
      return {
        ...current,
        body: `${current.body}${EMAIL_SIGNATURE_MESSAGE_SPACE_HTML}${signatureHtml}`,
      };
    });
  }, [emailSignature, isComposerExpanded, isComposerOpen]);
  function normalizeRecipientEmail(email: string) {
    return email.trim().toLowerCase();
  }
  function isValidRecipientEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  const getRecipientDisplayName = (recipient: { name?: string; email: string }) => {
    const name = String(recipient.name || "").trim();
    return name && normalizeRecipientEmail(name) !== normalizeRecipientEmail(recipient.email) ? name : "";
  };
  const getRecipientInitial = (recipient: { name?: string; email: string }) => {
    const displayName = getRecipientDisplayName(recipient);
    return displayName ? displayName.charAt(0).toUpperCase() : "";
  };
  const toggleRecipient = (recipientKey: string) => {
    setDraft((current) => {
      const selected = current.toRecipientKeys.includes(recipientKey);
      return {
        ...current,
        toRecipientKeys: selected
          ? current.toRecipientKeys.filter((key) => key !== recipientKey)
          : [...current.toRecipientKeys, recipientKey],
      };
    });
  };
  const addRecipientOption = (recipient: { key: string; email: string }) => {
    const matterRecipient = recipients.find((candidate) => candidate.key === recipient.key);
    if (matterRecipient) {
      setDraft((current) => ({
        ...current,
        toRecipientKeys: current.toRecipientKeys.includes(matterRecipient.key)
          ? current.toRecipientKeys
          : [...current.toRecipientKeys, matterRecipient.key],
        customRecipientEmails: current.customRecipientEmails.filter(
          (value) => normalizeRecipientEmail(value) !== normalizeRecipientEmail(matterRecipient.email),
        ),
      }));
    } else {
      addCustomRecipientEmail(recipient.email, { showInvalidToast: false });
    }
    setCustomRecipientInput("");
  };
  const addCustomRecipientEmail = (
    value = customRecipientInput,
    options: { showInvalidToast?: boolean } = {},
  ) => {
    const email = normalizeRecipientEmail(value);
    if (!email) return;
    if (!isValidRecipientEmail(email)) {
      if (options.showInvalidToast !== false) {
        toast({ title: "Invalid Email", description: "Enter a valid email address.", variant: "destructive" });
      }
      return;
    }
    const matchingMatterRecipient = recipients.find((recipient) => normalizeRecipientEmail(recipient.email) === email);
    if (matchingMatterRecipient) {
      setDraft((current) => ({
        ...current,
        toRecipientKeys: current.toRecipientKeys.includes(matchingMatterRecipient.key)
          ? current.toRecipientKeys
          : [...current.toRecipientKeys, matchingMatterRecipient.key],
        customRecipientEmails: current.customRecipientEmails.filter((value) => normalizeRecipientEmail(value) !== email),
      }));
      setCustomRecipientInput("");
      return;
    }
    setDraft((current) => {
      if (current.customRecipientEmails.some((value) => normalizeRecipientEmail(value) === email)) return current;
      return { ...current, customRecipientEmails: [...current.customRecipientEmails, email] };
    });
    setCustomRecipientInput("");
  };
  const removeCustomRecipientEmail = (email: string) => {
    setDraft((current) => ({
      ...current,
      customRecipientEmails: current.customRecipientEmails.filter((value) => normalizeRecipientEmail(value) !== normalizeRecipientEmail(email)),
    }));
  };
  const createRecipientContact = async (email: string) => {
    const knownRecipient = knownRecipientOptions.find((recipient) => normalizeRecipientEmail(recipient.email) === normalizeRecipientEmail(email));
    if (knownRecipient?.contactId) {
      return {
        key: `custom:${email}`,
        contactId: knownRecipient.contactId,
        name: knownRecipient.name || email,
        email,
        source: knownRecipient.source,
        isCustom: true,
      };
    }
    const ghlLocationId = await getActiveGhlLocationId();
    if (!ghlLocationId) throw new Error("GHL Location ID is not configured.");
    const [localPart] = email.split("@");
    const response: any = await createContact({
      locationId: ghlLocationId,
      firstName: localPart || "Email",
      email,
    });
    const createdContact = response.contact || response.data?.contact || response.data || response;
    const contactId = String(createdContact?.id || createdContact?._id || createdContact?.contactId || "");
    if (!contactId) throw new Error(`Could not create a GHL contact for ${email}.`);
    return {
      key: `custom:${email}`,
      contactId,
      name: createdContact?.name || createdContact?.fullName || email,
      email,
      source: "Custom Email",
      isCustom: true,
    };
  };
  const resolveRecipientsForSend = async () => {
    const resolvedCustomRecipients = await Promise.all(
      customRecipients.map((recipient) => createRecipientContact(recipient.email)),
    );
    return [...selectedMatterRecipients, ...resolvedCustomRecipients];
  };
  const getSendableAttachmentUrls = async () => {
    const urls = await Promise.all(
      attachedMatterDocuments.map(async (document) => {
        const externalUrl = String(document.file_url || "").trim();
        if (externalUrl) return externalUrl;
        const download = await viewDocument(document.id);
        return download.url;
      }),
    );
    return urls.filter(Boolean);
  };
  const handleSendCommunication = async () => {
    const bodyText = getCommunicationBodyText();
    if (selectedRecipients.length === 0) {
      toast({ title: "Recipient Required", description: "Select one or more matter contacts before sending.", variant: "destructive" });
      return;
    }
    if (!draft.subject.trim()) {
      toast({ title: "Subject Required", description: "Add a subject before sending.", variant: "destructive" });
      return;
    }
    if (!bodyText) {
      toast({ title: "Message Required", description: "Add a message before sending.", variant: "destructive" });
      return;
    }
    if (attachments.length > 0) {
      toast({
        title: "Attachments Not Ready",
        description: "Local file uploads are not connected yet. Remove local files or attach existing matter documents before sending.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const attachmentUrls = await getSendableAttachmentUrls();
      const resolvedRecipients = await resolveRecipientsForSend();
      const emailBodyHtml = getEmailBodyWithSignature();
      const participantNames = resolvedRecipients.map((recipient) => recipient.name).join(", ");
      const savedCommunication = await sendCaseCommunication({
        caseId: detail.case.id,
        locationId: detail.case.location_id,
        subject: draft.subject.trim(),
        body: emailBodyHtml,
        message: bodyText,
        preview: bodyText,
        emailFrom: draft.fromEmail.includes("@") ? draft.fromEmail.trim() : undefined,
        conversationId: replyContext?.ghlConversationIds[0],
        replyMessageId: replyContext?.ghlMessageIds[0],
        emailReplyMode: replyContext ? "reply" : undefined,
        participantName: participantNames,
        recipients: resolvedRecipients.map((recipient) => ({
          contactId: recipient.contactId,
          name: recipient.name,
          email: recipient.email,
          source: recipient.source,
        })),
        attachments: attachmentUrls.map((url) => ({ url })),
        attachmentUrls,
        metadata: {
          fromEmail: draft.fromEmail.includes("@") ? draft.fromEmail.trim() : null,
          signatureApplied: emailSignature.enabled && Boolean(emailSignature.html || emailSignature.logoUrl),
          replyToCommunicationId: replyContext?.communicationId || null,
          replyToGhlMessageIds: replyContext?.ghlMessageIds || [],
          replyToSubject: replyContext?.subject || null,
        },
      });
      setSentCommunications((current) => [
        normalizeMatterCommunication(savedCommunication),
        ...current,
      ]);
      onCommunicationCreated?.(savedCommunication);
      setDraft((current) => ({
        ...current,
        toRecipientKeys: [],
        customRecipientEmails: [],
        subject: "",
        body: "",
      }));
      setCustomRecipientInput("");
      setAttachments([]);
      setAttachedDocumentIds([]);
      setReplyContext(null);
      setIsComposerOpen(false);
      setIsComposerExpanded(false);
      toast({
        title: "Email Sent",
        description: resolvedRecipients.length === 1
          ? `Message sent to ${resolvedRecipients[0].name}.`
          : `Message sent to ${resolvedRecipients.length} recipients.`,
      });
    } catch (error) {
      toast({
        title: "Email Not Sent",
        description: getUserFriendlyErrorMessage(
          error,
          "Could not send this email through GHL. A failed conversation entry is saved when the request reaches Lawbric.",
        ),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };
  const canSendCommunication = Boolean(selectedRecipients.length > 0 && draft.subject.trim() && getCommunicationBodyText() && !sending);
  const renderRecipientBadge = (recipient: typeof selectedRecipients[number]) => {
    const displayName = getRecipientDisplayName(recipient);
    const initial = getRecipientInitial(recipient);
    const removeRecipient = () => {
      if ("isCustom" in recipient && recipient.isCustom) {
        removeCustomRecipientEmail(recipient.email);
        return;
      }
      toggleRecipient(recipient.key);
    };

    return (
      <span
        key={recipient.key}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          "isCustom" in recipient && recipient.isCustom
            ? "border border-blue-200 bg-blue-50 text-[#2384CA]"
            : "border border-blue-200 bg-blue-50 text-[#2384CA]",
        )}
      >
        {initial ? (
          <span className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
            "bg-[#2384CA]",
          )}>
            {initial}
          </span>
        ) : null}
        {!("isCustom" in recipient && recipient.isCustom) ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#2384CA]">
            <UserRound className="h-3 w-3" />
          </span>
        ) : null}
        <span className="min-w-0 truncate">
          {displayName ? `${displayName} (${recipient.email})` : recipient.email}
        </span>
        <button
          type="button"
          className={cn(
            "shrink-0 rounded-full",
            "isCustom" in recipient && recipient.isCustom
              ? "text-[#2384CA]/70 hover:text-[#2384CA]"
              : "text-[#2384CA]/70 hover:text-[#2384CA]",
          )}
          aria-label={`Remove ${displayName || recipient.email}`}
          onClick={removeRecipient}
        >
          x
        </button>
      </span>
    );
  };
  const renderRecipientSelector = () => (
    <div className="flex items-start gap-3">
      <Label className="w-16 shrink-0 pt-2 text-sm text-muted-foreground">To</Label>
      <div className="relative min-w-0 flex-1">
        <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-border px-0 py-1 focus-within:border-[#2384CA]">
          {selectedRecipients.map(renderRecipientBadge)}
          <input
            value={customRecipientInput}
            onChange={(event) => setCustomRecipientInput(event.target.value)}
            onFocus={() => setIsRecipientInputFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setIsRecipientInputFocused(false), 150);
              if (isValidRecipientEmail(customRecipientInput)) addCustomRecipientEmail(customRecipientInput, { showInvalidToast: false });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!isValidRecipientEmail(customRecipientInput) && recipientSuggestions.length === 1) {
                  addRecipientOption(recipientSuggestions[0]);
                } else {
                  addCustomRecipientEmail(customRecipientInput);
                }
              }
              if ([",", ";", "Tab"].includes(event.key)) {
                if (customRecipientInput.trim()) {
                  event.preventDefault();
                  addCustomRecipientEmail(customRecipientInput);
                }
              }
              if (event.key === "Backspace" && !customRecipientInput && selectedRecipients.length > 0) {
                const lastRecipient = selectedRecipients[selectedRecipients.length - 1];
                if ("isCustom" in lastRecipient && lastRecipient.isCustom) removeCustomRecipientEmail(lastRecipient.email);
                else toggleRecipient(lastRecipient.key);
              }
            }}
            placeholder={selectedRecipients.length === 0 ? "Type an email or contact name..." : ""}
            className="min-w-[180px] flex-1 border-0 bg-transparent px-0 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {isRecipientInputFocused && recipientSuggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-[150] mt-1 max-h-64 overflow-y-auto rounded-md border bg-background p-1 shadow-xl">
            {recipientSuggestions.map((recipient) => {
              const displayName = getRecipientDisplayName(recipient);
              return (
                <button
                  key={recipient.key}
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    addRecipientOption(recipient);
                  }}
                >
                  {getRecipientInitial(recipient) ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-[#2384CA]">
                      {getRecipientInitial(recipient)}
                    </span>
                  ) : (
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{displayName || recipient.email}</span>
                    {displayName ? <span className="block truncate text-xs text-muted-foreground">{recipient.email}</span> : null}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{recipient.source}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
  const renderSubjectInput = () => (
    <div className="flex items-center gap-3">
      <Label className="w-16 shrink-0 text-sm text-muted-foreground">Subject</Label>
      <Input
        value={draft.subject}
        onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
        placeholder={`Re: ${detail.case.case_name}`}
        className="h-10 flex-1 rounded-none border-0 border-b border-border bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-[#2384CA]"
      />
    </div>
  );
  const startReplyToCommunication = (communication: typeof communications[number]) => {
    const senderEmail = normalizeRecipientEmail(communication.senderEmail || "");
    if (!senderEmail) {
      toast({ title: "Reply Not Available", description: "This message does not include a sender email address.", variant: "destructive" });
      return;
    }

    const matterRecipient = recipients.find((recipient) => normalizeRecipientEmail(recipient.email) === senderEmail);
    const replySubject = /^re:/i.test(communication.subject)
      ? communication.subject
      : `Re: ${communication.subject || detail.case.case_name}`;

    setReplyContext({
      communicationId: communication.id,
      senderName: communication.senderName || senderEmail,
      senderEmail,
      subject: communication.subject,
      ghlMessageIds: communication.ghlMessageIds || [],
      ghlConversationIds: communication.ghlConversationIds || [],
    });
    setCustomRecipientInput("");
    setAttachments([]);
    setAttachedDocumentIds([]);
    setDraft((current) => ({
      ...current,
      toRecipientKeys: matterRecipient ? [matterRecipient.key] : [],
      customRecipientEmails: matterRecipient ? [] : [senderEmail],
      subject: replySubject,
      body: "",
    }));
    setIsComposerExpanded(false);
    setIsComposerOpen(true);
  };
  const renderCommunicationViewer = () => {
    if (!selectedCommunication) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center bg-muted/10 p-8 text-center">
          <div>
            <Mail className="mx-auto h-9 w-9 text-muted-foreground/60" />
            <div className="mt-3 text-sm font-medium text-foreground">Select a message</div>
            <div className="mt-1 text-xs text-muted-foreground">Choose a communication from the list to view it here.</div>
          </div>
        </div>
      );
    }

    const body = selectedCommunication.body || selectedCommunication.html || selectedCommunication.message || selectedCommunication.preview;
    const selectedRecipients = Array.isArray(selectedCommunication.recipients) ? selectedCommunication.recipients : [];
    const selectedAttachments = Array.isArray(selectedCommunication.attachments) ? selectedCommunication.attachments : [];
    const getViewerRecipientBadgeClass = (recipient: any) => {
      const source = String(recipient?.source || "").toLowerCase();
      return source.includes("custom") || source.includes("previous")
        ? "border-blue-200 bg-blue-50 text-[#2384CA]"
        : "border-blue-200 bg-blue-50 text-[#2384CA]";
    };
    const canReplyToSelectedCommunication = Boolean(selectedCommunication.senderEmail) &&
      (selectedCommunication.direction === "inbound" || selectedCommunication.status === "received");

    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="hover-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pl-8 pr-5">
          <div className="flex flex-col gap-3 border-b pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-foreground">{selectedCommunication.subject}</h3>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <Avatar className="h-7 w-7 shrink-0">
                    {selectedCommunication.senderAvatarUrl ? (
                      <AvatarImage src={selectedCommunication.senderAvatarUrl} alt={`${selectedCommunication.senderName || "Sender"} avatar`} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-[11px] font-medium text-primary">
                      {getAvatarInitials(
                        { fullName: selectedCommunication.senderName || "Unknown sender", email: selectedCommunication.senderEmail },
                        "U",
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{selectedCommunication.senderName || "Unknown sender"}</div>
                    {selectedCommunication.senderEmail ? (
                      <div className="truncate text-xs text-muted-foreground">{selectedCommunication.senderEmail}</div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canReplyToSelectedCommunication ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => startReplyToCommunication(selectedCommunication)}
                  >
                    <Reply className="mr-1.5 h-3.5 w-3.5" />
                    Reply
                  </Button>
                ) : null}
                <span className="text-xs text-muted-foreground">{selectedCommunication.date}</span>
                <Badge variant="outline" className="capitalize">{selectedCommunication.status}</Badge>
              </div>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex gap-1.5">
                <span className="w-5 shrink-0 text-muted-foreground">To</span>
                <span className="flex min-w-0 flex-wrap gap-1.5 text-foreground">
                  {selectedRecipients.length > 0 ? (
                    selectedRecipients.map((recipient: any, index: number) => {
                      const label = String(recipient?.name || recipient?.email || "").trim();
                      if (!label) return null;
                      return (
                        <Badge
                          key={`${label}-${index}`}
                          variant="outline"
                          className={cn("inline-flex max-w-full items-center gap-1 truncate", getViewerRecipientBadgeClass(recipient))}
                        >
                          {!String(recipient?.source || "").toLowerCase().includes("custom") &&
                            !String(recipient?.source || "").toLowerCase().includes("previous") ? (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#2384CA]">
                              <UserRound className="h-3 w-3" />
                            </span>
                          ) : null}
                          {label}
                        </Badge>
                      );
                    })
                  ) : (
                    <Badge variant="outline" className="max-w-full truncate border-transparent bg-blue-50 text-[#2384CA]">{selectedCommunication.participant}</Badge>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="min-h-[180px] rounded-md bg-muted/10 p-3">
            {body ? (
              <NoteRichTextBody value={body} className="text-sm leading-tight text-foreground" />
            ) : (
              <div className="text-sm text-muted-foreground">No message body saved.</div>
            )}
          </div>

          {selectedAttachments.length > 0 ? (
            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">Attachments</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedAttachments.map((attachment: any, index: number) => {
                  const url = String(attachment?.url || "");
                  const name = String(attachment?.name || url.split("/").pop() || `Attachment ${index + 1}`);
                  const isImage = /\.(apng|avif|gif|jpe?g|png|webp)$/i.test(name) || /\.(apng|avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(url);
                  return (
                    <div
                      key={`${url || "attachment"}-${index}`}
                      className="flex min-w-0 items-center gap-3 rounded-lg border bg-background p-2 shadow-sm"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-blue-50 text-[#2384CA]">
                        {isImage && url ? (
                          <img src={url} alt={name} className="h-full w-full object-cover" />
                        ) : (
                          <FileText className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{name}</div>
                        <div className="truncate text-xs text-muted-foreground">{url ? "Attached file" : "Attachment unavailable"}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#2384CA] hover:text-white"
                            aria-label={`Open ${name}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/40">
                            <ExternalLink className="h-4 w-4" />
                          </span>
                        )}
                        {url ? (
                          <a
                            href={url}
                            download={name}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#2384CA] hover:text-white"
                            aria-label={`Download ${name}`}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/40">
                            <Download className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };
  const renderAttachmentControls = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => attachmentInputRef.current?.click()}
        >
          <Paperclip className="mr-2 h-4 w-4" />
          Attach files
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => setIsDocumentPickerOpen(true)}
        >
          <FileText className="mr-2 h-4 w-4" />
          Attach matter document
        </Button>
      </div>
      <CommunicationAttachmentList
        localAttachments={attachments}
        matterDocuments={attachedMatterDocuments}
        onRemoveLocal={removeAttachment}
        onRemoveMatterDocument={removeMatterDocumentAttachment}
      />
    </div>
  );
  const handleSetCommunicationRead = async (
    communication: typeof communications[number],
    nextIsRead: boolean,
    options: { silent?: boolean } = {},
  ) => {
    const readAt = nextIsRead ? new Date().toISOString() : "";
    setCommunicationActionId(communication.id);
    setSentCommunications((current) =>
      current.map((item) => item.id === communication.id ? { ...item, isRead: nextIsRead, readAt } : item)
    );
    try {
      const updatedCommunication = await updateCaseCommunication({
        locationId: detail.case.location_id,
        communicationId: communication.id,
        isRead: nextIsRead,
      });
      if (updatedCommunication) onCommunicationUpdated?.(updatedCommunication);
      if (!options.silent && updatedCommunication) {
        setSentCommunications((current) =>
          current.map((item) => item.id === communication.id ? normalizeMatterCommunication(updatedCommunication) : item)
        );
      }
    } catch (error) {
      if (!options.silent) {
        setSentCommunications((current) =>
          current.map((item) =>
            item.id === communication.id
              ? { ...item, isRead: communication.isRead, readAt: communication.readAt }
              : item
          )
        );
        toast({
          title: "Conversation Not Updated",
          description: getUserFriendlyErrorMessage(error, "Could not update the conversation read state."),
          variant: "destructive",
        });
      }
    } finally {
      setCommunicationActionId("");
    }
  };
  const handleToggleCommunicationRead = async (communication: typeof communications[number]) => {
    const nextIsRead = !communication.isRead;
    await handleSetCommunicationRead(communication, nextIsRead);
    if (!nextIsRead) {
      setTimeout(() => {
        void updateCaseCommunication({
          locationId: detail.case.location_id,
          communicationId: communication.id,
          isRead: false,
        }).catch(() => undefined);
      }, 1000);
    }
  };
  const handleDeleteCommunication = async (communication: typeof communications[number]) => {
    const previousCommunications = sentCommunications;
    const previousSelectedCommunicationId = selectedCommunicationId;
    const nextSelectedCommunication = sortedCommunications.find((item) => item.id !== communication.id);
    setCommunicationActionId(communication.id);
    setSentCommunications((current) => current.filter((item) => item.id !== communication.id));
    if (selectedCommunicationId === communication.id) {
      setSelectedCommunicationId(nextSelectedCommunication?.id || "");
    }

    try {
      await deleteCaseCommunication({
        locationId: detail.case.location_id,
        communicationId: communication.id,
        deleteReason: "Deleted from matter conversations list",
      });
      onCommunicationDeleted?.(communication.id);
    } catch (error) {
      setSentCommunications(previousCommunications);
      setSelectedCommunicationId(previousSelectedCommunicationId);
      toast({
        title: "Conversation Not Deleted",
        description: getUserFriendlyErrorMessage(error, "Could not delete the conversation."),
        variant: "destructive",
      });
    } finally {
      setCommunicationActionId("");
    }
  };
  const handleSelectCommunication = (communication: typeof communications[number]) => {
    setSelectedCommunicationId(communication.id);
    if (!communication.isRead && communicationActionId !== communication.id) {
      const readAt = new Date().toISOString();
      setSentCommunications((current) =>
        current.map((item) => item.id === communication.id ? { ...item, isRead: true, readAt } : item)
      );
      void updateCaseCommunication({
        locationId: detail.case.location_id,
        communicationId: communication.id,
        isRead: true,
      })
        .then((updatedCommunication) => {
          if (updatedCommunication) onCommunicationUpdated?.(updatedCommunication);
        })
        .catch(() => undefined);
    }
  };
  const renderCommunicationListItem = (communication: typeof sortedCommunications[number]) => {
    const preview = getCommunicationPreview(communication);
    const selected = communication.id === selectedCommunicationId;
    const isUnread = !communication.isRead;
    const actionsDisabled = communicationActionId === communication.id;
    return (
      <div
        key={communication.id}
        role="button"
        tabIndex={0}
        className={cn(
          "group flex w-full cursor-pointer gap-3 border-b border-l-4 border-l-transparent py-3 pl-4 pr-4 text-left outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-[#2384CA]/30",
          selected && "bg-blue-50/70 hover:bg-blue-50/70",
          isUnread && !selected && "bg-blue-50/30",
        )}
        style={{ borderLeftColor: selected ? "#2384CA" : "transparent" }}
        onClick={() => handleSelectCommunication(communication)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          handleSelectCommunication(communication);
        }}
      >
        <Avatar className={cn(
          "mt-0.5 h-8 w-8 shrink-0 border border-slate-200 bg-background",
          isUnread && "ring-2 ring-[#2384CA]/20",
        )}>
          {communication.senderAvatarUrl ? (
            <AvatarImage src={communication.senderAvatarUrl} alt={`${communication.senderName || "Sender"} avatar`} />
          ) : null}
          <AvatarFallback className="bg-blue-50 text-[11px] font-medium text-[#2384CA]">
            {getAvatarInitials(
              { fullName: communication.senderName || "Unknown sender", email: communication.senderEmail },
              "U",
            )}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 flex min-w-0 items-center gap-2">
            {isUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#2384CA]" aria-label="Unread conversation" /> : null}
            <span className={cn("block truncate text-xs text-black", isUnread ? "font-semibold" : "font-medium")}>
              {communication.senderName || "Unknown sender"}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm text-[#2384CA]", isUnread ? "font-semibold" : "font-medium")}>{communication.subject}</span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="text-xs text-muted-foreground">{communication.date}</span>
              <span className="ml-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:bg-blue-100 hover:text-[#2384CA]"
                  disabled={actionsDisabled}
                  aria-label={communication.isRead ? "Mark conversation unread" : "Mark conversation read"}
                  title={communication.isRead ? "Mark unread" : "Mark read"}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleToggleCommunicationRead(communication);
                  }}
                >
                  {communication.isRead ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  disabled={actionsDisabled}
                  aria-label="Delete conversation"
                  title="Delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteCommunication(communication);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </span>
          </span>
          {preview ? (
            <span className={cn("mt-0.5 block truncate text-xs", isUnread ? "font-medium text-slate-700" : "text-muted-foreground")}>{preview}</span>
          ) : null}
        </span>
      </div>
    );
  };
  const openCommunicationComposer = () => {
    setReplyContext(null);
    setCustomRecipientInput("");
    setDraft((current) => ({
      ...current,
      toRecipientKeys: [],
      customRecipientEmails: [],
    }));
    setIsComposerExpanded(false);
    setIsComposerOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col pt-0">
      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleAttachmentChange}
      />
      <div className="min-h-0 flex-1">
        <div className="h-full p-0">
          <div className="flex h-full min-h-0 flex-col overflow-visible rounded-xl bg-background">
          <div className="shrink-0 flex items-center justify-between gap-4 border-b bg-[#F0F6FF] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-full bg-primary px-4 text-primary-foreground hover:bg-[#0484C8]"
                onClick={openCommunicationComposer}
              >
                <Mail className="mr-2 h-4 w-4" />
                Compose
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(
                      "relative h-9 w-9 shrink-0 rounded-full",
                      activeFilterCount > 0 && "border-primary/40 bg-primary/10 text-primary",
                    )}
                    aria-label="Filter conversations"
                    title="Filter conversations"
                  >
                    <Filter className="h-4 w-4" />
                    {activeFilterCount > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="top-full z-[220] mt-2 w-80 p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Filter Conversations</div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          setTypeFilter("all");
                          setStatusFilter("all");
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger>
                          <span className={typeFilter === "all" ? "text-muted-foreground" : "capitalize"}>
                            {typeFilter === "all" ? "Any Type" : typeFilter}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                          <SelectItem value="all">Any Type</SelectItem>
                          {typeOptions.map((type) => (
                            <SelectItem key={type} value={type}>
                              <span className="capitalize">{type}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                          <span className={statusFilter === "all" ? "text-muted-foreground" : "capitalize"}>
                            {statusFilter === "all" ? "Any Status" : statusFilter}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="z-[150] max-h-64 overflow-y-auto">
                          <SelectItem value="all">Any Status</SelectItem>
                          {statusOptions.map((status) => (
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
            </div>
            <div className="relative ml-auto w-full max-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="matter-communication-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search..."
                className="h-9 !rounded-full bg-background pl-9"
              />
            </div>
          </div>
          <div className="grid min-h-0 flex-1 overflow-hidden gap-0 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.48fr)]">
            <div className="min-h-0 overflow-hidden xl:border-r">
              <div className="hover-scrollbar h-full min-h-0 overflow-y-auto">
                {sortedCommunications.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Mail className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <div className="mt-3 text-sm font-medium text-foreground">
                      {hasCommunicationListFilters ? "No matching conversations" : "No Conversations"}
                    </div>
                    {hasCommunicationListFilters ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-4 rounded-full"
                        onClick={clearCommunicationListFilters}
                      >
                        Clear Filters
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <Accordion
                    type="multiple"
                    defaultValue={["today", "yesterday", "this-week", "last-week", "last-month", "older"]}
                    className="w-full"
                  >
                    {communicationGroups.map((group) => (
                      <AccordionItem key={group.key} value={group.key} className="last:border-0">
                        <AccordionTrigger className="border-b border-slate-200 bg-[#fdfdfd] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-[#f5f5f5] hover:text-slate-800">
                          <span>{group.label}</span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                          {group.communications.map(renderCommunicationListItem)}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>
            </div>
            {renderCommunicationViewer()}
          </div>
          </div>
        </div>
      </div>

      {isComposerOpen ? (
        <div className="fixed bottom-4 right-4 z-[115] w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-lg border bg-background shadow-2xl">
          <div className="flex items-center justify-between gap-3 bg-[#0F1729] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" />
              <div className="truncate text-sm font-semibold">
                {replyContext ? `Reply to ${replyContext.senderName || replyContext.senderEmail}` : "New Conversation"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
                aria-label="Expand conversation composer"
                title="Expand"
                onClick={() => {
                  setIsComposerExpanded(true);
                  setIsComposerOpen(false);
                }}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setIsComposerOpen(false);
                  setIsComposerExpanded(false);
                  setReplyContext(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
          <div className="max-h-[calc(100vh-7rem)] space-y-4 overflow-y-auto p-4">
            {renderRecipientSelector()}

            {renderSubjectInput()}

            <div>
              <NoteRichTextEditor
                value={draft.body}
                onChange={(body) => setDraft((current) => ({ ...current, body }))}
                placeholder="Write your message..."
              />
            </div>

            {renderAttachmentControls()}

            <div className="flex justify-end border-t pt-4">
              <Button type="button" disabled={!canSendCommunication} className="shrink-0" onClick={handleSendCommunication}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <Dialog
        open={isComposerExpanded}
        onOpenChange={(open) => {
          setIsComposerExpanded(open);
          if (!open) setReplyContext(null);
        }}
      >
        <DialogContent className="max-w-4xl overflow-hidden !p-0">
          <div className="bg-[#0F1729] px-6 py-4 pr-14 text-white">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <DialogTitle className="text-base">
                {replyContext ? `Reply to ${replyContext.senderName || replyContext.senderEmail}` : "New Conversation"}
              </DialogTitle>
            </div>
          </div>
          <div className="max-h-[calc(100vh-9rem)] space-y-4 overflow-y-auto p-6">
            {renderRecipientSelector()}

            {renderSubjectInput()}

            <div>
              <NoteRichTextEditor
                value={draft.body}
                onChange={(body) => setDraft((current) => ({ ...current, body }))}
                placeholder="Write your message..."
              />
            </div>

            {renderAttachmentControls()}

            <DialogFooter className="border-t pt-4">
              <Button type="button" disabled={!canSendCommunication} onClick={handleSendCommunication}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? "Sending..." : "Send"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isDocumentPickerOpen} onOpenChange={setIsDocumentPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attach Matter Document</DialogTitle>
          </DialogHeader>
          {matterDocuments.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <div className="mt-3 text-sm font-medium text-foreground">No matter documents available.</div>
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {matterDocuments.map((document) => {
                const attached = attachedDocumentIds.includes(document.id);
                return (
                  <button
                    key={document.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/50",
                      attached && "border-primary/40 bg-primary/10 text-primary",
                    )}
                    onClick={() => attachMatterDocument(document.id)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                        <DocumentTypeIcon documentRecord={document} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{getDocumentName(document)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {getDisplayFolderName(document)}
                          {document.size_bytes ? ` · ${formatAttachmentSize(Number(document.size_bytes))}` : ""}
                        </span>
                      </span>
                    </span>
                    {attached ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setIsDocumentPickerOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
    <Card className="mt-3">
      <CardContent>
      <div className="flex flex-col gap-3 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <CheckSquare className="h-4 w-4" />
          <span className="font-medium text-foreground">Tasks ({detail.tasks.length})</span>
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
      </CardContent>
    </Card>
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
  const columns: Array<ReorderableColumn<MatterTaskSortColumn>> = [
    { key: "title", label: "Task" },
    { key: "assigned_to", label: "Assigned To" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "due_at", label: "Due Date" },
  ];
  const { orderedColumns, getColumnDragProps, shouldSuppressColumnClick } = useColumnOrder("lawbric.tableColumns.matterTasks", columns);

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
              const renderCell = (column: MatterTaskSortColumn) => {
                switch (column) {
                  case "title":
                    return (
                      <td key={column} className="max-w-xs px-4 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                            <CheckSquare className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className={cn("flex min-w-0 items-center gap-1.5 font-medium text-[#2384CA]", completed && "text-muted-foreground line-through")}>
                              <span className="truncate">{task.title}</span>
                              {isPrivateTask(task) ? <Eye className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Private task" /> : null}
                            </div>
                            {task.description ? <div className="line-clamp-1 text-xs text-muted-foreground">{task.description}</div> : null}
                          </div>
                        </div>
                      </td>
                    );
                  case "assigned_to":
                    return (
                      <td key={column} className="px-4 py-2 text-foreground/70">
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
                    );
                  case "priority":
                    return (
                      <td key={column} className="px-4 py-2">
                        <Badge variant="outline" className="capitalize">
                          {task.priority || "normal"}
                        </Badge>
                      </td>
                    );
                  case "status":
                    return (
                      <td key={column} className="px-4 py-2">
                        <Badge variant="outline" className={cn("border-transparent capitalize", getStatusClass(task.status))}>
                          {formatTaskStatusLabel(task.status)}
                        </Badge>
                      </td>
                    );
                  case "due_at":
                    return (
                      <td key={column} className="px-4 py-2 text-foreground/70">
                        <div className="flex items-center">
                          <Clock className="mr-2 h-3.5 w-3.5 shrink-0" />
                          <span>{dueLabel}</span>
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
                  {orderedColumns.map((column) => renderCell(column.key))}
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const sortedNotes = [...notes].sort((first, second) => String(second.created_at || "").localeCompare(String(first.created_at || "")));
  const displayTotalCount = sortedNotes.length;
  const safeTotalPages = Math.max(1, Math.ceil(displayTotalCount / itemsPerPage));
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = displayTotalCount === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(displayTotalCount, effectiveCurrentPage * itemsPerPage);
  const visiblePageItems = getPaginationItems(effectiveCurrentPage, safeTotalPages);
  const paginatedNotes = sortedNotes.slice(firstVisibleRow === 0 ? 0 : firstVisibleRow - 1, lastVisibleRow);
  type MatterNoteColumn = "subject" | "note" | "created_by" | "created_at";
  const columns: Array<ReorderableColumn<MatterNoteColumn>> = [
    { key: "subject", label: "Subject" },
    { key: "note", label: "Note" },
    { key: "created_by", label: "Created By" },
    { key: "created_at", label: "Created" },
  ];
  const { orderedColumns, getColumnDragProps } = useColumnOrder("lawbric.tableColumns.matterNotes", columns);

  useEffect(() => {
    setCurrentPage(1);
  }, [notes.length, itemsPerPage]);

  if (notes.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">No notes found.</div>;
  }

  return (
    <>
      <div className="overflow-x-auto pt-3">
        <table className="w-full min-w-[760px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[30%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              {orderedColumns.map((column) => (
                <th
                  key={column.key}
                  className="h-10 cursor-grab px-3 py-3 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                  {...getColumnDragProps(column.key)}
                >
                  {column.label}
                </th>
              ))}
              <th className="h-10 px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedNotes.map((note) => {
              const renderCell = (column: MatterNoteColumn) => {
                switch (column) {
                  case "subject":
                    return (
                      <td key={column} className="min-w-0 px-3 py-2">
                        <div className="truncate font-medium text-[#2384CA]">{getNoteSubject(note)}</div>
                      </td>
                    );
                  case "note":
                    return (
                      <td key={column} className="min-w-0 px-3 py-2">
                        <div className="truncate text-foreground/80">{getNotePreviewText(note.body)}</div>
                      </td>
                    );
                  case "created_by":
                    return (
                      <td key={column} className="px-3 py-2 text-foreground/70">
                        <div className="truncate">{getNoteAuthorName(note, users)}</div>
                      </td>
                    );
                  case "created_at":
                    return <td key={column} className="whitespace-nowrap px-3 py-2 text-foreground/70">{formatDateTime(note.created_at)}</td>;
                  default:
                    return null;
                }
              };

              return (
              <tr
                key={note.id || note.created_at}
                role="button"
                tabIndex={0}
                className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
                onClick={() => onViewNote(note)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onViewNote(note);
                  }
                }}
              >
                {orderedColumns.map((column) => renderCell(column.key))}
                <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Note actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewNote(note)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEditNote(note)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDeleteNote(note)}>
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
          <span className="font-medium text-foreground">{displayTotalCount}</span> notes
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
                  <PaginationItem key={`notes-ellipsis-${index}`} className="hidden px-1 text-muted-foreground sm:block">
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
  const navigate = useNavigate();
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
  const [driveFolderStatus, setDriveFolderStatus] = useState<MatterDriveFolderResult | null>(null);
  const [driveFolderLoading, setDriveFolderLoading] = useState(false);
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
  const documentColumns: Array<ReorderableColumn<MatterDocumentSortColumn>> = [
    { key: "name", label: "Name" },
    { key: "storage_type", label: "Type" },
    { key: "folder", label: "Folder" },
    { key: "created_at", label: "Uploaded" },
  ];
  const folderColumns: Array<ReorderableColumn<MatterDocumentFolderSortColumn>> = [
    { key: "folder", label: "Folder" },
    { key: "matter", label: "Matter" },
    { key: "documents", label: "Documents" },
    { key: "latest_uploaded", label: "Latest Upload" },
    { key: "last_user_edit", label: "Last User Edit" },
  ];
  const {
    orderedColumns: orderedDocumentColumns,
    getColumnDragProps: getDocumentColumnDragProps,
    shouldSuppressColumnClick: shouldSuppressDocumentColumnClick,
  } = useColumnOrder("lawbric.tableColumns.matterDocuments", documentColumns);
  const {
    orderedColumns: orderedFolderColumns,
    getColumnDragProps: getFolderColumnDragProps,
    shouldSuppressColumnClick: shouldSuppressFolderColumnClick,
  } = useColumnOrder("lawbric.tableColumns.matterDocumentFolders", folderColumns);

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

  const loadDriveFolder = async (
    createIfMissing = false,
    { showErrorToast = true, showSuccessToast = false } = {},
  ) => {
    try {
      setDriveFolderLoading(true);
      const result = await getMatterDriveFolder(detail.case.id, createIfMissing);
      setDriveFolderStatus(result);
      if (showSuccessToast && createIfMissing && result.folder?.webUrl) {
        toast({ title: "Google Drive folder ready", description: "The matter folder has been created." });
      }
    } catch (error) {
      if (showErrorToast) {
        toast({
          title: "Google Drive folder unavailable",
          description: getUserFriendlyErrorMessage(error, "Could not load the Google Drive folder for this matter."),
          variant: "destructive",
        });
      } else {
        console.error("Google Drive folder setup failed", error);
      }
    } finally {
      setDriveFolderLoading(false);
    }
  };

  useEffect(() => {
    void loadDriveFolder(true, { showErrorToast: false });
  }, [detail.case.id]);

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
      toast({ title: "Document Deleted", description: "The matter document was removed from normal views." });
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

      <Card className="mt-3">
        <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 pt-2 lg:flex-row lg:items-center lg:justify-between">
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
            <div className="flex items-center gap-2 text-sm text-foreground">
              <FileText className="h-4 w-4" />
              <span className="font-medium text-foreground">Documents ({documents.length})</span>
            </div>
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
            {driveFolderStatus?.folder?.driveFolderId ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 rounded-full"
                onClick={() => {
                  const params = new URLSearchParams({
                    driveFolder: driveFolderStatus.folder?.driveFolderId || "",
                    driveFolderName: driveFolderStatus.folder?.folderName || "Matter folder",
                  });
                  navigate(`/documents?${params.toString()}#gdrive`);
                }}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                Drive Folder
              </Button>
            ) : driveFolderStatus?.connected && driveFolderStatus.rootFolderId ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 rounded-full"
                disabled={driveFolderLoading}
                onClick={() => {
                  const params = new URLSearchParams({
                    driveFolder: driveFolderStatus.rootFolderId || "",
                    driveFolderName: "Lawbric",
                  });
                  navigate(`/documents?${params.toString()}#gdrive`);
                }}
              >
                {driveFolderLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                Lawbric Folder
              </Button>
            ) : driveFolderStatus?.connected && capabilities.canUpload ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 rounded-full"
                disabled={driveFolderLoading}
                onClick={() => loadDriveFolder(true, { showSuccessToast: true })}
              >
                {driveFolderLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                Create Drive Folder
              </Button>
            ) : null}
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
                  {orderedFolderColumns.map((column) => (
                    <th
                      key={column.key}
                      className="h-12 cursor-grab px-4 py-4 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                      {...getFolderColumnDragProps(column.key)}
                      onClick={() => {
                        if (shouldSuppressFolderColumnClick()) return;
                        handleFolderSort(column.key);
                      }}
                    >
                      <div className="flex items-center">
                        {column.label} {renderFolderSortIcon(column.key)}
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
                  const renderCell = (column: MatterDocumentFolderSortColumn) => {
                    switch (column) {
                      case "folder":
                        return (
                          <td key={column} className="max-w-xs px-4 py-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                                <FolderOpen className="h-4 w-4" />
                              </span>
                              <span className="truncate font-medium text-[#2384CA] hover:underline">{folderGroup.folderName}</span>
                            </div>
                          </td>
                        );
                      case "matter":
                        return (
                          <td key={column} className="min-w-0 px-4 py-2 text-foreground/70">
                            <div className="min-w-0">
                              <Link to={`/case/${detail.case.id}`} className="block truncate font-medium text-[#2384CA] hover:underline">
                                {detail.case.case_name}
                              </Link>
                              <div className="truncate text-xs text-muted-foreground">{detail.case.case_number}</div>
                            </div>
                          </td>
                        );
                      case "documents":
                        return <td key={column} className="whitespace-nowrap px-4 py-2 text-foreground/70">{folderGroup.documents.length}</td>;
                      case "latest_uploaded":
                        return (
                          <td key={column} className="px-4 py-2 text-foreground/70">
                            <div className="truncate">
                              {latestDocument ? formatDateTime(latestDocument.created_at) : "Not set"}
                            </div>
                          </td>
                        );
                      case "last_user_edit":
                        return (
                          <td key={column} className="px-4 py-2 text-foreground/70">
                            <div className="truncate" onClick={(event) => event.stopPropagation()}>
                              <UserLink
                                userId={getDocumentUserId(lastEditedDocument)}
                                user={lastEditedDocument?.updated_user || lastEditedDocument?.uploaded_user}
                                name={getDocumentUserName(lastEditedDocument)}
                                stopPropagation
                              />
                            </div>
                          </td>
                        );
                      default:
                        return null;
                    }
                  };
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
                      {orderedFolderColumns.map((column) => renderCell(column.key))}
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
                  {orderedDocumentColumns.map((column) => (
                    <th
                      key={column.key}
                      className="h-12 cursor-grab px-4 py-4 font-medium transition-colors hover:bg-muted/80 active:cursor-grabbing"
                      {...getDocumentColumnDragProps(column.key)}
                      onClick={() => {
                        if (shouldSuppressDocumentColumnClick()) return;
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
                {paginatedDocumentsToDisplay.map((document) => {
                  const renderCell = (column: MatterDocumentSortColumn) => {
                    switch (column) {
                      case "name":
                        return (
                          <td key={column} className="min-w-0 px-4 py-2">
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
                        );
                      case "storage_type":
                        return (
                          <td key={column} className="px-4 py-2">
                            <Badge variant="outline" className="capitalize">{getStorageTypeLabel(document.storage_type)}</Badge>
                          </td>
                        );
                      case "folder":
                        return (
                          <td key={column} className="px-4 py-2 text-foreground/70">
                            <div className="flex items-center gap-2">
                              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{getDisplayFolderName(document)}</span>
                            </div>
                          </td>
                        );
                      case "created_at":
                        return (
                          <td key={column} className="px-4 py-2 text-foreground/70">
                            <div className="flex items-center">
                              <Calendar className="mr-2 h-3.5 w-3.5 shrink-0" />
                              <span>{formatDateTime(document.created_at)}</span>
                            </div>
                          </td>
                        );
                      default:
                        return null;
                    }
                  };

                  return (
                  <tr key={document.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    {orderedDocumentColumns.map((column) => renderCell(column.key))}
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
                  );
                })}
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
        </CardContent>
      </Card>
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
  const [destination, setDestination] = useState<"internal" | "gdrive">("internal");
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setDestination("internal");
      setDriveConnected(false);
      setDriveStatusLoading(false);
      setFolderName("");
      setFile(null);
      setIsDraggingFile(false);
      return;
    }

    setDriveStatusLoading(true);
    getGoogleDriveStatus()
      .then((status) => setDriveConnected(Boolean(status.connected)))
      .catch(() => setDriveConnected(false))
      .finally(() => setDriveStatusLoading(false));
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
    if (destination === "gdrive" && !driveConnected) return;
    setSubmitting(true);
    try {
      if (destination === "gdrive") {
        await uploadGoogleDriveDocument(file, matterId, { folderName });
      } else {
        await uploadDocument(file, matterId, undefined, { folderName });
      }
      onOpenChange(false);
      onSaved();
      toast({
        title: destination === "gdrive" ? "Uploaded to Google Drive" : "Document Uploaded",
        description: destination === "gdrive"
          ? "The file has been added to this matter's Google Drive folder."
          : "The document has been added to this matter.",
      });
    } catch (error) {
      toast({ title: "Document Not Uploaded", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(file && (destination === "internal" || driveConnected));

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
            <Label>Destination</Label>
            <Select
              value={destination}
              onValueChange={(value) => setDestination(value as "internal" | "gdrive")}
            >
              <SelectTrigger>
                <span>{destination === "gdrive" ? "Google Drive" : "Internal"}</span>
              </SelectTrigger>
              <SelectContent className="z-[220]">
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="gdrive" disabled={!driveConnected && !driveStatusLoading}>
                  Google Drive
                </SelectItem>
              </SelectContent>
            </Select>
            {destination === "gdrive" && !driveStatusLoading && !driveConnected ? (
              <p className="text-xs text-muted-foreground">
                Connect Google Drive from Tools → Connected Apps to upload files there.
              </p>
            ) : null}
            {destination === "gdrive" && driveConnected ? (
              <p className="text-xs text-muted-foreground">
                Files are uploaded to this matter&apos;s Google Drive folder.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>{destination === "gdrive" ? "Drive subfolder" : "Folder"}</Label>
            <Input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder={destination === "gdrive" ? "Optional subfolder name" : "Folder name"}
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
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}>
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
