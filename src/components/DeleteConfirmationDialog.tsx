import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";

type DeleteConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  recordName?: string;
  recordType?: string;
  isDeleting?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  title = "Delete record?",
  description,
  recordType = "record",
  isDeleting,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const [confirmationText, setConfirmationText] = useState("");

  useEffect(() => {
    if (!open) setConfirmationText("");
  }, [open]);

  const canDelete = confirmationText === "DELETE" && !isDeleting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader className="mb-6 space-y-1">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          <SheetDescription>
            {description ||
              `Deleting this ${recordType} will hide it from everyday lists, dashboards, and search results. Lawbric will retain it for audit history and recovery, and an administrator may be required to restore it.`}
          </SheetDescription>
        </SheetHeader>

        <div className="py-2">
          <p className="mb-3 text-sm text-muted-foreground">
            Type <strong className="text-foreground">DELETE</strong> to confirm.
          </p>
          <Input
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            placeholder="Type DELETE"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!canDelete} onClick={onConfirm}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
