import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/DatePicker";
import { ContactRelationshipsField, type RelatedContactOption } from "@/components/ContactRelationshipsField";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getRelatedContactId,
  listContactRelationships,
  type ContactRelationshipInput,
} from "@/lib/contact-relationships";
import { formatPersonName } from "@/lib/names";
import { formatPhoneInput, formatPhoneNumber } from "@/lib/phone";

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
  relatedContacts: z.array(z.object({
    relatedContactId: z.string(),
    relationshipType: z.string(),
    notes: z.string().optional().nullable(),
  })).optional(),
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

type EditContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditContact: (contact: ContactFormValues) => Promise<void> | void;
  contact: any | null;
  accountTypeOptions?: string[];
  practiceAreaOptions?: string[];
  languageOptions?: string[];
  tagOptions?: string[];
  onCreateTag?: (name: string) => Promise<string | void> | string | void;
  systemUsers?: SystemUser[];
  locationId?: string;
  relatedContactOptions?: RelatedContactOption[];
};

function getUserName(user: SystemUser) {
  const name =
    user.name ||
    user.full_name ||
    `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim();

  return name ? formatPersonName(name) : user.email || user.id;
}

function getUserByFormValue(users: SystemUser[], value: string) {
  return users.find((user) => user.id === value || getUserName(user) === value);
}

function trimValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function findMatchingOption(value: unknown, options: string[]) {
  if (!value || typeof value !== "string") return value;
  const trimmed = value.trim();
  const matched = options.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  return matched || trimmed;
}

export function EditContactDialog({
  open,
  onOpenChange,
  onEditContact,
  contact,
  accountTypeOptions = [],
  practiceAreaOptions = [],
  languageOptions = [],
  tagOptions = [],
  onCreateTag,
  systemUsers = [],
  locationId = "",
  relatedContactOptions = [],
}: EditContactDialogProps) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
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

  useEffect(() => {
    if (contact && open) {
      const normalizedGender = contact.gender
        ? String(trimValue(contact.gender)).charAt(0).toUpperCase() +
          String(trimValue(contact.gender)).slice(1).toLowerCase()
        : "";

      const assignedUser = getUserByFormValue(
        systemUsers,
        contact.attorneyAssignedId || contact.assignedAttorneyId || contact.attorneyAssigned || contact.assignedAttorney || "",
      );

      form.reset({
        name: String(trimValue(contact.name) || ""),
        email: contact.email === "N/A" ? "" : String(trimValue(contact.email) || ""),
        phone: contact.phone === "N/A" ? "" : formatPhoneNumber(String(trimValue(contact.phone) || ""), ""),
        type: String(findMatchingOption(contact.type, accountTypeOptions) || DEFAULT_ACCOUNT_TYPE),
        status: String(findMatchingOption(contact.status, CONTACT_STATUS_OPTIONS) || "Active"),
        caseType: String(findMatchingOption(contact.caseType, practiceAreaOptions) || ""),
        attorneyAssigned: assignedUser?.id || "Unassigned",
        dob: contact.dob === "N/A" ? "" : String(trimValue(contact.dob) || ""),
        gender: contact.gender === "N/A" ? "" : normalizedGender,
        language: String(findMatchingOption(contact.language, languageOptions) || ""),
        tags: Array.isArray(contact.tags)
          ? contact.tags.filter((tag: string) => tagOptions.some((option) => option.toLowerCase() === tag.toLowerCase()))
          : [],
        relatedContacts: [],
      });
    }
  }, [contact, open, form, accountTypeOptions, practiceAreaOptions, languageOptions, tagOptions, systemUsers]);

  useEffect(() => {
    if (!contact?.id || !locationId || !open) return;

    let isMounted = true;
    listContactRelationships(locationId, contact.id)
      .then((relationships) => {
        if (!isMounted) return;
        form.setValue("relatedContacts", relationships.map((relationship) => ({
          relatedContactId: getRelatedContactId(relationship, contact.id),
          relationshipType: relationship.relationship_type,
          notes: relationship.notes || "",
        })));
      })
      .catch((error) => {
        console.error("Failed to load contact relationships", error);
      });

    return () => {
      isMounted = false;
    };
  }, [contact?.id, form, locationId, open]);

  const onSubmit = async (data: ContactFormValues) => {
    await onEditContact(data);
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
      <SheetContent className="bottom-0 top-0 flex h-screen min-h-screen w-full flex-col overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
          <SheetTitle className="text-lg font-semibold">Edit Contact</SheetTitle>
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

            <ContactRelationshipsField
              value={(form.watch("relatedContacts") || []) as ContactRelationshipInput[]}
              onChange={(relatedContacts) => form.setValue("relatedContacts", relatedContacts)}
              contactOptions={relatedContactOptions}
              currentContactId={contact?.id}
            />

            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="dob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value && field.value !== "N/A" ? field.value : ""}
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
                        value={field.value && field.value !== "N/A" ? field.value : ""}
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
                          value={field.value && field.value !== "N/A" ? field.value : ""}
                          onValueChange={field.onChange}
                          options={languageOptions}
                          placeholder="Select language"
                          searchPlaceholder="Search languages..."
                          emptyMessage="No languages found."
                        />
                      </FormControl>
                    ) : (
                      <FormControl>
                        <Input
                          placeholder="e.g. English"
                          {...field}
                          value={field.value !== "N/A" ? field.value : ""}
                        />
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
              <Button type="submit" className="hover:bg-[#0484C8]" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
