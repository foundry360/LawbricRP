import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CheckSquare, Loader2, Mail, Pencil, Phone, Plus, UserRound, UserX, X } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  addContactsToBusiness,
  createContact,
  getAppLocationContext,
  getBusiness,
  getContactsByBusinessId,
  getCustomFields,
  type GhlBusiness,
  updateBusiness,
} from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
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

const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"];
const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];

function unwrapBusinessResponse(response: any): GhlBusiness | null {
  return response?.business || response?.buiseness || response?.data?.business || response?.data?.buiseness || response?.data || response || null;
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  const dateLabel = date.toLocaleDateString("en-US");
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateLabel}, ${timeLabel}`;
}

function formatAddress(company: GhlBusiness) {
  return [
    company.address,
    [company.city, `${company.state || ""} ${company.postalCode || ""}`.trim()].filter(Boolean).join(", "),
    company.country,
  ].filter(Boolean).join("\n") || "N/A";
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
  const name = `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.name || contact.email || "Unknown";
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
  return task.assigned_user?.full_name || task.assigned_user?.email || (assignedUser ? getUserName(assignedUser) : "Unassigned");
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
  disabled,
}: {
  options: string[];
  currentTags: string[];
  onAddTag: (tagName: string) => Promise<void>;
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
    const estimatedHeight = 260;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openAbove = availableBelow < estimatedHeight && availableAbove > availableBelow;
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
    );

    setMenuStyle({
      left,
      top: openAbove ? Math.max(viewportPadding, rect.top - estimatedHeight - gap) : rect.bottom + gap,
      width: menuWidth,
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

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const addTag = async (tagName: string) => {
    const nextTag = tagName.trim();
    if (!nextTag) return;

    setIsSaving(true);
    try {
      await onAddTag(nextTag);
      setQuery("");
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] rounded-md border border-border bg-background p-0 shadow-lg"
            style={menuStyle}
          >
            <div className="border-b border-border p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search or create tag..."
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="hover-scrollbar max-h-52 overflow-y-auto p-1">
              {filteredOptions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => void addTag(tag)}
                >
                  {tag}
                </button>
              ))}
              {canCreate ? (
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-2 border-t px-2 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                  onClick={() => void addTag(trimmedQuery)}
                >
                  <Plus className="h-4 w-4" />
                  <span className="truncate">Create tag "{trimmedQuery}"</span>
                </button>
              ) : null}
              {filteredOptions.length === 0 && !canCreate ? (
                <div className="px-2 py-3 text-center text-sm text-muted-foreground">No tags found.</div>
              ) : null}
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
            <Button type="submit" className="flex-1" disabled={submitting}>
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

export function CompanyDetailPage() {
  const { companyId } = useParams();
  const location = useLocation();
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
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isLoading, setIsLoading] = useState(!initialCompany);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    title: "",
    email: "",
  });

  const parsedDescription = useMemo(() => parseDescription(company?.description), [company?.description]);
  const phone = company?.phone ? formatPhoneNumber(company.phone) : "Not set";
  const address = company ? formatAddress(company) : "Not set";
  const website = company?.website || "";
  const status = parsedDescription.status || "Active";
  const practiceArea = parsedDescription.practiceArea || "General";
  const primaryContact = parsedDescription.primaryContact || "Not set";
  const activeTasks = useMemo(() => companyTasks.filter((task) => !isCompletedTask(task)), [companyTasks]);
  const completedTasks = useMemo(() => companyTasks.filter(isCompletedTask), [companyTasks]);
  const companyTags = useMemo(() => {
    const rawTags = Array.isArray(company?.tags) ? company.tags : [];
    const descriptionTags = parsedDescription.tags || [];
    const tags = [...rawTags, ...descriptionTags].map((tag) => String(tag).trim()).filter(Boolean);
    return Array.from(new Set(tags));
  }, [company?.tags, parsedDescription.tags]);

  const resetContactForm = () => {
    setContactForm({ name: "", title: "", email: "" });
  };

  const loadContactCustomFields = async () => {
    if (!locationId) return customFields;
    if (customFields.length > 0) return customFields;

    const fieldsResponse: any = await getCustomFields(locationId).catch((error) => {
      console.error("Failed to load contact custom fields", error);
      return { customFields: [] };
    });
    const nextCustomFields = getArrayFromResponse(fieldsResponse, "customFields");
    setCustomFields(nextCustomFields);
    return nextCustomFields;
  };

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

  const handleAddTagToCompany = async (tagName: string) => {
    const trimmedName = tagName.trim();
    if (!trimmedName || companyTags.some((tag) => tag.toLowerCase() === trimmedName.toLowerCase())) return;

    await saveCompanyTags([...companyTags, trimmedName], `${trimmedName} has been added.`);
  };

  const handleRemoveTagFromCompany = async (tagName: string) => {
    const nextTags = companyTags.filter((tag) => tag.toLowerCase() !== tagName.toLowerCase());
    await saveCompanyTags(nextTags, `${tagName} has been removed.`);
  };

  const handleCreateCompanyContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!company || !companyId) return;

    const name = contactForm.name.trim();
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
        businessId: companyId,
        tags: ["Company Contact"],
      };

      const availableCustomFields = await loadContactCustomFields();
      const titleFieldId = getCustomFieldId(availableCustomFields, ["title", "job title", "contact title"]);
      if (title) {
        payload.title = title;
        payload.jobTitle = title;
      }
      if (titleFieldId && title) {
        payload.customFields = [{ id: titleFieldId, field_value: title }];
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

  useEffect(() => {
    const loadCompany = async () => {
      if (!companyId) return;

      const hasCachedCompany = Boolean(company);
      setIsLoading((current) => (hasCachedCompany ? false : current));
      try {
        const context = await getAppLocationContext();
        const ghlLocationId = context.location?.ghlLocationId || "";
        setLocationId(ghlLocationId);

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

        const contactsResponse = await getContactsByBusinessId(companyId).catch((error) => {
          console.error("Failed to load company contacts", error);
          return { contacts: [] };
        });
        setCompanyContacts(
          getArrayFromResponse(contactsResponse, "contacts").map((contact: any) =>
            normalizeCompanyContact(contact),
          ),
        );

        if (locationRecordId) {
          const assignableUsers = await getAssignableUsers().catch((error) => {
            console.error("Failed to fetch assigned user details", error);
            return [];
          });
          setSystemUsers(assignableUsers);
          const { data, error } = await supabase
            .from("contact_assignments")
            .select("assigned_user_id")
            .eq("location_id", locationRecordId)
            .eq("ghl_contact_id", companyId)
            .maybeSingle();

          if (!error && data?.assigned_user_id) {
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
              <Button type="submit" disabled={isSavingContact}>
                {isSavingContact ? "Saving..." : "Save Contact"}
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
            <Button
              size="icon"
              className="h-10 w-10 rounded-full p-0"
              disabled={!company.email}
              title="Email"
              aria-label="Email"
              onClick={() => {
                if (company.email) window.location.href = `mailto:${company.email}`;
              }}
            >
              <Mail className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-primary/90"
              disabled={!company.phone}
              title="Call"
              aria-label="Call"
              onClick={() => {
                if (company.phone) window.location.href = `tel:${company.phone}`;
              }}
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-primary/90"
              title="Edit"
              aria-label="Edit"
              onClick={() => {
                toast({ title: "Company Editing Coming Soon", description: "Company records can be managed in Companies for now." });
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-primary/90"
              title="Add Task"
              aria-label="Add Task"
              onClick={() => setIsCreateTaskOpen(true)}
            >
              <CheckSquare className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-primary/90"
              title="Add Contact"
              aria-label="Add Contact"
              onClick={() => setIsAddContactOpen(true)}
            >
              <UserRound className="h-4 w-4" />
            </Button>
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
                        "N/A"
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Phone</span>
                    <span>{phone}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Website</span>
                    <span className="break-all">
                      {website ? (
                        <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noreferrer" className="text-[#2384CA] hover:underline">
                          {website}
                        </a>
                      ) : (
                        "N/A"
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Address</span>
                    <span className="whitespace-pre-line">{address}</span>
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
                    <span>{parsedDescription.industry || "N/A"}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Practice Area</span>
                    <span>{practiceArea}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Assigned Attorney</span>
                    <span>{assignedAttorney}</span>
                  </div>
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <span className="whitespace-nowrap font-medium text-foreground/70">Primary Contact</span>
                    <span>{primaryContact}</span>
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
                        className="h-6 gap-1.5 border-transparent bg-primary/5 px-2.5 text-xs font-medium text-primary"
                      >
                        {tag}
                        <button
                          type="button"
                          className="-mr-1 rounded-full p-0.5 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
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
                      options={companyTags}
                      currentTags={companyTags}
                      onAddTag={handleAddTagToCompany}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-sm text-muted-foreground">No tags</span>
                    <CompanyTagAddButton
                      options={companyTags}
                      currentTags={companyTags}
                      onAddTag={handleAddTagToCompany}
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
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-sm text-muted-foreground">
                    Matter overview details will appear here.
                  </div>
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
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{primaryContact}</div>
                          <div className="truncate text-xs text-muted-foreground">{company.email || "No email set"}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-xs font-medium text-primary">
                        Primary Contact
                      </Badge>
                    </div>
                  </div>

                  {companyContacts.map((contact) => (
                    <div key={contact.id} className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/5 text-sm font-semibold text-primary">
                          {getAvatarInitials({ fullName: contact.name, email: contact.email }, "C")}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{contact.name}</div>
                          {contact.title ? <div className="text-xs text-muted-foreground">{contact.title}</div> : null}
                          <a href={`mailto:${contact.email}`} className="block truncate text-xs text-[#2384CA] hover:underline">
                            {contact.email}
                          </a>
                        </div>
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
