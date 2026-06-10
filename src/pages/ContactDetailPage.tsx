import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, CheckSquare, Clock, Eye, IdCard, Loader2, Mail, MoreVertical, NotebookPen, Pencil, Phone, Plus, Trash2, UserX, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/DatePicker";
import { EditContactDialog, type ContactFormValues } from "@/components/EditContactDialog";
import { MatterActionSheet, MatterCreateSheet } from "@/components/MatterActionSheet";
import { NoteRichTextBody, NoteRichTextEditor } from "@/components/NoteRichText";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  apiClient,
  createLocationTag,
  getAppLocationContext,
  getCustomFields,
  getContacts,
  getLocationTags,
  hasPermission,
  requirePermission,
  type GhlTag,
  updateContact,
} from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import { listCases, type CaseRecord } from "@/lib/cases";
import {
  getRelatedContactId,
  listContactRelationships,
  saveContactRelationships,
  type ContactRelationship,
} from "@/lib/contact-relationships";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPersonName } from "@/lib/names";
import { formatPhoneNumber } from "@/lib/phone";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import { supabase } from "@/lib/supabase";
import { getTagPastelStyle } from "@/lib/tag-colors";
import { createTagMetadata, loadTagsWithMetadata } from "@/lib/tag-metadata";
import { createTask, formatTaskStatusLabel, listTasks, type TaskRecord, updateTask } from "@/lib/tasks";
import { getAssignableUsers, getUserId, getUserName } from "@/lib/users";
import { cn } from "@/lib/utils";

const getStatusColor = (status: string) => {
  switch (status) {
    case "Active":
      return "bg-green-50 text-green-900";
    case "Inactive":
      return "bg-gray-100 text-gray-900";
    default:
      return "bg-gray-100 text-gray-900";
  }
};

const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"];
const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];
const CONTACT_STATUS_OPTIONS = ["Active", "Inactive"] as const;
const ACCOUNT_TYPE_OPTIONS = [
  "Lead",
  "Client (Active)",
  "Client (Former)",
  "Referral Partner",
  "Partner",
  "Vendor",
  "Opposing Party",
  "Expert / Witness",
  "Court / Agency",
  "Internal",
];
const LEGACY_ACCOUNT_TYPE_TAGS = ["Prospect", "Client", "Attorney", "Expert Witness", "Opposing Counsel", "Lead"];
const DEFAULT_ACCOUNT_TYPE = ACCOUNT_TYPE_OPTIONS[0];

type MatterActionState = {
  mode: "view" | "edit" | "delete";
  matter: CaseRecord;
} | null;

type ContactNote = {
  id: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  created_by?: string | null;
};

function getNoteAuthorName(note: { created_by?: string | null }, users: any[]) {
  if (!note.created_by) return "Unknown user";
  const matchedUser = users.find((user) => getUserId(user) === note.created_by);
  return matchedUser ? getUserName(matchedUser) : "Unknown user";
}

type RelatedContactDisplay = {
  id: string;
  name: string;
  email: string;
  phone: string;
  relationshipType: string;
};

function HeaderIconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent className="left-1/2 -translate-x-1/2 whitespace-nowrap border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white shadow-md">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function getAvatarUrlFromMetadata(metadata?: Record<string, unknown> | null) {
  const possibleValues = [
    metadata?.avatar_url,
    metadata?.avatarUrl,
    metadata?.profilePhoto,
    metadata?.profile_photo,
    metadata?.profilePicture,
    metadata?.profile_picture,
    metadata?.picture,
  ];
  const avatarUrl = possibleValues.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof avatarUrl === "string" ? avatarUrl.trim() : "";
}

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function getFieldOptions(field: any) {
  if (!field) return [];
  const possibleOptionArrays = [field.options, field.picklistOptions, field.allowedValues, field.choices];

  for (const options of possibleOptionArrays) {
    if (Array.isArray(options) && options.length > 0) {
      return options.map((option: any) =>
        typeof option === "string" ? option : option.label || option.value || option.name || String(option),
      );
    }
  }

  return [];
}

function normalizeAccountTypeOptions(options: string[]) {
  const normalizedOptions = options.filter((option) => option && option !== "Lead" && option !== "Prospect");
  return ["Lead", ...normalizedOptions];
}

function normalizeCustomFieldName(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCustomFieldLookup(value: unknown) {
  return normalizeCustomFieldName(value).replace(/[._-]+/g, " ");
}

function customFieldMatchesName(field: any, name: string) {
  const normalizedName = normalizeCustomFieldLookup(name);
  return [field?.name, field?.label, field?.fieldName, field?.fieldKey, field?.key]
    .map((value) => normalizeCustomFieldLookup(value))
    .some((value) => value === normalizedName || value.endsWith(` ${normalizedName}`));
}

function buildCustomFieldsMap(customFields: any[]) {
  const entries = customFields.flatMap((customField: any) => {
    const fieldName = normalizeCustomFieldLookup(customField.name || customField.fieldKey || customField.key);
    return [customField.id, customField.fieldKey]
      .filter(Boolean)
      .map((fieldId) => [String(fieldId), fieldName] as const);
  });

  return new Map(entries);
}

function getCustomField(customFields: any[], name: string) {
  return customFields.find((field) => customFieldMatchesName(field, name));
}

function getCustomFieldValue(contact: any, customFieldsMap: Map<string, string>, fieldName: string) {
  const normalizedFieldName = normalizeCustomFieldLookup(fieldName);
  const field = contact.customFields?.find((customField: any) => {
    const fieldId = String(customField.id || customField.fieldId || customField.customFieldId || customField.fieldKey || "");
    const mappedName = customFieldsMap.get(fieldId) || "";
    return (
      customFieldMatchesName(customField, fieldName) ||
      mappedName === normalizedFieldName ||
      mappedName.endsWith(` ${normalizedFieldName}`)
    );
  });

  return field?.value ?? field?.field_value ?? field?.fieldValue;
}

function normalizeContactStatus(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = String(rawValue || "").trim().toLowerCase();
  return CONTACT_STATUS_OPTIONS.find((status) => status.toLowerCase() === normalized) || null;
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

function formatDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function formatRecordDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const dateLabel = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateLabel} ${timeLabel}`;
}

function formatDetailValue(value?: string | null) {
  const text = String(value || "").trim();
  if (!text || ["n/a", "not set", "unassigned"].includes(text.toLowerCase())) return "-";
  return text;
}

function normalizeContactMatchValue(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function getContactDisplayName(contact: any) {
  return formatPersonName(`${contact?.firstName || ""} ${contact?.lastName || ""}`.trim() || contact?.name || "") ||
    contact?.email ||
    "Unknown contact";
}

function toRelatedContactDisplay(contact: any, relationshipType = ""): RelatedContactDisplay {
  return {
    id: String(contact?.id || contact?._id || ""),
    name: getContactDisplayName(contact),
    email: contact?.email || "",
    phone: formatPhoneNumber(contact?.phone, ""),
    relationshipType,
  };
}

function toRelationshipContactDisplay(
  relationship: ContactRelationship,
  currentContactId: string,
  contactOptions: RelatedContactDisplay[] = [],
): RelatedContactDisplay {
  const relatedContactId = getRelatedContactId(relationship, currentContactId);
  const matchedContact = contactOptions.find((candidate) => candidate.id === relatedContactId);

  return {
    id: relatedContactId,
    name: matchedContact?.name || relatedContactId,
    email: matchedContact?.email || "",
    phone: matchedContact?.phone || "",
    relationshipType: relationship.relationship_type,
  };
}

function getTaskRelatedLabel(task: TaskRecord) {
  if (task.related_type === "case" && task.case) return task.case.case_name;
  if (task.related_type === "contact") return "Contact";
  if (task.related_type === "opportunity") return task.ghl_opportunity_name || "Opportunity";
  return "General";
}

function isCompletedTask(task: TaskRecord) {
  return ["done", "completed"].includes(String(task.status).toLowerCase());
}

function ContactTagAddButton({
  options,
  currentTags,
  onAddTag,
  onCreateTag,
  disabled,
}: {
  options: string[];
  currentTags: string[];
  onAddTag: (tagName: string) => Promise<void>;
  onCreateTag: (tagName: string) => Promise<string | void> | string | void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentTagSet = useMemo(() => new Set(currentTags.map((tag) => tag.toLowerCase())), [currentTags]);
  const availableOptions = useMemo(
    () => Array.from(new Set(options.filter(Boolean))).filter((tag) => !currentTagSet.has(tag.toLowerCase())),
    [currentTagSet, options],
  );
  const filteredOptions = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return availableOptions;
    return availableOptions.filter((tag) => tag.toLowerCase().includes(search));
  }, [availableOptions, query]);
  const trimmedQuery = query.trim();
  const canCreate =
    trimmedQuery.length > 0 &&
    !currentTagSet.has(trimmedQuery.toLowerCase()) &&
    !availableOptions.some((tag) => tag.toLowerCase() === trimmedQuery.toLowerCase());

  const updateMenuPosition = useCallback(() => {
    const trigger = buttonRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 6;
    const menuWidth = 260;
    const desiredHeight = 320;
    const minHeight = 120;
    const availableBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
    const availableAbove = rect.top - gap - viewportPadding;
    const openAbove = availableBelow < desiredHeight && availableAbove > availableBelow;
    const availableHeight = Math.max(minHeight, openAbove ? availableAbove : availableBelow);
    const menuHeight = Math.min(desiredHeight, availableHeight);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
    );

    setMenuStyle({
      left,
      top: openAbove ? Math.max(viewportPadding, rect.top - menuHeight - gap) : rect.bottom + gap,
      width: menuWidth,
      maxHeight: menuHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    updateMenuPosition();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const addTag = async (tagName: string) => {
    if (!tagName || isSaving) return;
    setIsSaving(true);
    try {
      await onAddTag(tagName);
      setOpen(false);
      setQuery("");
    } finally {
      setIsSaving(false);
    }
  };

  const createAndAddTag = async () => {
    if (!canCreate || isSaving) return;
    setIsSaving(true);
    try {
      const createdName = (await onCreateTag(trimmedQuery)) || trimmedQuery;
      await onAddTag(createdName);
      setOpen(false);
      setQuery("");
    } finally {
      setIsSaving(false);
    }
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[220] flex flex-col overflow-hidden rounded-md border border-border bg-background shadow-lg"
            style={menuStyle}
          >
            <div className="border-b border-border p-2">
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (filteredOptions[0]) void addTag(filteredOptions[0]);
                  else if (canCreate) void createAndAddTag();
                }}
                placeholder="Search or create tag..."
                className="h-9"
              />
            </div>
            <div className="hover-scrollbar min-h-0 flex-1 overflow-y-auto p-1">
              {filteredOptions.length === 0 && !canCreate ? (
                <div className="px-2 py-3 text-center text-sm text-muted-foreground">No tags available.</div>
              ) : (
                filteredOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void addTag(tag)}
                    disabled={isSaving}
                  >
                    {tag}
                  </button>
                ))
              )}
              {canCreate && (
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-2 border-t px-2 py-2 text-left text-sm font-medium text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void createAndAddTag()}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span className="truncate">Create tag "{trimmedQuery}"</span>
                </button>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title="Add tag"
        disabled={disabled || isSaving}
        onClick={() => {
          updateMenuPosition();
          setOpen((nextOpen) => !nextOpen);
        }}
      >
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
      {menu}
    </>
  );
}

function ContactTaskList({
  tasks,
  users,
  userAvatarMap,
  onTaskClick,
}: {
  tasks: TaskRecord[];
  users: any[];
  userAvatarMap: Record<string, string>;
  onTaskClick: (task: TaskRecord) => void;
}) {
  if (tasks.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">No tasks found.</div>;
  }

  return (
    <div className="divide-y pt-3">
      {tasks.map((task) => {
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
          userAvatarMap[assignedUserId] ||
          matchedUser?.avatar_url ||
          matchedUser?.profilePhoto ||
          "";
        const completed = isCompletedTask(task);
        const dueLabel = isCompletedTask(task) ? "Completed" : formatTaskDate(task.due_at);

        return (
          <button
            key={task.id}
            type="button"
            className="block w-full py-3 text-left first:pt-0 last:pb-0"
            onClick={() => onTaskClick(task)}
          >
            <div className="flex items-start gap-3">
              <Avatar className="mt-0.5 h-8 w-8 shrink-0">
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
              <div className="min-w-0 flex-1">
                <div className={cn("font-medium text-[#2384CA]", completed && "text-muted-foreground line-through")}>
                  {task.title}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                  <div className="min-w-0 truncate">
                    {getTaskRelatedLabel(task)}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-right">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{dueLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ContactMatterList({
  matters,
  emptyText,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  matters: CaseRecord[];
  emptyText: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (matter: CaseRecord) => void;
  onDelete: (matter: CaseRecord) => void;
}) {
  if (matters.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg bg-card">
      {matters.map((matter) => (
        <div key={matter.id} className="px-3 py-3 first:pt-3 last:pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={`/case/${matter.id}`}
                className="block truncate text-sm font-semibold text-[#2384CA] hover:text-[#1b6da8]"
              >
                {matter.case_name || matter.case_number || "Untitled Matter"}
              </Link>
              {matter.case_number ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{matter.case_number}</div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="border-transparent bg-muted text-xs capitalize text-foreground/80">
                {String(matter.status || "-").replace(/_/g, " ")}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                    aria-label="Matter actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {canEdit && (
                    <DropdownMenuItem onClick={() => onEdit(matter)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem onClick={() => onDelete(matter)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactNoteList({
  notes,
  users,
  onViewNote,
  onEditNote,
  onDeleteNote,
}: {
  notes: ContactNote[];
  users: any[];
  onViewNote: (note: ContactNote) => void;
  onEditNote: (note: ContactNote) => void;
  onDeleteNote: (note: ContactNote) => void;
}) {
  if (notes.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">No notes found.</div>;
  }

  return (
    <div className="divide-y pt-3">
      {notes.map((note) => (
        <div
          key={note.id}
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
              <NoteRichTextBody value={note.body || "Untitled note"} className="line-clamp-3 text-sm font-medium text-foreground" />
              <div className="mt-1 text-xs text-muted-foreground">
                Created by {getNoteAuthorName(note, users)} · {formatRecordDate(note.created_at)}
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

function ContactTaskEditSheet({
  open,
  onOpenChange,
  task,
  users,
  locationId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRecord | null;
  users: Array<{
    id?: string;
    user_id?: string;
    email?: string;
    full_name?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    firstName?: string;
    lastName?: string;
  }>;
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
    });
  }, [open, task]);

  const selectedUser = users.find((user) => getUserId(user) === form.assignedUserId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!task) return;
    if (!form.title.trim()) {
      toast({ title: "Task Title Required", description: "Please enter a task title.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const savedTask = await updateTask({
        locationId,
        taskId: task.id,
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
        assignedUserId: form.assignedUserId || null,
        relatedType: task.related_type || "contact",
        caseId: task.case_id || null,
        ghlContactId: task.ghl_contact_id || null,
        ghlContactName: task.ghl_contact_name || null,
        ghlOpportunityId: task.ghl_opportunity_id || null,
        ghlOpportunityName: task.ghl_opportunity_name || null,
      });
      onSaved(savedTask);
      onOpenChange(false);
      toast({ title: "Task Updated", description: `${savedTask.title} has been saved.` });
    } catch (error) {
      toast({
        title: "Task Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not save this task. Please try again."),
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
          <SheetTitle>Edit Task</SheetTitle>
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

          <div className="space-y-2">
            <Label>Assign To</Label>
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

          <div className="grid grid-cols-1 gap-4">
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
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <DateTimePicker
                value={form.dueAt}
                onValueChange={(dueAt) => setForm({ ...form, dueAt })}
                placeholder="Select due date"
              />
            </div>
            <div className="space-y-2">
              <Label>Reminder Date</Label>
              <DateTimePicker
                value={form.reminderAt}
                onValueChange={(reminderAt) => setForm({ ...form, reminderAt })}
                placeholder="Select reminder date"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Task
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ContactTaskCreateSheet({
  open,
  onOpenChange,
  users,
  locationId,
  contactId,
  contactName,
  initialAssignedUserId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: Array<{
    id?: string;
    user_id?: string;
    email?: string;
    full_name?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    firstName?: string;
    lastName?: string;
  }>;
  locationId: string;
  contactId: string;
  contactName: string;
  initialAssignedUserId?: string;
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
  });

  useEffect(() => {
    if (!open) return;

    setForm({
      title: "",
      description: "",
      status: "todo",
      priority: "normal",
      dueAt: "",
      reminderAt: "",
      assignedUserId: initialAssignedUserId || "",
    });
  }, [initialAssignedUserId, open]);

  const selectedUser = users.find((user) => getUserId(user) === form.assignedUserId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Task Title Required", description: "Please enter a task title.", variant: "destructive" });
      return;
    }
    if (!locationId || !contactId) {
      toast({
        title: "Task Not Created",
        description: "This contact is still missing the required location details.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const savedTask = await createTask({
        locationId,
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
        assignedUserId: form.assignedUserId || null,
        relatedType: "contact",
        caseId: null,
        ghlContactId: contactId,
        ghlContactName: contactName,
        ghlOpportunityId: null,
        ghlOpportunityName: null,
      });
      onSaved(savedTask);
      onOpenChange(false);
      toast({ title: "Task Created", description: `${savedTask.title} has been added to ${contactName}.` });
    } catch (error) {
      toast({
        title: "Task Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not create this task. Please try again."),
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
          <SheetTitle>Create Task</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Task Title</Label>
            <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </div>

          <div className="space-y-2">
            <Label>Contact</Label>
            <Input value={contactName} readOnly disabled className="bg-muted/40 text-foreground" />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Assign To</Label>
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

          <div className="grid grid-cols-1 gap-4">
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

            <div className="space-y-2">
              <Label>Reminder Date</Label>
              <DateTimePicker
                value={form.reminderAt}
                onValueChange={(reminderAt) => setForm({ ...form, reminderAt })}
                placeholder="Select reminder date"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Task
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ContactNoteSheet({
  open,
  onOpenChange,
  locationId,
  contactId,
  selectedNote,
  mode,
  users,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  contactId: string;
  selectedNote?: ContactNote | null;
  mode: "view" | "edit" | "create";
  users: any[];
  onSaved: (note: ContactNote) => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isViewingNote = Boolean(selectedNote) && mode === "view";
  const isEditingNote = Boolean(selectedNote) && mode === "edit";
  const sheetTitle = isViewingNote ? "View Note" : isEditingNote ? "Edit Note" : "Add Note";

  useEffect(() => {
    if (open) setNote(selectedNote?.body || "");
  }, [open, selectedNote]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) {
      toast({ title: "Note Required", description: "Please enter a note.", variant: "destructive" });
      return;
    }
    if (!locationId || !contactId) {
      toast({ title: "Note Not Added", description: "Contact context is missing.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await requirePermission("contacts.edit", "You do not have permission to save contact notes.");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const query = selectedNote
        ? supabase
            .from("contact_notes")
            .update({
              body: note.trim(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", selectedNote.id)
            .select("*")
            .single()
        : supabase
            .from("contact_notes")
            .insert({
              location_id: locationId,
              ghl_contact_id: contactId,
              body: note.trim(),
              created_by: user?.id || null,
            })
            .select("*")
            .single();

      const { data, error } = await query;

      if (error) throw new Error(error.message);
      onSaved(data as ContactNote);
      onOpenChange(false);
      toast({ title: selectedNote ? "Note Updated" : "Note Created", description: "The contact note has been saved." });
    } catch (error) {
      toast({
        title: selectedNote ? "Note Not Updated" : "Note Not Added",
        description: getUserFriendlyErrorMessage(error, "Could not add this contact note. Please try again."),
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
            <NoteRichTextEditor value={note} onChange={setNote} readOnly={isViewingNote} placeholder="Add a contact note" />
            {selectedNote ? (
              <p className="text-xs text-muted-foreground">
                Created by {getNoteAuthorName(selectedNote, users)} · {formatRecordDate(selectedNote.created_at)}
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

export function ContactDetailPage() {
  const { contactId } = useParams();
  const { toast } = useToast();
  const [contact, setContact] = useState<any>(null);
  const [contactTasks, setContactTasks] = useState<TaskRecord[]>([]);
  const [contactNotes, setContactNotes] = useState<ContactNote[]>([]);
  const [contactMatters, setContactMatters] = useState<CaseRecord[]>([]);
  const [relatedMatters, setRelatedMatters] = useState<CaseRecord[]>([]);
  const [allContactOptions, setAllContactOptions] = useState<RelatedContactDisplay[]>([]);
  const [relatedContacts, setRelatedContacts] = useState<RelatedContactDisplay[]>([]);
  const [matterAction, setMatterAction] = useState<MatterActionState>(null);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateMatterOpen, setIsCreateMatterOpen] = useState(false);
  const [isNoteSheetOpen, setIsNoteSheetOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ContactNote | null>(null);
  const [noteSheetMode, setNoteSheetMode] = useState<"view" | "edit" | "create">("create");
  const [activeContactTab, setActiveContactTab] = useState("tasks");
  const [accountTypeOptions, setAccountTypeOptions] = useState<string[]>([]);
  const [practiceAreaOptions, setPracticeAreaOptions] = useState<string[]>([]);
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<GhlTag[]>([]);
  const [crmCustomFields, setCrmCustomFields] = useState<any[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [userAvatarMap, setUserAvatarMap] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState("");
  const [locationRecordId, setLocationRecordId] = useState("");
  const [canDeleteMatters, setCanDeleteMatters] = useState(false);
  const [canCreateMatters, setCanCreateMatters] = useState(false);
  const [canEditMatters, setCanEditMatters] = useState(false);
  const [canAssignMatters, setCanAssignMatters] = useState(false);
  const relatedContactOptionsLoadedRef = useRef(false);
  const relatedContactOptionsLoadingRef = useRef(false);
  const effectivePracticeAreaOptions = Array.from(new Set([...PRACTICE_AREAS, ...practiceAreaOptions]));
  const activeTasks = useMemo(() => contactTasks.filter((task) => !isCompletedTask(task)), [contactTasks]);
  const completedTasks = useMemo(() => contactTasks.filter(isCompletedTask), [contactTasks]);

  useEffect(() => {
    Promise.all([
      hasPermission("matters.delete"),
      hasPermission("matters.create"),
      hasPermission("matters.edit"),
      hasPermission("matters.assign"),
    ])
      .then(([canDelete, canCreate, canEdit, canAssign]) => {
        setCanDeleteMatters(canDelete);
        setCanCreateMatters(canCreate);
        setCanEditMatters(canEdit);
        setCanAssignMatters(canAssign);
      })
      .catch((error) => {
        console.error("Failed to load matter permissions", error);
        setCanDeleteMatters(false);
        setCanCreateMatters(false);
        setCanEditMatters(false);
        setCanAssignMatters(false);
      });
  }, []);

  const handleTaskSaved = (savedTask: TaskRecord) => {
    setContactTasks((current) => current.map((task) => (task.id === savedTask.id ? { ...task, ...savedTask } : task)));
    setEditingTask(null);
  };

  const handleTaskCreated = (savedTask: TaskRecord) => {
    setContactTasks((current) => [savedTask, ...current.filter((task) => task.id !== savedTask.id)]);
  };

  const handleNoteSaved = (savedNote: ContactNote) => {
    setContactNotes((current) => [savedNote, ...current.filter((note) => note.id !== savedNote.id)]);
    setActiveContactTab("notes");
    setSelectedNote(null);
    setNoteSheetMode("create");
  };

  const handleNoteDeleted = (noteId: string) => {
    setContactNotes((current) => current.filter((note) => note.id !== noteId));
    setActiveContactTab("notes");
    setSelectedNote(null);
    setNoteSheetMode("create");
  };

  const handleDeleteContactNote = async (note: ContactNote) => {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;

    try {
      await requirePermission("contacts.edit", "You do not have permission to delete contact notes.");
      const { error } = await supabase.from("contact_notes").delete().eq("id", note.id);
      if (error) throw new Error(error.message);

      handleNoteDeleted(note.id);
      toast({ title: "Note Deleted", description: "The contact note has been deleted." });
    } catch (error) {
      toast({
        title: "Note Not Deleted",
        description: getUserFriendlyErrorMessage(error, "Could not delete this contact note. Please try again."),
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const nextAvatarMap: Record<string, string> = {};
    systemUsers.forEach((user) => {
      const userId = getUserId(user);
      const avatarUrl = user.avatar_url || user.profilePhoto || "";
      if (userId && avatarUrl) nextAvatarMap[userId] = avatarUrl;
    });

    const loadProfileAvatars = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentUserAvatar = getAvatarUrlFromMetadata(user?.user_metadata as Record<string, unknown> | null);
      if (user?.id && currentUserAvatar) nextAvatarMap[user.id] = currentUserAvatar;

      const assignedUserIds = Array.from(
        new Set(
          contactTasks
            .map((task) => task.assigned_user?.id || task.assigned_user_id)
            .filter((userId): userId is string => Boolean(userId)),
        ),
      );

      if (assignedUserIds.length > 0) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, avatar_url")
          .in("id", assignedUserIds);

        if (!error) {
          (data ?? []).forEach((profile) => {
            if (profile.id && profile.avatar_url) nextAvatarMap[profile.id] = profile.avatar_url;
          });
        } else {
          console.warn("Profile avatar lookup skipped", error);
        }
      }

      setUserAvatarMap(nextAvatarMap);
    };

    void loadProfileAvatars();
  }, [contactTasks, systemUsers]);

  const saveContactAssignment = async (ghlContactId: string, assignedUserId: string) => {
    if (!locationRecordId || !ghlContactId) return;

    if (!assignedUserId || assignedUserId === "Unassigned") {
      const { error } = await supabase
        .from("contact_assignments")
        .delete()
        .eq("location_id", locationRecordId)
        .eq("ghl_contact_id", ghlContactId);

      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await supabase.from("contact_assignments").upsert(
      {
        location_id: locationRecordId,
        ghl_contact_id: ghlContactId,
        assigned_user_id: assignedUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "location_id,ghl_contact_id" },
    );

    if (error) throw new Error(error.message);
  };

  const handleCreateTag = async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const existingTag = tagOptions.find((tag) => tag.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingTag) return existingTag.name;

    if (!locationId) {
      toast({ title: "Tag Not Created", description: "No GHL location is configured.", variant: "destructive" });
      throw new Error("No GHL location is configured.");
    }

    try {
      const createdTag = await createLocationTag(locationId, trimmedName);
      const createdTagWithMetadata = locationRecordId
        ? await createTagMetadata(locationRecordId, createdTag)
        : createdTag;
      setTagOptions((current) => {
        if (
          current.some(
            (tag) =>
              tag.id === createdTagWithMetadata.id ||
              tag.name.toLowerCase() === createdTagWithMetadata.name.toLowerCase(),
          )
        ) {
          return current;
        }
        return [...current, createdTagWithMetadata];
      });
      toast({ title: "Tag Created", description: `${createdTagWithMetadata.name} has been added.` });
      return createdTagWithMetadata.name;
    } catch (error) {
      toast({
        title: "Tag Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not create this tag in GHL. Please try again."),
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleAddTagToContact = async (tagName: string) => {
    if (!contact) return;

    const trimmedName = tagName.trim();
    if (!trimmedName) return;

    const existingTags: string[] = (Array.isArray(contact.tags) ? contact.tags : [])
      .map((tag: unknown) => String(tag).trim())
      .filter(Boolean);

    if (existingTags.some((tag) => tag.toLowerCase() === trimmedName.toLowerCase())) return;

    const previousContact = contact;
    const nextTags = Array.from(new Set([...existingTags, trimmedName]));
    setContact({ ...contact, tags: nextTags });

    try {
      await updateContact(contact.id, { tags: nextTags });
      toast({ title: "Tag Added", description: `${trimmedName} has been added to ${contact.name}.` });
    } catch (error) {
      setContact(previousContact);
      toast({
        title: "Tag Not Added",
        description: getUserFriendlyErrorMessage(error, "Could not add this tag to the contact. Please try again."),
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleRemoveTagFromContact = async (tagName: string) => {
    if (!contact) return;

    const existingTags: string[] = (Array.isArray(contact.tags) ? contact.tags : [])
      .map((tag: unknown) => String(tag).trim())
      .filter(Boolean);
    const nextTags = existingTags.filter((tag) => tag.toLowerCase() !== tagName.toLowerCase());

    if (nextTags.length === existingTags.length) return;

    const previousContact = contact;
    setContact({ ...contact, tags: nextTags });

    try {
      await updateContact(contact.id, { tags: nextTags });
      toast({ title: "Tag Removed", description: `${tagName} has been removed from ${contact.name}.` });
    } catch (error) {
      setContact(previousContact);
      toast({
        title: "Tag Not Removed",
        description: getUserFriendlyErrorMessage(error, "Could not remove this tag from the contact. Please try again."),
        variant: "destructive",
      });
      throw error;
    }
  };

  const loadRelatedContactOptions = useCallback(async () => {
    if (!locationId || !contact?.id || relatedContactOptionsLoadedRef.current || relatedContactOptionsLoadingRef.current) {
      return allContactOptions;
    }

    relatedContactOptionsLoadingRef.current = true;

    try {
      const contactsResponse = await getContacts(locationId);
      const contactOptions = getArrayFromResponse(contactsResponse, "contacts")
        .map((candidate: any) => toRelatedContactDisplay(candidate))
        .filter((candidate: RelatedContactDisplay) => candidate.id && candidate.id !== contact.id);

      setAllContactOptions(contactOptions);
      setRelatedContacts((current) =>
        current.map((relationship) => {
          const matchedContact = contactOptions.find((candidate: RelatedContactDisplay) => candidate.id === relationship.id);
          return matchedContact
            ? {
                ...relationship,
                name: matchedContact.name,
                email: matchedContact.email,
                phone: matchedContact.phone,
              }
            : relationship;
        }),
      );
      relatedContactOptionsLoadedRef.current = true;
      return contactOptions;
    } catch (error) {
      console.error("Failed to fetch contacts for relationships", error);
      toast({
        variant: "destructive",
        title: "Related Contacts Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load contact options. Please try again."),
      });
      return allContactOptions;
    } finally {
      relatedContactOptionsLoadingRef.current = false;
    }
  }, [allContactOptions, contact?.id, locationId, toast]);

  useEffect(() => {
    if (isEditModalOpen) {
      void loadRelatedContactOptions();
    }
  }, [isEditModalOpen, loadRelatedContactOptions]);

  useEffect(() => {
    if (contact?.id && locationId) {
      void loadRelatedContactOptions();
    }
  }, [contact?.id, loadRelatedContactOptions, locationId]);

  useEffect(() => {
    if (allContactOptions.length === 0 || relatedContacts.length === 0) return;

    setRelatedContacts((current) => {
      let changed = false;
      const nextRelatedContacts = current.map((relationship) => {
        const matchedContact = allContactOptions.find((candidate) => candidate.id === relationship.id);
        if (
          !matchedContact ||
          (
            relationship.name === matchedContact.name &&
            relationship.email === matchedContact.email &&
            relationship.phone === matchedContact.phone
          )
        ) {
          return relationship;
        }

        changed = true;
        return {
          ...relationship,
          name: matchedContact.name,
          email: matchedContact.email,
          phone: matchedContact.phone,
        };
      });

      return changed ? nextRelatedContacts : current;
    });
  }, [allContactOptions, relatedContacts.length]);

  useEffect(() => {
    const fetchFields = async () => {
      try {
        const context = await getAppLocationContext();
        const locId = context.location?.ghlLocationId || "";
        setLocationId(locId);
        setLocationRecordId(context.location?.id || "");
        if (!locId) return;

        const fieldsResponse: any = await getCustomFields(locId);
        const customFieldsList = getArrayFromResponse(fieldsResponse, "customFields");
        setCrmCustomFields(customFieldsList);

        try {
          const fetchedTags = await getLocationTags(locId);
          setTagOptions(context.location?.id ? await loadTagsWithMetadata(context.location.id, fetchedTags) : fetchedTags);
        } catch (error) {
          console.error("Failed to fetch tags", error);
        }

        try {
          const fetchedUsers = await getAssignableUsers();
          setSystemUsers(fetchedUsers);
        } catch (error) {
          console.error("Failed to fetch app users", error);
        }

        const findField = (exactName: string, fallbackTerms: string[] = []) => {
          return (
            customFieldsList.find((field: any) => field.name?.trim().toLowerCase() === exactName) ||
            customFieldsList.find((field: any) => {
              const name = field.name?.trim().toLowerCase() || "";
              return fallbackTerms.some((term) => name.includes(term));
            })
          );
        };

        const nextAccountTypeOptions = getFieldOptions(findField("account type"));
        setAccountTypeOptions(
          nextAccountTypeOptions.length > 0 ? normalizeAccountTypeOptions(nextAccountTypeOptions) : ACCOUNT_TYPE_OPTIONS,
        );
        setPracticeAreaOptions(getFieldOptions(findField("practice area")));
        setLanguageOptions(getFieldOptions(findField("language")));
      } catch (error) {
        console.error("Failed to fetch custom fields", error);
      }
    };

    fetchFields();
  }, []);

  const handleEditContact = async (updatedData: ContactFormValues) => {
    if (!contact) return;

    const previousContact = contact;
    const selectedAssignedUser = systemUsers.find((user) => getUserId(user) === updatedData.attorneyAssigned);
    const formattedUpdatedName = formatPersonName(updatedData.name.trim());
    setContact({
      ...contact,
      ...updatedData,
      name: formattedUpdatedName,
      phone: formatPhoneNumber(updatedData.phone),
      assignedAttorney: selectedAssignedUser ? getUserName(selectedAssignedUser) : "Unassigned",
      assignedAttorneyId: selectedAssignedUser ? getUserId(selectedAssignedUser) : "",
      tags: Array.from(new Set([updatedData.type, ...(updatedData.tags || [])].filter(Boolean))),
    });

    try {
      const [firstName, ...rest] = formattedUpdatedName.split(" ");
      const payload: Record<string, any> = {
        firstName,
        lastName: rest.join(" "),
        email: updatedData.email,
        tags: Array.from(new Set([updatedData.type, ...(updatedData.tags || [])].filter(Boolean))),
      };

      if (updatedData.phone && updatedData.phone !== "N/A") payload.phone = formatPhoneNumber(updatedData.phone, "");
      if (updatedData.dob && updatedData.dob !== "N/A" && updatedData.dob.trim() !== "") {
        payload.dateOfBirth = updatedData.dob;
      }

      let latestCustomFields = crmCustomFields;
      if (latestCustomFields.length === 0 && locationId) {
        const fieldsResponse: any = await getCustomFields(locationId);
        latestCustomFields = getArrayFromResponse(fieldsResponse, "customFields");
        setCrmCustomFields(latestCustomFields);
      }

      const getFieldValuePayload = (name: string, value: unknown) => {
        const field = getCustomField(latestCustomFields, name);
        if (!field) return null;
        return {
          ...(field.id ? { id: field.id } : {}),
          ...(field.fieldKey ? { key: field.fieldKey } : {}),
          field_value: value,
        };
      };
      const getFirstFieldValuePayload = (names: string[], value: unknown) => {
        const fieldName = names.find((name) => getCustomField(latestCustomFields, name));
        return fieldName ? getFieldValuePayload(fieldName, value) : null;
      };
      const genderField = getCustomField(latestCustomFields, "gender");

      if (!genderField?.id && updatedData.gender && updatedData.gender !== "N/A") {
        const lowerGender = updatedData.gender.toLowerCase();
        if (["male", "female", "other"].includes(lowerGender)) payload.gender = lowerGender;
      }

      const customFields = [
        getFirstFieldValuePayload(["practice area", "case type", "case"], updatedData.caseType || ""),
        getFieldValuePayload("account type", updatedData.type || ""),
        getFieldValuePayload("status", updatedData.status || ""),
        getFieldValuePayload("language", updatedData.language && updatedData.language !== "N/A" ? updatedData.language : ""),
        getFieldValuePayload("gender", updatedData.gender && updatedData.gender !== "N/A" ? updatedData.gender : ""),
      ].filter(Boolean);

      if (customFields.length > 0) payload.customFields = customFields;

      await updateContact(contact.id, payload);
      await saveContactAssignment(contact.id, selectedAssignedUser ? getUserId(selectedAssignedUser) : "");
      await saveContactRelationships(locationRecordId, contact.id, updatedData.relatedContacts || []);
      setRelatedContacts(
        (updatedData.relatedContacts || []).map((relationship) => {
          const matchedContact = allContactOptions.find((candidate) => candidate.id === relationship.relatedContactId);
          return {
            id: relationship.relatedContactId,
            name: matchedContact?.name || relationship.relatedContactId,
            email: matchedContact?.email || "",
            phone: matchedContact?.phone || "",
            relationshipType: relationship.relationshipType,
          };
        }),
      );
      toast({
        title: "Contact Updated",
        description: `${updatedData.name}'s details have been saved.`,
      });
    } catch (error) {
      setContact(previousContact);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: getUserFriendlyErrorMessage(error, "Failed to save contact changes. Please try again."),
      });
      throw error;
    }
  };

  useEffect(() => {
    const fetchContact = async () => {
      if (!contactId) return;

      try {
        setLoading(true);
        const data: any = await apiClient(`/contacts/${encodeURIComponent(contactId)}`);
        const rawContact = data.contact || data.data?.contact || data.data || data;

        const context = await getAppLocationContext();
        const locRecordId = context.location?.id || locationRecordId;
        if (context.location?.id) setLocationRecordId(context.location.id);
        if (context.location?.ghlLocationId) setLocationId(context.location.ghlLocationId);
        let contactCustomFields = crmCustomFields;
        if (contactCustomFields.length === 0 && context.location?.ghlLocationId) {
          try {
            const fieldsResponse: any = await getCustomFields(context.location.ghlLocationId);
            contactCustomFields = getArrayFromResponse(fieldsResponse, "customFields");
            setCrmCustomFields(contactCustomFields);
          } catch (error) {
            console.error("Failed to fetch custom fields for contact detail", error);
          }
        }
        const customFieldsMap = buildCustomFieldsMap(contactCustomFields);
        setContactTasks([]);
        setContactNotes([]);
        setContactMatters([]);
        setRelatedMatters([]);
        setRelatedContacts([]);
        setAllContactOptions([]);
        relatedContactOptionsLoadedRef.current = false;
        relatedContactOptionsLoadingRef.current = false;
        if (locRecordId && rawContact.id) {
          listContactRelationships(locRecordId, rawContact.id)
            .then((relationships) => {
              setRelatedContacts(
                relationships.map((relationship: ContactRelationship) =>
                  toRelationshipContactDisplay(relationship, rawContact.id),
                ),
              );
            })
            .catch((error) => {
              console.error("Failed to fetch related contacts", error);
              toast({
                variant: "destructive",
                title: "Related Contacts Not Loaded",
                description: getUserFriendlyErrorMessage(error, "Could not load related contacts. Please try again."),
              });
            });

          listCases({ locationId: locRecordId })
            .then(async (cases) => {
              const directMatters = cases.filter((caseRecord) => caseRecord.ghl_contact_id === rawContact.id);
              setContactMatters(directMatters);

              const directMatterIds = new Set(directMatters.map((caseRecord) => caseRecord.id));
              const rawName = `${rawContact.firstName || ""} ${rawContact.lastName || ""}`.trim() || rawContact.name || "";
              const contactEmail = normalizeContactMatchValue(rawContact.email);
              const contactName = normalizeContactMatchValue(rawName);
              const { data: parties, error: partiesError } = await supabase
                .from("case_parties")
                .select("case_id, ghl_contact_id, email, name")
                .eq("location_id", locRecordId);

              if (partiesError) throw new Error(partiesError.message);

              const relatedMatterIds = new Set(
                (parties || [])
                  .filter((party) => {
                    if (directMatterIds.has(party.case_id)) return false;
                    const matchesContactId = party.ghl_contact_id && party.ghl_contact_id === rawContact.id;
                    const matchesEmail = contactEmail && normalizeContactMatchValue(party.email) === contactEmail;
                    const matchesName = contactName && normalizeContactMatchValue(party.name) === contactName;
                    return matchesContactId || matchesEmail || matchesName;
                  })
                  .map((party) => party.case_id),
              );
              setRelatedMatters(cases.filter((caseRecord) => relatedMatterIds.has(caseRecord.id)));
            })
            .catch((error) => {
              console.error("Failed to fetch contact matters", error);
              toast({
                variant: "destructive",
                title: "Matters Not Loaded",
                description: getUserFriendlyErrorMessage(error, "Could not load matters for this contact. Please try again."),
              });
            });

          setTasksLoading(true);
          listTasks({ locationId: locRecordId, limit: 500 })
            .then((tasks) => {
              setContactTasks(tasks.filter((task) => task.ghl_contact_id === rawContact.id));
            })
            .catch((error) => {
              console.error("Failed to fetch contact tasks", error);
              toast({
                variant: "destructive",
                title: "Tasks Not Loaded",
                description: getUserFriendlyErrorMessage(error, "Could not load tasks for this contact. Please try again."),
              });
            })
            .finally(() => setTasksLoading(false));

          void (async () => {
            try {
              const { data: notes, error } = await supabase
                .from("contact_notes")
                .select("*")
                .eq("location_id", locRecordId)
                .eq("ghl_contact_id", rawContact.id)
                .order("created_at", { ascending: false });

              if (error) throw new Error(error.message);
              setContactNotes((notes || []) as ContactNote[]);
            } catch (error) {
              console.error("Failed to fetch contact notes", error);
              toast({
                variant: "destructive",
                title: "Notes Not Loaded",
                description: getUserFriendlyErrorMessage(error, "Could not load notes for this contact. Please try again."),
              });
            }
          })();
        }
        let rawAssignedAttorneyId = "";
        if (locRecordId) {
          const { data: assignment, error: assignmentError } = await supabase
            .from("contact_assignments")
            .select("assigned_user_id")
            .eq("location_id", locRecordId)
            .eq("ghl_contact_id", rawContact.id)
            .maybeSingle();

          if (assignmentError) {
            console.error("Failed to fetch contact assignment", assignmentError);
          } else {
            rawAssignedAttorneyId = assignment?.assigned_user_id || "";
          }
        }
        let assignedAttorneyId = "";
        let assignedUserName = "";
        if (rawAssignedAttorneyId) {
          try {
            const assignableUsers = systemUsers.length > 0 ? systemUsers : await getAssignableUsers();
            if (systemUsers.length === 0) setSystemUsers(assignableUsers);
            const assignedUser = assignableUsers.find((user) => getUserId(user) === rawAssignedAttorneyId);
            assignedAttorneyId = assignedUser ? getUserId(assignedUser) : "";
            assignedUserName = assignedUser ? getUserName(assignedUser) : "";
          } catch (error) {
            console.error("Failed to fetch assigned user details", error);
          }
        }

        const rawName = `${rawContact.firstName || ""} ${rawContact.lastName || ""}`.trim() || rawContact.name || "";
        const formattedName = formatPersonName(rawName);
        const tags = rawContact.tags || [];
        const accountTypeValue =
          getCustomFieldValue(rawContact, customFieldsMap, "account type") ||
          tags.find((tag: string) =>
            [...ACCOUNT_TYPE_OPTIONS, ...LEGACY_ACCOUNT_TYPE_TAGS]
              .map((option) => option.toLowerCase())
              .includes(tag.toLowerCase()),
          );
        const caseTypeValue =
          getCustomFieldValue(rawContact, customFieldsMap, "practice area") ||
          getCustomFieldValue(rawContact, customFieldsMap, "case type") ||
          getCustomFieldValue(rawContact, customFieldsMap, "case") ||
          tags.find(
            (tag: string) =>
              !["client", "attorney", "expert", "opposing", "active", "pending", "closed", "consultation"].includes(
                tag.toLowerCase(),
              ),
          );
        const assignedAttorneyValue = assignedUserName || "Unassigned";

        setContact({
          id: rawContact.id,
          name: formattedName || rawContact.email || "Unknown",
          email: rawContact.email || "N/A",
          phone: formatPhoneNumber(rawContact.phone),
          status: normalizeContactStatus(getCustomFieldValue(rawContact, customFieldsMap, "status")) || "Active",
          type: Array.isArray(accountTypeValue) ? accountTypeValue.join(", ") : accountTypeValue || DEFAULT_ACCOUNT_TYPE,
          caseType: Array.isArray(caseTypeValue) ? caseTypeValue.join(", ") : caseTypeValue || "General",
          assignedAttorney: Array.isArray(assignedAttorneyValue)
            ? assignedAttorneyValue[0]
            : assignedAttorneyValue || "Unassigned",
          assignedAttorneyId,
          address:
            [
              rawContact.address1,
              [rawContact.city, `${rawContact.state || ""} ${rawContact.postalCode || ""}`.trim()]
                .filter(Boolean)
                .join(", "),
              rawContact.country === "US" ? "United States" : rawContact.country,
            ]
              .filter(Boolean)
              .join("\n") || "N/A",
          dob: rawContact.dateOfBirth ? new Date(rawContact.dateOfBirth).toISOString().split("T")[0] : "N/A",
          gender: rawContact.gender
            ? rawContact.gender.charAt(0).toUpperCase() + rawContact.gender.slice(1)
            : getCustomFieldValue(rawContact, customFieldsMap, "gender") || "N/A",
          language: getCustomFieldValue(rawContact, customFieldsMap, "language") || "English",
          tags,
          notes: "No notes available.",
          lastContact: "Recently",
          createdAt: rawContact.createdAt || rawContact.dateAdded || rawContact.created_at || null,
          updatedAt: rawContact.updatedAt || rawContact.dateUpdated || rawContact.updated_at || null,
          avatarUrl:
            rawContact.avatarUrl ||
            rawContact.profilePhoto ||
            rawContact.profilePicture ||
            rawContact.photo ||
            rawContact.imageUrl,
        });
      } catch (error) {
        console.error("Failed to fetch contact", error);
        toast({
          variant: "destructive",
          title: "Contact Not Loaded",
          description: getUserFriendlyErrorMessage(error, "We couldn't load this contact. Please refresh and try again."),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchContact();
  }, [contactId]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="mx-auto w-full px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-16 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <UserX className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-foreground">Contact not found</h3>
          <p className="mb-6 max-w-md text-muted-foreground">
            The contact you are looking for might have been deleted or does not exist.
          </p>
        </div>
      </div>
    );
  }

  const contactTagValues: string[] = (Array.isArray(contact.tags) ? contact.tags : [])
    .map((tag: unknown) => String(tag).trim())
    .filter(Boolean);
  const visibleTags = Array.from(new Set(contactTagValues));

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] w-full flex-col overflow-hidden px-4 pb-2 pt-2 sm:px-6">
      <MatterActionSheet
        open={Boolean(matterAction)}
        onOpenChange={(open) => !open && setMatterAction(null)}
        mode={matterAction?.mode || null}
        matter={matterAction?.matter || null}
        locationId={locationRecordId}
        users={systemUsers}
        canEditMatter={canEditMatters}
        canDeleteMatter={canDeleteMatters}
        canAssignMatter={canAssignMatters}
        onSaved={(updatedMatter) => {
          setContactMatters((current) =>
            current.map((matter) => (matter.id === updatedMatter.id ? { ...matter, ...updatedMatter } : matter)),
          );
          setRelatedMatters((current) =>
            current.map((matter) => (matter.id === updatedMatter.id ? { ...matter, ...updatedMatter } : matter)),
          );
        }}
        onDeleted={(matterId) => {
          setContactMatters((current) => current.filter((matter) => matter.id !== matterId));
          setRelatedMatters((current) => current.filter((matter) => matter.id !== matterId));
        }}
      />
      <MatterCreateSheet
        open={isCreateMatterOpen}
        onOpenChange={setIsCreateMatterOpen}
        locationId={locationRecordId}
        contact={{
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          assignedUserId: contact.assignedAttorneyId,
        }}
        users={systemUsers}
        canAssignMatter={canAssignMatters}
        onCreated={(matter) => {
          setContactMatters((current) => [matter, ...current]);
        }}
      />

      <ContactTaskEditSheet
        open={Boolean(editingTask)}
        onOpenChange={(open) => !open && setEditingTask(null)}
        task={editingTask}
        users={systemUsers}
        locationId={locationRecordId}
        onSaved={handleTaskSaved}
      />
      <ContactTaskCreateSheet
        open={isCreateTaskOpen}
        onOpenChange={setIsCreateTaskOpen}
        users={systemUsers}
        locationId={locationRecordId}
        contactId={contact.id}
        contactName={contact.name}
        initialAssignedUserId={contact.assignedAttorneyId}
        onSaved={handleTaskCreated}
      />
      <ContactNoteSheet
        open={isNoteSheetOpen}
        onOpenChange={(open) => {
          setIsNoteSheetOpen(open);
          if (!open) {
            setSelectedNote(null);
            setNoteSheetMode("create");
          }
        }}
        locationId={locationRecordId}
        contactId={contact.id}
        selectedNote={selectedNote}
        mode={noteSheetMode}
        users={systemUsers}
        onSaved={handleNoteSaved}
      />
      <div className="shrink-0 border-b border-border pb-4">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-blue-50 text-primary">
                <IdCard className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="mr-1 text-2xl font-bold text-foreground">{contact.name}</h1>
                <Badge
                  variant="outline"
                  className="h-6 shrink-0 border-transparent bg-gray-100 px-3 font-semibold text-gray-900"
                >
                  {contact.type}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("h-6 shrink-0 border-transparent px-3", getStatusColor(contact.status))}
                >
                  {contact.status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex w-full gap-3 md:w-auto">
            <HeaderIconTooltip label="Email">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full p-0 hover:bg-[#0484C8]"
                disabled={!contact.email || contact.email === "N/A"}
                aria-label="Email"
                onClick={() => {
                  if (contact.email && contact.email !== "N/A") window.location.href = `mailto:${contact.email}`;
                }}
              >
                <Mail className="h-4 w-4" />
              </Button>
            </HeaderIconTooltip>
            <HeaderIconTooltip label="Call">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
                disabled={!contact.phone || contact.phone === "N/A"}
                aria-label="Call"
                onClick={() => {
                  if (contact.phone && contact.phone !== "N/A") window.location.href = `tel:${contact.phone}`;
                }}
              >
                <Phone className="h-4 w-4" />
              </Button>
            </HeaderIconTooltip>
            <HeaderIconTooltip label="Edit">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
                aria-label="Edit"
                onClick={() => setIsEditModalOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </HeaderIconTooltip>
            <HeaderIconTooltip label="Add Task">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
                aria-label="Add Task"
                onClick={() => setIsCreateTaskOpen(true)}
              >
                <CheckSquare className="h-4 w-4" />
              </Button>
            </HeaderIconTooltip>
            <HeaderIconTooltip label="Add Note">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
                aria-label="Add Note"
                onClick={() => {
                  setSelectedNote(null);
                  setNoteSheetMode("create");
                  setIsNoteSheetOpen(true);
                }}
              >
                <NotebookPen className="h-4 w-4" />
              </Button>
            </HeaderIconTooltip>
            {canCreateMatters && (
              <HeaderIconTooltip label="Add Matter">
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
                  aria-label="Add Matter"
                  onClick={() => setIsCreateMatterOpen(true)}
                >
                  <Briefcase className="h-4 w-4 shrink-0" />
                </Button>
              </HeaderIconTooltip>
            )}
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden border-b border-border lg:grid-cols-[25fr_45fr_30fr] lg:divide-x lg:divide-border">
        <div className="h-full overflow-y-auto py-6 lg:pr-6">
          <div className="mb-2 border-b border-border pb-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Link to="/" className="text-muted-foreground transition-colors hover:text-foreground" title="Back to Directory">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              Contact Details
            </h2>
          </div>
          <Accordion type="multiple" defaultValue={["personal", "related-contacts", "demographics", "tags", "record"]} className="w-full">
            <AccordionItem value="personal">
              <AccordionTrigger>Personal Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Email</span>
                    <span className="col-span-2 break-all">
                      {formatDetailValue(contact.email) !== "-" ? (
                        <a href={`mailto:${contact.email}`} className="text-[#2384CA] hover:underline">
                          {contact.email}
                        </a>
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Phone</span>
                    <span className="col-span-2">{formatDetailValue(contact.phone)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Address</span>
                    <span className="col-span-2 whitespace-pre-line">{formatDetailValue(contact.address)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Date of Birth</span>
                    <span className="col-span-2">
                      {contact.dob !== "N/A" ? new Date(contact.dob).toLocaleDateString() : "-"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Gender</span>
                    <span className="col-span-2">{formatDetailValue(contact.gender)}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="related-contacts">
              <AccordionTrigger>Related Contacts ({relatedContacts.length})</AccordionTrigger>
              <AccordionContent>
                {relatedContacts.length > 0 ? (
                  <div className="divide-y divide-border pt-2">
                    {relatedContacts.map((relatedContact) => (
                      <div key={relatedContact.id} className="py-3 first:pt-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              to={`/contact/${relatedContact.id}`}
                              className="block truncate text-sm font-semibold text-[#2384CA] hover:text-[#1b6da8]"
                            >
                              {relatedContact.name}
                            </Link>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {relatedContact.relationshipType || "Related"}
                              {" - "}
                              {relatedContact.email || relatedContact.phone || "No contact info"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="pt-2 text-sm text-muted-foreground">No related contacts.</div>
                )}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="demographics">
              <AccordionTrigger>Additional Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Status</span>
                    <span className="col-span-2">{contact.status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Language</span>
                    <span className="col-span-2">{formatDetailValue(contact.language)}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tags">
              <AccordionTrigger>Tags</AccordionTrigger>
              <AccordionContent>
                {visibleTags.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    {visibleTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="h-6 gap-1.5 px-2.5 text-xs font-medium"
                        style={getTagPastelStyle(tag)}
                      >
                        {tag}
                        <button
                          type="button"
                          className="-mr-1 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
                          title={`Remove ${tag}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleRemoveTagFromContact(tag);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <ContactTagAddButton
                      options={tagOptions.map((tag) => tag.name)}
                      currentTags={contactTagValues}
                      onAddTag={handleAddTagToContact}
                      onCreateTag={handleCreateTag}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-sm text-muted-foreground">No tags</span>
                    <ContactTagAddButton
                      options={tagOptions.map((tag) => tag.name)}
                      currentTags={contactTagValues}
                      onAddTag={handleAddTagToContact}
                      onCreateTag={handleCreateTag}
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="record">
              <AccordionTrigger>Record Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Created</span>
                    <span>{formatRecordDate(contact.createdAt)}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Updated</span>
                    <span>{formatRecordDate(contact.updatedAt)}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="h-full overflow-y-auto py-6 lg:px-6">
          <Tabs value={activeContactTab} onValueChange={setActiveContactTab} className="w-full">
            <div className="mb-4">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="tasks"
                  className="rounded-none border-b-2 border-border py-3 text-muted-foreground/70 data-[state=active]:border-[#2384CA] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Tasks
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="rounded-none border-b-2 border-border py-3 text-muted-foreground/70 data-[state=active]:border-[#2384CA] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Notes
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="rounded-none border-b-2 border-border py-3 text-muted-foreground/70 data-[state=active]:border-[#2384CA] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Activity
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="tasks" className="m-0">
              {tasksLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading tasks...
                </div>
              ) : (
                <Accordion type="multiple" defaultValue={["active-tasks", "completed-tasks"]} className="w-full">
                  <AccordionItem value="active-tasks">
                    <AccordionTrigger>Active Tasks ({activeTasks.length})</AccordionTrigger>
                    <AccordionContent>
                      <ContactTaskList
                        tasks={activeTasks}
                        users={systemUsers}
                        userAvatarMap={userAvatarMap}
                        onTaskClick={setEditingTask}
                      />
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="completed-tasks">
                    <AccordionTrigger>Completed Tasks ({completedTasks.length})</AccordionTrigger>
                    <AccordionContent>
                      <ContactTaskList
                        tasks={completedTasks}
                        users={systemUsers}
                        userAvatarMap={userAvatarMap}
                        onTaskClick={setEditingTask}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </TabsContent>

            <TabsContent value="notes" className="m-0">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="recent-notes">
                  <AccordionTrigger>Recent Notes ({contactNotes.length})</AccordionTrigger>
                  <AccordionContent>
                    <ContactNoteList
                      notes={contactNotes}
                      users={systemUsers}
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
                      onDeleteNote={handleDeleteContactNote}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            <TabsContent value="activity" className="m-0">
              <div className="py-8 text-center text-sm text-muted-foreground">No recent activity found.</div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="h-full overflow-y-auto py-6 lg:pl-6">
          <Accordion type="multiple" defaultValue={["matter", "related-matters"]} className="w-full">
            <AccordionItem value="matter">
              <AccordionTrigger
                action={
                  <Link to="/cases" className="shrink-0 text-xs font-medium text-[#2384CA] hover:text-[#1b6da8]">
                    View all matters
                  </Link>
                }
              >
                Matters ({contactMatters.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="pt-2">
                  <ContactMatterList
                    matters={contactMatters}
                    emptyText="No matters associated to this contact yet."
                    canEdit={canEditMatters}
                    canDelete={canDeleteMatters}
                    onEdit={(matter) => setMatterAction({ mode: "edit", matter })}
                    onDelete={(matter) => setMatterAction({ mode: "delete", matter })}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="related-matters">
              <AccordionTrigger
                action={
                  <Link to="/cases" className="shrink-0 text-xs font-medium text-[#2384CA] hover:text-[#1b6da8]">
                    View all matters
                  </Link>
                }
              >
                Related Matters ({relatedMatters.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="pt-2">
                  <ContactMatterList
                    matters={relatedMatters}
                    emptyText="No related matters found for this contact."
                    canEdit={canEditMatters}
                    canDelete={canDeleteMatters}
                    onEdit={(matter) => setMatterAction({ mode: "edit", matter })}
                    onDelete={(matter) => setMatterAction({ mode: "delete", matter })}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      <EditContactDialog
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onEditContact={handleEditContact}
        contact={contact}
        accountTypeOptions={accountTypeOptions}
        practiceAreaOptions={effectivePracticeAreaOptions}
        languageOptions={languageOptions}
        tagOptions={tagOptions.map((tag) => tag.name)}
        onCreateTag={handleCreateTag}
        systemUsers={systemUsers}
        locationId={locationRecordId}
        relatedContactOptions={allContactOptions.map((relatedContact) => ({
          id: relatedContact.id,
          name: relatedContact.name,
          email: relatedContact.email,
        }))}
      />
    </div>
  );
}
