import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/DatePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/SearchableSelect";
import { UserLink } from "@/components/UserLink";
import { createCase, deleteCase, updateCase, type CaseRecord } from "@/lib/cases";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { getAppLocationContext, getPipelines, type GhlPipeline } from "@/lib/api";
import { formatPhoneNumber } from "@/lib/phone";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import { getUserId, getUserName, type AssignableUser } from "@/lib/users";
import { useToast } from "@/hooks/use-toast";

type MatterActionMode = "view" | "edit" | "delete";

type MatterActionSheetProps = {
  mode: MatterActionMode | null;
  matter: CaseRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId?: string;
  users?: AssignableUser[];
  canEditMatter?: boolean;
  canDeleteMatter?: boolean;
  canAssignMatter?: boolean;
  onSaved: (matter: CaseRecord) => void;
  onDeleted: (matterId: string) => void;
};

type MatterCreateSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId?: string;
  contact: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    assignedUserId?: string | null;
  } | null;
  relatedCompany?: {
    id: string;
    name: string;
  } | null;
  users?: AssignableUser[];
  canAssignMatter?: boolean;
  onCreated: (matter: CaseRecord) => void;
};

const CASE_STATUS_OPTIONS = ["open", "pending", "closed", "archived"];
const NO_PIPELINE_VALUE = "none";
const NO_STAGE_VALUE = "none";

function formatMatterStatus(status?: string | null) {
  return String(status || "-").replace(/_/g, " ");
}

function formatDateOnly(value?: string | null) {
  if (!value) return "Not set";
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatDateInput(value?: string | null) {
  if (!value) return "";
  const [datePart] = value.split("T");
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
}

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
    pipeline,
    stage,
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

function DetailRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 text-sm">
      <span className="font-medium text-foreground/70">{label}</span>
      <span className="min-w-0 break-words">{value || "-"}</span>
    </div>
  );
}

export function MatterCreateSheet({ open, onOpenChange, locationId, contact, relatedCompany, users = [], canAssignMatter = true, onCreated }: MatterCreateSheetProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [pipelines, setPipelines] = useState<GhlPipeline[]>([]);
  const [form, setForm] = useState({
    caseNumber: "",
    caseName: "",
    caseType: PRACTICE_AREAS[0],
    status: "open",
    stage: "intake",
    pipelineId: "",
    pipelineStageId: "",
    statuteOfLimitationsAt: "",
    assignedUserId: "",
    sourceAttorneyUserId: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      caseNumber: "",
      caseName: "",
      caseType: PRACTICE_AREAS[0],
      status: "open",
      stage: "intake",
      pipelineId: "",
      pipelineStageId: "",
      statuteOfLimitationsAt: "",
      assignedUserId: contact?.assignedUserId || "",
      sourceAttorneyUserId: "",
      notes: "",
    });
  }, [contact?.assignedUserId, open]);

  useEffect(() => {
    if (!open) return;
    loadMatterPipelines()
      .then(setPipelines)
      .catch((error) => {
        console.error("Could not load matter pipelines", error);
        setPipelines([]);
      });
  }, [open]);

  const closeSheet = () => onOpenChange(false);
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === form.pipelineId);
  const selectedLeadAttorney = users.find((user) => getUserId(user) === form.assignedUserId);
  const selectedSourceAttorney = users.find((user) => getUserId(user) === form.sourceAttorneyUserId);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contact?.id) {
      toast({ title: "Contact Required", description: "A contact is required to create a matter.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const matter = await createCase({
        locationId,
        caseNumber: form.caseNumber,
        caseName: form.caseName,
        caseType: form.caseType,
        stage: form.stage,
        status: form.status,
        contactId: contact.id,
        contactName: contact.name,
        contactEmail: contact.email || "",
        contactPhone: formatPhoneNumber(contact.phone, ""),
        statuteOfLimitationsAt: form.statuteOfLimitationsAt || null,
        ...(canAssignMatter ? { assignedUserId: form.assignedUserId || null } : {}),
        ...(canAssignMatter ? { sourceAttorneyUserId: form.sourceAttorneyUserId || null } : {}),
        ghlPipelineId: form.pipelineId || null,
        ghlPipelineStageId: form.pipelineStageId || null,
        notes: form.notes,
        metadata: {
          clientType: relatedCompany ? "company" : "contact",
          relatedRecordType: relatedCompany ? "company" : "contact",
          assigned_user_name: selectedLeadAttorney ? getUserName(selectedLeadAttorney) : "",
          source_attorney_name: selectedSourceAttorney ? getUserName(selectedSourceAttorney) : "",
          ...(selectedPipeline ? { ghl_pipeline_name: selectedPipeline.name } : {}),
          ...(form.pipelineStageId ? { ghl_pipeline_stage_name: form.stage } : {}),
          ...(relatedCompany ? { companyId: relatedCompany.id, companyName: relatedCompany.name } : {}),
          primaryContactId: contact.id,
          primaryContactName: contact.name,
        },
      });
      onCreated(matter);
      closeSheet();
      toast({ title: "Matter Created", description: `${matter.case_name} has been created.` });
    } catch (error) {
      toast({
        title: "Matter Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not create the matter. Please try again."),
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
          <SheetTitle>Create Matter</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Contact</Label>
            <Input value={contact?.name || ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Matter Number</Label>
            <Input value={form.caseNumber} onChange={(event) => setForm({ ...form, caseNumber: event.target.value })} placeholder="CASE-001" />
          </div>
          <div className="space-y-2">
            <Label>Matter Name</Label>
            <Input value={form.caseName} onChange={(event) => setForm({ ...form, caseName: event.target.value })} placeholder="Smith v. Acme" required />
          </div>
          <div className="space-y-2">
            <Label>Practice Area</Label>
            <SearchableSelect
              value={form.caseType}
              onValueChange={(caseType) => setForm({ ...form, caseType })}
              options={PRACTICE_AREAS}
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
          {canAssignMatter && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}>
                <SelectTrigger>
                  <span className="capitalize">{formatMatterStatus(form.status)}</span>
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
                  <span className={!form.pipelineStageId ? "text-muted-foreground" : undefined}>
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
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Lead Attorney</Label>
              <Select value={form.assignedUserId} onValueChange={(assignedUserId) => setForm({ ...form, assignedUserId })}>
                <SelectTrigger>
                  <span className={!form.assignedUserId ? "text-muted-foreground" : undefined}>
                    {selectedLeadAttorney ? getUserName(selectedLeadAttorney) : "Unassigned"}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
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
                  <span className={!form.sourceAttorneyUserId ? "text-muted-foreground" : undefined}>
                    {selectedSourceAttorney ? getUserName(selectedSourceAttorney) : "Unassigned"}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value="">Unassigned</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={getUserId(user)} value={getUserId(user)}>
                      {getUserName(user)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Internal Notes</Label>
            <Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional context for this matter" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={closeSheet}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting || !contact?.id}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Matter
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function MatterActionSheet({
  mode,
  matter,
  open,
  onOpenChange,
  locationId,
  users = [],
  canEditMatter = true,
  canDeleteMatter = true,
  canAssignMatter = true,
  onSaved,
  onDeleted,
}: MatterActionSheetProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [pipelines, setPipelines] = useState<GhlPipeline[]>([]);
  const [form, setForm] = useState({
    caseNumber: "",
    caseName: "",
    caseType: "",
    status: "",
    stage: "",
    pipelineId: "",
    pipelineStageId: "",
    statuteOfLimitationsAt: "",
    assignedUserId: "",
    sourceAttorneyUserId: "",
  });
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  useEffect(() => {
    if (!matter || !open) return;
    const selection = getPipelineSelection(pipelines, matter.ghl_pipeline_id, matter.ghl_pipeline_stage_id);
    setDeleteConfirmationText("");
    setForm({
      caseNumber: matter.case_number || "",
      caseName: matter.case_name || "",
      caseType: matter.case_type || "",
      status: matter.status || "open",
      stage: matter.stage || "",
      pipelineId: selection.pipelineId,
      pipelineStageId: selection.pipelineStageId,
      statuteOfLimitationsAt: formatDateInput(matter.statute_of_limitations_at),
      assignedUserId: matter.assigned_user_id || "",
      sourceAttorneyUserId: matter.source_attorney_user_id || "",
    });
  }, [matter, open, pipelines]);

  useEffect(() => {
    if (!open) return;
    loadMatterPipelines()
      .then(setPipelines)
      .catch((error) => {
        console.error("Could not load matter pipelines", error);
        setPipelines([]);
      });
  }, [open]);

  const closeSheet = () => onOpenChange(false);
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === form.pipelineId);
  const selectedLeadAttorney = users.find((user) => getUserId(user) === form.assignedUserId);
  const selectedSourceAttorney = users.find((user) => getUserId(user) === form.sourceAttorneyUserId);

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

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!matter) return;

    setSubmitting(true);
    try {
      const updatedMatter = await updateCase({
        caseId: matter.id,
        caseNumber: form.caseNumber,
        caseName: form.caseName,
        caseType: form.caseType,
        status: form.status,
        stage: form.stage,
        statuteOfLimitationsAt: form.statuteOfLimitationsAt || null,
        ghlPipelineId: form.pipelineId || null,
        ghlPipelineStageId: form.pipelineStageId || null,
        ...(canAssignMatter ? { assignedUserId: form.assignedUserId || null } : {}),
        ...(canAssignMatter ? { sourceAttorneyUserId: form.sourceAttorneyUserId || null } : {}),
        metadata: {
          source_attorney_name: selectedSourceAttorney ? getUserName(selectedSourceAttorney) : "",
          ...(selectedPipeline ? { ghl_pipeline_name: selectedPipeline.name } : {}),
          ...(form.pipelineStageId ? { ghl_pipeline_stage_name: form.stage } : {}),
        },
      });
      onSaved(updatedMatter);
      closeSheet();
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

  const handleDelete = async () => {
    if (!matter) return;

    setSubmitting(true);
    try {
      await deleteCase({ locationId, caseId: matter.id });
      onDeleted(matter.id);
      closeSheet();
      toast({ title: "Matter Deleted", description: `${matter.case_name || "Matter"} was removed from normal views.` });
    } catch (error) {
      toast({
        title: "Matter Not Deleted",
        description: getUserFriendlyErrorMessage(error, "Could not delete this matter. Please try again."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "edit" ? "Edit Matter" : mode === "delete" ? "Delete Matter" : "View Matter";
  const caseTypeOptions = PRACTICE_AREAS.includes(form.caseType) ? PRACTICE_AREAS : [form.caseType, ...PRACTICE_AREAS].filter(Boolean);
  const canConfirmDelete = canDeleteMatter && deleteConfirmationText === "DELETE" && !submitting;
  const matterLeadAttorney = users.find((user) => getUserId(user) === matter?.assigned_user_id);
  const matterSourceAttorneyMetadataName =
    typeof matter?.metadata?.source_attorney_name === "string" ? matter.metadata.source_attorney_name.trim() : "";
  const matterSourceAttorney =
    users.find((user) => getUserId(user) === matter?.source_attorney_user_id) ||
    users.find(
      (user) =>
        matterSourceAttorneyMetadataName &&
        getUserName(user).toLowerCase() === matterSourceAttorneyMetadataName.toLowerCase(),
    );
  const matterSourceAttorneyUserId = matter?.source_attorney_user_id || (matterSourceAttorney ? getUserId(matterSourceAttorney) : "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        {!matter ? null : mode === "edit" && canEditMatter ? (
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Matter Number</Label>
              <Input value={form.caseNumber} onChange={(event) => setForm({ ...form, caseNumber: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Matter Name</Label>
              <Input value={form.caseName} onChange={(event) => setForm({ ...form, caseName: event.target.value })} required />
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
            {canAssignMatter && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(status) => setForm({ ...form, status })}>
                  <SelectTrigger>
                    <span className="capitalize">{formatMatterStatus(form.status)}</span>
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
                    <span className={!form.pipelineStageId ? "text-muted-foreground" : undefined}>
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
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Lead Attorney</Label>
                <Select value={form.assignedUserId} onValueChange={(assignedUserId) => setForm({ ...form, assignedUserId })}>
                  <SelectTrigger>
                    <span className={!form.assignedUserId ? "text-muted-foreground" : undefined}>
                      {selectedLeadAttorney ? getUserName(selectedLeadAttorney) : "Unassigned"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
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
                    <span className={!form.sourceAttorneyUserId ? "text-muted-foreground" : undefined}>
                      {selectedSourceAttorney ? getUserName(selectedSourceAttorney) : "Unassigned"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    <SelectItem value="">Unassigned</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={getUserId(user)} value={getUserId(user)}>
                        {getUserName(user)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={closeSheet}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 hover:bg-[#0484C8]" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          </form>
        ) : mode === "edit" ? (
          <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
            You do not have permission to edit matters.
          </div>
        ) : mode === "delete" && canDeleteMatter ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-foreground">
              <div>Are you sure you want to delete this matter?</div>
              <div className="mt-2 font-semibold">{matter.case_name || matter.case_number || "This matter"}</div>
              <div className="mt-2">This action cannot be undone.</div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Type <strong className="text-foreground">DELETE</strong> to confirm.
              </p>
              <Input
                value={deleteConfirmationText}
                onChange={(event) => setDeleteConfirmationText(event.target.value)}
                placeholder="Type DELETE"
              />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={closeSheet} disabled={submitting}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" className="flex-1" onClick={handleDelete} disabled={!canConfirmDelete}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete Matter
              </Button>
            </div>
          </div>
        ) : mode === "delete" ? (
          <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
            You do not have permission to delete matters.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <DetailRow label="Matter Name" value={matter.case_name} />
            <DetailRow label="Matter Number" value={matter.case_number} />
            <DetailRow label="Status" value={formatMatterStatus(matter.status)} />
            <DetailRow label="Practice Area" value={matter.case_type} />
            <DetailRow label="Stage" value={formatMatterStatus(matter.stage)} />
            <DetailRow label="Filing Deadline" value={formatDateOnly(matter.statute_of_limitations_at)} />
            <DetailRow
              label="Lead Attorney"
              value={<UserLink userId={matter.assigned_user_id} user={matterLeadAttorney} />}
            />
            <DetailRow
              label="Source Attorney"
              value={
                <UserLink
                  userId={matterSourceAttorneyUserId}
                  user={matterSourceAttorney}
                  name={matterSourceAttorneyMetadataName || undefined}
                />
              }
            />
            <DetailRow label="Client" value={matter.primary_contact_name || matter.ghl_contact_id} />
            <Link
              to={`/case/${matter.id}`}
              className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#0484C8]"
            >
              Open Matter
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
