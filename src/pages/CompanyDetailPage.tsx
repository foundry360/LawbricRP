import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Building2, CheckSquare, Loader2, Mail, MoreVertical, Pencil, Phone, Plus, Trash2, UserRound, UserX, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/DatePicker";
import { EditCompanyDialog, type CompanyFormValues } from "@/components/EditCompanyDialog";
import { MatterActionSheet, MatterCreateSheet } from "@/components/MatterActionSheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  addContactsToBusiness,
  createContact,
  createLocationTag,
  getAppLocationContext,
  getBusiness,
  getCachedBusinessCustomFieldsIfAvailable,
  getCachedCustomFieldsIfAvailable,
  getBusinessCustomFields,
  getBusinessObjectRecord,
  getContact,
  getContactsByBusinessId,
  getCustomFields,
  getLocationTags,
  type GhlBusiness,
  type GhlCustomField,
  type GhlTag,
  removeContactsFromBusiness,
  updateBusiness,
  updateBusinessObjectProperties,
  updateContact,
} from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import {
  getBusinessCustomFieldsCollection,
  getBusinessIndustryLabel,
  getBusinessIndustryOptions,
} from "@/lib/business-custom-fields";
import { listCases, type CaseRecord } from "@/lib/cases";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPersonName } from "@/lib/names";
import { formatPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { getTagPastelStyle } from "@/lib/tag-colors";
import { createTask, listTasks, type TaskRecord } from "@/lib/tasks";
import { getAssignableUsers, getUserId, getUserName } from "@/lib/users";
import { cn } from "@/lib/utils";

type ParsedCompanyDescription = {
  primaryContact?: string;
  industry?: string;
  practiceArea?: string;
  status?: string;
  tags?: string[];
  notes?: string;
};

type CompanyContact = {
  id: string;
  name: string;
  title: string;
  email: string;
};

type MatterActionState = {
  mode: "view" | "edit" | "delete";
  matter: CaseRecord;
} | null;

function HeaderIconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent className="left-1/2 -translate-x-1/2 whitespace-nowrap border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"];
const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];

function unwrapBusinessResponse(response: any): GhlBusiness | null {
  return response?.business || response?.buiseness || response?.data?.business || response?.data?.buiseness || response?.data || response || null;
}

function formatDate(value?: string | null) {
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

function formatAddress(company: GhlBusiness) {
  return [
    company.address,
    [company.city, `${company.state || ""} ${company.postalCode || ""}`.trim()].filter(Boolean).join(", "),
    company.country,
  ].filter(Boolean).join("\n") || "-";
}

function getStatusColor(status: string) {
  switch (status) {
    case "Active":
      return "bg-green-50 text-green-900";
    case "Pending":
      return "bg-yellow-50 text-yellow-900";
    case "Closed":
      return "bg-gray-100 text-gray-900";
    case "Consultation":
      return "bg-blue-50 text-blue-900";
    default:
      return "bg-gray-100 text-gray-900";
  }
}

function parseDescription(description?: string | null): ParsedCompanyDescription {
  if (!description) return {};

  const parsed: ParsedCompanyDescription = {};
  const notes: string[] = [];

  description.split(/\r?\n/).forEach((line) => {
    const [label, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const normalizedLabel = label.trim().toLowerCase();

    if (!value) {
      notes.push(line);
      return;
    }

    if (normalizedLabel === "primary contact") parsed.primaryContact = value;
    else if (normalizedLabel === "industry") parsed.industry = value;
    else if (normalizedLabel === "practice area") parsed.practiceArea = value;
    else if (normalizedLabel === "status") parsed.status = value;
    else if (normalizedLabel === "tags") parsed.tags = value.split(",").map((tag) => tag.trim()).filter(Boolean);
    else notes.push(line);
  });

  if (notes.length > 0) parsed.notes = notes.join("\n");
  return parsed;
}

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function getBusinessPropertiesFromRecord(response: any) {
  return response?.record?.properties || response?.data?.record?.properties || response?.data?.properties || response?.properties || {};
}

function getCustomFieldId(customFields: any[], names: string[]) {
  const normalizedNames = names.map((name) => name.toLowerCase());
  return customFields.find((field) => normalizedNames.includes(field.name?.trim().toLowerCase()))?.id || "";
}

function getContactCustomFieldValue(contact: any, customFields: any[], names: string[]) {
  const fieldId = getCustomFieldId(customFields, names);
  const normalizedNames = names.map((name) => name.toLowerCase());
  const field = contact.customFields?.find((customField: any) => {
    const fieldName = customField.name?.trim().toLowerCase();
    return customField.id === fieldId || normalizedNames.includes(fieldName);
  });

  return field?.value || field?.field_value || "";
}

function normalizeCompanyContact(contact: any, customFields: any[] = []): CompanyContact {
  const rawName = `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.name || "";
  const name = formatPersonName(rawName) || contact.email || "Unknown";
  const title =
    contact.title ||
    contact.jobTitle ||
    contact.job_title ||
    getContactCustomFieldValue(contact, customFields, ["title", "job title", "contact title"]) ||
    "";

  return {
    id: contact.id || crypto.randomUUID(),
    name,
    title,
    email: contact.email || "No email set",
  };
}

function isCompletedTask(task: TaskRecord) {
  return ["done", "completed"].includes(String(task.status).toLowerCase());
}

function formatTaskDate(value?: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString();
}

function getTaskAssigneeName(task: TaskRecord, users: any[]) {
  const assignedUser = task.assigned_user_id
    ? users.find((user) => getUserId(user) === task.assigned_user_id)
    : null;
  return task.assigned_user?.full_name
    ? formatPersonName(task.assigned_user.full_name)
    : task.assigned_user?.email || (assignedUser ? getUserName(assignedUser) : "Unassigned");
}

function getCachedCompany(companyId?: string, routeCompany?: GhlBusiness) {
  if (routeCompany) return routeCompany;
  if (!companyId || typeof window === "undefined") return null;

  const cachedCompany = window.sessionStorage.getItem(`company:${companyId}`);
  if (!cachedCompany) return null;

  try {
    return JSON.parse(cachedCompany) as GhlBusiness;
  } catch {
    return null;
  }
}

function upsertDescriptionLine(description: string | null | undefined, label: string, value: string) {
  const normalizedLabel = label.toLowerCase();
  const lines = (description || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .filter((line) => line.split(":")[0]?.trim().toLowerCase() !== normalizedLabel);

  if (value.trim()) lines.push(`${label}: ${value.trim()}`);
  return lines.join("\n");
}

function CompanyTagAddButton({
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
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title="Add tag"
        onClick={() => {
          updateMenuPosition();
          setOpen((nextOpen) => !nextOpen);
        }}
        disabled={disabled || isSaving}
      >
        {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      </button>
      {menu}
    </>
  );
}

function CompanyTaskCreateSheet({
  open,
  onOpenChange,
  users,
  locationId,
  companyId,
  companyName,
  initialAssignedUserId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: any[];
  locationId: string;
  companyId: string;
  companyName: string;
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
    if (!locationId || !companyId) {
      toast({
        title: "Task Not Created",
        description: "This company is still missing the required location details.",
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
        relatedType: "general",
        caseId: null,
        ghlContactId: null,
        ghlContactName: null,
        ghlOpportunityId: null,
        ghlOpportunityName: null,
        metadata: {
          companyId,
          companyName,
          relatedRecordType: "company",
        },
      });
      onSaved(savedTask);
      onOpenChange(false);
      toast({ title: "Task Created", description: `${savedTask.title} has been added to ${companyName}.` });
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
            <Label>Company</Label>
            <Input value={companyName} readOnly disabled className="bg-muted/40 text-foreground" />
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
                  <span className="capitalize">{form.status.replace(/_/g, " ")}</span>
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      <span className="capitalize">{status.replace(/_/g, " ")}</span>
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

function CompanyTaskList({ tasks, users }: { tasks: TaskRecord[]; users: any[] }) {
  if (tasks.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">No tasks found.</div>;
  }

  return (
    <div className="space-y-2 pt-2">
      {tasks.map((task) => {
        const completed = isCompletedTask(task);
        return (
          <div key={task.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={cn("truncate text-sm font-semibold", completed && "line-through text-muted-foreground")}>
                  {task.title}
                </div>
                {task.description ? (
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</div>
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground">
                  Assigned to {getTaskAssigneeName(task, users)}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <div className="capitalize">{String(task.priority || "normal")}</div>
                <div>{completed ? "Completed" : formatTaskDate(task.due_at)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompanyContactActions({
  disabled,
  onMakePrimary,
  onEdit,
  onDelete,
}: {
  disabled?: boolean;
  onMakePrimary?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={disabled}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onMakePrimary ? (
          <DropdownMenuItem onClick={onMakePrimary}>
            <UserRound className="mr-2 h-4 w-4" />
            Make Primary
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CompanyDetailPage() {
  const { companyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const routeCompany = (location.state as { company?: GhlBusiness } | null)?.company;
  const initialCompany = getCachedCompany(companyId, routeCompany);
  const [company, setCompany] = useState<GhlBusiness | null>(initialCompany);
  const [appLocationId, setAppLocationId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [assignedAttorney, setAssignedAttorney] = useState("Unassigned");
  const [assignedAttorneyId, setAssignedAttorneyId] = useState("");
  const [companyContacts, setCompanyContacts] = useState<CompanyContact[]>([]);
  const [companyTasks, setCompanyTasks] = useState<TaskRecord[]>([]);
  const [companyMatters, setCompanyMatters] = useState<CaseRecord[]>([]);
  const [matterAction, setMatterAction] = useState<MatterActionState>(null);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [tagOptions, setTagOptions] = useState<GhlTag[]>([]);
  const [businessCustomFields, setBusinessCustomFields] = useState<GhlCustomField[]>([]);
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);
  const [companyIndustry, setCompanyIndustry] = useState("");
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isEditCompanyOpen, setIsEditCompanyOpen] = useState(false);
  const [editingCompanyContact, setEditingCompanyContact] = useState<CompanyContact | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateMatterOpen, setIsCreateMatterOpen] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isSavingContactEdit, setIsSavingContactEdit] = useState(false);
  const [removingCompanyContactId, setRemovingCompanyContactId] = useState<string | null>(null);
  const [savingPrimaryContactId, setSavingPrimaryContactId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialCompany);
  const [tasksLoading, setTasksLoading] = useState(false);
  const editingContactDetailRequestRef = useRef("");
  const [contactForm, setContactForm] = useState({
    name: "",
    title: "",
    email: "",
  });
  const [contactEditForm, setContactEditForm] = useState({
    name: "",
    title: "",
    email: "",
  });

  const parsedDescription = useMemo(() => parseDescription(company?.description), [company?.description]);
  const phone = company?.phone ? formatPhoneNumber(company.phone) : "-";
  const address = company ? formatAddress(company) : "-";
  const website = company?.website || "";
  const status = parsedDescription.status || "Active";
  const practiceArea = parsedDescription.practiceArea || "General";
  const primaryContact = parsedDescription.primaryContact || "Not set";
  const industry = companyIndustry || parsedDescription.industry || "";
  const activeTasks = useMemo(() => companyTasks.filter((task) => !isCompletedTask(task)), [companyTasks]);
  const completedTasks = useMemo(() => companyTasks.filter(isCompletedTask), [companyTasks]);
  const companyTags = useMemo(() => {
    const rawTags = Array.isArray(company?.tags) ? company.tags : [];
    const descriptionTags = parsedDescription.tags || [];
    const tags = [...rawTags, ...descriptionTags].map((tag) => String(tag).trim()).filter(Boolean);
    return Array.from(new Set(tags));
  }, [company?.tags, parsedDescription.tags]);
  const primaryContactRecord = useMemo(() => {
    if (companyContacts.length === 0) return null;

    const normalizedPrimaryContact = primaryContact.trim().toLowerCase();
    if (!normalizedPrimaryContact || normalizedPrimaryContact === "not set") return companyContacts[0];

    const exactMatch = companyContacts.find((contact) => {
      const normalizedName = contact.name.trim().toLowerCase();
      const normalizedEmail = contact.email.trim().toLowerCase();
      return normalizedName === normalizedPrimaryContact || normalizedEmail === normalizedPrimaryContact;
    });

    return exactMatch || companyContacts[0];
  }, [companyContacts, primaryContact]);
  const secondaryCompanyContacts = useMemo(
    () => companyContacts.filter((contact) => contact.id !== primaryContactRecord?.id),
    [companyContacts, primaryContactRecord?.id],
  );

  const resetContactForm = () => {
    setContactForm({ name: "", title: "", email: "" });
  };

  const openCompanyContactEdit = (contact: CompanyContact) => {
    editingContactDetailRequestRef.current = contact.id;
    setEditingCompanyContact(contact);
    setContactEditForm({
      name: contact.name === "Unknown" ? "" : contact.name,
      title: contact.title || "",
      email: contact.email === "No email set" ? "" : contact.email,
    });

    void Promise.all([
      getContact(contact.id).catch((error) => {
        console.error("Failed to load linked contact detail", error);
        return null;
      }),
      loadContactCustomFields(locationId).catch((error) => {
        console.error("Failed to load contact custom fields", error);
        return customFields;
      }),
    ]).then(([detailResponse, availableCustomFields]) => {
      if (editingContactDetailRequestRef.current !== contact.id || !detailResponse) return;

      const detail: any = (detailResponse as any)?.contact ||
        (detailResponse as any)?.data?.contact ||
        (detailResponse as any)?.data ||
        detailResponse;
      const detailedContact = normalizeCompanyContact({ ...contact, ...detail, id: detail.id || contact.id }, availableCustomFields);

      setEditingCompanyContact(detailedContact);
      setContactEditForm({
        name: detailedContact.name === "Unknown" ? "" : detailedContact.name,
        title: detailedContact.title || "",
        email: detailedContact.email === "No email set" ? "" : detailedContact.email,
      });
      setCompanyContacts((current) =>
        current.map((candidate) => (candidate.id === detailedContact.id ? detailedContact : candidate)),
      );
    });
  };

  const closeCompanyContactEdit = () => {
    editingContactDetailRequestRef.current = "";
    setEditingCompanyContact(null);
    setContactEditForm({ name: "", title: "", email: "" });
  };

  const getCachedContactCustomFields = useCallback((ghlLocationId = locationId) => {
    if (!ghlLocationId) return customFields;
    if (customFields.length > 0) return customFields;

    const cachedFieldsResponse = getCachedCustomFieldsIfAvailable(ghlLocationId);
    const cachedFields = getArrayFromResponse(cachedFieldsResponse, "customFields");
    if (cachedFields.length > 0) {
      setCustomFields(cachedFields);
      return cachedFields;
    }

    return [];
  }, [customFields, locationId]);

  const loadContactCustomFields = async (ghlLocationId = locationId, forceRefresh = false) => {
    if (!ghlLocationId) return customFields;
    if (!forceRefresh && customFields.length > 0) return customFields;

    const fieldsResponse: any = await getCustomFields(ghlLocationId).catch((error) => {
      console.error("Failed to load contact custom fields", error);
      return { customFields: [] };
    });
    const nextCustomFields = getArrayFromResponse(fieldsResponse, "customFields");
    setCustomFields(nextCustomFields);
    return nextCustomFields;
  };

  const getCachedBusinessCustomFields = useCallback((ghlLocationId = locationId) => {
    if (!ghlLocationId) return businessCustomFields;
    if (businessCustomFields.length > 0) return businessCustomFields;

    const cachedFieldsResponse = getCachedBusinessCustomFieldsIfAvailable(ghlLocationId);
    const nextCustomFields = getBusinessCustomFieldsCollection(cachedFieldsResponse);
    if (nextCustomFields.length > 0) {
      setBusinessCustomFields(nextCustomFields);
      setIndustryOptions(getBusinessIndustryOptions(nextCustomFields));
      return nextCustomFields;
    }

    return [];
  }, [businessCustomFields, locationId]);

  const loadBusinessCustomFields = async (ghlLocationId = locationId) => {
    if (!ghlLocationId) return businessCustomFields;
    if (businessCustomFields.length > 0) return businessCustomFields;

    const fieldsResponse = await getBusinessCustomFields(ghlLocationId).catch((error) => {
      console.error("Failed to load business custom fields", error);
      return { fields: [] };
    });
    const nextCustomFields = getBusinessCustomFieldsCollection(fieldsResponse);
    setBusinessCustomFields(nextCustomFields);
    setIndustryOptions(getBusinessIndustryOptions(nextCustomFields));
    return nextCustomFields;
  };

  const loadSystemUsers = useCallback(async () => {
    if (systemUsers.length > 0) return systemUsers;

    const assignableUsers = await getAssignableUsers().catch((error) => {
      console.error("Failed to fetch assigned user details", error);
      return [];
    });
    setSystemUsers(assignableUsers);
    return assignableUsers;
  }, [systemUsers]);

  useEffect(() => {
    if (isEditCompanyOpen) {
      void loadBusinessCustomFields();
    }
  }, [isEditCompanyOpen]);

  useEffect(() => {
    if (isCreateTaskOpen) {
      void loadSystemUsers();
    }
  }, [isCreateTaskOpen, loadSystemUsers]);

  const handleTaskCreated = (task: TaskRecord) => {
    setCompanyTasks((current) => [task, ...current.filter((candidate) => candidate.id !== task.id)]);
  };

  const saveCompanyTags = async (nextTags: string[], successMessage: string) => {
    if (!company) return;

    const previousCompany = company;
    const nextDescription = upsertDescriptionLine(company.description, "Tags", nextTags.join(", "));
    const nextCompany = { ...company, tags: nextTags, description: nextDescription };
    setCompany(nextCompany);
    if (companyId && typeof window !== "undefined") {
      window.sessionStorage.setItem(`company:${companyId}`, JSON.stringify(nextCompany));
    }

    try {
      await updateBusiness(company.id, { description: nextDescription });
      toast({ title: successMessage });
    } catch (error) {
      setCompany(previousCompany);
      toast({
        variant: "destructive",
        title: "Tags Not Saved",
        description: getUserFriendlyErrorMessage(error, "Could not save company tags. Please try again."),
      });
    }
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
      setTagOptions((current) => {
        if (
          current.some(
            (tag) => tag.id === createdTag.id || tag.name.toLowerCase() === createdTag.name.toLowerCase(),
          )
        ) {
          return current;
        }
        return [...current, createdTag];
      });
      toast({ title: "Tag Created", description: `${createdTag.name} has been added.` });
      return createdTag.name;
    } catch (error) {
      toast({
        title: "Tag Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not create this tag in GHL. Please try again."),
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleAddTagToCompany = async (tagName: string) => {
    const trimmedName = tagName.trim();
    if (!trimmedName || companyTags.some((tag) => tag.toLowerCase() === trimmedName.toLowerCase())) return;

    await saveCompanyTags([...companyTags, trimmedName], `${trimmedName} has been added.`);
  };

  const handleRemoveTagFromCompany = async (tagName: string) => {
    const nextTags = companyTags.filter((tag) => tag.toLowerCase() !== tagName.toLowerCase());
    await saveCompanyTags(nextTags, `${tagName} has been removed.`);
  };

  const handleEditCompany = async (updatedData: CompanyFormValues) => {
    if (!company) return;

    const previousCompany = company;
    const previousIndustry = companyIndustry;
    const nextCompany: GhlBusiness = {
      ...company,
      name: updatedData.name.trim(),
      email: updatedData.email.trim() || null,
      phone: updatedData.phone ? formatPhoneNumber(updatedData.phone, "") : null,
      website: updatedData.website.trim() || null,
      address: updatedData.address.trim() || null,
    };

    setCompany(nextCompany);
    setCompanyIndustry(updatedData.industry);
    if (companyId && typeof window !== "undefined") {
      window.sessionStorage.setItem(`company:${companyId}`, JSON.stringify(nextCompany));
    }

    try {
      await updateBusiness(company.id, {
        name: nextCompany.name,
        email: nextCompany.email,
        phone: nextCompany.phone,
        website: nextCompany.website,
        address: nextCompany.address,
      });

      if (locationId) {
        await updateBusinessObjectProperties(locationId, company.id, { industry: updatedData.industry || "" });
      }

      toast({ title: "Company Updated", description: `${nextCompany.name} has been saved.` });
    } catch (error) {
      setCompany(previousCompany);
      setCompanyIndustry(previousIndustry);
      if (companyId && typeof window !== "undefined") {
        window.sessionStorage.setItem(`company:${companyId}`, JSON.stringify(previousCompany));
      }
      toast({
        title: "Company Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not save company changes. Please try again."),
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleCreateCompanyContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!company || !companyId) return;

    const name = formatPersonName(contactForm.name.trim());
    const email = contactForm.email.trim();
    const title = contactForm.title.trim();

    if (!name || !email) {
      toast({
        title: "Contact Details Required",
        description: "Please enter a contact name and email.",
        variant: "destructive",
      });
      return;
    }

    if (!locationId) {
      toast({
        title: "Contact Not Added",
        description: "No location is configured for this company.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingContact(true);
    try {
      const [firstName, ...rest] = name.split(/\s+/);
      const payload: Record<string, any> = {
        locationId,
        firstName,
        lastName: rest.join(" "),
        name,
        email,
        companyName: company.name,
        tags: ["Company Contact"],
      };

      const availableCustomFields = await loadContactCustomFields(locationId, true);
      const titleFieldId = getCustomFieldId(availableCustomFields, ["title", "job title", "contact title"]);
      if (title) {
        if (titleFieldId) {
          payload.customFields = [{ id: titleFieldId, field_value: title }];
        }
      }

      const response: any = await createContact(payload);
      const createdContact = response.contact || response.data?.contact || response.data || response;
      const createdContactId = createdContact.id;

      if (createdContactId) {
        await addContactsToBusiness(locationId, [createdContactId], companyId);
      }

      const nextContact = normalizeCompanyContact(
        { ...createdContact, id: createdContactId, firstName, lastName: rest.join(" "), name, email, title },
        availableCustomFields,
      );
      setCompanyContacts((current) => [nextContact, ...current.filter((contact) => contact.id !== nextContact.id)]);
      resetContactForm();
      setIsAddContactOpen(false);
      toast({ title: "Contact Added", description: `${nextContact.name} has been added to ${company.name}.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Contact Not Added",
        description: getUserFriendlyErrorMessage(error, "Could not add this contact. Please try again."),
      });
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleUpdateCompanyContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCompanyContact) return;

    const name = formatPersonName(contactEditForm.name.trim());
    const email = contactEditForm.email.trim();
    const title = contactEditForm.title.trim();

    if (!name || !email) {
      toast({
        title: "Contact Details Required",
        description: "Please enter a contact name and email.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingContactEdit(true);
    const previousContacts = companyContacts;

    try {
      const [firstName, ...rest] = name.split(/\s+/);
      const payload: Record<string, any> = {
        firstName,
        lastName: rest.join(" "),
        email,
      };

      const availableCustomFields = await loadContactCustomFields(locationId, true);
      const titleFieldId = getCustomFieldId(availableCustomFields, ["title", "job title", "contact title"]);
      if (titleFieldId) {
        payload.customFields = [{ id: titleFieldId, field_value: title }];
      }

      await updateContact(editingCompanyContact.id, payload);

      const updatedContact = normalizeCompanyContact(
        {
          ...editingCompanyContact,
          firstName,
          lastName: rest.join(" "),
          name,
          email,
          title,
        },
        availableCustomFields,
      );

      setCompanyContacts((current) =>
        current.map((contact) => (contact.id === editingCompanyContact.id ? updatedContact : contact)),
      );
      closeCompanyContactEdit();
      toast({ title: "Contact Updated", description: `${updatedContact.name} has been saved.` });
    } catch (error) {
      setCompanyContacts(previousContacts);
      toast({
        variant: "destructive",
        title: "Contact Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not save this company contact. Please try again."),
      });
    } finally {
      setIsSavingContactEdit(false);
    }
  };

  const handleRemoveCompanyContactConnection = async (contact: CompanyContact) => {
    if (!locationId) {
      toast({
        title: "Contact Not Removed",
        description: "No location is configured for this company.",
        variant: "destructive",
      });
      return;
    }

    const previousContacts = companyContacts;
    setRemovingCompanyContactId(contact.id);
    setCompanyContacts((current) => current.filter((candidate) => candidate.id !== contact.id));
    if (editingCompanyContact?.id === contact.id) closeCompanyContactEdit();

    try {
      await removeContactsFromBusiness(locationId, [contact.id]);
      toast({
        title: "Connection Removed",
        description: `${contact.name} was removed from this company. The contact record was not deleted.`,
      });
    } catch (error) {
      setCompanyContacts(previousContacts);
      toast({
        variant: "destructive",
        title: "Connection Not Removed",
        description: getUserFriendlyErrorMessage(error, "Could not remove this contact from the company. Please try again."),
      });
    } finally {
      setRemovingCompanyContactId(null);
    }
  };

  const handleMakePrimaryCompanyContact = async (contact: CompanyContact) => {
    if (!company) return;

    const previousCompany = company;
    const nextDescription = upsertDescriptionLine(company.description, "Primary Contact", contact.name);
    const nextCompany = { ...company, description: nextDescription };
    setSavingPrimaryContactId(contact.id);
    setCompany(nextCompany);
    if (companyId && typeof window !== "undefined") {
      window.sessionStorage.setItem(`company:${companyId}`, JSON.stringify(nextCompany));
    }

    try {
      await updateBusiness(company.id, { description: nextDescription });
      toast({ title: "Primary Contact Updated", description: `${contact.name} is now the primary contact.` });
    } catch (error) {
      setCompany(previousCompany);
      if (companyId && typeof window !== "undefined") {
        window.sessionStorage.setItem(`company:${companyId}`, JSON.stringify(previousCompany));
      }
      toast({
        variant: "destructive",
        title: "Primary Contact Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not update the primary contact. Please try again."),
      });
    } finally {
      setSavingPrimaryContactId(null);
    }
  };

  useEffect(() => {
    const loadCompany = async () => {
      if (!companyId) return;

      const hasCachedCompany = Boolean(company);
      setIsLoading((current) => (hasCachedCompany ? false : current));
      try {
        const context = await getAppLocationContext();
        const ghlLocationId = context.location?.ghlLocationId || "";
        setLocationId(ghlLocationId);
        const cachedBusinessCustomFields = getCachedBusinessCustomFields(ghlLocationId);
        if (ghlLocationId) {
          const fetchedTags = await getLocationTags(ghlLocationId).catch((error) => {
            console.error("Failed to load location tags", error);
            return [];
          });
          setTagOptions(fetchedTags);
        }

        const locationRecordId = context.location?.id || "";
        setAppLocationId(locationRecordId);
        try {
          const businessResponse = await getBusiness(companyId);
          const nextCompany = unwrapBusinessResponse(businessResponse);
          if (nextCompany) {
            setCompany(nextCompany);
            window.sessionStorage.setItem(`company:${companyId}`, JSON.stringify(nextCompany));
          }
        } catch (error) {
          console.warn("Company refresh skipped", error);
          if (!hasCachedCompany) throw error;
        }

        if (ghlLocationId) {
          const businessRecordResponse = await getBusinessObjectRecord(ghlLocationId, companyId).catch((error) => {
            console.error("Failed to load business object record", error);
            return null;
          });
          const businessProperties = getBusinessPropertiesFromRecord(businessRecordResponse);
          setCompanyIndustry(
            getBusinessIndustryLabel(businessProperties.industry, cachedBusinessCustomFields) ||
              String(businessProperties.industry || ""),
          );
        }

        const contactsResponse = await getContactsByBusinessId(ghlLocationId, companyId).catch((error) => {
          console.error("Failed to load company contacts", error);
          return { contacts: [] };
        });
        const linkedContacts = getArrayFromResponse(contactsResponse, "contacts");
        const contactCustomFields = getCachedContactCustomFields(ghlLocationId);
        setCompanyContacts(linkedContacts.map((contact: any) => normalizeCompanyContact(contact, contactCustomFields)));

        if (locationRecordId) {
          const linkedContactIds = new Set(
            linkedContacts
              .map((contact: any) => String(contact.id || contact._id || ""))
              .filter(Boolean),
          );
          const caseRows = await listCases({ locationId: locationRecordId }).catch((error) => {
            console.error("Failed to load company matters", error);
            return [];
          });
          setCompanyMatters(
            caseRows.filter((caseRecord) => {
              const matterContactId = String(caseRecord.ghl_contact_id || "");
              const matterCompanyId = String(caseRecord.metadata?.companyId || caseRecord.metadata?.company_id || "");
              return matterCompanyId === companyId || matterContactId === companyId || linkedContactIds.has(matterContactId);
            }),
          );

          const { data, error } = await supabase
            .from("contact_assignments")
            .select("assigned_user_id")
            .eq("location_id", locationRecordId)
            .eq("ghl_contact_id", companyId)
            .maybeSingle();

          if (!error && data?.assigned_user_id) {
            const assignableUsers = await loadSystemUsers();
            const user = assignableUsers.find((candidate) => getUserId(candidate) === data.assigned_user_id);
            setAssignedAttorneyId(user ? getUserId(user) : "");
            setAssignedAttorney(user ? getUserName(user) : "Unassigned");
          }

          setTasksLoading(true);
          listTasks({ locationId: locationRecordId, limit: 500 })
            .then((tasks) => {
              setCompanyTasks(
                tasks.filter((task) => {
                  const metadata = task.metadata && typeof task.metadata === "object" ? task.metadata : {};
                  return metadata.companyId === companyId || metadata.company_id === companyId;
                }),
              );
            })
            .catch((error) => {
              console.error("Failed to load company tasks", error);
            })
            .finally(() => setTasksLoading(false));
        }
      } catch (error) {
        if (hasCachedCompany) {
          console.warn("Company background refresh failed", error);
          return;
        }

        toast({
          variant: "destructive",
          title: "Company Not Loaded",
          description: getUserFriendlyErrorMessage(error, "We couldn't load this company right now."),
        });
      } finally {
        setIsLoading(false);
      }
    };

    void loadCompany();
  }, [companyId]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="mx-auto w-full px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-16 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <UserX className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-foreground">Company not found</h3>
          <p className="mb-6 max-w-md text-muted-foreground">
            The company you are looking for might have been deleted or does not exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] w-full flex-col overflow-hidden px-4 pb-2 pt-2 sm:px-6">
      <EditCompanyDialog
        open={isEditCompanyOpen}
        onOpenChange={setIsEditCompanyOpen}
        company={company}
        industry={industry}
        industryOptions={industryOptions}
        onEditCompany={handleEditCompany}
      />

      <MatterActionSheet
        open={Boolean(matterAction)}
        onOpenChange={(open) => !open && setMatterAction(null)}
        mode={matterAction?.mode || null}
        matter={matterAction?.matter || null}
        locationId={appLocationId}
        onSaved={(updatedMatter) => {
          setCompanyMatters((current) =>
            current.map((matter) => (matter.id === updatedMatter.id ? { ...matter, ...updatedMatter } : matter)),
          );
        }}
        onDeleted={(matterId) => {
          setCompanyMatters((current) => current.filter((matter) => matter.id !== matterId));
        }}
      />
      <MatterCreateSheet
        open={isCreateMatterOpen}
        onOpenChange={setIsCreateMatterOpen}
        locationId={appLocationId}
        contact={
          primaryContactRecord
            ? {
                id: primaryContactRecord.id,
                name: primaryContactRecord.name,
                email: primaryContactRecord.email,
                assignedUserId: assignedAttorneyId,
              }
            : null
        }
        relatedCompany={{
          id: companyId || company.id,
          name: company.name || "Company",
        }}
        onCreated={(matter) => {
          setCompanyMatters((current) => [matter, ...current]);
        }}
      />

      <CompanyTaskCreateSheet
        open={isCreateTaskOpen}
        onOpenChange={setIsCreateTaskOpen}
        users={systemUsers}
        locationId={appLocationId}
        companyId={companyId || company.id}
        companyName={company.name}
        initialAssignedUserId={assignedAttorneyId}
        onSaved={handleTaskCreated}
      />

      <Sheet
        open={isAddContactOpen}
        onOpenChange={(open) => {
          if (!open) resetContactForm();
          setIsAddContactOpen(open);
        }}
      >
        <SheetContent className="flex h-screen w-full flex-col overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
            <SheetTitle className="text-lg font-semibold">Add Company Contact</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleCreateCompanyContact} className="flex min-h-0 flex-1 flex-col">
            <div className="hover-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={contactForm.name}
                  onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Jane Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={contactForm.title}
                  onChange={(event) => setContactForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Chief Operating Officer"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={contactForm.email}
                  onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="jane@example.com"
                  required
                />
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setIsAddContactOpen(false)} disabled={isSavingContact}>
                Cancel
              </Button>
              <Button type="submit" className="hover:bg-[#0484C8]" disabled={isSavingContact}>
                {isSavingContact ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(editingCompanyContact)}
        onOpenChange={(open) => {
          if (!open) closeCompanyContactEdit();
        }}
      >
        <SheetContent className="flex h-screen w-full flex-col overflow-hidden p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
            <SheetTitle className="text-lg font-semibold">Edit Company Contact</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleUpdateCompanyContact} className="flex min-h-0 flex-1 flex-col">
            <div className="hover-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={contactEditForm.name}
                  onChange={(event) => setContactEditForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Jane Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={contactEditForm.title}
                  onChange={(event) => setContactEditForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Chief Operating Officer"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={contactEditForm.email}
                  onChange={(event) => setContactEditForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="jane@example.com"
                  required
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-border bg-background px-6 py-4">
              <Button type="submit" className="w-full hover:bg-[#0484C8]" disabled={isSavingContactEdit}>
                {isSavingContactEdit ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <div className="shrink-0 border-b border-border pb-4">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-blue-50 text-primary">
                <Building2 className="h-6 w-6" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="mr-1 text-2xl font-bold text-foreground">{company.name}</h1>
                <Badge
                  variant="outline"
                  className="h-6 shrink-0 border-transparent bg-gray-100 px-3 font-semibold text-gray-900"
                >
                  Company
                </Badge>
                <Badge
                  variant="outline"
                  className={`h-6 shrink-0 border-transparent px-3 ${getStatusColor(status)}`}
                >
                  {status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex w-full gap-3 md:w-auto">
            <HeaderIconTooltip label="Email">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full p-0 hover:bg-[#0484C8]"
                disabled={!company.email}
                aria-label="Email"
                onClick={() => {
                  if (company.email) window.location.href = `mailto:${company.email}`;
                }}
              >
                <Mail className="h-4 w-4" />
              </Button>
            </HeaderIconTooltip>
            <HeaderIconTooltip label="Call">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
                disabled={!company.phone}
                aria-label="Call"
                onClick={() => {
                  if (company.phone) window.location.href = `tel:${company.phone}`;
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
                onClick={() => {
                  setIsEditCompanyOpen(true);
                }}
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
            <HeaderIconTooltip label="Add Contact">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
                aria-label="Add Contact"
                onClick={() => setIsAddContactOpen(true)}
              >
                <UserRound className="h-4 w-4" />
              </Button>
            </HeaderIconTooltip>
            <HeaderIconTooltip label={primaryContactRecord ? "Add Matter" : "Add a contact before creating a matter"}>
              <Button
                size="icon"
                className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-[#0484C8]"
                disabled={!primaryContactRecord}
                aria-label="Add Matter"
                onClick={() => setIsCreateMatterOpen(true)}
              >
                <Briefcase className="h-4 w-4 shrink-0" />
              </Button>
            </HeaderIconTooltip>
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
              Company Details
            </h2>
          </div>

          <Accordion type="multiple" defaultValue={["company", "business", "tags", "record"]} className="w-full">
            <AccordionItem value="company">
              <AccordionTrigger>Company Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Email</span>
                    <span className="break-all">
                      {company.email ? (
                        <a href={`mailto:${company.email}`} className="text-[#2384CA] hover:underline">
                          {company.email}
                        </a>
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Phone</span>
                    <span>{formatDetailValue(phone)}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Website</span>
                    <span className="break-all">
                      {website ? (
                        <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noreferrer" className="text-[#2384CA] hover:underline">
                          {website}
                        </a>
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Address</span>
                    <span className="whitespace-pre-line">{formatDetailValue(address)}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="business">
              <AccordionTrigger>Business Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Industry</span>
                    <span>{formatDetailValue(industry)}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Practice Area</span>
                    <span>{practiceArea}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Assigned Attorney</span>
                    <span>{formatDetailValue(assignedAttorney)}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Primary Contact</span>
                    <span className="flex min-w-0 items-center gap-2">
                      {primaryContactRecord ? (
                        <>
                          <button
                            type="button"
                            className="min-w-0 cursor-pointer truncate text-left text-[#2384CA] hover:text-[#1b6da8]"
                            onClick={() => navigate(`/contact/${primaryContactRecord.id}`)}
                          >
                            {primaryContact === "Not set" ? primaryContactRecord.name : formatPersonName(primaryContact)}
                          </button>
                        </>
                      ) : (
                        formatDetailValue(primaryContact)
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Status</span>
                    <span>{status}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tags">
              <AccordionTrigger>Tags</AccordionTrigger>
              <AccordionContent>
                {companyTags.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    {companyTags.map((tag) => (
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
                            void handleRemoveTagFromCompany(tag);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <CompanyTagAddButton
                      options={tagOptions.map((tag) => tag.name)}
                      currentTags={companyTags}
                      onAddTag={handleAddTagToCompany}
                      onCreateTag={handleCreateTag}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-sm text-muted-foreground">No tags</span>
                    <CompanyTagAddButton
                      options={tagOptions.map((tag) => tag.name)}
                      currentTags={companyTags}
                      onAddTag={handleAddTagToCompany}
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
                    <span>{formatDate(company.createdAt)}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Updated</span>
                    <span>{formatDate(company.updatedAt)}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="h-full overflow-y-auto py-6 lg:px-6">
          <Tabs defaultValue="tasks" className="w-full">
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
                      <CompanyTaskList tasks={activeTasks} users={systemUsers} />
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="completed-tasks">
                    <AccordionTrigger>Completed Tasks ({completedTasks.length})</AccordionTrigger>
                    <AccordionContent>
                      <CompanyTaskList tasks={completedTasks} users={systemUsers} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </TabsContent>

            <TabsContent value="notes" className="m-0">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="recent-notes">
                  <AccordionTrigger>Recent Notes</AccordionTrigger>
                  <AccordionContent>
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      {parsedDescription.notes || "No notes found."}
                    </div>
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
          <Accordion type="multiple" defaultValue={["matter", "contacts"]} className="w-full">
            <AccordionItem value="matter">
              <AccordionTrigger>Matter Overview</AccordionTrigger>
              <AccordionContent>
                <div className="pt-2">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">
                      {companyMatters.length === 1 ? "Matter" : "Matters"} ({companyMatters.length})
                    </div>
                    <Link to="/cases" className="shrink-0 text-xs font-medium text-[#2384CA] hover:text-[#1b6da8]">
                      View all matters
                    </Link>
                  </div>

                  {companyMatters.length > 0 ? (
                    <div className="divide-y divide-border rounded-lg bg-card">
                      {companyMatters.map((matter) => (
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
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem onClick={() => setMatterAction({ mode: "edit", matter })}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setMatterAction({ mode: "delete", matter })}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-sm text-muted-foreground">
                      No matters linked to this company yet.
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="contacts">
              <AccordionTrigger>Contacts</AccordionTrigger>
              <AccordionContent>
                <div className="divide-y divide-border pt-2">
                  <div className="py-3 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/5 text-sm font-semibold text-primary">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          {primaryContactRecord ? (
                            <button
                              type="button"
                              className="block max-w-full cursor-pointer truncate text-left text-sm font-semibold text-[#2384CA] hover:text-[#1b6da8]"
                              onClick={() => navigate(`/contact/${primaryContactRecord.id}`)}
                            >
                              {primaryContact === "Not set" ? primaryContactRecord.name : formatPersonName(primaryContact)}
                            </button>
                          ) : (
                            <div className="truncate text-sm font-semibold">{primaryContact}</div>
                          )}
                          <div className="truncate text-xs text-muted-foreground">
                            {primaryContactRecord?.title || "No title set"}
                          </div>
                          {primaryContactRecord ? (
                            <div className="truncate text-xs text-[#2384CA]">
                              {primaryContactRecord.email}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-xs font-medium text-primary">
                          Primary Contact
                        </Badge>
                        {primaryContactRecord ? (
                          <CompanyContactActions
                            disabled={removingCompanyContactId === primaryContactRecord.id}
                            onEdit={() => openCompanyContactEdit(primaryContactRecord)}
                            onDelete={() => handleRemoveCompanyContactConnection(primaryContactRecord)}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {secondaryCompanyContacts.map((contact) => (
                    <div key={contact.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left transition-colors hover:bg-muted/40"
                          onClick={() => navigate(`/contact/${contact.id}`)}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/5 text-sm font-semibold text-primary">
                            {getAvatarInitials({ fullName: contact.name, email: contact.email }, "C")}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="block truncate text-sm font-semibold text-[#2384CA]">
                              {contact.name}
                            </div>
                            {contact.title ? <div className="text-xs text-muted-foreground">{contact.title}</div> : null}
                            <span className="block truncate text-xs text-[#2384CA]">
                              {contact.email}
                            </span>
                          </div>
                        </button>
                        <CompanyContactActions
                          disabled={removingCompanyContactId === contact.id || savingPrimaryContactId === contact.id}
                          onMakePrimary={() => handleMakePrimaryCompanyContact(contact)}
                          onEdit={() => openCompanyContactEdit(contact)}
                          onDelete={() => handleRemoveCompanyContactConnection(contact)}
                        />
                        </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}
