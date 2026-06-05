import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckSquare, Clock, IdCard, Loader2, Mail, Pencil, Phone, Plus, UserX, X } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  apiClient,
  createLocationTag,
  getAppLocationContext,
  getCustomFields,
  getLocationTags,
  type GhlTag,
  updateContact,
} from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneNumber } from "@/lib/phone";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import { supabase } from "@/lib/supabase";
import { createTagMetadata, loadTagsWithMetadata } from "@/lib/tag-metadata";
import { createTask, listTasks, type TaskRecord, updateTask } from "@/lib/tasks";
import { getAssignableUsers, getUserId, getUserName } from "@/lib/users";
import { cn } from "@/lib/utils";

const getStatusColor = (status: string) => {
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
};

const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"];
const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];

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

function getCustomFieldValue(contact: any, fieldName: string) {
  const field = contact.customFields?.find((customField: any) => {
    const name = customField.name?.toLowerCase() || "";
    return name === fieldName || customField.id === fieldName;
  });

  return field?.value || field?.field_value;
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
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  const dateLabel = date.toLocaleDateString("en-US");
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateLabel}, ${timeLabel}`;
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
            className="fixed z-[220] overflow-hidden rounded-md border border-border bg-background shadow-lg"
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
            <div className="hover-scrollbar max-h-56 overflow-y-auto p-1">
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
          task.assigned_user?.full_name ||
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
            <Button type="submit" className="flex-1" disabled={submitting}>
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

export function ContactDetailPage() {
  const { contactId } = useParams();
  const { toast } = useToast();
  const [contact, setContact] = useState<any>(null);
  const [contactTasks, setContactTasks] = useState<TaskRecord[]>([]);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [accountTypeOptions, setAccountTypeOptions] = useState<string[]>([]);
  const [practiceAreaOptions, setPracticeAreaOptions] = useState<string[]>([]);
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<GhlTag[]>([]);
  const [crmCustomFields, setCrmCustomFields] = useState<any[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [userAvatarMap, setUserAvatarMap] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState("");
  const [locationRecordId, setLocationRecordId] = useState("");
  const effectivePracticeAreaOptions = Array.from(new Set([...PRACTICE_AREAS, ...practiceAreaOptions]));
  const activeTasks = useMemo(() => contactTasks.filter((task) => !isCompletedTask(task)), [contactTasks]);
  const completedTasks = useMemo(() => contactTasks.filter(isCompletedTask), [contactTasks]);

  const handleTaskSaved = (savedTask: TaskRecord) => {
    setContactTasks((current) => current.map((task) => (task.id === savedTask.id ? { ...task, ...savedTask } : task)));
    setEditingTask(null);
  };

  const handleTaskCreated = (savedTask: TaskRecord) => {
    setContactTasks((current) => [savedTask, ...current.filter((task) => task.id !== savedTask.id)]);
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

        setAccountTypeOptions(getFieldOptions(findField("account type")));
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
    setContact({
      ...contact,
      ...updatedData,
      phone: formatPhoneNumber(updatedData.phone),
      assignedAttorney: selectedAssignedUser ? getUserName(selectedAssignedUser) : "Unassigned",
      assignedAttorneyId: selectedAssignedUser ? getUserId(selectedAssignedUser) : "",
      tags: Array.from(new Set([updatedData.type, updatedData.status, ...(updatedData.tags || [])].filter(Boolean))),
    });

    try {
      const [firstName, ...rest] = updatedData.name.trim().split(" ");
      const payload: Record<string, any> = {
        firstName,
        lastName: rest.join(" "),
        email: updatedData.email,
        tags: Array.from(new Set([updatedData.type, updatedData.status, ...(updatedData.tags || [])].filter(Boolean))),
      };

      if (updatedData.phone && updatedData.phone !== "N/A") payload.phone = formatPhoneNumber(updatedData.phone, "");
      if (updatedData.dob && updatedData.dob !== "N/A" && updatedData.dob.trim() !== "") {
        payload.dateOfBirth = updatedData.dob;
      }

      const getFieldId = (name: string) =>
        crmCustomFields.find((customField) => customField.name?.trim().toLowerCase() === name)?.id;
      const genderFieldId = getFieldId("gender");

      if (!genderFieldId && updatedData.gender && updatedData.gender !== "N/A") {
        const lowerGender = updatedData.gender.toLowerCase();
        if (["male", "female", "other"].includes(lowerGender)) payload.gender = lowerGender;
      }

      const caseTypeFieldId = getFieldId("practice area") || getFieldId("case type") || getFieldId("case");
      const accountTypeFieldId = getFieldId("account type");
      const languageFieldId = getFieldId("language");
      const customFields = [];

      if (caseTypeFieldId) customFields.push({ id: caseTypeFieldId, field_value: updatedData.caseType || "" });
      if (accountTypeFieldId) customFields.push({ id: accountTypeFieldId, field_value: updatedData.type || "" });
      if (languageFieldId) {
        customFields.push({
          id: languageFieldId,
          field_value: updatedData.language && updatedData.language !== "N/A" ? updatedData.language : "",
        });
      }
      if (genderFieldId) {
        customFields.push({
          id: genderFieldId,
          field_value: updatedData.gender && updatedData.gender !== "N/A" ? updatedData.gender : "",
        });
      }

      if (customFields.length > 0) payload.customFields = customFields;

      await updateContact(contact.id, payload);
      await saveContactAssignment(contact.id, selectedAssignedUser ? getUserId(selectedAssignedUser) : "");
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
        setContactTasks([]);
        if (locRecordId && rawContact.id) {
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

        const rawName = `${rawContact.firstName || ""} ${rawContact.lastName || ""}`.trim();
        const formattedName = rawName
          .split(" ")
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
        const tags = rawContact.tags || [];
        const accountTypeValue =
          getCustomFieldValue(rawContact, "account type") ||
          tags.find((tag: string) =>
            ["client", "attorney", "expert witness", "opposing counsel"].includes(tag.toLowerCase()),
          );
        const caseTypeValue =
          getCustomFieldValue(rawContact, "practice area") ||
          getCustomFieldValue(rawContact, "case type") ||
          getCustomFieldValue(rawContact, "case") ||
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
          status: (() => {
            if (tags.some((tag: string) => tag.toLowerCase().includes("pending"))) return "Pending";
            if (tags.some((tag: string) => tag.toLowerCase().includes("closed"))) return "Closed";
            if (tags.some((tag: string) => tag.toLowerCase().includes("consultation"))) return "Consultation";
            return "Active";
          })(),
          type: Array.isArray(accountTypeValue) ? accountTypeValue.join(", ") : accountTypeValue || "Client",
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
            : getCustomFieldValue(rawContact, "gender") || "N/A",
          language: getCustomFieldValue(rawContact, "language") || "English",
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
  const visibleTags = Array.from(new Set(contactTagValues)).filter((tag) => {
    const normalized = tag.toLowerCase();
    return ![
      String(contact.type || "").toLowerCase(),
      String(contact.status || "").toLowerCase(),
      "client",
      "attorney",
      "expert witness",
      "opposing counsel",
      "lead",
      "active",
      "pending",
      "closed",
      "consultation",
    ].includes(normalized);
  });

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] w-full flex-col overflow-hidden px-4 pb-2 pt-2 sm:px-6">
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
            <Button
              size="icon"
              className="h-10 w-10 rounded-full p-0"
              disabled={!contact.email || contact.email === "N/A"}
              title="Email"
              aria-label="Email"
              onClick={() => {
                if (contact.email && contact.email !== "N/A") window.location.href = `mailto:${contact.email}`;
              }}
            >
              <Mail className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-primary/90"
              disabled={!contact.phone || contact.phone === "N/A"}
              title="Call"
              aria-label="Call"
              onClick={() => {
                if (contact.phone && contact.phone !== "N/A") window.location.href = `tel:${contact.phone}`;
              }}
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-primary p-0 text-white hover:bg-primary/90"
              title="Edit"
              aria-label="Edit"
              onClick={() => setIsEditModalOpen(true)}
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
          <Accordion type="multiple" defaultValue={["personal", "demographics", "tags", "record"]} className="w-full">
            <AccordionItem value="personal">
              <AccordionTrigger>Personal Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Email</span>
                    <span className="col-span-2 break-all">
                      {contact.email !== "N/A" ? (
                        <a href={`mailto:${contact.email}`} className="text-[#2384CA] hover:underline">
                          {contact.email}
                        </a>
                      ) : (
                        contact.email
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Phone</span>
                    <span className="col-span-2">{contact.phone}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Address</span>
                    <span className="col-span-2 whitespace-pre-line">{contact.address}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="demographics">
              <AccordionTrigger>Demographics</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">DOB</span>
                    <span className="col-span-2">
                      {contact.dob !== "N/A" ? new Date(contact.dob).toLocaleDateString() : "N/A"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Gender</span>
                    <span className="col-span-2">{contact.gender}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Language</span>
                    <span className="col-span-2">{contact.language}</span>
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
                  <AccordionTrigger>Recent Notes</AccordionTrigger>
                  <AccordionContent>
                    <div className="py-4 text-center text-sm text-muted-foreground">No notes found.</div>
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
          <Accordion type="multiple" defaultValue={["matter"]} className="w-full">
            <AccordionItem value="matter">
              <AccordionTrigger>Matter Overview</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  <div className="rounded-lg border border-primary/10 bg-primary/5 p-4">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">Last Contact</div>
                    <div className="text-sm font-semibold">{contact.lastContact}</div>
                  </div>
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
      />
    </div>
  );
}
