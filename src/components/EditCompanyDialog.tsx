import { useEffect, useState } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { GhlBusiness } from "@/lib/api";
import { formatPhoneInput, formatPhoneNumber } from "@/lib/phone";

export type CompanyFormValues = {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  industry: string;
};

type EditCompanyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: GhlBusiness | null;
  industry?: string;
  industryOptions?: string[];
  onEditCompany: (values: CompanyFormValues) => Promise<void> | void;
};

export function EditCompanyDialog({
  open,
  onOpenChange,
  company,
  industry = "",
  industryOptions = [],
  onEditCompany,
}: EditCompanyDialogProps) {
  const [form, setForm] = useState<CompanyFormValues>({
    name: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    industry: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !company) return;

    setForm({
      name: company.name || "",
      email: company.email || "",
      phone: company.phone ? formatPhoneNumber(company.phone, "") : "",
      website: company.website || "",
      address: company.address || "",
      industry,
    });
  }, [company, industry, open]);

  const updateField = (field: keyof CompanyFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    setIsSaving(true);
    try {
      await onEditCompany(form);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bottom-0 top-0 flex h-screen min-h-screen w-full flex-col overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
          <SheetTitle className="text-lg font-semibold">Edit Company</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="hover-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(event) => updateField("email", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(event) => updateField("phone", formatPhoneInput(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={(event) => updateField("website", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(event) => updateField("address", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              {industryOptions.length > 0 ? (
                <SearchableSelect
                  value={form.industry}
                  onValueChange={(value) => updateField("industry", value)}
                  options={industryOptions}
                  placeholder="Select industry"
                  searchPlaceholder="Search industries..."
                  emptyMessage="No industries found."
                />
              ) : (
                <Input value={form.industry} onChange={(event) => updateField("industry", event.target.value)} />
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-border bg-background px-6 py-4">
            <Button type="submit" className="w-full hover:bg-[#0484C8]" disabled={isSaving || !form.name.trim()}>
              {isSaving ? "Saving..." : "Save Company"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
