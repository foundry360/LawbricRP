import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Loader2,
  Mail,
  MoreVertical,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
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
import { NoteRichTextBody, NoteRichTextEditor } from "@/components/NoteRichText";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UserLink } from "@/components/UserLink";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getAppLocationContext, getPipelines, type GhlPipeline } from "@/lib/api";
import {
  addCaseParty,
  createCaseEvent,
  createCaseNote,
  createCaseTask,
  deleteCaseNote,
  getCase,
  type CaseDetail,
  updateCase,
  updateCaseNote,
  uploadCaseDocument,
} from "@/lib/cases";
import { formatTaskStatusLabel, updateTask } from "@/lib/tasks";
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
const TASK_STATUS_OPTIONS = ["todo", "in_progress", "blocked", "done", "cancelled"];
const TASK_PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"];

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

function getMatterPartyDisplayName(party: any) {
  return formatPersonName(party?.name || "") || party?.email || party?.phone || "Unnamed contact";
}

function getNoteAuthorName(note: { created_by?: string | null }, users: AssignableUser[]) {
  if (!note.created_by) return "Unknown user";
  const matchedUser = users.find((user) => getUserId(user) === note.created_by);
  return matchedUser ? getUserName(matchedUser) : "Unknown user";
}

export function CaseDetailPage() {
  const { caseId } = useParams();
  const { toast } = useToast();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isNoteSheetOpen, setIsNoteSheetOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [noteSheetMode, setNoteSheetMode] = useState<"view" | "edit" | "create">("create");
  const [isOverviewCollapsed, setIsOverviewCollapsed] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("tasks");
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

      <div
        className={cn(
          "grid flex-1 grid-cols-1 overflow-hidden border-b border-border lg:divide-x lg:divide-border",
          isOverviewCollapsed ? "lg:grid-cols-[25fr_75fr_40px]" : "lg:grid-cols-[25fr_45fr_30fr]",
        )}
      >
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
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-transparent p-0 xl:grid-cols-6">
                <TabsTrigger value="tasks" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Tasks</TabsTrigger>
                <TabsTrigger value="timeline" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Timeline</TabsTrigger>
                <TabsTrigger value="parties" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Parties</TabsTrigger>
                <TabsTrigger value="events" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Events</TabsTrigger>
                <TabsTrigger value="documents" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Docs</TabsTrigger>
                <TabsTrigger value="financials" className={CASE_DETAIL_TAB_TRIGGER_CLASS}>Financials</TabsTrigger>
              </TabsList>
            </div>

            <div className="hover-scrollbar min-h-0 flex-1 overflow-y-auto pb-6">
              <TabsContent value="tasks" className="m-0">
                <TasksTab
                  detail={detail}
                  users={users}
                  onTaskClick={(task) => {
                    setSelectedTask(task);
                    setIsCreateTaskOpen(true);
                  }}
                />
              </TabsContent>
              <TabsContent value="timeline" className="m-0">
                <TimelineTab detail={detail} onChanged={loadCase} />
              </TabsContent>
              <TabsContent value="parties" className="m-0">
                <PartiesTab detail={detail} onChanged={loadCase} />
              </TabsContent>
              <TabsContent value="events" className="m-0">
                <EventsTab detail={detail} onChanged={loadCase} />
              </TabsContent>
              <TabsContent value="documents" className="m-0">
                <DocumentsTab detail={detail} onChanged={loadCase} />
              </TabsContent>
              <TabsContent value="financials" className="m-0">
                <FinancialsTab detail={detail} />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {!isOverviewCollapsed && (
          <div className="hover-scrollbar h-full overflow-y-auto py-6 lg:pl-6">
            <OverviewTab
              detail={detail}
              users={users}
              onViewAllDocuments={() => setActiveDetailTab("documents")}
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
              onToggleCollapse={() => setIsOverviewCollapsed(true)}
            />
          </div>
        )}
        {isOverviewCollapsed && (
          <div className="hidden h-full items-start justify-center bg-[#F8FAFC] py-6 lg:flex">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground"
              onClick={() => setIsOverviewCollapsed(false)}
              title="Show overview"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
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

function OverviewTab({
  detail,
  users,
  onViewAllDocuments,
  onViewNote,
  onEditNote,
  onDeleteNote,
  onToggleCollapse,
}: {
  detail: CaseDetail;
  users: AssignableUser[];
  onViewAllDocuments: () => void;
  onViewNote: (note: any) => void;
  onEditNote: (note: any) => void;
  onDeleteNote: (note: any) => void;
  onToggleCollapse: () => void;
}) {
  const clientName = formatPersonName(detail.case.primary_contact_name) || detail.case.ghl_contact_id || "Unknown contact";
  const recentDocuments = detail.documents.slice(0, 5);
  const recentNotes = detail.notes.slice(0, 5);
  const primaryContactMatchValues = new Set(
    [detail.case.ghl_contact_id, detail.case.primary_contact_email, detail.case.primary_contact_name]
      .map((value) => normalizeMatterContactMatch(value))
      .filter(Boolean),
  );
  const associatedContacts = detail.parties.filter((party) => {
    const values = [party.ghl_contact_id, party.email, party.name].map((value) => normalizeMatterContactMatch(value));
    return !values.some((value) => value && primaryContactMatchValues.has(value));
  });

  return (
    <>
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/70">Additional Information</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground"
          onClick={onToggleCollapse}
          title="Hide overview"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-4">
        <Accordion type="multiple" defaultValue={["contacts"]} className="w-full">
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
                        {detail.case.ghl_contact_id ? (
                          <Link
                            to={`/contact/${detail.case.ghl_contact_id}`}
                            className="block truncate text-sm font-semibold text-[#2384CA] hover:text-[#1b6da8]"
                          >
                            {clientName}
                          </Link>
                        ) : (
                          <div className="truncate text-sm font-semibold">{clientName}</div>
                        )}
                        <div className="truncate text-xs text-muted-foreground">Primary Contact</div>
                        {detail.case.primary_contact_email ? (
                          <div className="truncate text-xs text-[#2384CA]">{detail.case.primary_contact_email}</div>
                        ) : null}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-xs font-medium text-primary">
                      Primary
                    </Badge>
                  </div>
                </div>

                {associatedContacts.map((party) => {
                  const name = getMatterPartyDisplayName(party);
                  const contactId = String(party.ghl_contact_id || "");
                  return (
                    <div key={party.id || `${name}-${party.email || party.phone || party.role}`} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/5 text-sm font-semibold text-primary">
                            {getAvatarInitials({ fullName: name, email: party.email }, "C")}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            {contactId ? (
                              <Link
                                to={`/contact/${contactId}`}
                                className="block truncate text-sm font-semibold text-[#2384CA] hover:text-[#1b6da8]"
                              >
                                {name}
                              </Link>
                            ) : (
                              <div className="truncate text-sm font-semibold text-foreground">{name}</div>
                            )}
                            <div className="truncate text-xs text-muted-foreground">
                              {[party.party_type, party.role].filter(Boolean).join(" - ") || "Associated Contact"}
                            </div>
                            {party.email || party.phone ? (
                              <div className="truncate text-xs text-[#2384CA]">{party.email || party.phone}</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="documents">
            <AccordionTrigger
              action={
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-[#2384CA] hover:text-[#1b6da8]"
                  onClick={onViewAllDocuments}
                >
                  View all documents
                </button>
              }
            >
              Recent Documents ({recentDocuments.length})
            </AccordionTrigger>
            <AccordionContent>
              <MatterDocumentList documents={recentDocuments} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="notes">
            <AccordionTrigger>Notes ({recentNotes.length})</AccordionTrigger>
            <AccordionContent>
              <MatterNoteList notes={recentNotes} users={users} onViewNote={onViewNote} onEditNote={onEditNote} onDeleteNote={onDeleteNote} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

      </div>
    </>
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

function PartiesTab({ detail, onChanged }: { detail: CaseDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", partyType: "client", role: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      await addCaseParty({ caseId: detail.case.id, ...form });
      setForm({ name: "", partyType: "client", role: "", email: "", phone: "" });
      onChanged();
    } catch (error) {
      toast({ title: "Party Not Added", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TwoColumnTab title="Add Party" icon={Users} action={<Button disabled={submitting || !form.name.trim()} onClick={submit}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add Party</Button>}>
      <div className="space-y-3">
        <Input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Type" value={form.partyType} onChange={(event) => setForm({ ...form, partyType: event.target.value })} />
          <Input placeholder="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
        </div>
        <Input placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <Input placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      </div>
      <ListCard title="Parties" items={detail.parties} emptyIcon={Users} emptyText="No parties yet." render={(party) => (
        <Row title={party.name} meta={[party.party_type, party.role, party.email].filter(Boolean).join(" · ")} />
      )} />
    </TwoColumnTab>
  );
}

function TasksTab({
  detail,
  users,
  onTaskClick,
}: {
  detail: CaseDetail;
  users: AssignableUser[];
  onTaskClick: (task: any) => void;
}) {
  const activeTasks = detail.tasks.filter((task) => !isCompletedTask(task));
  const completedTasks = detail.tasks.filter(isCompletedTask);

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={["active-tasks", "completed-tasks"]} className="w-full">
        <AccordionItem value="active-tasks">
          <AccordionTrigger>Active Tasks ({activeTasks.length})</AccordionTrigger>
          <AccordionContent>
            <MatterTaskList tasks={activeTasks} users={users} onTaskClick={onTaskClick} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="completed-tasks">
          <AccordionTrigger>Completed Tasks ({completedTasks.length})</AccordionTrigger>
          <AccordionContent>
            <MatterTaskList tasks={completedTasks} users={users} onTaskClick={onTaskClick} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function MatterTaskList({
  tasks,
  users,
  onTaskClick,
}: {
  tasks: any[];
  users: AssignableUser[];
  onTaskClick: (task: any) => void;
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
          matchedUser?.avatar_url ||
          matchedUser?.profilePhoto ||
          "";
        const completed = isCompletedTask(task);
        const dueLabel = completed ? "Completed" : formatTaskDate(task.due_at);

        return (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            className="block w-full cursor-pointer py-3 text-left first:pt-0 last:pb-0 hover:bg-muted/30"
            onClick={() => onTaskClick(task)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onTaskClick(task);
              }
            }}
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
                  <div className="min-w-0 truncate capitalize">
                    {[formatTaskStatusLabel(task.status), task.priority].filter(Boolean).join(" · ")}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-right">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{dueLabel}</span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Assigned to{" "}
                  <UserLink
                    userId={assignedUserId}
                    user={matchedUser}
                    name={assignedUserName || "Unassigned"}
                    stopPropagation
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatFileSize(value?: number | null) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 bytes";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MatterDocumentList({ documents }: { documents: any[] }) {
  if (documents.length === 0) {
    return <div className="py-4 text-center text-sm text-muted-foreground">No documents found.</div>;
  }

  return (
    <div className="divide-y pt-3">
      {documents.map((document) => {
        const documentType = String(document.document_type || "Document").replace(/_/g, " ");
        const mimeType = document.mime_type || "file";

        return (
          <div key={document.id || document.file_name} className="block w-full py-3 text-left first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-[#2384CA]">{document.file_name || "Untitled document"}</div>
                <div className="mt-0.5 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                  <div className="min-w-0 truncate capitalize">
                    {[documentType, mimeType].filter(Boolean).join(" · ")}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-right">
                    <span>{formatFileSize(document.size_bytes)}</span>
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(document.created_at)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
              <NoteRichTextBody value={note.body || "Untitled note"} className="line-clamp-3 text-sm font-medium text-foreground" />
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

function DocumentsTab({ detail, onChanged }: { detail: CaseDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("other");
  const [submitting, setSubmitting] = useState(false);

  const fileToBase64 = (selectedFile: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(selectedFile);
    });

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      await uploadCaseDocument({
        caseId: detail.case.id,
        fileName: file.name,
        mimeType: file.type,
        documentType,
        contentBase64: await fileToBase64(file),
      });
      setFile(null);
      setDocumentType("other");
      onChanged();
    } catch (error) {
      toast({ title: "Document Not Uploaded", description: getUserFriendlyErrorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TwoColumnTab title="Upload Document" icon={Upload} action={<Button disabled={submitting || !file} onClick={submit}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload</Button>}>
      <div className="space-y-3">
        <Input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        <Input placeholder="Document type" value={documentType} onChange={(event) => setDocumentType(event.target.value)} />
      </div>
      <ListCard title="Documents" items={detail.documents} emptyIcon={FileText} emptyText="No documents yet." render={(document) => (
        <Row title={document.file_name} meta={`${document.document_type} · ${document.mime_type || "file"} · ${document.size_bytes || 0} bytes`} />
      )} />
    </TwoColumnTab>
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
