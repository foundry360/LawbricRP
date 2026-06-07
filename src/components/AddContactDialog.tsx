import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, UserRound } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/DatePicker";
import { ContactRelationshipsField, type RelatedContactOption } from "@/components/ContactRelationshipsField";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TagMultiSelect } from "@/components/TagMultiSelect";
import { type ContactRelationshipInput } from "@/lib/contact-relationships";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatPersonName } from "@/lib/names";
import { formatPhoneInput, formatPhoneNumber } from "@/lib/phone";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const contactSchema = z
  .object({
    contactKind: z.enum(["person", "company"]).optional(),
    name: z.string().optional(),
    companyName: z.string().optional(),
    primaryContactMode: z.enum(["existing", "create"]).optional(),
    existingContactId: z.string().optional(),
    primaryContactName: z.string().optional(),
    primaryContactEmail: z.string().email("Invalid email address").or(z.literal("")).optional(),
    primaryContactPhone: z.string().optional(),
    primaryContactTitle: z.string().optional(),
    website: z.string().optional(),
    industry: z.string().optional(),
    companyAddress: z.string().optional(),
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
    relatedContacts: z.array(z.object({
      relatedContactId: z.string(),
      relationshipType: z.string(),
      notes: z.string().optional().nullable(),
    })).optional(),
  })
  .superRefine((data, context) => {
    const contactKind = data.contactKind || "person";

    if (contactKind === "person" && !data.name?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "Name is required" });
    }

    if (contactKind === "company" && !data.companyName?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Company name is required" });
    }

    if (contactKind === "company" && data.primaryContactMode === "existing" && !data.existingContactId?.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["existingContactId"], message: "Select a contact" });
    }

    if (contactKind === "company" && (data.primaryContactMode || "create") === "create") {
      if (!data.primaryContactName?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["primaryContactName"], message: "Contact name is required" });
      }
      if (!data.primaryContactEmail?.trim()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["primaryContactEmail"], message: "Contact email is required" });
      }
    }
  });

const CONTACT_STATUS_OPTIONS = ["Active", "Inactive"];
const DEFAULT_ACCOUNT_TYPE = "Lead";
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

export type CompanyContactOption = {
  id: string;
  name: string;
  email?: string;
};

type AddContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddContact: (contact: ContactFormValues) => Promise<void> | void;
  locationId: string;
  accountTypeOptions?: string[];
  practiceAreaOptions?: string[];
  industryOptions?: string[];
  languageOptions?: string[];
  tagOptions?: string[];
  onCreateTag?: (name: string) => Promise<string | void> | string | void;
  onCompanyModeSelected?: () => Promise<void> | void;
  systemUsers?: SystemUser[];
  companyContactOptions?: CompanyContactOption[];
  relatedContactOptions?: RelatedContactOption[];
};

function getUserName(user: SystemUser) {
  const name =
    user.name ||
    user.full_name ||
    `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim();

  return name ? formatPersonName(name) : user.email || user.id;
}

export function AddContactDialog({
  open,
  onOpenChange,
  onAddContact,
  locationId,
  accountTypeOptions = [],
  practiceAreaOptions = [],
  industryOptions = [],
  languageOptions = [],
  tagOptions = [],
  onCreateTag,
  onCompanyModeSelected,
  systemUsers = [],
  companyContactOptions = [],
  relatedContactOptions = [],
}: AddContactDialogProps) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      contactKind: "person",
      name: "",
      companyName: "",
      primaryContactMode: "create",
      existingContactId: "",
      primaryContactName: "",
      primaryContactEmail: "",
      primaryContactPhone: "",
      primaryContactTitle: "",
      website: "",
      industry: "",
      companyAddress: "",
      email: "",
      phone: "",
      type: DEFAULT_ACCOUNT_TYPE,
      status: "Active",
      caseType: "",
      attorneyAssigned: "Unassigned",
      dob: "",
      gender: "",
      language: "",
      tags: [],
      relatedContacts: [],
    },
  });

  const onSubmit = async (data: ContactFormValues) => {
    await onAddContact(data);

    const formContactKind = data.contactKind || "person";
    const fullName = formContactKind === "company" ? data.primaryContactName || data.companyName || "" : data.name || "";
    const trackingPayload = {
      type: "external_form_submission",
      timestamp: Date.now(),
      formId: "Add Contact Form",
      formData: {
        first_name: fullName.split(" ")[0] || fullName,
        last_name: fullName.split(" ").slice(1).join(" "),
        company_name: formContactKind === "company" ? data.companyName : "",
        email: data.email,
        phone: formatPhoneNumber(data.phone, ""),
        "contact.contact_type": data.type,
        "contact.case_type": data.caseType,
      },
      formLabels: {
        first_name: "First Name",
        last_name: "Last Name",
        company_name: "Company Name",
        email: "Email",
        phone: "Phone",
        "contact.contact_type": "Contact Type",
        "contact.case_type": "Practice Area",
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
  const contactKind = form.watch("contactKind") || "person";
  const primaryContactMode = form.watch("primaryContactMode") || "create";

  useEffect(() => {
    if (open && contactKind === "company") {
      void onCompanyModeSelected?.();
    }
  }, [contactKind, onCompanyModeSelected, open]);

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
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="hover-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
            <Tabs
              value={contactKind}
              onValueChange={(value) => form.setValue("contactKind", value as NonNullable<ContactFormValues["contactKind"]>)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="person"
                  className="gap-2 rounded-md data-[state=active]:bg-[#344256] data-[state=active]:text-white data-[state=active]:shadow-sm"
                >
                  <UserRound className="h-4 w-4" />
                  Person
                </TabsTrigger>
                <TabsTrigger
                  value="company"
                  className="gap-2 rounded-md data-[state=active]:bg-[#344256] data-[state=active]:text-white data-[state=active]:shadow-sm"
                >
                  <Building2 className="h-4 w-4" />
                  Company
                </TabsTrigger>
              </TabsList>
              <TabsContent value="person" className="mt-4 space-y-4">
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
                  name="dob"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={field.value || ""}
                          onValueChange={field.onChange}
                          placeholder="Select date of birth"
                          monthYearPicker
                          fromYear={1900}
                          toYear={new Date().getFullYear()}
                          maxDate={new Date()}
                        />
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
              </TabsContent>
              <TabsContent value="company" className="mt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Legal Group" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="rounded-lg border border-border p-3">
                  <FormLabel className="text-sm font-medium">Primary Contact</FormLabel>
                  <Tabs
                    value={primaryContactMode}
                    onValueChange={(value) => {
                      form.setValue("primaryContactMode", value as "existing" | "create");
                    }}
                    className="mt-3 w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="existing">Existing</TabsTrigger>
                      <TabsTrigger value="create">Create New</TabsTrigger>
                    </TabsList>

                    <TabsContent value="existing" className="mt-4">
                      <FormField
                        control={form.control}
                        name="existingContactId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact</FormLabel>
                            <FormControl>
                              <SearchableSelect
                                value={field.value || ""}
                                onValueChange={field.onChange}
                                options={companyContactOptions.map((contact) => contact.id)}
                                placeholder="Select contact"
                                searchPlaceholder="Search contacts..."
                                emptyMessage="No GHL contacts found."
                                getOptionLabel={(value) => {
                                  const contact = companyContactOptions.find((option) => option.id === value);
                                  return contact ? `${contact.name}${contact.email ? ` (${contact.email})` : ""}` : value;
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    <TabsContent value="create" className="mt-4 space-y-4">
                      <FormField
                        control={form.control}
                        name="primaryContactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Jane Doe" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="primaryContactTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input placeholder="Chief Operating Officer" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="primaryContactEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="jane@example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="primaryContactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Phone</FormLabel>
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
                    </TabsContent>
                  </Tabs>
                </div>
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry</FormLabel>
                      {industryOptions.length > 0 ? (
                        <FormControl>
                          <SearchableSelect
                            value={field.value || ""}
                            onValueChange={field.onChange}
                            options={industryOptions}
                            placeholder="Select industry"
                            searchPlaceholder="Search industries..."
                            emptyMessage="No industries found."
                          />
                        </FormControl>
                      ) : (
                        <FormControl>
                          <Input placeholder="e.g. Real Estate" {...field} />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="companyAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Street, City, State ZIP" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
              {contactKind === "person" ? (
                <ContactRelationshipsField
                  value={(form.watch("relatedContacts") || []) as ContactRelationshipInput[]}
                  onChange={(relatedContacts) => form.setValue("relatedContacts", relatedContacts)}
                  contactOptions={relatedContactOptions}
                />
              ) : null}
            </Tabs>

            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{contactKind === "company" ? "Company Email" : "Email"}</FormLabel>
                    <FormControl>
                      <Input placeholder={contactKind === "company" ? "info@example.com" : "jane@example.com"} {...field} />
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

            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" className="hover:bg-[#0484C8]" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
