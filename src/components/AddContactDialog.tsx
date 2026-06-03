import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhoneInput, formatPhoneNumber } from "@/lib/phone";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
});

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

function getUserByFormValue(users: SystemUser[], value: string) {
  return users.find((user) => user.id === value || getUserName(user) === value);
}

export function AddContactDialog({
  open,
  onOpenChange,
  onAddContact,
  locationId,
  accountTypeOptions = [],
  practiceAreaOptions = [],
  languageOptions = [],
  systemUsers = [],
}: AddContactDialogProps) {
  const [isAttorneyPopoverOpen, setIsAttorneyPopoverOpen] = useState(false);
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
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-[700px]">
        <SheetHeader className="mb-6 space-y-1">
          <SheetTitle className="text-lg font-semibold">Add New Contact</SheetTitle>
          <SheetDescription>
            Enter the details of the new contact here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {accountTypeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Consultation">Consultation</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select practice area" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {practiceAreaOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
              render={({ field }) => {
                const selectedUser = getUserByFormValue(systemUsers, field.value);
                const attorneyLabel =
                  field.value && field.value !== "Unassigned"
                    ? selectedUser
                      ? getUserName(selectedUser)
                      : "Select attorney"
                    : "Select attorney";

                return (
                  <FormItem className="flex flex-col">
                    <FormLabel>Assigned Attorney</FormLabel>
                    <Popover open={isAttorneyPopoverOpen} onOpenChange={setIsAttorneyPopoverOpen}>
                      <FormControl>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {attorneyLabel}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                      </FormControl>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Search users..." />
                          <CommandList>
                            {systemUsers.length === 0 && <CommandEmpty>No users found.</CommandEmpty>}
                            <CommandGroup>
                              <CommandItem
                                value="Unassigned"
                                onSelect={() => {
                                  form.setValue("attorneyAssigned", "Unassigned");
                                  setIsAttorneyPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === "Unassigned" || !field.value ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                Unassigned
                              </CommandItem>
                              {systemUsers.map((user) => {
                                const userName = getUserName(user);
                                return (
                                  <CommandItem
                                    value={`${userName} ${user.id}`}
                                    key={user.id}
                                    onSelect={() => {
                                      form.setValue("attorneyAssigned", user.id);
                                      setIsAttorneyPopoverOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === user.id ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    {userName}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {languageOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

            <SheetFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save Contact"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
