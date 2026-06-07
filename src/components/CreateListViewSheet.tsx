import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { formatPersonName } from "@/lib/names";

export type ListView = {
  id: string;
  name: string;
  filters: {
    status?: string;
    type?: string;
    caseType?: string;
    attorneyAssigned?: string;
  };
};

type SystemUser = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type CreateListViewSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (listView: ListView) => void;
  onDelete?: (id: string) => void;
  editingListView?: ListView | null;
  systemUsers?: SystemUser[];
  accountTypeOptions?: string[];
  practiceAreaOptions?: string[];
};

const DEFAULT_ACCOUNT_TYPE_OPTIONS = [
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

export function CreateListViewSheet({
  open,
  onOpenChange,
  onSave,
  onDelete,
  editingListView,
  systemUsers = [],
  accountTypeOptions = [],
  practiceAreaOptions = [],
}: CreateListViewSheetProps) {
  const { toast } = useToast();
  const effectiveAccountTypeOptions = accountTypeOptions.length > 0 ? accountTypeOptions : DEFAULT_ACCOUNT_TYPE_OPTIONS;
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [type, setType] = useState<string>("All");
  const [caseType, setCaseType] = useState<string>("All");
  const [attorneyAssigned, setAttorneyAssigned] = useState<string>("All");

  useEffect(() => {
    if (open) {
      if (editingListView) {
        setName(editingListView.name);
        setStatus(editingListView.filters.status || "All");
        setType(editingListView.filters.type || "All");
        setCaseType(editingListView.filters.caseType || "All");
        setAttorneyAssigned(editingListView.filters.attorneyAssigned || "All");
      } else {
        setName("");
        setStatus("All");
        setType("All");
        setCaseType("All");
        setAttorneyAssigned("All");
      }
    }
  }, [open, editingListView]);

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        variant: "destructive",
        title: "Name required",
        description: "Please enter a name for your list view.",
      });
      return;
    }

    const newListView: ListView = {
      id: editingListView ? editingListView.id : Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      filters: {
        ...(status !== "All" && { status }),
        ...(type !== "All" && { type }),
        ...(caseType !== "All" && { caseType }),
        ...(attorneyAssigned !== "All" && { attorneyAssigned }),
      },
    };

    onSave(newListView);
    onOpenChange(false);

    setName("");
    setStatus("All");
    setType("All");
    setCaseType("All");
    setAttorneyAssigned("All");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editingListView ? "Edit List View" : "Create List View"}</SheetTitle>
          <SheetDescription>
            {editingListView
              ? "Update the filters for this list view."
              : "Define filters to save a custom view of your contacts."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <Label htmlFor="list-name">
              List Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="list-name"
              placeholder="e.g. My Active Clients"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-4">
            <h4 className="border-b pb-2 text-sm font-medium text-muted-foreground">Filters</h4>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Account Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any Account Type</SelectItem>
                  {effectiveAccountTypeOptions.map((option) => {
                    return (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Practice Area</Label>
              <SearchableSelect
                value={caseType}
                onValueChange={setCaseType}
                options={["All", ...practiceAreaOptions]}
                placeholder="Any Practice Area"
                searchPlaceholder="Search practice areas..."
                emptyMessage="No practice areas found."
                getOptionLabel={(value) => (value === "All" ? "Any Practice Area" : value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Assigned Attorney</Label>
              <Select value={attorneyAssigned} onValueChange={setAttorneyAssigned}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Attorney" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Any Attorney</SelectItem>
                  {systemUsers.map((user) => {
                    const rawName =
                      user.name ||
                      `${user.firstName || ""} ${user.lastName || ""}`.trim();
                    const userName = rawName ? formatPersonName(rawName) : user.email || user.id;
                    return (
                      <SelectItem key={user.id} value={userName}>
                        {userName}
                      </SelectItem>
                    );
                  })}
                  <SelectItem value="Unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <SheetFooter className="mt-8 flex w-full items-center sm:justify-between">
          {editingListView && onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive/90"
              onClick={() => {
                onDelete(editingListView.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="hover:bg-[#0484C8]" onClick={handleSave}>{editingListView ? "Save Changes" : "Save List View"}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
