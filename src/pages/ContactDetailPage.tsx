import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Mail, Phone, UserX } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditContactDialog, type ContactFormValues } from "@/components/EditContactDialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient, getAppLocationContext, getCustomFields, updateContact } from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { getAssignableUsers, getUserId, getUserName } from "@/lib/users";
import { cn } from "@/lib/utils";

const getStatusColor = (status: string) => {
  switch (status) {
    case "Active":
      return "bg-green-50 text-green-900";
    case "Pending":
      return "bg-yellow-50 text-yellow-900";
    case "Closed":
      return "bg-gray-100 text-gray-900";
    case "Consultation":
      return "bg-blue-50 text-blue-900";
    default:
      return "bg-gray-100 text-gray-900";
  }
};

function getArrayFromResponse(response: any, key: string) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.[key])) return response[key];
  if (Array.isArray(response?.data?.[key])) return response.data[key];
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function getFieldOptions(field: any) {
  if (!field) return [];
  const possibleOptionArrays = [field.options, field.picklistOptions, field.allowedValues, field.choices];

  for (const options of possibleOptionArrays) {
    if (Array.isArray(options) && options.length > 0) {
      return options.map((option: any) =>
        typeof option === "string" ? option : option.label || option.value || option.name || String(option),
      );
    }
  }

  return [];
}

function getCustomFieldValue(contact: any, fieldName: string) {
  const field = contact.customFields?.find((customField: any) => {
    const name = customField.name?.toLowerCase() || "";
    return name === fieldName || customField.id === fieldName;
  });

  return field?.value || field?.field_value;
}

export function ContactDetailPage() {
  const { contactId } = useParams();
  const { toast } = useToast();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [accountTypeOptions, setAccountTypeOptions] = useState<string[]>([]);
  const [practiceAreaOptions, setPracticeAreaOptions] = useState<string[]>([]);
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
  const [crmCustomFields, setCrmCustomFields] = useState<any[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [locationRecordId, setLocationRecordId] = useState("");

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
    const fetchFields = async () => {
      try {
        const context = await getAppLocationContext();
        const locId = context.location?.ghlLocationId || "";
        setLocationRecordId(context.location?.id || "");
        if (!locId) return;

        const fieldsResponse: any = await getCustomFields(locId);
        const customFieldsList = getArrayFromResponse(fieldsResponse, "customFields");
        setCrmCustomFields(customFieldsList);

        try {
          const fetchedUsers = await getAssignableUsers();
          setSystemUsers(fetchedUsers);
        } catch (error) {
          console.error("Failed to fetch app users", error);
        }

        const findField = (exactName: string, fallbackTerms: string[] = []) => {
          return (
            customFieldsList.find((field: any) => field.name?.trim().toLowerCase() === exactName) ||
            customFieldsList.find((field: any) => {
              const name = field.name?.trim().toLowerCase() || "";
              return fallbackTerms.some((term) => name.includes(term));
            })
          );
        };

        setAccountTypeOptions(getFieldOptions(findField("account type")));
        setPracticeAreaOptions(getFieldOptions(findField("practice area")));
        setLanguageOptions(getFieldOptions(findField("language")));
      } catch (error) {
        console.error("Failed to fetch custom fields", error);
      }
    };

    fetchFields();
  }, []);

  const handleEditContact = async (updatedData: ContactFormValues) => {
    if (!contact) return;

    const previousContact = contact;
    const selectedAssignedUser = systemUsers.find((user) => getUserId(user) === updatedData.attorneyAssigned);
    setContact({
      ...contact,
      ...updatedData,
      phone: formatPhoneNumber(updatedData.phone),
      assignedAttorney: selectedAssignedUser ? getUserName(selectedAssignedUser) : "Unassigned",
      assignedAttorneyId: selectedAssignedUser ? getUserId(selectedAssignedUser) : "",
    });

    try {
      const [firstName, ...rest] = updatedData.name.trim().split(" ");
      const payload: Record<string, any> = {
        firstName,
        lastName: rest.join(" "),
        email: updatedData.email,
        tags: [updatedData.type, updatedData.status].filter(Boolean),
      };

      if (updatedData.phone && updatedData.phone !== "N/A") payload.phone = formatPhoneNumber(updatedData.phone, "");
      if (updatedData.dob && updatedData.dob !== "N/A" && updatedData.dob.trim() !== "") {
        payload.dateOfBirth = updatedData.dob;
      }

      const getFieldId = (name: string) =>
        crmCustomFields.find((customField) => customField.name?.trim().toLowerCase() === name)?.id;
      const genderFieldId = getFieldId("gender");

      if (!genderFieldId && updatedData.gender && updatedData.gender !== "N/A") {
        const lowerGender = updatedData.gender.toLowerCase();
        if (["male", "female", "other"].includes(lowerGender)) payload.gender = lowerGender;
      }

      const caseTypeFieldId = getFieldId("practice area") || getFieldId("case type") || getFieldId("case");
      const accountTypeFieldId = getFieldId("account type");
      const languageFieldId = getFieldId("language");
      const customFields = [];

      if (caseTypeFieldId) customFields.push({ id: caseTypeFieldId, field_value: updatedData.caseType || "" });
      if (accountTypeFieldId) customFields.push({ id: accountTypeFieldId, field_value: updatedData.type || "" });
      if (languageFieldId) {
        customFields.push({
          id: languageFieldId,
          field_value: updatedData.language && updatedData.language !== "N/A" ? updatedData.language : "",
        });
      }
      if (genderFieldId) {
        customFields.push({
          id: genderFieldId,
          field_value: updatedData.gender && updatedData.gender !== "N/A" ? updatedData.gender : "",
        });
      }

      if (customFields.length > 0) payload.customFields = customFields;

      await updateContact(contact.id, payload);
      await saveContactAssignment(contact.id, selectedAssignedUser ? getUserId(selectedAssignedUser) : "");
      toast({
        title: "Contact Updated",
        description: `${updatedData.name}'s details have been saved.`,
      });
    } catch (error) {
      setContact(previousContact);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: getUserFriendlyErrorMessage(error, "Failed to save contact changes. Please try again."),
      });
      throw error;
    }
  };

  useEffect(() => {
    const fetchContact = async () => {
      if (!contactId) return;

      try {
        setLoading(true);
        const data: any = await apiClient(`/contacts/${encodeURIComponent(contactId)}`);
        const rawContact = data.contact || data.data?.contact || data.data || data;

        const context = await getAppLocationContext();
        const locRecordId = context.location?.id || locationRecordId;
        if (context.location?.id) setLocationRecordId(context.location.id);
        let rawAssignedAttorneyId = "";
        if (locRecordId) {
          const { data: assignment, error: assignmentError } = await supabase
            .from("contact_assignments")
            .select("assigned_user_id")
            .eq("location_id", locRecordId)
            .eq("ghl_contact_id", rawContact.id)
            .maybeSingle();

          if (assignmentError) {
            console.error("Failed to fetch contact assignment", assignmentError);
          } else {
            rawAssignedAttorneyId = assignment?.assigned_user_id || "";
          }
        }
        let assignedAttorneyId = "";
        let assignedUserName = "";
        if (rawAssignedAttorneyId) {
          try {
            const assignableUsers = systemUsers.length > 0 ? systemUsers : await getAssignableUsers();
            if (systemUsers.length === 0) setSystemUsers(assignableUsers);
            const assignedUser = assignableUsers.find((user) => getUserId(user) === rawAssignedAttorneyId);
            assignedAttorneyId = assignedUser ? getUserId(assignedUser) : "";
            assignedUserName = assignedUser ? getUserName(assignedUser) : "";
          } catch (error) {
            console.error("Failed to fetch assigned user details", error);
          }
        }

        const rawName = `${rawContact.firstName || ""} ${rawContact.lastName || ""}`.trim();
        const formattedName = rawName
          .split(" ")
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
        const tags = rawContact.tags || [];
        const accountTypeValue =
          getCustomFieldValue(rawContact, "account type") ||
          tags.find((tag: string) =>
            ["client", "attorney", "expert witness", "opposing counsel"].includes(tag.toLowerCase()),
          );
        const caseTypeValue =
          getCustomFieldValue(rawContact, "practice area") ||
          getCustomFieldValue(rawContact, "case type") ||
          getCustomFieldValue(rawContact, "case") ||
          tags.find(
            (tag: string) =>
              !["client", "attorney", "expert", "opposing", "active", "pending", "closed", "consultation"].includes(
                tag.toLowerCase(),
              ),
          );
        const assignedAttorneyValue = assignedUserName || "Unassigned";

        setContact({
          id: rawContact.id,
          name: formattedName || rawContact.email || "Unknown",
          email: rawContact.email || "N/A",
          phone: formatPhoneNumber(rawContact.phone),
          status: (() => {
            if (tags.some((tag: string) => tag.toLowerCase().includes("pending"))) return "Pending";
            if (tags.some((tag: string) => tag.toLowerCase().includes("closed"))) return "Closed";
            if (tags.some((tag: string) => tag.toLowerCase().includes("consultation"))) return "Consultation";
            return "Active";
          })(),
          type: Array.isArray(accountTypeValue) ? accountTypeValue.join(", ") : accountTypeValue || "Client",
          caseType: Array.isArray(caseTypeValue) ? caseTypeValue.join(", ") : caseTypeValue || "General",
          assignedAttorney: Array.isArray(assignedAttorneyValue)
            ? assignedAttorneyValue[0]
            : assignedAttorneyValue || "Unassigned",
          assignedAttorneyId,
          address:
            [
              rawContact.address1,
              [rawContact.city, `${rawContact.state || ""} ${rawContact.postalCode || ""}`.trim()]
                .filter(Boolean)
                .join(", "),
              rawContact.country === "US" ? "United States" : rawContact.country,
            ]
              .filter(Boolean)
              .join("\n") || "N/A",
          dob: rawContact.dateOfBirth ? new Date(rawContact.dateOfBirth).toISOString().split("T")[0] : "N/A",
          gender: rawContact.gender
            ? rawContact.gender.charAt(0).toUpperCase() + rawContact.gender.slice(1)
            : getCustomFieldValue(rawContact, "gender") || "N/A",
          language: getCustomFieldValue(rawContact, "language") || "English",
          notes: "No notes available.",
          lastContact: "Recently",
          avatarUrl:
            rawContact.avatarUrl ||
            rawContact.profilePhoto ||
            rawContact.profilePicture ||
            rawContact.photo ||
            rawContact.imageUrl,
        });
      } catch (error) {
        console.error("Failed to fetch contact", error);
        toast({
          variant: "destructive",
          title: "Contact Not Loaded",
          description: getUserFriendlyErrorMessage(error, "We couldn't load this contact. Please refresh and try again."),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchContact();
  }, [contactId]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="mx-auto w-full px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/40 bg-card py-16 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <UserX className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-foreground">Contact not found</h3>
          <p className="mb-6 max-w-md text-muted-foreground">
            The contact you are looking for might have been deleted or does not exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] w-full flex-col overflow-hidden px-4 pb-2 pt-2 sm:px-6">
      <div className="mb-5 shrink-0 border-b border-border pb-4">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
              <AvatarImage
                src={contact.avatarUrl}
                alt={`${getAvatarInitials({ fullName: contact.name, email: contact.email }, "C")} avatar`}
              />
              <AvatarFallback className="bg-blue-50 text-lg text-primary">
                {getAvatarInitials({ fullName: contact.name, email: contact.email }, "C")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="mr-1 text-2xl font-bold text-foreground">{contact.name}</h1>
                <Badge
                  variant="outline"
                  className="h-6 shrink-0 border-transparent bg-gray-100 px-3 font-semibold text-gray-900"
                >
                  {contact.type}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("h-6 shrink-0 border-transparent px-3", getStatusColor(contact.status))}
                >
                  {contact.status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex w-full gap-3 md:w-auto">
            <Button className="flex-1 md:flex-none">
              <Mail className="mr-2 h-4 w-4" /> Email
            </Button>
            <Button className="flex-1 border-0 bg-primary text-white hover:bg-primary/90 md:flex-none">
              <Phone className="mr-2 h-4 w-4" /> Call
            </Button>
            <Button
              className="flex-1 border-0 bg-primary text-white hover:bg-primary/90 md:flex-none"
              onClick={() => setIsEditModalOpen(true)}
            >
              Edit
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-2 grid flex-1 grid-cols-1 overflow-hidden border-b border-border lg:grid-cols-[25fr_45fr_30fr] lg:divide-x lg:divide-border">
        <div className="h-full overflow-y-auto pb-6 lg:pb-0 lg:pr-6">
          <div className="mb-2 border-b border-border pb-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Link to="/" className="text-muted-foreground transition-colors hover:text-foreground" title="Back to Directory">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              Contact Details
            </h2>
          </div>
          <Accordion type="multiple" defaultValue={["personal", "demographics"]} className="w-full">
            <AccordionItem value="personal">
              <AccordionTrigger>Personal Information</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Email</span>
                    <span className="col-span-2 break-all">
                      {contact.email !== "N/A" ? (
                        <a href={`mailto:${contact.email}`} className="text-[#2384CA] hover:underline">
                          {contact.email}
                        </a>
                      ) : (
                        contact.email
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Phone</span>
                    <span className="col-span-2">{contact.phone}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Address</span>
                    <span className="col-span-2 whitespace-pre-line">{contact.address}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="demographics">
              <AccordionTrigger>Demographics</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">DOB</span>
                    <span className="col-span-2">
                      {contact.dob !== "N/A" ? new Date(contact.dob).toLocaleDateString() : "N/A"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Gender</span>
                    <span className="col-span-2">{contact.gender}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="font-medium text-foreground/70">Language</span>
                    <span className="col-span-2">{contact.language}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="h-full overflow-y-auto py-6 lg:px-6 lg:py-0">
          <Tabs defaultValue="tasks" className="w-full">
            <div className="mb-4">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="tasks"
                  className="rounded-none border-b-2 border-border py-3 text-muted-foreground/70 data-[state=active]:border-[#2384CA] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Tasks
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="rounded-none border-b-2 border-border py-3 text-muted-foreground/70 data-[state=active]:border-[#2384CA] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Notes
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="rounded-none border-b-2 border-border py-3 text-muted-foreground/70 data-[state=active]:border-[#2384CA] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Activity
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="tasks" className="m-0">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="active-tasks">
                  <AccordionTrigger>Active Tasks (0)</AccordionTrigger>
                  <AccordionContent>
                    <div className="py-4 text-center text-sm text-muted-foreground">No active tasks found.</div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="completed-tasks">
                  <AccordionTrigger>Completed Tasks (0)</AccordionTrigger>
                  <AccordionContent>
                    <div className="py-4 text-center text-sm text-muted-foreground">No completed tasks found.</div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            <TabsContent value="notes" className="m-0">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="recent-notes">
                  <AccordionTrigger>Recent Notes</AccordionTrigger>
                  <AccordionContent>
                    <div className="py-4 text-center text-sm text-muted-foreground">No notes found.</div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            <TabsContent value="activity" className="m-0">
              <div className="py-8 text-center text-sm text-muted-foreground">No recent activity found.</div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="h-full overflow-y-auto py-6 lg:py-0 lg:pl-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground/70">Case Overview</h3>
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/10 bg-primary/5 p-4">
              <div className="mb-1 text-xs uppercase text-muted-foreground">Practice Area</div>
              <div className="text-sm font-semibold">{contact.caseType}</div>
            </div>
            <div className="rounded-lg border border-primary/10 bg-primary/5 p-4">
              <div className="mb-1 text-xs uppercase text-muted-foreground">Assigned Attorney</div>
              <div className="text-sm font-semibold">{contact.assignedAttorney}</div>
            </div>
            <div className="rounded-lg border border-primary/10 bg-primary/5 p-4">
              <div className="mb-1 text-xs uppercase text-muted-foreground">Last Contact</div>
              <div className="text-sm font-semibold">{contact.lastContact}</div>
            </div>
          </div>
        </div>
      </div>

      <EditContactDialog
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onEditContact={handleEditContact}
        contact={contact}
        accountTypeOptions={accountTypeOptions}
        practiceAreaOptions={practiceAreaOptions}
        languageOptions={languageOptions}
        systemUsers={systemUsers}
      />
    </div>
  );
}
