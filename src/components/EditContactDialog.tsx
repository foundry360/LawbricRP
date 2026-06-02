import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  firstName?: string;
  lastName?: string;
  email?: string;
};

type EditContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditContact: (contact: ContactFormValues) => Promise<void> | void;
  contact: any | null;
  attorneyOptions?: string[];
  accountTypeOptions?: string[];
  practiceAreaOptions?: string[];
  languageOptions?: string[];
  systemUsers?: SystemUser[];
};

function getUserName(user: SystemUser) {
  return user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.id;
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
  systemUsers = [],
}: EditContactDialogProps) {
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
      attorneyAssigned: "",
      dob: "",
      gender: "",
      language: "",
    },
  });

  useEffect(() => {
    if (contact && open) {
      const normalizedGender = contact.gender
        ? String(trimValue(contact.gender)).charAt(0).toUpperCase() +
          String(trimValue(contact.gender)).slice(1).toLowerCase()
        : "";

      form.reset({
        name: String(trimValue(contact.name) || ""),
        email: contact.email === "N/A" ? "" : String(trimValue(contact.email) || ""),
        phone: contact.phone === "N/A" ? "" : String(trimValue(contact.phone) || ""),
        type: String(findMatchingOption(contact.type, accountTypeOptions) || "Client"),
        status: String(trimValue(contact.status) || "Consultation"),
        caseType: String(findMatchingOption(contact.caseType, practiceAreaOptions) || ""),
        attorneyAssigned: contact.attorneyAssigned || contact.assignedAttorney || "Unassigned",
        dob: contact.dob === "N/A" ? "" : String(trimValue(contact.dob) || ""),
        gender: contact.gender === "N/A" ? "" : normalizedGender,
        language: String(findMatchingOption(contact.language, languageOptions) || ""),
      });
    }
  }, [contact, open, form, accountTypeOptions, practiceAreaOptions, languageOptions]);

  const onSubmit = async (data: ContactFormValues) => {
    await onEditContact(data);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) form.reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
          <DialogDescription>
            Update the details of the contact here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
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
                      <Input placeholder="(555) 000-0000" {...field} />
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
                          {field.value && !accountTypeOptions.includes(field.value) && (
                            <SelectItem value={field.value}>{field.value}</SelectItem>
                          )}
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
                          {field.value && !practiceAreaOptions.includes(field.value) && (
                            <SelectItem value={field.value}>{field.value}</SelectItem>
                          )}
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
                const selectedUser = systemUsers.find(
                  (user) => user.id === field.value || getUserName(user) === field.value,
                );
                const selectedLabel =
                  field.value && field.value !== "Unassigned"
                    ? selectedUser
                      ? getUserName(selectedUser)
                      : field.value
                    : "Select attorney";

                return (
                  <FormItem className="flex flex-col">
                    <FormLabel>Assigned Attorney</FormLabel>
                    <Popover open={isAttorneyPopoverOpen} onOpenChange={setIsAttorneyPopoverOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between font-normal",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {selectedLabel}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Search users..." />
                          <CommandList>
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
                                    field.value === "Unassigned" || !field.value
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                Unassigned
                              </CommandItem>
                              {systemUsers.length === 0 && (
                                <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                                  No users found.
                                </div>
                              )}
                              {systemUsers.map((user) => {
                                const userName = getUserName(user);
                                return (
                                  <CommandItem
                                    value={userName}
                                    key={user.id}
                                    onSelect={() => {
                                      form.setValue("attorneyAssigned", userName);
                                      setIsAttorneyPopoverOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === userName ? "opacity-100" : "opacity-0",
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
                      <Input type="date" {...field} value={field.value !== "N/A" ? field.value : ""} />
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
                    <Select onValueChange={field.onChange} value={field.value !== "N/A" ? field.value : ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                        {field.value && !["Male", "Female", "Other"].includes(field.value) && (
                          <SelectItem value={field.value}>{field.value}</SelectItem>
                        )}
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
                      <Select onValueChange={field.onChange} value={field.value !== "N/A" ? field.value : ""}>
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
                          {field.value && field.value !== "N/A" && !languageOptions.includes(field.value) && (
                            <SelectItem value={field.value}>{field.value}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
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

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
