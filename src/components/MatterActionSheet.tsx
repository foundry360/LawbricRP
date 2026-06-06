import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/SearchableSelect";
import { createCase, deleteCase, updateCase, type CaseRecord } from "@/lib/cases";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneNumber } from "@/lib/phone";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import { useToast } from "@/hooks/use-toast";

type MatterActionMode = "view" | "edit" | "delete";

type MatterActionSheetProps = {
  mode: MatterActionMode | null;
  matter: CaseRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId?: string;
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
  onCreated: (matter: CaseRecord) => void;
};

const CASE_STATUS_OPTIONS = ["open", "pending", "closed", "archived"];

function formatMatterStatus(status?: string | null) {
  return String(status || "-").replace(/_/g, " ");
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 text-sm">
      <span className="font-medium text-foreground/70">{label}</span>
      <span className="min-w-0 break-words">{value || "-"}</span>
    </div>
  );
}

export function MatterCreateSheet({ open, onOpenChange, locationId, contact, onCreated }: MatterCreateSheetProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    caseNumber: "",
    caseName: "",
    caseType: PRACTICE_AREAS[0],
    status: "open",
    stage: "intake",
    assignedUserId: "",
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
      assignedUserId: contact?.assignedUserId || "",
      notes: "",
    });
  }, [contact?.assignedUserId, open]);

  const closeSheet = () => onOpenChange(false);

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
        assignedUserId: form.assignedUserId || null,
        notes: form.notes,
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
              <Input value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} />
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
  onSaved,
  onDeleted,
}: MatterActionSheetProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    caseNumber: "",
    caseName: "",
    caseType: "",
    status: "",
    stage: "",
  });
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  useEffect(() => {
    if (!matter || !open) return;
    setDeleteConfirmationText("");
    setForm({
      caseNumber: matter.case_number || "",
      caseName: matter.case_name || "",
      caseType: matter.case_type || "",
      status: matter.status || "open",
      stage: matter.stage || "",
    });
  }, [matter, open]);

  const closeSheet = () => onOpenChange(false);

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
      toast({ title: "Matter Deleted", description: `${matter.case_name || "Matter"} was permanently deleted.` });
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
  const canDelete = deleteConfirmationText === "DELETE" && !submitting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        {!matter ? null : mode === "edit" ? (
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
                <Input value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} />
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
        ) : mode === "delete" ? (
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
              <Button type="button" variant="destructive" className="flex-1" onClick={handleDelete} disabled={!canDelete}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete Matter
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <DetailRow label="Matter Name" value={matter.case_name} />
            <DetailRow label="Matter Number" value={matter.case_number} />
            <DetailRow label="Status" value={formatMatterStatus(matter.status)} />
            <DetailRow label="Practice Area" value={matter.case_type} />
            <DetailRow label="Stage" value={formatMatterStatus(matter.stage)} />
            <DetailRow label="Client" value={matter.primary_contact_name || matter.ghl_contact_id} />
            <Link
              to={`/case/${matter.id}`}
              className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open Matter
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
