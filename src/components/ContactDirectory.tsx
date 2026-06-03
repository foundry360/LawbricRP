import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { AddContactDialog, type ContactFormValues } from "@/components/AddContactDialog";
import { CreateListViewSheet, type ListView } from "@/components/CreateListViewSheet";
import { EditContactDialog } from "@/components/EditContactDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  apiClient,
  createContact,
  deleteContact,
  getAppLocationContext,
  getContacts,
  getCustomFields,
  updateContact,
} from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { getAssignableUsers, getUserId, getUserName } from "@/lib/users";
import { cn } from "@/lib/utils";

type ContactStatus = "Active" | "Pending" | "Closed" | "Consultation";
type ContactType = "Client" | "Attorney" | "Expert Witness" | "Opposing Counsel" | "Lead" | string;

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: ContactType;
  status: ContactStatus;
  caseType: string;
  attorneyAssigned: string;
  attorneyAssignedId?: string;
  lastContact: string;
  avatarUrl?: string;
  dob?: string;
  gender?: string;
  language?: string;
};

const defaultListViews: ListView[] = [{ id: "all", name: "All Contacts", filters: {} }];

function getStatusColor(status: ContactStatus) {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-800";
    case "Pending":
      return "bg-yellow-100 text-yellow-800";
    case "Closed":
      return "bg-gray-100 text-gray-800";
    case "Consultation":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getCustomFieldValue(contact: any, customFieldsMap: Map<string, string>, name: string) {
  let field = contact.customFields?.find(
    (customField: any) =>
      customField.name?.toLowerCase() === name.toLowerCase() || customField.id === name,
  );

  if (field) return field.value || field.field_value;

  const fieldId = [...customFieldsMap.entries()].find(
    ([, fieldName]) => fieldName === name.toLowerCase(),
  )?.[0];

  if (!fieldId) return null;

  field = contact.customFields?.find((customField: any) => customField.id === fieldId);
  return field ? field.value || field.field_value : null;
}

function getFieldOptions(field: any) {
  if (!field) return [];
  const optionArrays = [field.options, field.picklistOptions, field.allowedValues, field.choices];
  const rawOptions = optionArrays.find((options) => Array.isArray(options) && options.length > 0) || [];
  return rawOptions.map((option: any) =>
    typeof option === "string" ? option : option.label || option.value || option.name || String(option),
  );
}

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function getCustomFieldId(customFields: any[], name: string) {
  return customFields.find((field) => field.name?.trim().toLowerCase() === name)?.id;
}

function buildContactCustomFields(customFields: any[], data: ContactFormValues) {
  return [
    ["practice area", data.caseType],
    ["account type", data.type],
    ["language", data.language],
    ["gender", data.gender],
  ]
    .map(([name, value]) => {
      const id = getCustomFieldId(customFields, String(name));
      return id && value ? { id, field_value: value } : null;
    })
    .filter(Boolean);
}

function getVisiblePageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

export function ContactDirectory() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [sortColumn, setSortColumn] = useState<keyof Contact>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [locationId, setLocationId] = useState("");
  const [locationRecordId, setLocationRecordId] = useState("");
  const [accountTypeOptions, setAccountTypeOptions] = useState<string[]>([]);
  const [practiceAreaOptions, setPracticeAreaOptions] = useState<string[]>([]);
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
  const [crmCustomFields, setCrmCustomFields] = useState<any[]>([]);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [listViews, setListViews] = useState<ListView[]>(defaultListViews);
  const [activeListViewId, setActiveListViewId] = useState("all");
  const [isListViewPanelOpen, setIsListViewPanelOpen] = useState(false);
  const [editingListView, setEditingListView] = useState<ListView | null>(null);

  useEffect(() => {
    const loadListViews = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const saved = session?.user?.user_metadata?.contactListViews;
      if (Array.isArray(saved) && saved.length > 0) {
        const hasAll = saved.some((view) => view.id === "all");
        setListViews(hasAll ? saved : [...defaultListViews, ...saved]);
      }
    };

    loadListViews().catch((error) => console.error("Failed to load list views from Supabase", error));
  }, []);

  const saveListViewsToSupabase = async (newListViews: ListView[]) => {
    setListViews(newListViews);
    await supabase.auth.updateUser({ data: { contactListViews: newListViews } }).catch((error) => {
      console.error("Failed to save list views to Supabase", error);
    });
  };

  const saveContactAssignment = async (ghlContactId: string, assignedUserId: string) => {
    if (!locationRecordId || !ghlContactId) return;

    if (!assignedUserId || assignedUserId === "Unassigned") {
      const { error } = await supabase
        .from("contact_assignments")
        .delete()
        .eq("location_id", locationRecordId)
        .eq("ghl_contact_id", ghlContactId);

      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await supabase.from("contact_assignments").upsert(
      {
        location_id: locationRecordId,
        ghl_contact_id: ghlContactId,
        assigned_user_id: assignedUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "location_id,ghl_contact_id" },
    );

    if (error) throw new Error(error.message);
  };

  useEffect(() => {
    const fetchCRMContacts = async () => {
      setIsLoading(true);
      try {
        const context = await getAppLocationContext();
        const locId = context.location?.ghlLocationId || "";
        const locRecordId = context.location?.id || "";
        setLocationId(locId);
        setLocationRecordId(locRecordId);

        if (!context.configured) {
          setContacts([]);
          return;
        }

        let fieldsResponse: any = { customFields: [] };
        try {
          fieldsResponse = await getCustomFields(locId);
        } catch (error) {
          console.error("Failed to fetch custom fields", error);
          toast({
            variant: "destructive",
            title: "Custom Fields Sync Failed",
            description: "Could not load custom fields. Check the private integration scopes.",
          });
        }

        let fetchedUsers: any[] = [];
        try {
          fetchedUsers = await getAssignableUsers();
          setSystemUsers(fetchedUsers);
        } catch (error) {
          console.error("Failed to fetch app users", error);
        }

        const response: any = await getContacts(locId);
        const customFieldsList = getArrayFromResponse(fieldsResponse, "customFields");
        setCrmCustomFields(customFieldsList);

        const customFieldsMap = new Map<string, string>(
          customFieldsList.map((customField: any) => [
            String(customField.id),
            customField.name?.toLowerCase() || "",
          ]),
        );

        const findField = (exactName: string, fallbackTerms: string[] = []) => {
          return customFieldsList.find(
            (field: any) => field.name?.trim().toLowerCase() === exactName,
          ) || customFieldsList.find((field: any) => {
            const name = field.name?.trim().toLowerCase() || "";
            return fallbackTerms.some((term) => name.includes(term));
          });
        };

        const accountTypeField = findField("account type");
        const practiceAreaField = findField("practice area");
        const languageField = findField("language");

        const accOptions = getFieldOptions(accountTypeField);
        const paOptions = getFieldOptions(practiceAreaField);
        const langOptions = getFieldOptions(languageField);

        if (accOptions.length > 0) setAccountTypeOptions(accOptions);
        if (paOptions.length > 0) setPracticeAreaOptions(paOptions);
        if (langOptions.length > 0) setLanguageOptions(langOptions);

        const assignmentMap = new Map<string, string>();
        if (locRecordId) {
          const { data: assignments, error: assignmentsError } = await supabase
            .from("contact_assignments")
            .select("ghl_contact_id, assigned_user_id")
            .eq("location_id", locRecordId);

          if (assignmentsError) {
            console.error("Failed to fetch contact assignments", assignmentsError);
          } else {
            (assignments ?? []).forEach((assignment) => {
              if (assignment.ghl_contact_id && assignment.assigned_user_id) {
                assignmentMap.set(assignment.ghl_contact_id, assignment.assigned_user_id);
              }
            });
          }
        }

        const mappedContacts = getArrayFromResponse(response, "contacts").map((contact: any): Contact => {
          const tags = contact.tags || [];
          const accountTypeValue =
            getCustomFieldValue(contact, customFieldsMap, "account type") ||
            tags.find((tag: string) =>
              ["client", "attorney", "expert witness", "opposing counsel", "lead"].includes(tag.toLowerCase()),
            );
          const type = Array.isArray(accountTypeValue)
            ? accountTypeValue.join(", ")
            : accountTypeValue || "Client";

          let status: ContactStatus = "Active";
          if (tags.some((tag: string) => tag.toLowerCase().includes("pending"))) status = "Pending";
          else if (tags.some((tag: string) => tag.toLowerCase().includes("closed"))) status = "Closed";
          else if (tags.some((tag: string) => tag.toLowerCase().includes("consultation"))) status = "Consultation";

          const caseTypeValue =
            getCustomFieldValue(contact, customFieldsMap, "practice area") ||
            getCustomFieldValue(contact, customFieldsMap, "case type") ||
            getCustomFieldValue(contact, customFieldsMap, "case");
          const caseType = Array.isArray(caseTypeValue) ? caseTypeValue.join(", ") : caseTypeValue || "General";

          const assignedUserId = assignmentMap.get(contact.id) || "";
          const assignedUser = assignedUserId
            ? fetchedUsers.find((user) => getUserId(user) === assignedUserId)
            : null;
          const attorneyAssignedId = assignedUser ? getUserId(assignedUser) : "";
          const attorneyAssigned = assignedUser ? getUserName(assignedUser) : "Unassigned";

          const dateValue = contact.dateUpdated || contact.dateAdded;
          const date = dateValue ? new Date(dateValue) : null;

          return {
            id: contact.id,
            name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email || "Unknown",
            email: contact.email || "N/A",
            phone: formatPhoneNumber(contact.phone),
            type,
            status,
            caseType,
            attorneyAssigned,
            attorneyAssignedId,
            lastContact: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : "Recently",
            dob: contact.dateOfBirth ? new Date(contact.dateOfBirth).toISOString().split("T")[0] : "",
            gender: contact.gender || getCustomFieldValue(contact, customFieldsMap, "gender") || "",
            language: getCustomFieldValue(contact, customFieldsMap, "language") || "",
          };
        });

        setContacts(mappedContacts);
      } catch (error) {
        const message = getUserFriendlyErrorMessage(error, "We couldn't load your contacts right now.");
        console.error("Failed to fetch CRM contacts:", error);
        toast({
          variant: "destructive",
          title: "Sync Failed",
          description: message,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCRMContacts();
  }, []);

  const handleAddContact = async (newContactData: ContactFormValues) => {
    try {
      const [firstName, ...rest] = newContactData.name.trim().split(" ");
      const payload: Record<string, any> = {
        locationId,
        firstName,
        lastName: rest.join(" "),
        tags: [newContactData.type, newContactData.status],
      };

      if (newContactData.email && newContactData.email !== "N/A") payload.email = newContactData.email;
      if (newContactData.phone && newContactData.phone !== "N/A") {
        payload.phone = formatPhoneNumber(newContactData.phone, "");
      }
      if (newContactData.dob?.trim()) payload.dateOfBirth = newContactData.dob;

      const customFields = buildContactCustomFields(crmCustomFields, newContactData);

      if (customFields.length > 0) payload.customFields = customFields;

      const assignedUser = systemUsers.find((user) => getUserId(user) === newContactData.attorneyAssigned);

      const response: any = await createContact(payload);
      const createdContact = response.contact || response.data?.contact || response.data || response;
      const createdContactId = createdContact.id || crypto.randomUUID();

      if (assignedUser) {
        await saveContactAssignment(createdContactId, getUserId(assignedUser));
      }

      const newContact: Contact = {
        id: createdContactId,
        name: newContactData.name,
        email: newContactData.email,
        phone: formatPhoneNumber(newContactData.phone),
        type: newContactData.type,
        status: newContactData.status as ContactStatus,
        caseType: newContactData.caseType,
        attorneyAssigned: assignedUser ? getUserName(assignedUser) : "Unassigned",
        attorneyAssignedId: assignedUser ? getUserId(assignedUser) : "",
        lastContact: "Just now",
        dob: newContactData.dob,
        gender: newContactData.gender,
        language: newContactData.language,
      };

      setContacts((current) => [newContact, ...current]);
      toast({ title: "Contact Added", description: `${newContact.name} has been added to CRM.` });
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Failed to create contact in CRM. Please try again.");
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: message,
      });
      throw error;
    }
  };

  const handleEditContact = async (updatedData: ContactFormValues) => {
    if (!contactToEdit) return;
    const previousContacts = contacts;
    const selectedAssignedUser = systemUsers.find((user) => getUserId(user) === updatedData.attorneyAssigned);
    const updatedContact: Contact = {
      ...contactToEdit,
      ...updatedData,
      phone: formatPhoneNumber(updatedData.phone),
      status: updatedData.status as ContactStatus,
      attorneyAssigned: selectedAssignedUser ? getUserName(selectedAssignedUser) : "Unassigned",
      attorneyAssignedId: selectedAssignedUser ? getUserId(selectedAssignedUser) : "",
    };
    setContacts((current) =>
      current.map((contact) => (contact.id === contactToEdit.id ? updatedContact : contact)),
    );

    try {
      const [firstName, ...rest] = updatedData.name.trim().split(" ");
      const payload: Record<string, any> = {
        firstName,
        lastName: rest.join(" "),
        tags: [updatedData.type, updatedData.status],
      };
      if (updatedData.email) payload.email = updatedData.email;
      if (updatedData.phone) payload.phone = formatPhoneNumber(updatedData.phone, "");
      if (updatedData.dob?.trim()) payload.dateOfBirth = updatedData.dob;

      const customFields = buildContactCustomFields(crmCustomFields, updatedData);
      if (customFields.length > 0) payload.customFields = customFields;

      const assignedUser = systemUsers.find((user) => getUserId(user) === updatedData.attorneyAssigned);

      await updateContact(contactToEdit.id, payload);
      await saveContactAssignment(contactToEdit.id, assignedUser ? getUserId(assignedUser) : "");
      toast({ title: "Contact Updated", description: `${updatedContact.name}'s details have been saved.` });
    } catch (error) {
      setContacts(previousContacts);
      const message = getUserFriendlyErrorMessage(error, "Failed to save contact changes. Please try again.");
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: message,
      });
      throw error;
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      await deleteContact(contactId);
      await saveContactAssignment(contactId, "");
      setContacts((current) => current.filter((contact) => contact.id !== contactId));
      toast({ title: "Contact Deleted", description: "The contact has been removed from CRM." });
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Failed to delete the contact. Please try again.");
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: message,
      });
      throw error;
    }
  };

  const activeListView = listViews.find((listView) => listView.id === activeListViewId) || listViews[0];

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const matchesSearch =
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.caseType.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "All" || contact.type === typeFilter;
      let matchesListView = true;

      if (activeListView?.id !== "all") {
        const filters = activeListView.filters;
        if (filters.status && filters.status !== "All" && contact.status !== filters.status) matchesListView = false;
        if (filters.type && filters.type !== "All" && contact.type !== filters.type) matchesListView = false;
        if (filters.caseType && filters.caseType !== "All" && contact.caseType !== filters.caseType) matchesListView = false;
        if (
          filters.attorneyAssigned &&
          filters.attorneyAssigned !== "All" &&
          contact.attorneyAssigned !== filters.attorneyAssigned
        ) {
          matchesListView = false;
        }
      }

      return matchesSearch && matchesType && matchesListView;
    });
  }, [activeListView, contacts, searchTerm, typeFilter]);

  const sortedContacts = useMemo(() => {
    return [...filteredContacts].sort((a, b) => {
      let aValue = a[sortColumn] ?? "";
      let bValue = b[sortColumn] ?? "";

      if (typeof aValue === "string") aValue = aValue.toLowerCase();
      if (typeof bValue === "string") bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredContacts, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedContacts.length / itemsPerPage);
  const safeTotalPages = Math.max(1, totalPages);
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = sortedContacts.length === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(effectiveCurrentPage * itemsPerPage, sortedContacts.length);
  const visiblePageItems = getVisiblePageItems(effectiveCurrentPage, safeTotalPages);
  const paginatedContacts = sortedContacts.slice(
    (effectiveCurrentPage - 1) * itemsPerPage,
    effectiveCurrentPage * itemsPerPage,
  );

  const handleSort = (column: keyof Contact) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (column: keyof Contact) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
    return sortDirection === "asc" ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />;
  };

  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex w-full flex-col items-start justify-between gap-4 overflow-hidden xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <h2 className="shrink-0 text-2xl font-bold tracking-tight text-primary">Contacts</h2>
          <Tabs
            value={activeListViewId}
            onValueChange={(value) => {
              setActiveListViewId(value);
              setCurrentPage(1);
            }}
            className="min-w-0 flex-1"
          >
            <div className="flex items-center gap-2">
              <TabsList className="h-10 flex-nowrap justify-start overflow-x-auto bg-transparent p-0">
                {listViews.slice(0, 6).map((view) => (
                  <TabsTrigger
                    key={view.id}
                    value={view.id}
                    className="whitespace-nowrap rounded-full px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                  >
                    {view.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {listViews.length > 6 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {listViews.slice(6).map((view) => (
                      <DropdownMenuItem key={view.id} onClick={() => setActiveListViewId(view.id)}>
                        {view.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-full px-3 text-muted-foreground"
                onClick={() => {
                  setEditingListView(null);
                  setIsListViewPanelOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> Add List
              </Button>
            </div>
          </Tabs>
        </div>

        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-3 xl:w-auto">
          {activeListViewId !== "all" && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 rounded-full px-4 text-muted-foreground"
              onClick={() => {
                setEditingListView(listViews.find((view) => view.id === activeListViewId) || null);
                setIsListViewPanelOpen(true);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit List
            </Button>
          )}
          {contacts.length > 0 && !isLoading && (
            <>
              <div
                className={`relative flex items-center transition-all duration-300 ${
                  isSearchExpanded || searchTerm ? "w-full sm:w-64" : "w-10"
                }`}
              >
                <Button
                  variant={isSearchExpanded || searchTerm ? "ghost" : "outline"}
                  size="icon"
                  className="absolute left-0 z-10 h-10 w-10 rounded-full"
                  onClick={() => {
                    if (!isSearchExpanded && !searchTerm) {
                      setIsSearchExpanded(true);
                      window.setTimeout(() => document.getElementById("contact-search")?.focus(), 100);
                    }
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Input
                  id="contact-search"
                  placeholder="Search contacts..."
                  className={`h-10 rounded-full bg-background pl-10 transition-all duration-300 ${
                    isSearchExpanded || searchTerm ? "w-full opacity-100" : "w-0 border-0 p-0 opacity-0"
                  }`}
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setCurrentPage(1);
                  }}
                  onBlur={() => {
                    if (!searchTerm) setIsSearchExpanded(false);
                  }}
                />
              </div>

              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="flex h-10 w-10 items-center justify-center rounded-full border border-input bg-background p-0 [&>svg:last-child]:hidden">
                  <Filter className="h-4 w-4" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="All">All Types</SelectItem>
                  <SelectItem value="Client">Clients</SelectItem>
                  <SelectItem value="Attorney">Attorneys</SelectItem>
                  <SelectItem value="Expert Witness">Expert Witnesses</SelectItem>
                  <SelectItem value="Opposing Counsel">Opposing Counsel</SelectItem>
                </SelectContent>
              </Select>

              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "grid" | "list")} className="hidden sm:block">
                <TabsList className="h-10 rounded-full">
                  <TabsTrigger value="grid" className="rounded-full px-3">
                    <LayoutGrid className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="list" className="rounded-full px-3">
                    <List className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}

          <Button
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Syncing CRM contacts...</span>
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/5 px-4 py-20 text-center">
          <div className="mb-4 rounded-full bg-muted/30 p-4 text-muted-foreground/50">
            <Users className="h-8 w-8" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-muted-foreground">No contacts found</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground/70">Get started by adding your first contact.</p>
          <Button onClick={() => setIsAddModalOpen(true)} size="icon" className="h-12 w-12 rounded-full shadow-sm">
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {paginatedContacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onNavigate={() => navigate(`/contact/${contact.id}`)}
                  onEdit={() => {
                    setContactToEdit(contact);
                    setIsEditModalOpen(true);
                  }}
                  onDelete={() => {
                    setContactToDelete(contact);
                    setDeleteConfirmationText("");
                    setIsDeleteDialogOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <ContactTable
              contacts={paginatedContacts}
              navigate={navigate}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
              onEdit={(contact) => {
                setContactToEdit(contact);
                setIsEditModalOpen(true);
              }}
              onDelete={(contact) => {
                setContactToDelete(contact);
                setDeleteConfirmationText("");
                setIsDeleteDialogOpen(true);
              }}
            />
          )}

          {filteredContacts.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
              <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-foreground">No contacts found</h3>
              <p className="mt-1 text-muted-foreground">Try adjusting your search or filters.</p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
              {" - "}
              <span className="font-medium text-foreground">{lastVisibleRow}</span>
              {" of "}
              <span className="font-medium text-foreground">{sortedContacts.length}</span> contacts
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center justify-between gap-2 text-muted-foreground sm:justify-start">
                <span>Rows per page</span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[78px] rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[78px]">
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="75">75</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              </div>

              <Pagination className="mx-0 w-full justify-end sm:w-auto">
              <PaginationContent className="justify-end">
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      setCurrentPage(Math.max(1, effectiveCurrentPage - 1));
                    }}
                    className={cn(
                      "h-9 rounded-full px-3",
                      effectiveCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer",
                    )}
                  />
                </PaginationItem>
                {visiblePageItems.map((item, index) =>
                  item === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${index}`} className="hidden px-1 text-muted-foreground sm:block">
                      ...
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={item} className="hidden sm:block">
                      <PaginationLink
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          setCurrentPage(item);
                        }}
                        isActive={effectiveCurrentPage === item}
                        className="h-9 min-w-9 cursor-pointer rounded-full px-3"
                      >
                        {item}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem className="sm:hidden">
                  <span className="flex h-9 items-center rounded-full px-3 text-sm text-muted-foreground">
                    Page {effectiveCurrentPage} of {safeTotalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      setCurrentPage(Math.min(safeTotalPages, effectiveCurrentPage + 1));
                    }}
                    className={cn(
                      "h-9 rounded-full px-3",
                      effectiveCurrentPage === safeTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer",
                    )}
                  />
                </PaginationItem>
              </PaginationContent>
              </Pagination>
            </div>
          </div>
        </>
      )}

      <AddContactDialog
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        onAddContact={handleAddContact}
        locationId={locationId}
        accountTypeOptions={accountTypeOptions}
        practiceAreaOptions={practiceAreaOptions}
        languageOptions={languageOptions}
        systemUsers={systemUsers}
      />

      <EditContactDialog
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onEditContact={handleEditContact}
        contact={contactToEdit}
        accountTypeOptions={accountTypeOptions}
        practiceAreaOptions={practiceAreaOptions}
        languageOptions={languageOptions}
        systemUsers={systemUsers}
      />

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <strong className="text-foreground">{contactToDelete?.name}</strong> from CRM.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="mb-3 text-sm text-muted-foreground">
              Please type <strong className="text-foreground">DELETE</strong> to confirm.
            </p>
            <Input
              value={deleteConfirmationText}
              onChange={(event) => setDeleteConfirmationText(event.target.value)}
              placeholder="Type DELETE"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmationText !== "DELETE"}
              onClick={async () => {
                if (contactToDelete) {
                  await handleDeleteContact(contactToDelete.id);
                  setIsDeleteDialogOpen(false);
                }
              }}
            >
              Delete Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateListViewSheet
        open={isListViewPanelOpen}
        onOpenChange={setIsListViewPanelOpen}
        editingListView={editingListView}
        onSave={(newListView) => {
          const updatedViews = editingListView
            ? listViews.map((view) => (view.id === newListView.id ? newListView : view))
            : [...listViews, newListView];
          saveListViewsToSupabase(updatedViews);
          setActiveListViewId(newListView.id);
        }}
        onDelete={(id) => {
          saveListViewsToSupabase(listViews.filter((view) => view.id !== id));
          setActiveListViewId("all");
        }}
        systemUsers={systemUsers}
        accountTypeOptions={accountTypeOptions}
        practiceAreaOptions={practiceAreaOptions}
      />
    </div>
  );
}

function ContactCard({
  contact,
  onNavigate,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  onNavigate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const contactInitials = getAvatarInitials({ fullName: contact.name, email: contact.email }, "C");

  return (
    <Card className="cursor-pointer overflow-hidden transition-all hover:border-primary/50 hover:shadow-md" onClick={onNavigate}>
      <CardHeader className="flex flex-row items-start justify-between bg-muted/30 pb-4">
        <div className="flex items-center space-x-4">
          <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
            <AvatarImage src={contact.avatarUrl} alt={`${contactInitials} avatar`} />
            <AvatarFallback className="bg-primary/10 font-semibold text-primary">
              {contactInitials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="mb-1.5 text-lg capitalize leading-none text-[#2384CA] hover:underline">
              <Link to={`/contact/${contact.id}`} onClick={(event) => event.stopPropagation()}>
                {contact.name}
              </Link>
            </h3>
            <div className="text-sm text-muted-foreground">{contact.type}</div>
          </div>
        </div>
        <ContactActions onView={onNavigate} onEdit={onEdit} onDelete={onDelete} />
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-3">
          <Badge variant="outline" className={cn("border-transparent", getStatusColor(contact.status))}>
            {contact.status}
          </Badge>
          <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center text-foreground/70">
              <Mail className="mr-2 h-4 w-4" />
              <span className="truncate">{contact.email}</span>
            </div>
            <div className="flex items-center text-foreground/70">
              <Phone className="mr-2 h-4 w-4" />
              <span>{contact.phone}</span>
            </div>
          </div>
          <div className="mt-3 space-y-2 border-t pt-3">
            <ContactMeta label="Case Type" value={contact.caseType} />
            <ContactMeta label="Assigned To" value={contact.attorneyAssigned} />
            <ContactMeta label="Last Contact" value={contact.lastContact} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ContactMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground/80">{value}</span>
    </div>
  );
}

function ContactActions({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
        >
          View
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContactTable({
  contacts,
  navigate,
  handleSort,
  renderSortIcon,
  onEdit,
  onDelete,
}: {
  contacts: Contact[];
  navigate: (path: string) => void;
  handleSort: (column: keyof Contact) => void;
  renderSortIcon: (column: keyof Contact) => ReactNode;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}) {
  const columns: Array<[keyof Contact, string]> = [
    ["name", "Contact"],
    ["email", "Email"],
    ["phone", "Phone"],
    ["status", "Status"],
    ["type", "Account Type"],
    ["caseType", "Practice Area"],
    ["attorneyAssigned", "Assigned Attorney"],
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            {columns.map(([column, label]) => (
              <th
                key={column}
                className="h-12 cursor-pointer px-4 py-4 font-medium transition-colors hover:bg-muted/80"
                onClick={() => handleSort(column)}
              >
                <div className="flex items-center">
                  {label} {renderSortIcon(column)}
                </div>
              </th>
            ))}
            <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr
              key={contact.id}
              className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
              onClick={() => navigate(`/contact/${contact.id}`)}
            >
              <td className="px-4 py-2">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={contact.avatarUrl}
                      alt={`${getAvatarInitials({ fullName: contact.name, email: contact.email }, "C")} avatar`}
                    />
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">
                      {getAvatarInitials({ fullName: contact.name, email: contact.email }, "C")}
                    </AvatarFallback>
                  </Avatar>
                  <Link to={`/contact/${contact.id}`} onClick={(event) => event.stopPropagation()} className="capitalize text-[#2384CA] hover:underline">
                    {contact.name}
                  </Link>
                </div>
              </td>
              <td className="px-4 py-2 text-foreground/70">
                <div className="flex items-center">
                  <Mail className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span>{contact.email}</span>
                </div>
              </td>
              <td className="px-4 py-2 text-foreground/70">
                <div className="flex items-center">
                  <Phone className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span>{contact.phone}</span>
                </div>
              </td>
              <td className="px-4 py-2">
                <Badge variant="outline" className={cn("border-transparent", getStatusColor(contact.status))}>
                  {contact.status}
                </Badge>
              </td>
              <td className="px-4 py-2 text-foreground/70">{contact.type}</td>
              <td className="px-4 py-2 text-foreground/80">{contact.caseType}</td>
              <td className="px-4 py-2 text-foreground/80">{contact.attorneyAssigned}</td>
              <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <ContactActions
                  onView={() => navigate(`/contact/${contact.id}`)}
                  onEdit={() => onEdit(contact)}
                  onDelete={() => onDelete(contact)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
