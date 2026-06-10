import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  FileText,
  Loader2,
  Mail,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UserLink } from "@/components/UserLink";
import { useToast } from "@/hooks/use-toast";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { formatPersonName } from "@/lib/names";
import { PRACTICE_AREAS } from "@/lib/practice-areas";
import {
  ACCOUNT_STATUS_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  PROFILE_STATUS_OPTIONS,
  arrayToCsv,
  csvToArray,
  getUserDocumentSignedUrl,
  loadUserProfile,
  saveCredentials,
  saveProfileCore,
  saveRolesAndResponsibilities,
  saveSystemAccess,
  saveUserSystemAccess,
  uploadUserDocument,
  type LoadedUserProfile,
  type Permission,
  type UserCredential,
  type UserDocument,
  type UserPermissionOverride,
  type UserProfile,
  type UserSystemAccess,
} from "@/lib/user-profile";
import { cn } from "@/lib/utils";

const TAB_TRIGGER_CLASS =
  "w-full !justify-start gap-2 whitespace-nowrap rounded-none border-l-2 border-transparent px-3 py-2 text-left text-muted-foreground/70 data-[state=active]:border-[#2384CA] data-[state=active]:bg-[#F0F6FF] data-[state=active]:text-foreground data-[state=active]:shadow-none";
const NO_REPORTS_TO_VALUE = "__none__";

function emptyCredential(): UserCredential {
  return {
    bar_number: "",
    jurisdiction: "",
    admission_date: "",
    certifications: [],
    licenses: [],
    malpractice_provider: "",
    malpractice_policy_number: "",
    malpractice_expiration: "",
    conflict_check_status: false,
    notes: "",
  };
}

function formatStatus(value?: string | null) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not set";
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getDisplayName(profile?: Partial<UserProfile> | null) {
  return formatPersonName(profile?.full_name || "") || profile?.email || "Unknown user";
}

export function UserProfilePage() {
  const { userId = "" } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState<LoadedUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<Partial<UserProfile>>({});
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedMatterRoleTypeIds, setSelectedMatterRoleTypeIds] = useState<string[]>([]);
  const [selectedPracticeAreas, setSelectedPracticeAreas] = useState<string[]>([]);
  const [reportsTo, setReportsTo] = useState(NO_REPORTS_TO_VALUE);
  const [teamDepartment, setTeamDepartment] = useState("");
  const [credentials, setCredentials] = useState<UserCredential[]>([]);
  const [documentType, setDocumentType] = useState<(typeof DOCUMENT_TYPE_OPTIONS)[number]>("Resume");
  const [documentExpiration, setDocumentExpiration] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [systemAccess, setSystemAccess] = useState<UserSystemAccess | null>(null);
  const [permissionOverrides, setPermissionOverrides] = useState<UserPermissionOverride[]>([]);

  const loadProfile = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const nextData = await loadUserProfile(userId);
      setData(nextData);
      setProfileForm(nextData.profile);
      setSelectedRoleIds(nextData.selectedRoleIds);
      setSelectedMatterRoleTypeIds(nextData.selectedMatterRoleTypeIds);
      setSelectedPracticeAreas(nextData.selectedPracticeAreas);
      setReportsTo(nextData.profile.reports_to || NO_REPORTS_TO_VALUE);
      setTeamDepartment(nextData.profile.team_department || "");
      setCredentials(nextData.credentials.length > 0 ? nextData.credentials : [emptyCredential()]);
      setSystemAccess(
        nextData.systemAccess ?? {
          user_id: userId,
          account_status: nextData.profile.is_active === false ? "suspended" : "active",
          mfa_enabled: false,
          last_login_at: null,
        },
      );
      setPermissionOverrides(nextData.permissionOverrides);
    } catch (error) {
      console.error("Failed to load user profile", error);
      toast({
        title: "User Profile Not Loaded",
        description: getUserFriendlyErrorMessage(error, "Could not load this user profile."),
        variant: "destructive",
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const directReports = useMemo(
    () => data?.allUsers.filter((user) => user.reports_to === userId) ?? [],
    [data?.allUsers, userId],
  );
  const selectedRoles = useMemo(
    () => data?.roles.filter((role) => selectedRoleIds.includes(role.id)) ?? [],
    [data?.roles, selectedRoleIds],
  );
  const derivedPermissionIds = useMemo(() => {
    const roleIds = new Set(selectedRoleIds);
    return new Set(
      (data?.rolePermissions ?? [])
        .filter((rolePermission) => roleIds.has(rolePermission.role_id))
        .map((rolePermission) => rolePermission.permission_id),
    );
  }, [data?.rolePermissions, selectedRoleIds]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <UserRound className="mb-4 h-12 w-12 text-muted-foreground" />
            <h1 className="text-xl font-semibold">User profile unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This user may not exist, or your role does not allow access.
            </p>
            <Link to="/users" className="mt-6 text-sm text-primary hover:underline">
              Back to User Management
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const profileName = getDisplayName(data.profile);
  const initials = getAvatarInitials(
    {
      fullName: profileName,
      email: data.profile.email || "",
    },
    "U",
  );

  const saveSection = async (section: string, action: () => Promise<void>, successMessage: string) => {
    setSavingSection(section);
    try {
      await action();
      toast({ title: successMessage });
      await loadProfile();
    } catch (error) {
      console.error(error);
      toast({
        title: "Changes Not Saved",
        description: getUserFriendlyErrorMessage(error, "Could not save changes. Please try again."),
        variant: "destructive",
      });
    } finally {
      setSavingSection(null);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-64px)] w-full max-w-[1400px] flex-col overflow-hidden px-4 py-6 sm:px-6">
      <Link to="/users" className="mb-4 inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        User Management
      </Link>

      <Card className="mb-6 shrink-0 overflow-hidden bg-[#F0F6FF]">
        <div className="border-b bg-[#F0F6FF] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-32 w-32">
                {data.profile.avatar_url ? <AvatarImage src={data.profile.avatar_url} alt={`${profileName} avatar`} /> : null}
                <AvatarFallback className="bg-primary/10 text-4xl font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">{profileName}</h1>
                  <Badge className="capitalize">{formatStatus(data.profile.status || "active")}</Badge>
                  {data.profile.is_active === false && (
                    <Badge variant="outline" className="border-transparent bg-red-100 text-red-800">
                      Deactivated
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.profile.title || "No title set"}
                  {data.profile.office_location ? ` · ${data.profile.office_location}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {data.profile.email || "No email"}
                  </span>
                  {selectedRoles.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-4 w-4" />
                      {selectedRoles.map((role) => role.name).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <AccessSummary access={data.access} />
          </div>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-[290px_minmax(0,1fr)]">
        <TabsList className="flex w-full shrink-0 flex-col items-stretch gap-1 rounded-lg bg-transparent p-0">
          <TabsTrigger value="profile" className={TAB_TRIGGER_CLASS}>
            <UserRound className="h-4 w-4 shrink-0" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="roles" className={TAB_TRIGGER_CLASS}>
            <Users className="h-4 w-4 shrink-0" />
            Roles & Responsibilities
          </TabsTrigger>
          <TabsTrigger value="credentials" className={TAB_TRIGGER_CLASS}>
            <BadgeCheck className="h-4 w-4 shrink-0" />
            Credentials & Compliance
          </TabsTrigger>
          <TabsTrigger value="system" className={TAB_TRIGGER_CLASS}>
            <ShieldCheck className="h-4 w-4 shrink-0" />
            System Access & Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="min-h-0 overflow-y-auto pr-1">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Full Name">
                  <Input
                    value={profileForm.full_name || ""}
                    disabled={!data.access.can_edit_core}
                    onChange={(event) => setProfileForm({ ...profileForm, full_name: event.target.value })}
                  />
                </Field>
                <Field label="Title">
                  <Input
                    placeholder="Partner, Associate, Paralegal"
                    value={profileForm.title || ""}
                    disabled={!data.access.can_edit_core}
                    onChange={(event) => setProfileForm({ ...profileForm, title: event.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <Input value={profileForm.email || ""} disabled />
                </Field>
                <Field label="Phone">
                  <Input
                    value={profileForm.phone || ""}
                    disabled={!data.access.can_edit_core}
                    onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })}
                  />
                </Field>
                <Field label="Office Location">
                  <Input
                    value={profileForm.office_location || ""}
                    disabled={!data.access.can_edit_core}
                    onChange={(event) => setProfileForm({ ...profileForm, office_location: event.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={profileForm.status || "active"}
                    onValueChange={(status) => {
                      if (!data.access.can_edit_core) return;
                      setProfileForm({ ...profileForm, status: status as UserProfile["status"] });
                    }}
                  >
                    <SelectTrigger className={cn(!data.access.can_edit_core && "pointer-events-none opacity-50")}>
                      <span>{formatStatus(profileForm.status || "active")}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {PROFILE_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {formatStatus(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Account Status">
                  <Select
                    value={systemAccess?.account_status || "active"}
                    onValueChange={(accountStatus) =>
                      data.access.can_edit_system_access &&
                      setSystemAccess({
                        ...(systemAccess as UserSystemAccess),
                        account_status: accountStatus as UserSystemAccess["account_status"],
                      })
                    }
                  >
                    <SelectTrigger className={cn(!data.access.can_edit_system_access && "pointer-events-none opacity-50")}>
                      <span>{formatStatus(systemAccess?.account_status || "active")}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {formatStatus(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Last Login Timestamp">
                  <Input value={formatDateTime(systemAccess?.last_login_at)} disabled />
                </Field>
              </div>
              <SaveBar
                disabled={!data.access.can_edit_core && !data.access.can_edit_system_access}
                saving={savingSection === "profile"}
                onCancel={() => {
                  setProfileForm(data.profile);
                  setSystemAccess(
                    data.systemAccess ?? {
                      user_id: userId,
                      account_status: data.profile.is_active === false ? "suspended" : "active",
                      mfa_enabled: false,
                      last_login_at: null,
                    },
                  );
                }}
                onSave={() =>
                  saveSection(
                    "profile",
                    async () => {
                      if (data.access.can_edit_core) await saveProfileCore(userId, profileForm);
                      if (data.access.can_edit_system_access && systemAccess) {
                        await saveUserSystemAccess(userId, systemAccess);
                      }
                    },
                    "Profile updated successfully.",
                  )
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="min-h-0 overflow-y-auto pr-1">
          {data.access.is_limited_view ? (
            <LimitedAccessNotice />
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card>
                <CardHeader>
                  <CardTitle>Roles & Responsibilities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Accordion type="multiple" defaultValue={["system-role", "matter-roles", "practice-areas", "team-reporting"]}>
                    <AccordionItem value="system-role">
                      <AccordionTrigger>System Role</AccordionTrigger>
                      <AccordionContent>
                        <CheckboxGroup
                          control="radio"
                          options={data.roles.map((role) => ({ id: role.id, label: role.name, description: role.description }))}
                          value={selectedRoleIds}
                          disabled={!data.access.can_edit_roles}
                          onChange={setSelectedRoleIds}
                        />
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="matter-roles">
                      <AccordionTrigger>Matter Roles</AccordionTrigger>
                      <AccordionContent>
                        <CheckboxGroup
                          control="radio"
                          options={data.matterRoleTypes.map((role) => ({ id: role.id, label: role.name }))}
                          value={selectedMatterRoleTypeIds}
                          disabled={!data.access.can_edit_roles}
                          onChange={setSelectedMatterRoleTypeIds}
                        />
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="practice-areas">
                      <AccordionTrigger>Practice Areas</AccordionTrigger>
                      <AccordionContent>
                        <CheckboxGroup
                          control="radio"
                          columns
                          options={PRACTICE_AREAS.map((practiceArea) => ({ id: practiceArea, label: practiceArea }))}
                          value={selectedPracticeAreas}
                          disabled={!data.access.can_edit_roles}
                          onChange={setSelectedPracticeAreas}
                        />
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="team-reporting" className="border-b-0">
                      <AccordionTrigger>Team & Reporting</AccordionTrigger>
                      <AccordionContent>
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Team / Department">
                            <Input
                              value={teamDepartment}
                              disabled={!data.access.can_edit_roles}
                              onChange={(event) => setTeamDepartment(event.target.value)}
                            />
                          </Field>
                          <Field label="Reports To">
                            <Select
                              value={reportsTo}
                              onValueChange={(value) => {
                                if (!data.access.can_edit_roles) return;
                                setReportsTo(value);
                              }}
                            >
                              <SelectTrigger className={cn(!data.access.can_edit_roles && "pointer-events-none opacity-50")}>
                                <span>
                                  {reportsTo === NO_REPORTS_TO_VALUE
                                    ? "-"
                                    : getDisplayName(data.allUsers.find((user) => user.id === reportsTo))}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_REPORTS_TO_VALUE}>-</SelectItem>
                                {data.allUsers
                                  .filter((user) => user.id !== userId)
                                  .map((user) => (
                                    <SelectItem key={user.id} value={user.id}>
                                      {getDisplayName(user)}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </Field>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <SaveBar
                    disabled={!data.access.can_edit_roles}
                    saving={savingSection === "roles"}
                    onCancel={() => {
                      setSelectedRoleIds(data.selectedRoleIds);
                      setSelectedMatterRoleTypeIds(data.selectedMatterRoleTypeIds);
                      setSelectedPracticeAreas(data.selectedPracticeAreas);
                      setReportsTo(data.profile.reports_to || NO_REPORTS_TO_VALUE);
                      setTeamDepartment(data.profile.team_department || "");
                    }}
                    onSave={() =>
                      saveSection(
                        "roles",
                        () =>
                          saveRolesAndResponsibilities({
                            userId,
                            roleIds: selectedRoleIds,
                            matterRoleTypeIds: selectedMatterRoleTypeIds,
                            practiceAreas: selectedPracticeAreas,
                            reportsTo: reportsTo === NO_REPORTS_TO_VALUE ? null : reportsTo,
                            teamDepartment,
                          }),
                        "Roles and responsibilities updated.",
                      )
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Reporting Line</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Detail label="Reports To">
                    {data.profile.reports_to ? (
                      <UserLink userId={data.profile.reports_to} user={data.allUsers.find((user) => user.id === data.profile.reports_to)} />
                    ) : (
                      "No manager"
                    )}
                  </Detail>
                  <div>
                    <p className="mb-2 text-sm font-medium">Direct Reports</p>
                    {directReports.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No direct reports.</p>
                    ) : (
                      <div className="space-y-2">
                        {directReports.map((user) => (
                          <div key={user.id} className="rounded-md border p-3 text-sm">
                            <UserLink userId={user.id} user={user} />
                            <p className="mt-1 text-xs text-muted-foreground">{user.title || user.email}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="credentials" className="min-h-0 overflow-y-auto pr-1">
          {data.access.is_limited_view ? (
            <LimitedAccessNotice />
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Credentials & Compliance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {credentials.map((credential, index) => (
                    <CredentialForm
                      key={credential.id || index}
                      credential={credential}
                      index={index}
                      disabled={!data.access.can_edit_credentials}
                      onChange={(nextCredential) =>
                        setCredentials(credentials.map((item, itemIndex) => (itemIndex === index ? nextCredential : item)))
                      }
                      onRemove={() => setCredentials(credentials.filter((_item, itemIndex) => itemIndex !== index))}
                    />
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!data.access.can_edit_credentials}
                      onClick={() => setCredentials([...credentials, emptyCredential()])}
                    >
                      Add Credential
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!data.access.can_edit_credentials || savingSection === "credentials"}
                      onClick={() => setCredentials(data.credentials.length > 0 ? data.credentials : [emptyCredential()])}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={!data.access.can_edit_credentials || savingSection === "credentials"}
                      onClick={() =>
                        saveSection(
                          "credentials",
                          () => saveCredentials(userId, credentials),
                          "Credentials updated.",
                        )
                      }
                    >
                      {savingSection === "credentials" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Credentials
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <Card>
                  <CardHeader>
                    <CardTitle>Documents</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_180px]">
                      <Field label="Document Type">
                        <Select value={documentType} onValueChange={(value) => setDocumentType(value as typeof documentType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DOCUMENT_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="File">
                        <Input
                          type="file"
                          disabled={!data.access.can_edit_documents}
                          onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                        />
                      </Field>
                      <Field label="Expiration">
                        <Input
                          type="date"
                          value={documentExpiration}
                          disabled={!data.access.can_edit_documents}
                          onChange={(event) => setDocumentExpiration(event.target.value)}
                        />
                      </Field>
                    </div>
                    <Button
                      type="button"
                      disabled={!data.access.can_edit_documents || !documentFile || savingSection === "document"}
                      onClick={() =>
                        saveSection(
                          "document",
                          () =>
                            uploadUserDocument({
                              userId,
                              file: documentFile as File,
                              documentType,
                              expiresAt: documentExpiration,
                            }),
                          "Document uploaded.",
                        ).then(() => {
                          setDocumentFile(null);
                          setDocumentExpiration("");
                        })
                      }
                    >
                      {savingSection === "document" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Upload Document
                    </Button>
                    <DocumentList documents={data.documents} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Expiration Alerts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.complianceAlerts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No upcoming compliance expirations.</p>
                    ) : (
                      data.complianceAlerts.map((alert) => (
                        <div key={`${alert.alert_type}-${alert.source_id}`} className="rounded-md border p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{alert.title || formatStatus(alert.alert_type)}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "border-transparent",
                                alert.status === "expired" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800",
                              )}
                            >
                              {formatStatus(alert.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">Expires {formatDate(alert.expires_at)}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="system" className="min-h-0 overflow-y-auto pr-1">
          {data.access.is_limited_view ? (
            <LimitedAccessNotice />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>System Access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Accordion type="multiple" defaultValue={["overrides"]}>
                  <AccordionItem value="overrides" className="px-4">
                    <AccordionTrigger>User Permission Overrides</AccordionTrigger>
                    <AccordionContent>
                      {!data.access.can_manage_permissions ? (
                        <p className="text-sm text-muted-foreground">You can view derived permissions, but cannot edit overrides.</p>
                      ) : (
                        <PermissionOverrides
                          permissions={data.permissions}
                          derivedPermissionIds={derivedPermissionIds}
                          overrides={permissionOverrides}
                          onChange={setPermissionOverrides}
                        />
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="sets" className="border-b-0 px-4">
                    <AccordionTrigger>Permission Sets</AccordionTrigger>
                    <AccordionContent>
                      <PermissionSets
                        selectedRoles={selectedRoles}
                        permissions={data.permissions}
                        rolePermissions={data.rolePermissions}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <SaveBar
                  disabled={!data.access.can_edit_system_access}
                  saving={savingSection === "system"}
                  hideDivider
                  onCancel={() => {
                    setSystemAccess(
                      data.systemAccess ?? {
                        user_id: userId,
                        account_status: data.profile.is_active === false ? "suspended" : "active",
                        mfa_enabled: false,
                        last_login_at: null,
                      },
                    );
                    setPermissionOverrides(data.permissionOverrides);
                  }}
                  onSave={() =>
                    saveSection(
                      "system",
                      () =>
                        saveSystemAccess({
                          userId,
                          systemAccess: systemAccess as UserSystemAccess,
                          permissionOverrides,
                        }),
                      "System access updated.",
                    )
                  }
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{label}</p>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

function SaveBar({
  disabled,
  saving,
  hideDivider,
  onCancel,
  onSave,
}: {
  disabled?: boolean;
  saving?: boolean;
  hideDivider?: boolean;
  onCancel?: () => void;
  onSave: () => void;
}) {
  return (
    <div className={cn("mt-6 flex justify-end gap-2 pt-4", !hideDivider && "border-t")}>
      {onCancel && (
        <Button type="button" variant="outline" disabled={disabled || saving} onClick={onCancel}>
          Cancel
        </Button>
      )}
      <Button type="button" disabled={disabled || saving} onClick={onSave}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Changes
      </Button>
    </div>
  );
}

function AccessSummary({ access }: { access: LoadedUserProfile["access"] }) {
  return (
    <div className="rounded-lg border bg-background/80 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <BadgeCheck className="h-4 w-4 text-primary" />
        Access
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant={access.is_limited_view ? "outline" : "default"}>
          {access.is_limited_view ? "Limited View" : "Standard Access"}
        </Badge>
        {access.can_edit_core && <Badge variant="outline">Can Edit Profile</Badge>}
        {access.can_edit_roles && <Badge variant="outline">Can Manage Roles</Badge>}
      </div>
    </div>
  );
}

function LimitedAccessNotice() {
  return (
    <Card>
      <CardContent className="flex min-h-[260px] items-center justify-center py-10 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold">Limited profile access</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your current role can view core identity fields only. Roles, credentials, documents, and permission details are protected by
            server-side policy.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckboxGroup({
  label,
  options,
  value,
  disabled,
  columns,
  control = "checkbox",
  onChange,
}: {
  label?: string;
  options: Array<{ id: string; label: string; description?: string | null }>;
  value: string[];
  disabled?: boolean;
  columns?: boolean;
  control?: "checkbox" | "radio";
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(value);

  return (
    <div>
      {label && <p className="mb-3 text-sm font-semibold">{label}</p>}
      <div className={cn("grid gap-2", columns ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2")}>
        {options.map((option) => (
          <label key={option.id} className="flex items-start gap-3 rounded-md border p-3 text-sm">
            {control === "radio" ? (
              <input
                type="radio"
                checked={selected.has(option.id)}
                disabled={disabled}
                onClick={(event) => {
                  if ((event.currentTarget as HTMLInputElement).checked && selected.has(option.id)) {
                    onChange(value.filter((item) => item !== option.id));
                  }
                }}
                onChange={(event) => {
                  if (event.target.checked && !selected.has(option.id)) onChange([...value, option.id]);
                }}
                className="mt-0.5 h-4 w-4 accent-[#0384C8]"
              />
            ) : (
              <Checkbox
                checked={selected.has(option.id)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  if (checked) onChange([...value, option.id]);
                  else onChange(value.filter((item) => item !== option.id));
                }}
              />
            )}
            <span>
              <span className="block font-medium">{option.label}</span>
              {option.description && <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function CredentialForm({
  credential,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  credential: UserCredential;
  index: number;
  disabled?: boolean;
  onChange: (credential: UserCredential) => void;
  onRemove: () => void;
}) {
  const update = (patch: Partial<UserCredential>) => onChange({ ...credential, ...patch });

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-semibold">Credential {index + 1}</h3>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Bar Number">
          <Input value={credential.bar_number || ""} disabled={disabled} onChange={(event) => update({ bar_number: event.target.value })} />
        </Field>
        <Field label="Jurisdiction">
          <Input value={credential.jurisdiction || ""} disabled={disabled} onChange={(event) => update({ jurisdiction: event.target.value })} />
        </Field>
        <Field label="Bar Admission Date">
          <Input
            type="date"
            value={credential.admission_date || ""}
            disabled={disabled}
            onChange={(event) => update({ admission_date: event.target.value })}
          />
        </Field>
        <Field label="Certifications / Licenses">
          <Input
            value={arrayToCsv([...(credential.certifications ?? []), ...(credential.licenses ?? [])])}
            disabled={disabled}
            placeholder="Comma-separated"
            onChange={(event) => update({ certifications: csvToArray(event.target.value), licenses: [] })}
          />
        </Field>
        <Field label="Malpractice Provider">
          <Input
            value={credential.malpractice_provider || ""}
            disabled={disabled}
            onChange={(event) => update({ malpractice_provider: event.target.value })}
          />
        </Field>
        <Field label="Policy #">
          <Input
            value={credential.malpractice_policy_number || ""}
            disabled={disabled}
            onChange={(event) => update({ malpractice_policy_number: event.target.value })}
          />
        </Field>
        <Field label="Malpractice Expiration">
          <Input
            type="date"
            value={credential.malpractice_expiration || ""}
            disabled={disabled}
            onChange={(event) => update({ malpractice_expiration: event.target.value })}
          />
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Checkbox
              checked={Boolean(credential.conflict_check_status)}
              disabled={disabled}
              onCheckedChange={(checked) => update({ conflict_check_status: checked })}
            />
            Conflict Check Cleared
          </label>
        </div>
      </div>
      <div className="mt-4">
        <Field label="Conflict Notes">
          <Textarea value={credential.notes || ""} disabled={disabled} onChange={(event) => update({ notes: event.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function DocumentList({ documents }: { documents: UserDocument[] }) {
  if (documents.length === 0) {
    return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No documents uploaded.</p>;
  }

  const openDocument = async (document: UserDocument) => {
    const signedUrl = await getUserDocumentSignedUrl(document);
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-2">
      {documents.map((document) => (
        <button
          key={document.id}
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left text-sm hover:bg-muted/50"
          onClick={() => void openDocument(document)}
        >
          <span className="flex min-w-0 items-center gap-3">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{document.file_name}</span>
              <span className="text-xs text-muted-foreground">
                {document.document_type}
                {document.expires_at ? ` · Expires ${formatDate(document.expires_at)}` : ""}
              </span>
            </span>
          </span>
          <span className="text-xs text-primary">Open</span>
        </button>
      ))}
    </div>
  );
}

function PermissionSets({
  selectedRoles,
  permissions,
  rolePermissions,
}: {
  selectedRoles: LoadedUserProfile["roles"];
  permissions: Permission[];
  rolePermissions: LoadedUserProfile["rolePermissions"];
}) {
  return (
    <div className="space-y-4">
      {selectedRoles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No roles assigned.</p>
      ) : (
        selectedRoles.map((role) => (
          <div key={role.id} className="border-b py-3 last:border-b-0 first:pt-0">
            <p className="font-medium">{role.name}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {rolePermissions
                .filter((rolePermission) => rolePermission.role_id === role.id)
                .map((rolePermission) => permissions.find((permission) => permission.id === rolePermission.permission_id))
                .filter(Boolean)
                .map((permission) => (
                  <Badge key={(permission as Permission).id} variant="outline">
                    {(permission as Permission).name}
                  </Badge>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PermissionOverrides({
  permissions,
  derivedPermissionIds,
  overrides,
  onChange,
}: {
  permissions: Permission[];
  derivedPermissionIds: Set<string>;
  overrides: UserPermissionOverride[];
  onChange: (overrides: UserPermissionOverride[]) => void;
}) {
  const groupedPermissions = permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    const category = permission.category || "general";
    groups[category] = [...(groups[category] ?? []), permission];
    return groups;
  }, {});

  const getOverride = (permissionId: string) => overrides.find((item) => item.permission_id === permissionId);
  const isPermissionEnabled = (permissionId: string) => {
    const override = getOverride(permissionId);
    if (override?.effect === "grant") return true;
    if (override?.effect === "deny") return false;
    return derivedPermissionIds.has(permissionId);
  };
  const setPermissionEnabled = (permissionId: string, enabled: boolean) => {
    const remaining = overrides.filter((override) => override.permission_id !== permissionId);
    onChange([...remaining, { user_id: "", permission_id: permissionId, effect: enabled ? "grant" : "deny" }]);
  };
  const setFeatureEnabled = (featurePermissions: Permission[], enabled: boolean) => {
    const permissionIds = new Set(featurePermissions.map((permission) => permission.id));
    const remaining = overrides.filter((override) => !permissionIds.has(override.permission_id));
    onChange([
      ...remaining,
      ...featurePermissions.map((permission) => ({
        user_id: "",
        permission_id: permission.id,
        effect: enabled ? "grant" as const : "deny" as const,
      })),
    ]);
  };

  return (
    <div className="space-y-4">
      {Object.entries(groupedPermissions).map(([featureKey, featurePermissions]) => {
        const featureEnabled = featurePermissions.some((permission) => isPermissionEnabled(permission.id));
        return (
          <div key={featureKey} className="border-b py-4 last:border-b-0 first:pt-0">
            <div className="mb-4 flex items-start gap-3">
              <PillToggle
                enabled={featureEnabled}
                onChange={(enabled) => setFeatureEnabled(featurePermissions, enabled)}
              />
              <div>
                <h4 className="font-medium">{getFeatureLabel(featureKey)}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Turn the feature on to enable all permissions, or tune individual permissions underneath.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {featurePermissions.map((permission) => (
                <div key={permission.id} className="rounded-md bg-muted/30 p-3 text-sm">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      checked={isPermissionEnabled(permission.id)}
                      onClick={() => setPermissionEnabled(permission.id, !isPermissionEnabled(permission.id))}
                      onChange={() => undefined}
                      className="mt-0.5 h-4 w-4 accent-[#0384C8]"
                    />
                  <div>
                    <p className="font-medium">{permission.name}</p>
                    {permission.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{permission.description}</p>
                    )}
                  </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PillToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 w-11 items-center rounded-full p-0.5 text-[10px] font-semibold transition-colors",
        enabled ? "justify-end bg-[#0384C8] text-primary-foreground" : "justify-start bg-muted text-muted-foreground",
      )}
      onClick={() => onChange(!enabled)}
    >
      <span className={cn("flex h-5 items-center justify-center rounded-full bg-background shadow-sm", enabled ? "px-1.5" : "w-5")}>
        {enabled ? "On" : ""}
      </span>
    </button>
  );
}

function getFeatureLabel(featureKey: string) {
  const labels: Record<string, string> = {
    users: "User Management",
    permissions: "Permissions",
    compliance: "Compliance",
    system: "System",
    matters: "Matters",
    tasks: "Tasks",
    contacts: "Contacts",
    leads: "Leads",
    dashboards: "Dashboards",
    documents: "Documents",
    billing: "Billing",
  };
  return labels[featureKey] || formatStatus(featureKey);
}
