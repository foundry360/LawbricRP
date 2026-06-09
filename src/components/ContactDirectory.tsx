import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  Building2,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Eye,
  Filter,
  IdCard,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Phone,
  Pin,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { AddContactDialog, type ContactFormValues } from "@/components/AddContactDialog";
import { CreateListViewSheet, type ListView } from "@/components/CreateListViewSheet";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { EditCompanyDialog, type CompanyFormValues } from "@/components/EditCompanyDialog";
import { EditContactDialog } from "@/components/EditContactDialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  apiClient,
  addContactsToBusiness,
  createBusiness,
  createContact,
  createLocationTag,
  deleteBusiness,
  deleteContact,
  getAppLocationContext,
  getBusinesses,
  getBusinessCustomFields,
  getBusinessObjectRecord,
  getContacts,
  getCustomFields,
  getLocationTags,
  hasPermission,
  type GhlBusiness,
  type GhlCustomField,
  type GhlTag,
  updateBusiness,
  updateBusinessObjectProperties,
  updateContact,
} from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import {
  getBusinessCustomFieldsCollection,
  getBusinessIndustryLabel,
  getBusinessIndustryOptions,
} from "@/lib/business-custom-fields";
import { saveContactRelationships } from "@/lib/contact-relationships";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPersonName } from "@/lib/names";
import { formatPhoneNumber } from "@/lib/phone";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import { supabase } from "@/lib/supabase";
import { createTagMetadata, loadTagsWithMetadata } from "@/lib/tag-metadata";
import { getAssignableUsers, getUserId, getUserName } from "@/lib/users";
import { cn } from "@/lib/utils";

type ContactStatus = "Active" | "Inactive";
type ContactType = string;
const CONTACT_STATUS_OPTIONS: ContactStatus[] = ["Active", "Inactive"];
const CONTACT_VIEW_MODE_STORAGE_KEY = "lawbric.contacts.viewMode";
const CONTACT_PINNED_VIEW_MODE_STORAGE_KEY = "lawbric.contacts.pinnedViewMode";
const CONTACT_PINNED_VIEW_MODE_METADATA_KEY = "contactPinnedViewMode";
const ACCOUNT_TYPE_OPTIONS = [
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
const LEGACY_ACCOUNT_TYPE_TAGS = ["Prospect", "Client", "Attorney", "Expert Witness", "Opposing Counsel", "Lead"];
const DEFAULT_ACCOUNT_TYPE = ACCOUNT_TYPE_OPTIONS[0];

type Contact = {
  id: string;
  recordKind: "contact" | "company";
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
  tags: string[];
  companyDetails?: GhlBusiness;
};

const defaultListViews: ListView[] = [{ id: "all", name: "All Contacts", filters: {} }];

type DirectoryViewMode = "grid" | "list";

function isDirectoryViewMode(value: unknown): value is DirectoryViewMode {
  return value === "grid" || value === "list";
}

function getInitialDirectoryViewMode(): DirectoryViewMode {
  if (typeof window === "undefined") return "list";
  const pinnedViewMode = window.localStorage.getItem(CONTACT_PINNED_VIEW_MODE_STORAGE_KEY);
  if (isDirectoryViewMode(pinnedViewMode)) return pinnedViewMode;
  const savedViewMode = window.localStorage.getItem(CONTACT_VIEW_MODE_STORAGE_KEY);
  return isDirectoryViewMode(savedViewMode) ? savedViewMode : "list";
}

function getInitialPinnedDirectoryViewMode(): DirectoryViewMode | null {
  if (typeof window === "undefined") return null;
  const pinnedViewMode = window.localStorage.getItem(CONTACT_PINNED_VIEW_MODE_STORAGE_KEY);
  return isDirectoryViewMode(pinnedViewMode) ? pinnedViewMode : null;
}

function ControlTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent className="left-1/2 -translate-x-1/2 whitespace-nowrap border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white shadow-md">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function getStatusColor(status: ContactStatus) {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-800";
    case "Inactive":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function normalizeCustomFieldName(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCustomFieldLookup(value: unknown) {
  return normalizeCustomFieldName(value).replace(/[._-]+/g, " ");
}

function customFieldMatchesName(field: any, name: string) {
  const normalizedName = normalizeCustomFieldLookup(name);
  return [field?.name, field?.label, field?.fieldName, field?.fieldKey, field?.key]
    .map((value) => normalizeCustomFieldLookup(value))
    .some((value) => value === normalizedName || value.endsWith(` ${normalizedName}`));
}

function buildCustomFieldsMap(customFields: any[]) {
  const entries = customFields.flatMap((customField: any) => {
    const fieldName = normalizeCustomFieldLookup(customField.name || customField.fieldKey || customField.key);
    return [customField.id, customField.fieldKey]
      .filter(Boolean)
      .map((fieldId) => [String(fieldId), fieldName] as const);
  });

  return new Map(entries);
}

function getCustomField(customFields: any[], name: string) {
  return customFields.find((field) => customFieldMatchesName(field, name));
}

function getCustomFieldValue(contact: any, customFieldsMap: Map<string, string>, name: string) {
  const normalizedName = normalizeCustomFieldLookup(name);
  let field = contact.customFields?.find((customField: any) => {
    const fieldId = String(customField.id || customField.fieldId || customField.customFieldId || customField.fieldKey || "");
    const mappedName = customFieldsMap.get(fieldId) || "";
    return (
      customFieldMatchesName(customField, name) ||
      mappedName === normalizedName ||
      mappedName.endsWith(` ${normalizedName}`)
    );
  });

  if (field) return field.value ?? field.field_value ?? field.fieldValue;

  const fieldId = [...customFieldsMap.entries()].find(
    ([, fieldName]) => fieldName === normalizedName || fieldName.endsWith(` ${normalizedName}`),
  )?.[0];

  if (!fieldId) return null;

  field = contact.customFields?.find((customField: any) =>
    [customField.id, customField.fieldId, customField.customFieldId, customField.fieldKey].some(
      (candidate) => String(candidate || "") === fieldId,
    ),
  );
  return field ? field.value ?? field.field_value ?? field.fieldValue : null;
}

function getFieldOptions(field: any) {
  if (!field) return [];
  const optionArrays = [field.options, field.picklistOptions, field.allowedValues, field.choices];
  const rawOptions = optionArrays.find((options) => Array.isArray(options) && options.length > 0) || [];
  return rawOptions.map((option: any) =>
    typeof option === "string" ? option : option.label || option.value || option.name || String(option),
  );
}

function normalizeAccountTypeOptions(options: string[]) {
  const normalizedOptions = options.filter((option) => option && option !== "Lead" && option !== "Prospect");
  return ["Lead", ...normalizedOptions];
}

function getUserAvatarUrl(user: any) {
  return user?.avatar_url || user?.profilePhoto || user?.avatarUrl || user?.profile_photo || "";
}

function getAvatarUrlFromMetadata(metadata?: Record<string, unknown> | null) {
  const possibleValues = [
    metadata?.avatar_url,
    metadata?.avatarUrl,
    metadata?.profilePhoto,
    metadata?.profile_photo,
    metadata?.profilePicture,
    metadata?.profile_picture,
    metadata?.picture,
  ];
  const avatarUrl = possibleValues.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof avatarUrl === "string" ? avatarUrl.trim() : "";
}

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function getAttorneyFilterLabel(value: string, users: any[]) {
  if (value === "All") return "Any Attorney";
  if (value === "Unassigned") return "Unassigned";
  const user = users.find((candidate) => getUserId(candidate) === value);
  return user ? getUserName(user) : "Unknown User";
}

function getDescriptionValue(description: unknown, label: string) {
  const normalizedLabel = label.trim().toLowerCase();
  return String(description || "")
    .split(/\r?\n/)
    .map((line) => {
      const [lineLabel, ...rest] = line.split(":");
      return {
        label: lineLabel.trim().toLowerCase(),
        value: rest.join(":").trim(),
      };
    })
    .find((line) => line.label === normalizedLabel)?.value || "";
}

function getBusinessPropertiesFromRecord(response: any) {
  return response?.record?.properties || response?.data?.record?.properties || response?.data?.properties || response?.properties || {};
}

function getBusinessIndustryFromRecord(response: any, customFields: GhlCustomField[]) {
  return getBusinessIndustryLabel(getBusinessPropertiesFromRecord(response).industry, customFields);
}

function getCustomFieldId(customFields: any[], name: string) {
  return getCustomField(customFields, name)?.id;
}

function normalizeContactStatus(value: unknown): ContactStatus | null {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = String(rawValue || "").trim().toLowerCase();
  return CONTACT_STATUS_OPTIONS.find((status) => status.toLowerCase() === normalized) || null;
}

function mapBusinessToContact(
  business: any,
  assignmentMap: Map<string, string>,
  users: any[],
  businessFields: GhlCustomField[],
): Contact {
  const dateValue = business.updatedAt || business.createdAt;
  const date = dateValue ? new Date(dateValue) : null;
  const assignedUserId = assignmentMap.get(business.id) || "";
  const assignedUser = assignedUserId ? users.find((user) => getUserId(user) === assignedUserId) : null;
  const industry =
    getBusinessIndustryLabel(business.properties?.industry || business.industry, businessFields) ||
    getDescriptionValue(business.description, "Industry");

  return {
    id: business.id,
    recordKind: "company",
    name: business.name || business.email || "Unknown Company",
    email: business.email || "N/A",
    phone: formatPhoneNumber(business.phone),
    type: "Company",
    status: "Active",
    caseType: "General",
    attorneyAssigned: assignedUser ? getUserName(assignedUser) : "Unassigned",
    attorneyAssignedId: assignedUser ? getUserId(assignedUser) : "",
    lastContact: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : "Recently",
    tags: ["Company"],
    companyDetails: { ...business, industry },
  };
}

function buildContactCustomFields(customFields: any[], data: ContactFormValues) {
  return [
    ["practice area", data.caseType],
    ["account type", data.type],
    ["status", data.status],
    ["language", data.language],
    ["gender", data.gender],
    ["primary contact", data.primaryContactName],
    ["website", data.website],
    ["company website", data.website],
    ["industry", data.industry],
    ["company address", data.companyAddress],
  ]
    .map(([name, value]) => {
      const field = getCustomField(customFields, String(name));
      if (!field || !value) return null;
      return {
        ...(field.id ? { id: field.id } : {}),
        ...(field.fieldKey ? { key: field.fieldKey } : {}),
        field_value: value,
      };
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
  const [statusFilter, setStatusFilter] = useState("All");
  const [caseTypeFilter, setCaseTypeFilter] = useState("All");
  const [attorneyFilter, setAttorneyFilter] = useState("All");
  const [viewMode, setViewMode] = useState<DirectoryViewMode>(getInitialDirectoryViewMode);
  const [pinnedViewMode, setPinnedViewMode] = useState<DirectoryViewMode | null>(getInitialPinnedDirectoryViewMode);
  const [isSavingPinnedView, setIsSavingPinnedView] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [companyToEdit, setCompanyToEdit] = useState<Contact | null>(null);
  const [companyToEditIndustry, setCompanyToEditIndustry] = useState("");
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isDeletingContact, setIsDeletingContact] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [sortColumn, setSortColumn] = useState<keyof Contact>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [locationId, setLocationId] = useState("");
  const [locationRecordId, setLocationRecordId] = useState("");
  const [accountTypeOptions, setAccountTypeOptions] = useState<string[]>([]);
  const [businessCustomFields, setBusinessCustomFields] = useState<GhlCustomField[]>([]);
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);
  const [practiceAreaOptions, setPracticeAreaOptions] = useState<string[]>([]);
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<GhlTag[]>([]);
  const [crmCustomFields, setCrmCustomFields] = useState<any[]>([]);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [userAvatarMap, setUserAvatarMap] = useState<Record<string, string>>({});
  const [listViews, setListViews] = useState<ListView[]>(defaultListViews);
  const [activeListViewId, setActiveListViewId] = useState("all");
  const [isListViewPanelOpen, setIsListViewPanelOpen] = useState(false);
  const [editingListView, setEditingListView] = useState<ListView | null>(null);
  const [canDeleteContacts, setCanDeleteContacts] = useState(false);
  const hasLoadedCompaniesRef = useRef(false);
  const isLoadingCompaniesRef = useRef(false);

  useEffect(() => {
    hasPermission("contacts.delete")
      .then(setCanDeleteContacts)
      .catch((error) => {
        console.error("Failed to load contact delete permission", error);
        setCanDeleteContacts(false);
      });
  }, []);

  useEffect(() => {
    const loadContactPreferences = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userMetadata = session?.user?.user_metadata || {};
      const saved = userMetadata.contactListViews;
      if (Array.isArray(saved) && saved.length > 0) {
        const hasAll = saved.some((view) => view.id === "all");
        setListViews(hasAll ? saved : [...defaultListViews, ...saved]);
      }

      const savedPinnedViewMode = userMetadata[CONTACT_PINNED_VIEW_MODE_METADATA_KEY];
      if (isDirectoryViewMode(savedPinnedViewMode)) {
        setPinnedViewMode(savedPinnedViewMode);
        setViewMode(savedPinnedViewMode);
        window.localStorage.setItem(CONTACT_PINNED_VIEW_MODE_STORAGE_KEY, savedPinnedViewMode);
      } else {
        setPinnedViewMode(null);
        window.localStorage.removeItem(CONTACT_PINNED_VIEW_MODE_STORAGE_KEY);
      }
    };

    loadContactPreferences().catch((error) => console.error("Failed to load contact preferences from Supabase", error));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CONTACT_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const handleTogglePinnedView = async () => {
    const nextPinnedViewMode = pinnedViewMode === viewMode ? null : viewMode;
    setPinnedViewMode(nextPinnedViewMode);
    if (nextPinnedViewMode) {
      window.localStorage.setItem(CONTACT_PINNED_VIEW_MODE_STORAGE_KEY, nextPinnedViewMode);
    } else {
      window.localStorage.removeItem(CONTACT_PINNED_VIEW_MODE_STORAGE_KEY);
    }

    setIsSavingPinnedView(true);
    try {
      await supabase.auth.updateUser({
        data: {
          [CONTACT_PINNED_VIEW_MODE_METADATA_KEY]: nextPinnedViewMode,
        },
      });
      toast({
        title: nextPinnedViewMode ? "Contacts View Pinned" : "Contacts View Unpinned",
        description: nextPinnedViewMode
          ? `Contacts will open in ${nextPinnedViewMode === "grid" ? "card" : "list"} view.`
          : "Contacts will open in the last view used on this device.",
      });
    } catch (error) {
      setPinnedViewMode(pinnedViewMode);
      if (pinnedViewMode) {
        window.localStorage.setItem(CONTACT_PINNED_VIEW_MODE_STORAGE_KEY, pinnedViewMode);
      } else {
        window.localStorage.removeItem(CONTACT_PINNED_VIEW_MODE_STORAGE_KEY);
      }
      toast({
        title: "Pinned View Not Saved",
        description: getUserFriendlyErrorMessage(error, "Could not save your pinned Contacts view."),
        variant: "destructive",
      });
    } finally {
      setIsSavingPinnedView(false);
    }
  };

  const saveListViewsToSupabase = async (newListViews: ListView[]) => {
    setListViews(newListViews);
    await supabase.auth.updateUser({ data: { contactListViews: newListViews } }).catch((error) => {
      console.error("Failed to save list views to Supabase", error);
    });
  };

  useEffect(() => {
    const nextAvatarMap: Record<string, string> = {};
    systemUsers.forEach((user) => {
      const userId = getUserId(user);
      const avatarUrl = getUserAvatarUrl(user);
      if (userId && avatarUrl) nextAvatarMap[userId] = avatarUrl;
    });

    const loadProfileAvatars = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentUserAvatar = getAvatarUrlFromMetadata(user?.user_metadata as Record<string, unknown> | null);
      if (user?.id && currentUserAvatar) nextAvatarMap[user.id] = currentUserAvatar;

      const assignedUserIds = Array.from(
        new Set(contacts.map((contact) => contact.attorneyAssignedId).filter((userId): userId is string => Boolean(userId))),
      );

      if (assignedUserIds.length > 0) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, avatar_url")
          .in("id", assignedUserIds);

        if (!error) {
          (data ?? []).forEach((profile) => {
            if (profile.id && profile.avatar_url) nextAvatarMap[profile.id] = profile.avatar_url;
          });
        } else {
          console.warn("Contact assigned attorney avatar lookup skipped", error);
        }
      }

      setUserAvatarMap(nextAvatarMap);
    };

    void loadProfileAvatars();
  }, [contacts, systemUsers]);

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
        const customFieldsList = getArrayFromResponse(fieldsResponse, "customFields");
        setCrmCustomFields(customFieldsList);

        let fetchedTags: GhlTag[] = [];
        try {
          fetchedTags = locId ? await getLocationTags(locId) : [];
          fetchedTags = locRecordId ? await loadTagsWithMetadata(locRecordId, fetchedTags) : fetchedTags;
          setTagOptions(fetchedTags);
        } catch (error) {
          console.error("Failed to fetch tags", error);
          toast({
            variant: "destructive",
            title: "Tags Sync Failed",
            description: "Could not load tags. Check the private integration scopes.",
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

        const customFieldsMap = buildCustomFieldsMap(customFieldsList);

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

        setAccountTypeOptions(accOptions.length > 0 ? normalizeAccountTypeOptions(accOptions) : ACCOUNT_TYPE_OPTIONS);
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
          const isCompanyContact = tags.some((tag: string) => tag.toLowerCase() === "company");
          const personName = formatPersonName(
            `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.name || "",
          );
          const companyName = contact.companyName || "";
          const accountTypeValue =
            getCustomFieldValue(contact, customFieldsMap, "account type") ||
            tags.find((tag: string) =>
              [...ACCOUNT_TYPE_OPTIONS, ...LEGACY_ACCOUNT_TYPE_TAGS]
                .map((option) => option.toLowerCase())
                .includes(tag.toLowerCase()),
            );
          const type = Array.isArray(accountTypeValue)
            ? accountTypeValue.join(", ")
            : accountTypeValue || DEFAULT_ACCOUNT_TYPE;

          const status = normalizeContactStatus(getCustomFieldValue(contact, customFieldsMap, "status")) || "Active";

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
            recordKind: "contact",
            name: (isCompanyContact ? companyName || personName : personName || companyName) || contact.email || "Unknown",
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
            tags,
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

  const buildContactTags = (data: ContactFormValues, existingTags: string[] = []) => {
    const appTagNames = new Set(tagOptions.map((tag) => tag.name.toLowerCase()));
    const systemTagNames = new Set(
      [...accountTypeOptions, ...ACCOUNT_TYPE_OPTIONS, ...LEGACY_ACCOUNT_TYPE_TAGS, ...CONTACT_STATUS_OPTIONS]
        .filter(Boolean)
        .map((tag) => tag.toLowerCase()),
    );
    const preservedTags = existingTags.filter((tag) => {
      const normalized = tag.toLowerCase();
      return !appTagNames.has(normalized) && !systemTagNames.has(normalized);
    });

    const contactKindTags = data.contactKind === "company" ? ["Company"] : [];
    return Array.from(
      new Set([...preservedTags, ...contactKindTags, data.type, ...(data.tags || [])].filter(Boolean)),
    );
  };

  const loadLatestCustomFields = async () => {
    if (!locationId) return crmCustomFields;

    const fieldsResponse: any = await getCustomFields(locationId);
    const customFieldsList = getArrayFromResponse(fieldsResponse, "customFields");
    setCrmCustomFields(customFieldsList);
    return customFieldsList;
  };

  const loadLatestBusinessCustomFields = useCallback(async () => {
    if (!locationId) return businessCustomFields;

    const fieldsResponse = await getBusinessCustomFields(locationId);
    const customFieldsList = getBusinessCustomFieldsCollection(fieldsResponse);
    setBusinessCustomFields(customFieldsList);
    setIndustryOptions(getBusinessIndustryOptions(customFieldsList));
    return customFieldsList;
  }, [businessCustomFields, locationId]);

  const loadCompanyRecords = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!locationId || (!force && hasLoadedCompaniesRef.current) || isLoadingCompaniesRef.current) return;

      isLoadingCompaniesRef.current = true;
      setIsLoadingCompanies(true);

      try {
        let latestBusinessCustomFields = businessCustomFields;
        if (latestBusinessCustomFields.length === 0) {
          try {
            latestBusinessCustomFields = await loadLatestBusinessCustomFields();
          } catch (error) {
            console.error("Failed to fetch business custom fields", error);
            latestBusinessCustomFields = [];
            setBusinessCustomFields([]);
            setIndustryOptions([]);
          }
        }

        const assignmentMap = new Map<string, string>();
        if (locationRecordId) {
          const { data: assignments, error: assignmentsError } = await supabase
            .from("contact_assignments")
            .select("ghl_contact_id, assigned_user_id")
            .eq("location_id", locationRecordId);

          if (assignmentsError) {
            console.error("Failed to fetch company assignments", assignmentsError);
          } else {
            (assignments ?? []).forEach((assignment) => {
              if (assignment.ghl_contact_id && assignment.assigned_user_id) {
                assignmentMap.set(assignment.ghl_contact_id, assignment.assigned_user_id);
              }
            });
          }
        }

        const businessesResponse: any = await getBusinesses(locationId);
        const mappedBusinesses: Contact[] = getArrayFromResponse(businessesResponse, "businesses").map((business: any) =>
          mapBusinessToContact(business, assignmentMap, systemUsers, latestBusinessCustomFields),
        );
        const mappedBusinessIds = new Set(mappedBusinesses.map((business) => business.id));

        setContacts((current) => [
          ...current.filter((contact) => contact.recordKind === "company" && !mappedBusinessIds.has(contact.id)),
          ...mappedBusinesses,
          ...current.filter((contact) => contact.recordKind !== "company"),
        ]);
        hasLoadedCompaniesRef.current = true;
      } catch (error) {
        console.error("Failed to fetch CRM companies", error);
        toast({
          variant: "destructive",
          title: "Company Sync Failed",
          description: "Could not load GHL company records. Check the private integration business scopes.",
        });
      } finally {
        isLoadingCompaniesRef.current = false;
        setIsLoadingCompanies(false);
      }
    },
    [businessCustomFields, loadLatestBusinessCustomFields, locationId, locationRecordId, systemUsers, toast],
  );

  const handleCompanyModeSelected = useCallback(async () => {
    try {
      await loadLatestBusinessCustomFields();
    } catch (error) {
      console.error("Failed to fetch business custom fields", error);
      setBusinessCustomFields([]);
      setIndustryOptions([]);
    }
  }, [loadLatestBusinessCustomFields]);

  const handleCreateTag = async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const existingTag = tagOptions.find((tag) => tag.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingTag) return existingTag.name;

    if (!locationId) {
      toast({ title: "Tag Not Created", description: "No GHL location is configured.", variant: "destructive" });
      throw new Error("No GHL location is configured.");
    }

    try {
      const createdTag = await createLocationTag(locationId, trimmedName);
      const createdTagWithMetadata = locationRecordId
        ? await createTagMetadata(locationRecordId, createdTag)
        : createdTag;
      setTagOptions((current) => {
        if (
          current.some(
            (tag) =>
              tag.id === createdTagWithMetadata.id ||
              tag.name.toLowerCase() === createdTagWithMetadata.name.toLowerCase(),
          )
        ) {
          return current;
        }
        return [...current, createdTagWithMetadata];
      });
      toast({ title: "Tag Created", description: `${createdTagWithMetadata.name} has been added.` });
      return createdTagWithMetadata.name;
    } catch (error) {
      toast({
        title: "Tag Not Created",
        description: getUserFriendlyErrorMessage(error, "Could not create this tag in GHL. Please try again."),
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleAddContact = async (newContactData: ContactFormValues) => {
    try {
      const isCompany = newContactData.contactKind === "company";
      const rawDisplayName = (isCompany ? newContactData.companyName : newContactData.name)?.trim() || "";
      const displayName = isCompany ? rawDisplayName : formatPersonName(rawDisplayName);
      const selectedPrimaryContact = isCompany && newContactData.existingContactId
        ? contacts.find((contact) => contact.id === newContactData.existingContactId && contact.recordKind === "contact")
        : null;
      const primaryName = formatPersonName((
        isCompany
          ? selectedPrimaryContact?.name || newContactData.primaryContactName
          : newContactData.name
      )?.trim() || displayName);
      const [firstName, ...rest] = primaryName.split(/\s+/);
      const assignedUser = systemUsers.find((user) => getUserId(user) === newContactData.attorneyAssigned);

      if (isCompany) {
        const companyDescription = [
          primaryName ? `Primary Contact: ${primaryName}` : "",
          newContactData.industry?.trim() ? `Industry: ${newContactData.industry.trim()}` : "",
          newContactData.caseType?.trim() ? `Practice Area: ${newContactData.caseType.trim()}` : "",
          newContactData.status?.trim() ? `Status: ${newContactData.status.trim()}` : "",
        ].filter(Boolean).join("\n");

        const businessPayload: Record<string, any> = {
          locationId,
          name: displayName,
        };

        if (newContactData.email && newContactData.email !== "N/A") businessPayload.email = newContactData.email;
        if (newContactData.phone && newContactData.phone !== "N/A") {
          businessPayload.phone = formatPhoneNumber(newContactData.phone, "");
        }
        if (newContactData.website?.trim()) businessPayload.website = newContactData.website.trim();
        if (newContactData.companyAddress?.trim()) businessPayload.address = newContactData.companyAddress.trim();
        if (companyDescription) businessPayload.description = companyDescription;

        const response: any = await createBusiness(businessPayload);
        const createdBusiness = response.business || response.buiseness || response.data?.business || response.data?.buiseness || response.data || response;
        const createdBusinessId = createdBusiness.id || crypto.randomUUID();
        const latestBusinessCustomFields = await loadLatestBusinessCustomFields();
        if (createdBusinessId && newContactData.industry?.trim()) {
          await updateBusinessObjectProperties(locationId, createdBusinessId, { industry: newContactData.industry.trim() });
        }
        let linkedContactId = newContactData.existingContactId || "";
        let createdCompanyContact: Contact | null = null;

        if ((newContactData.primaryContactMode || "create") === "create") {
          const contactPayload: Record<string, any> = {
            locationId,
            firstName,
            lastName: rest.join(" "),
            name: primaryName,
            email: newContactData.primaryContactEmail?.trim(),
            companyName: displayName,
            tags: ["Company Contact"],
          };

          if (newContactData.primaryContactPhone?.trim()) {
            contactPayload.phone = formatPhoneNumber(newContactData.primaryContactPhone, "");
          }
          const latestCustomFields = await loadLatestCustomFields();
          const titleFieldId =
            getCustomFieldId(latestCustomFields, "title") ||
            getCustomFieldId(latestCustomFields, "job title") ||
            getCustomFieldId(latestCustomFields, "contact title");
          if (titleFieldId && newContactData.primaryContactTitle?.trim()) {
            contactPayload.customFields = [{ id: titleFieldId, field_value: newContactData.primaryContactTitle.trim() }];
          }

          const contactResponse: any = await createContact(contactPayload);
          const createdContact = contactResponse.contact || contactResponse.data?.contact || contactResponse.data || contactResponse;
          linkedContactId = createdContact.id || crypto.randomUUID();
          createdCompanyContact = {
            id: linkedContactId,
            recordKind: "contact",
            name: primaryName,
            email: newContactData.primaryContactEmail || "N/A",
            phone: formatPhoneNumber(newContactData.primaryContactPhone || ""),
            type: DEFAULT_ACCOUNT_TYPE,
            status: "Active",
            caseType: newContactData.caseType || "General",
            attorneyAssigned: "Unassigned",
            lastContact: "Just now",
            tags: ["Company Contact"],
          };
        }

        if (linkedContactId) {
          await addContactsToBusiness(locationId, [linkedContactId], createdBusinessId);
        }

        if (assignedUser) {
          await saveContactAssignment(createdBusinessId, getUserId(assignedUser));
        }

        const newCompany: Contact = {
          id: createdBusinessId,
          recordKind: "company",
          name: createdBusiness.name || displayName,
          email: createdBusiness.email || newContactData.email || "N/A",
          phone: formatPhoneNumber(createdBusiness.phone || newContactData.phone),
          type: "Company",
          status: newContactData.status as ContactStatus,
          caseType: newContactData.caseType || "General",
          attorneyAssigned: assignedUser ? getUserName(assignedUser) : "Unassigned",
          attorneyAssignedId: assignedUser ? getUserId(assignedUser) : "",
          lastContact: "Just now",
          tags: ["Company"],
          companyDetails: {
            ...createdBusiness,
            id: createdBusinessId,
            industry: getBusinessIndustryLabel(newContactData.industry, latestBusinessCustomFields) || newContactData.industry,
          },
        };

        setContacts((current) => [
          newCompany,
          ...(createdCompanyContact ? [createdCompanyContact] : []),
          ...current,
        ]);
        toast({ title: "Company Added", description: `${newCompany.name} has been added to Companies.` });
        return;
      }

      const payload: Record<string, any> = {
        locationId,
        tags: buildContactTags(newContactData),
      };

      if (primaryName) {
        payload.firstName = firstName;
        payload.lastName = rest.join(" ");
      }

      if (newContactData.email && newContactData.email !== "N/A") payload.email = newContactData.email;
      if (newContactData.phone && newContactData.phone !== "N/A") {
        payload.phone = formatPhoneNumber(newContactData.phone, "");
      }
      if (newContactData.dob?.trim()) payload.dateOfBirth = newContactData.dob;

      const latestCustomFields = await loadLatestCustomFields();
      const customFields = buildContactCustomFields(latestCustomFields, newContactData);

      if (customFields.length > 0) payload.customFields = customFields;

      const response: any = await createContact(payload);
      const createdContact = response.contact || response.data?.contact || response.data || response;
      const createdContactId = createdContact.id || crypto.randomUUID();

      if (assignedUser) {
        await saveContactAssignment(createdContactId, getUserId(assignedUser));
      }
      await saveContactRelationships(locationId, createdContactId, newContactData.relatedContacts || []);

      const newContact: Contact = {
        id: createdContactId,
        recordKind: "contact",
        name: displayName,
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
        tags: buildContactTags(newContactData),
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
    const updatedName = formatPersonName(updatedData.name?.trim() || contactToEdit.name);
    const updatedContact: Contact = {
      ...contactToEdit,
      ...updatedData,
      name: updatedName,
      phone: formatPhoneNumber(updatedData.phone),
      status: updatedData.status as ContactStatus,
      attorneyAssigned: selectedAssignedUser ? getUserName(selectedAssignedUser) : "Unassigned",
      attorneyAssignedId: selectedAssignedUser ? getUserId(selectedAssignedUser) : "",
      tags: buildContactTags(updatedData, contactToEdit.tags || []),
    };
    setContacts((current) =>
      current.map((contact) => (contact.id === contactToEdit.id ? updatedContact : contact)),
    );

    try {
      const [firstName, ...rest] = updatedName.split(/\s+/);
      const payload: Record<string, any> = {
        firstName,
        lastName: rest.join(" "),
        tags: buildContactTags(updatedData, contactToEdit.tags || []),
      };
      if (updatedData.email) payload.email = updatedData.email;
      if (updatedData.phone) payload.phone = formatPhoneNumber(updatedData.phone, "");
      if (updatedData.dob?.trim()) payload.dateOfBirth = updatedData.dob;

      const latestCustomFields = await loadLatestCustomFields();
      const customFields = buildContactCustomFields(latestCustomFields, updatedData);
      if (customFields.length > 0) payload.customFields = customFields;

      const assignedUser = systemUsers.find((user) => getUserId(user) === updatedData.attorneyAssigned);

      await updateContact(contactToEdit.id, payload);
      await saveContactAssignment(contactToEdit.id, assignedUser ? getUserId(assignedUser) : "");
      await saveContactRelationships(locationId, contactToEdit.id, updatedData.relatedContacts || []);
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

  const handleDeleteContact = async (record: Contact) => {
    try {
      if (record.recordKind === "company") {
        await deleteBusiness(record.id);
      } else {
        await deleteContact(record.id);
      }
      await saveContactAssignment(record.id, "");
      setContacts((current) => current.filter((contact) => contact.id !== record.id));
      toast({
        title: record.recordKind === "company" ? "Company Deleted" : "Contact Deleted",
        description: `The ${record.recordKind === "company" ? "company" : "contact"} has been removed from CRM.`,
      });
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Failed to delete the record. Please try again.");
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: message,
      });
      throw error;
    }
  };

  const activeListView = listViews.find((listView) => listView.id === activeListViewId) || listViews[0];
  useEffect(() => {
    if (locationId && systemUsers.length > 0) {
      void loadCompanyRecords();
    }
  }, [loadCompanyRecords, locationId, systemUsers.length]);

  const contactTypeOptions = useMemo(
    () => [...new Set([...accountTypeOptions, "Company", ...contacts.map((contact) => contact.type).filter(Boolean)])],
    [accountTypeOptions, contacts],
  );
  const contactPracticeAreaOptions = useMemo(
    () => [
      ...new Set([
        ...PRACTICE_AREAS,
        ...practiceAreaOptions,
        ...contacts.map((contact) => contact.caseType).filter(Boolean),
      ]),
    ],
    [contacts, practiceAreaOptions],
  );
  const activeFilterCount = [
    typeFilter,
    statusFilter,
    caseTypeFilter,
    attorneyFilter,
  ].filter((value) => value !== "All").length;

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const matchesSearch =
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.caseType.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "All" || contact.type === typeFilter;
      const matchesStatus = statusFilter === "All" || contact.status === statusFilter;
      const matchesCaseType = caseTypeFilter === "All" || contact.caseType === caseTypeFilter;
      const matchesAttorney =
        attorneyFilter === "All" ||
        (attorneyFilter === "Unassigned"
          ? !contact.attorneyAssignedId && contact.attorneyAssigned === "Unassigned"
          : contact.attorneyAssignedId === attorneyFilter);
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

      return matchesSearch && matchesType && matchesStatus && matchesCaseType && matchesAttorney && matchesListView;
    });
  }, [activeListView, attorneyFilter, caseTypeFilter, contacts, searchTerm, statusFilter, typeFilter]);

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

  const handleViewRecord = (contact: Contact) => {
    if (contact.recordKind === "company") {
      const companyDetails: GhlBusiness = contact.companyDetails || {
        id: contact.id,
        name: contact.name,
        email: contact.email === "N/A" ? null : contact.email,
        phone: contact.phone === "N/A" ? null : contact.phone,
      };

      window.sessionStorage.setItem(`company:${contact.id}`, JSON.stringify(companyDetails));
      navigate(`/company/${contact.id}`, { state: { company: companyDetails } });
      return;
    }

    navigate(`/contact/${contact.id}`);
  };

  const handleEditRecord = (contact: Contact) => {
    if (contact.recordKind === "company") {
      setCompanyToEdit(contact);
      setCompanyToEditIndustry(
        getBusinessIndustryLabel((contact.companyDetails as any)?.industry, businessCustomFields) ||
          getDescriptionValue(contact.companyDetails?.description, "Industry"),
      );
      setIsEditCompanyModalOpen(true);
      if (locationId) {
        void Promise.all([
          loadLatestBusinessCustomFields().catch((error) => {
            console.error("Failed to refresh business fields", error);
            return businessCustomFields;
          }),
          getBusinessObjectRecord(locationId, contact.id).catch((error) => {
            console.error("Failed to load business object record", error);
            return null;
          }),
        ]).then(([latestFields, recordResponse]) => {
          if (recordResponse) {
            setCompanyToEditIndustry(
              getBusinessIndustryFromRecord(recordResponse, latestFields) ||
                getDescriptionValue(contact.companyDetails?.description, "Industry"),
            );
          }
        });
      }
      return;
    }

    setContactToEdit(contact);
    setIsEditModalOpen(true);
  };

  const handleEditCompany = async (updatedData: CompanyFormValues) => {
    if (!companyToEdit) return;

    const previousContacts = contacts;
    const previousCompany = companyToEdit;
    const nextCompanyDetails: GhlBusiness = {
      ...(companyToEdit.companyDetails || { id: companyToEdit.id, name: companyToEdit.name }),
      name: updatedData.name.trim(),
      email: updatedData.email.trim() || null,
      phone: updatedData.phone ? formatPhoneNumber(updatedData.phone, "") : null,
      website: updatedData.website.trim() || null,
      address: updatedData.address.trim() || null,
      industry: updatedData.industry,
    } as GhlBusiness;
    const nextCompany: Contact = {
      ...companyToEdit,
      name: nextCompanyDetails.name,
      email: nextCompanyDetails.email || "N/A",
      phone: formatPhoneNumber(nextCompanyDetails.phone || ""),
      companyDetails: nextCompanyDetails,
    };

    setCompanyToEdit(nextCompany);
    setContacts((current) => current.map((contact) => (contact.id === companyToEdit.id ? nextCompany : contact)));

    try {
      await updateBusiness(companyToEdit.id, {
        name: nextCompanyDetails.name,
        email: nextCompanyDetails.email,
        phone: nextCompanyDetails.phone,
        website: nextCompanyDetails.website,
        address: nextCompanyDetails.address,
      });
      if (locationId) {
        await updateBusinessObjectProperties(locationId, companyToEdit.id, { industry: updatedData.industry || "" });
      }
      setCompanyToEditIndustry(updatedData.industry);
      toast({ title: "Company Updated", description: `${nextCompanyDetails.name} has been saved.` });
    } catch (error) {
      setCompanyToEdit(previousCompany);
      setContacts(previousContacts);
      toast({
        variant: "destructive",
        title: "Company Not Updated",
        description: getUserFriendlyErrorMessage(error, "Could not save company changes. Please try again."),
      });
      throw error;
    }
  };

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
      <div className="flex w-full flex-col items-start justify-between gap-4 overflow-visible xl:flex-row xl:items-center">
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white"
                      aria-label="List actions"
                      tooltip="List actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
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
                className="h-8 shrink-0 rounded-full px-3 text-muted-foreground hover:bg-[#0484C8] hover:text-white"
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

              <Popover>
                <ControlTooltip label="Filter contacts">
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "relative h-10 w-10 shrink-0 rounded-full",
                        activeFilterCount > 0 && "border-primary/40 bg-primary/10 text-primary",
                      )}
                    >
                      <Filter className="h-4 w-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                </ControlTooltip>
                <PopoverContent className="right-0 w-80 p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Filter Contacts</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          setTypeFilter("All");
                          setStatusFilter("All");
                          setCaseTypeFilter("All");
                          setAttorneyFilter("All");
                          setCurrentPage(1);
                        }}
                      >
                        Clear
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={statusFilter} onValueChange={(value) => {
                        setStatusFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any status" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          <SelectItem value="All">Any Status</SelectItem>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Account Type</Label>
                      <Select value={typeFilter} onValueChange={(value) => {
                        setTypeFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any account type" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          <SelectItem value="All">Any Account Type</SelectItem>
                          {contactTypeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Practice Area</Label>
                      <SearchableSelect
                        value={caseTypeFilter}
                        onValueChange={(value) => {
                          setCaseTypeFilter(value);
                          setCurrentPage(1);
                        }}
                        options={["All", ...contactPracticeAreaOptions]}
                        placeholder="Any practice area"
                        searchPlaceholder="Search practice areas..."
                        emptyMessage="No practice areas found."
                        getOptionLabel={(value) => (value === "All" ? "Any Practice Area" : value)}
                        contentClassName="z-[150]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Assigned Attorney</Label>
                      <Select value={attorneyFilter} onValueChange={(value) => {
                        setAttorneyFilter(value);
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger>
                          <span className={cn(attorneyFilter === "All" && "text-muted-foreground")}>
                            {getAttorneyFilterLabel(attorneyFilter, systemUsers)}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="z-[150] max-h-72 overflow-y-auto">
                          <SelectItem value="All">Any Attorney</SelectItem>
                          <SelectItem value="Unassigned">Unassigned</SelectItem>
                          {systemUsers.map((user) => (
                            <SelectItem key={getUserId(user)} value={getUserId(user)}>
                              {getUserName(user)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as DirectoryViewMode)} className="hidden sm:block">
                <TabsList className="h-10 rounded-full">
                  <ControlTooltip label="Card view">
                    <TabsTrigger value="grid" className="rounded-full px-3">
                      <LayoutGrid className="h-4 w-4" />
                    </TabsTrigger>
                  </ControlTooltip>
                  <ControlTooltip label="List view">
                    <TabsTrigger value="list" className="rounded-full px-3">
                      <List className="h-4 w-4" />
                    </TabsTrigger>
                  </ControlTooltip>
                </TabsList>
              </Tabs>
              <ControlTooltip label={pinnedViewMode === viewMode ? "Unpin this Contacts view" : "Pin this Contacts view"}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "hidden h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white sm:inline-flex",
                    pinnedViewMode === viewMode && "bg-primary/10 text-primary hover:bg-[#0484C8] hover:text-white",
                  )}
                  disabled={isSavingPinnedView}
                  onClick={handleTogglePinnedView}
                  aria-label={pinnedViewMode === viewMode ? "Unpin this Contacts view" : "Pin this Contacts view"}
                >
                  <Pin className={cn("h-4 w-4", pinnedViewMode === viewMode && "fill-current")} />
                </Button>
              </ControlTooltip>
            </>
          )}

          <ControlTooltip label="Add contact">
            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-[#0484C8]"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </ControlTooltip>
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
          <Button onClick={() => setIsAddModalOpen(true)} size="icon" className="h-12 w-12 rounded-full shadow-sm hover:bg-[#0484C8]">
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {paginatedContacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onNavigate={() => handleViewRecord(contact)}
                  onEdit={() => handleEditRecord(contact)}
                  canDelete={canDeleteContacts}
                  onDelete={() => {
                    setContactToDelete(contact);
                  }}
                />
              ))}
            </div>
          ) : (
            <ContactTable
              contacts={paginatedContacts}
              systemUsers={systemUsers}
              userAvatarMap={userAvatarMap}
              onView={handleViewRecord}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
              canDelete={canDeleteContacts}
              onEdit={handleEditRecord}
              onDelete={(contact) => {
                setContactToDelete(contact);
              }}
            />
          )}

          {filteredContacts.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-12 text-center">
              {isLoadingCompanies ? (
                <>
                  <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
                  <h3 className="text-lg font-medium text-foreground">Loading companies...</h3>
                  <p className="mt-1 text-muted-foreground">Company records are syncing from CRM.</p>
                </>
              ) : (
                <>
                  <Briefcase className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                  <h3 className="text-lg font-medium text-foreground">No contacts found</h3>
                  <p className="mt-1 text-muted-foreground">Try adjusting your search or filters.</p>
                </>
              )}
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
        practiceAreaOptions={contactPracticeAreaOptions}
        industryOptions={industryOptions}
        languageOptions={languageOptions}
        tagOptions={tagOptions.map((tag) => tag.name)}
        onCreateTag={handleCreateTag}
        onCompanyModeSelected={handleCompanyModeSelected}
        systemUsers={systemUsers}
        companyContactOptions={contacts
          .filter((contact) => contact.recordKind === "contact")
          .map((contact) => ({ id: contact.id, name: contact.name, email: contact.email }))}
        relatedContactOptions={contacts
          .filter((contact) => contact.recordKind === "contact")
          .map((contact) => ({ id: contact.id, name: contact.name, email: contact.email }))}
      />

      <EditCompanyDialog
        open={isEditCompanyModalOpen}
        onOpenChange={(open) => {
          setIsEditCompanyModalOpen(open);
          if (!open) {
            setCompanyToEdit(null);
            setCompanyToEditIndustry("");
          }
        }}
        company={
          companyToEdit
            ? companyToEdit.companyDetails || {
                id: companyToEdit.id,
                name: companyToEdit.name,
                email: companyToEdit.email === "N/A" ? null : companyToEdit.email,
                phone: companyToEdit.phone === "N/A" ? null : companyToEdit.phone,
              }
            : null
        }
        industry={companyToEditIndustry}
        industryOptions={industryOptions}
        onEditCompany={handleEditCompany}
      />

      <EditContactDialog
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onEditContact={handleEditContact}
        contact={contactToEdit}
        accountTypeOptions={accountTypeOptions}
        practiceAreaOptions={contactPracticeAreaOptions}
        languageOptions={languageOptions}
        tagOptions={tagOptions.map((tag) => tag.name)}
        onCreateTag={handleCreateTag}
        systemUsers={systemUsers}
        locationId={locationId}
        relatedContactOptions={contacts
          .filter((contact) => contact.recordKind === "contact")
          .map((contact) => ({ id: contact.id, name: contact.name, email: contact.email }))}
      />

      <DeleteConfirmationDialog
        open={Boolean(contactToDelete)}
        onOpenChange={(open) => !open && setContactToDelete(null)}
        title={`Permanently delete ${contactToDelete?.recordKind === "company" ? "company" : "contact"}?`}
        recordType={contactToDelete?.recordKind === "company" ? "company" : "contact"}
        recordName={contactToDelete?.name}
        isDeleting={isDeletingContact}
        onConfirm={async () => {
          if (!contactToDelete) return;
          setIsDeletingContact(true);
          try {
            await handleDeleteContact(contactToDelete);
            setContactToDelete(null);
          } finally {
            setIsDeletingContact(false);
          }
        }}
      />

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
        practiceAreaOptions={contactPracticeAreaOptions}
      />
    </div>
  );
}

function ContactCard({
  contact,
  onNavigate,
  onEdit,
  canDelete,
  onDelete,
}: {
  contact: Contact;
  onNavigate: () => void;
  onEdit: () => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const isCompany = contact.recordKind === "company";

  return (
    <Card className="cursor-pointer overflow-hidden transition-all hover:border-primary/50 hover:shadow-md" onClick={onNavigate}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 bg-muted/30 p-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-blue-50 text-primary">
              {isCompany ? <Building2 className="h-4 w-4" /> : <IdCard className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-sm font-semibold leading-tight text-[#2384CA] hover:underline">
                {contact.recordKind === "company" ? (
                  <button
                    type="button"
                    className="block max-w-full truncate text-left"
                    onClick={(event) => {
                      event.stopPropagation();
                      onNavigate();
                    }}
                  >
                    {contact.name}
                  </button>
                ) : (
                  <Link to={`/contact/${contact.id}`} onClick={(event) => event.stopPropagation()} className="block truncate">
                    {contact.name}
                  </Link>
                )}
              </h3>
              <Badge variant="outline" className={cn("shrink-0 border-transparent px-2 py-0 text-[10px]", getStatusColor(contact.status))}>
                {contact.status}
              </Badge>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{contact.type}</div>
          </div>
        </div>
        <ContactActions onView={onNavigate} onEdit={onEdit} canDelete={canDelete} onDelete={onDelete} />
      </CardHeader>
      <CardContent className="p-3 pt-3">
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 gap-1.5 text-xs">
            <div className="flex items-center text-foreground/70">
              <Mail className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{contact.email}</span>
            </div>
            <div className="flex items-center text-foreground/70">
              <Phone className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{contact.phone}</span>
            </div>
          </div>
          <div className="space-y-1.5 border-t pt-2.5">
            <ContactMeta label="Practice Area" value={contact.caseType} />
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
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate text-right text-foreground/80">{value}</span>
    </div>
  );
}

function ContactActions({
  onView,
  onEdit,
  canDelete,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-[#0484C8] hover:text-white"
          aria-label="Contact actions"
          tooltip="Contact actions"
        >
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
          <Eye className="mr-2 h-4 w-4" />
          View
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        {canDelete && (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContactTable({
  contacts,
  systemUsers,
  userAvatarMap,
  onView,
  handleSort,
  renderSortIcon,
  canDelete,
  onEdit,
  onDelete,
}: {
  contacts: Contact[];
  systemUsers: any[];
  userAvatarMap: Record<string, string>;
  onView: (contact: Contact) => void;
  handleSort: (column: keyof Contact) => void;
  renderSortIcon: (column: keyof Contact) => ReactNode;
  canDelete: boolean;
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
          {contacts.map((contact) => {
            const assignedUser = contact.attorneyAssignedId
              ? systemUsers.find((user) => getUserId(user) === contact.attorneyAssignedId)
              : null;
            const assignedName = assignedUser ? getUserName(assignedUser) : contact.attorneyAssigned;
            const assignedAvatarUrl =
              getUserAvatarUrl(assignedUser) ||
              (contact.attorneyAssignedId ? userAvatarMap[contact.attorneyAssignedId] : "") ||
              "";
            const assignedInitials = getAvatarInitials({ fullName: assignedName }, "U");
            const isCompany = contact.recordKind === "company";

            return (
            <tr
              key={contact.id}
              className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
              onClick={() => onView(contact)}
            >
              <td className="px-4 py-2">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-blue-50 text-primary">
                      {isCompany ? <Building2 className="h-4 w-4" /> : <IdCard className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  {contact.recordKind === "company" ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onView(contact);
                      }}
                      className="text-[#2384CA] hover:underline"
                    >
                      {contact.name}
                    </button>
                  ) : (
                    <Link to={`/contact/${contact.id}`} onClick={(event) => event.stopPropagation()} className="text-[#2384CA] hover:underline">
                      {contact.name}
                    </Link>
                  )}
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
              <td className="px-4 py-2 text-foreground/80">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    {assignedAvatarUrl ? (
                      <AvatarImage src={assignedAvatarUrl} alt={`${assignedInitials} avatar`} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                      {assignedInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span>{assignedName}</span>
                </div>
              </td>
              <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                <ContactActions
                  onView={() => onView(contact)}
                  onEdit={() => onEdit(contact)}
                  canDelete={canDelete}
                  onDelete={() => onDelete(contact)}
                />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
