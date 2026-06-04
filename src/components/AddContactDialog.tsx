import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TagMultiSelect } from "@/components/TagMultiSelect";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatPhoneInput, formatPhoneNumber } from "@/lib/phone";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const contactSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address").or(z.literal("")),
  phone: z.string().min(10, "Phone number is required").or(z.literal("")),
  type: z.string().min(1, "Account type is required"),
  status: z.string().min(1, "Status is required"),
  caseType: z.string().min(1, "Practice area is required"),
  attorneyAssigned: z.string().min(1, "Attorney name is required"),
  dob: z.string().optional(),
  gender: z.string().optional(),
  language: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const CONTACT_STATUS_OPTIONS = ["Active", "Pending", "Consultation", "Closed"];
const GENDER_OPTIONS = ["Male", "Female", "Other"];

export type ContactFormValues = z.infer<typeof contactSchema>;

type SystemUser = {
  id: string;
  name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type AddContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddContact: (contact: ContactFormValues) => Promise<void> | void;
  locationId: string;
  accountTypeOptions?: string[];
  practiceAreaOptions?: string[];
  languageOptions?: string[];
  tagOptions?: string[];
  onCreateTag?: (name: string) => Promise<string | void> | string | void;
  systemUsers?: SystemUser[];
};

function getUserName(user: SystemUser) {
  return (
    user.name ||
    user.full_name ||
    `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim() ||
    user.email ||
    user.id
  );
}

export function AddContactDialog({
  open,
  onOpenChange,
  onAddContact,
  locationId,
  accountTypeOptions = [],
  practiceAreaOptions = [],
  languageOptions = [],
  tagOptions = [],
  onCreateTag,
  systemUsers = [],
}: AddContactDialogProps) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      type: "Client",
      status: "Consultation",
      caseType: "",
      attorneyAssigned: "Unassigned",
      dob: "",
      gender: "",
      language: "",
      tags: [],
    },
  });

  const onSubmit = async (data: ContactFormValues) => {
    await onAddContact(data);

    const trackingPayload = {
      type: "external_form_submission",
      timestamp: Date.now(),
      formId: "Add Contact Form",
      formData: {
        first_name: data.name.split(" ")[0] || data.name,
        last_name: data.name.split(" ").slice(1).join(" "),
        email: data.email,
        phone: formatPhoneNumber(data.phone, ""),
        "contact.contact_type": data.type,
        "contact.status": data.status,
        "contact.case_type": data.caseType,
      },
      formLabels: {
        first_name: "First Name",
        last_name: "Last Name",
        email: "Email",
        phone: "Phone",
        "contact.contact_type": "Contact Type",
        "contact.status": "Status",
        "contact.case_type": "Case Type",
      },
      url: window.location.href,
      title: document.title,
      path: window.location.pathname,
      userAgent: navigator.userAgent,
      trackingId: "tk_a81db2dc4f84489190a4af11a4668738",
      locationId,
      sessionId: crypto.randomUUID(),
      properties: {
        deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop",
      },
    };

    fetch("https://backend.leadconnectorhq.com/external-tracking/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        version: "2021-07-28",
      },
      body: JSON.stringify(trackingPayload),
    }).catch(() => {});

    form.reset();
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) form.reset();
        onOpenChange(value);
      }}
    >
      <SheetContent className="flex h-screen w-full flex-col overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
          <SheetTitle className="text-lg font-semibold">Add New Contact</SheetTitle>
          <SheetDescription>
            Enter the details of the new contact here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="hover-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="jane@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(555) 000-0000"
                        {...field}
                        onChange={(event) => field.onChange(formatPhoneInput(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Type</FormLabel>
                    {accountTypeOptions.length > 0 ? (
                      <FormControl>
                        <SearchableSelect
                          value={field.value}
                          onValueChange={field.onChange}
                          options={accountTypeOptions}
                          placeholder="Select type"
                          searchPlaceholder="Search account types..."
                          emptyMessage="No account types found."
                        />
                      </FormControl>
                    ) : (
                      <FormControl>
                        <Input placeholder="e.g. Client" {...field} />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        options={CONTACT_STATUS_OPTIONS}
                        placeholder="Select status"
                        searchPlaceholder="Search statuses..."
                        emptyMessage="No statuses found."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="caseType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Practice Area</FormLabel>
                    {practiceAreaOptions.length > 0 ? (
                      <FormControl>
                        <SearchableSelect
                          value={field.value}
                          onValueChange={field.onChange}
                          options={practiceAreaOptions}
                          placeholder="Select practice area"
                          searchPlaceholder="Search practice areas..."
                          emptyMessage="No practice areas found."
                        />
                      </FormControl>
                    ) : (
                      <FormControl>
                        <Input placeholder="e.g. Corporate Litigation" {...field} />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="attorneyAssigned"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Assigned Attorney</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={["Unassigned", ...systemUsers.map((user) => user.id)]}
                      placeholder="Select attorney"
                      searchPlaceholder="Search users..."
                      emptyMessage="No users found."
                      getOptionLabel={(value) => {
                        if (value === "Unassigned") return "Unassigned";
                        const user = systemUsers.find((candidate) => candidate.id === value || getUserName(candidate) === value);
                        return user ? getUserName(user) : value;
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <TagMultiSelect
                      value={field.value || []}
                      onValueChange={field.onChange}
                      options={tagOptions}
                      placeholder="Select tags"
                      onCreateOption={onCreateTag}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="dob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        value={field.value || ""}
                        onValueChange={field.onChange}
                        options={GENDER_OPTIONS}
                        placeholder="Select gender"
                        searchPlaceholder="Search genders..."
                        emptyMessage="No genders found."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language</FormLabel>
                    {languageOptions.length > 0 ? (
                      <FormControl>
                        <SearchableSelect
                          value={field.value || ""}
                          onValueChange={field.onChange}
                          options={languageOptions}
                          placeholder="Select language"
                          searchPlaceholder="Search languages..."
                          emptyMessage="No languages found."
                        />
                      </FormControl>
                    ) : (
                      <FormControl>
                        <Input placeholder="e.g. English" {...field} />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
