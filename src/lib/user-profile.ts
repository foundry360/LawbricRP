import { supabase } from "@/lib/supabase";

export const PROFILE_STATUS_OPTIONS = ["active", "inactive", "contract"] as const;
export const ACCOUNT_STATUS_OPTIONS = ["active", "suspended", "locked"] as const;
export const DOCUMENT_TYPE_OPTIONS = ["Resume", "Bar Certificate", "Insurance Docs", "Other"] as const;

export type ProfileStatus = (typeof PROFILE_STATUS_OPTIONS)[number];
export type AccountStatus = (typeof ACCOUNT_STATUS_OPTIONS)[number];

export type UserProfile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  title?: string | null;
  status?: ProfileStatus | null;
  office_location?: string | null;
  reports_to?: string | null;
  team_department?: string | null;
  is_active?: boolean | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
};

export type Permission = {
  id: string;
  key: string;
  name: string;
  category?: string | null;
  description?: string | null;
};

export type RolePermission = {
  role_id: string;
  permission_id: string;
};

export type MatterRoleType = {
  id: string;
  key: string;
  name: string;
};

export type UserCredential = {
  id?: string;
  user_id?: string;
  bar_number?: string | null;
  jurisdiction?: string | null;
  admission_date?: string | null;
  certifications?: string[];
  licenses?: string[];
  malpractice_provider?: string | null;
  malpractice_policy_number?: string | null;
  malpractice_expiration?: string | null;
  conflict_check_status?: boolean;
  notes?: string | null;
};

export type UserDocument = {
  id: string;
  user_id: string;
  document_type: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  expires_at?: string | null;
  created_at?: string | null;
};

export type UserSystemAccess = {
  user_id: string;
  account_status: AccountStatus;
  mfa_enabled: boolean;
  last_login_at?: string | null;
  updated_at?: string | null;
};

export type UserPermissionOverride = {
  user_id: string;
  permission_id: string;
  effect: "grant" | "deny";
  reason?: string | null;
};

export type UserProfileAccess = {
  can_view: boolean;
  can_edit_core: boolean;
  can_edit_roles: boolean;
  can_edit_credentials: boolean;
  can_edit_documents: boolean;
  can_edit_system_access: boolean;
  can_manage_permissions: boolean;
  is_limited_view: boolean;
};

export type UserComplianceAlert = {
  alert_type: string;
  user_id: string;
  source_id: string;
  expires_at: string;
  title?: string | null;
  status: "expired" | "due_soon" | "upcoming";
};

export type LoadedUserProfile = {
  access: UserProfileAccess;
  profile: UserProfile;
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermission[];
  matterRoleTypes: MatterRoleType[];
  allUsers: UserProfile[];
  selectedRoleIds: string[];
  selectedMatterRoleTypeIds: string[];
  selectedPracticeAreas: string[];
  credentials: UserCredential[];
  documents: UserDocument[];
  systemAccess: UserSystemAccess | null;
  permissionOverrides: UserPermissionOverride[];
  complianceAlerts: UserComplianceAlert[];
};

const defaultAccess: UserProfileAccess = {
  can_view: false,
  can_edit_core: false,
  can_edit_roles: false,
  can_edit_credentials: false,
  can_edit_documents: false,
  can_edit_system_access: false,
  can_manage_permissions: false,
  is_limited_view: true,
};

function requireUserId(userId: string) {
  if (!userId) throw new Error("Missing user id");
}

function compactStrings(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

export function csvToArray(value: string) {
  return compactStrings(value.split(","));
}

export function arrayToCsv(values?: string[] | null) {
  return (values ?? []).join(", ");
}

export async function loadUserProfile(userId: string): Promise<LoadedUserProfile> {
  requireUserId(userId);

  const { data: accessRows, error: accessError } = await supabase.rpc("get_user_profile_access", {
    target_user_id: userId,
  });
  if (accessError) throw accessError;

  const access = (Array.isArray(accessRows) ? accessRows[0] : accessRows) as UserProfileAccess | undefined;
  if (!access?.can_view) {
    throw new Error("You do not have permission to view this user profile.");
  }

  const [
    profileResult,
    rolesResult,
    permissionsResult,
    rolePermissionsResult,
    matterRoleTypesResult,
    allUsersResult,
    userRolesResult,
    userMatterRolesResult,
    practiceAreasResult,
    credentialsResult,
    documentsResult,
    systemAccessResult,
    permissionOverridesResult,
    complianceAlertsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, phone, title, status, office_location, reports_to, team_department, is_active, avatar_url, created_at, updated_at",
      )
      .eq("id", userId)
      .single(),
    supabase.from("roles").select("id, key, name, description").order("name"),
    supabase.from("permissions").select("id, key, name, category, description").order("category").order("name"),
    supabase.from("role_permissions").select("role_id, permission_id"),
    supabase.from("matter_role_types").select("id, key, name").order("name"),
    supabase.from("profiles").select("id, email, full_name, title, status, avatar_url, reports_to").order("full_name"),
    supabase.from("user_roles").select("role_id").eq("user_id", userId),
    supabase.from("user_matter_roles").select("matter_role_type_id").eq("user_id", userId),
    supabase.from("user_practice_areas").select("practice_area").eq("user_id", userId),
    supabase.from("user_credentials").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("user_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("user_system_access").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_permissions").select("user_id, permission_id, effect, reason").eq("user_id", userId),
    supabase
      .from("user_compliance_expiration_alerts")
      .select("*")
      .eq("user_id", userId)
      .order("expires_at", { ascending: true }),
  ]);

  const results = [
    profileResult,
    rolesResult,
    permissionsResult,
    rolePermissionsResult,
    matterRoleTypesResult,
    allUsersResult,
    userRolesResult,
    userMatterRolesResult,
    practiceAreasResult,
    credentialsResult,
    documentsResult,
    systemAccessResult,
    permissionOverridesResult,
    complianceAlertsResult,
  ];
  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) throw failedResult.error;
  if (!profileResult.data) throw new Error("User profile not found.");

  return {
    access,
    profile: profileResult.data as UserProfile,
    roles: (rolesResult.data ?? []) as Role[],
    permissions: (permissionsResult.data ?? []) as Permission[],
    rolePermissions: (rolePermissionsResult.data ?? []) as RolePermission[],
    matterRoleTypes: (matterRoleTypesResult.data ?? []) as MatterRoleType[],
    allUsers: (allUsersResult.data ?? []) as UserProfile[],
    selectedRoleIds: (userRolesResult.data ?? []).map((item: any) => item.role_id),
    selectedMatterRoleTypeIds: (userMatterRolesResult.data ?? []).map((item: any) => item.matter_role_type_id),
    selectedPracticeAreas: (practiceAreasResult.data ?? []).map((item: any) => item.practice_area),
    credentials: (credentialsResult.data ?? []) as UserCredential[],
    documents: (documentsResult.data ?? []) as UserDocument[],
    systemAccess: (systemAccessResult.data as UserSystemAccess | null) ?? null,
    permissionOverrides: (permissionOverridesResult.data ?? []) as UserPermissionOverride[],
    complianceAlerts: (complianceAlertsResult.data ?? []) as UserComplianceAlert[],
  };
}

export async function saveProfileCore(userId: string, profile: Partial<UserProfile>) {
  requireUserId(userId);
  const fullName = profile.full_name?.trim();
  if (!fullName) throw new Error("Full name is required.");

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone: profile.phone?.trim() || null,
      title: profile.title?.trim() || null,
      status: profile.status || "active",
      office_location: profile.office_location?.trim() || null,
    })
    .eq("id", userId);

  if (error) throw error;
}

export async function saveRolesAndResponsibilities({
  userId,
  roleIds,
  matterRoleTypeIds,
  practiceAreas,
  reportsTo,
  teamDepartment,
}: {
  userId: string;
  roleIds: string[];
  matterRoleTypeIds: string[];
  practiceAreas: string[];
  reportsTo?: string | null;
  teamDepartment?: string | null;
}) {
  requireUserId(userId);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profileUpdate = await supabase
    .from("profiles")
    .update({
      reports_to: reportsTo || null,
      team_department: teamDepartment?.trim() || null,
    })
    .eq("id", userId);
  if (profileUpdate.error) throw profileUpdate.error;

  const roleDelete = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (roleDelete.error) throw roleDelete.error;
  if (roleIds.length > 0) {
    const roleInsert = await supabase.from("user_roles").insert(
      roleIds.map((roleId) => ({
        user_id: userId,
        role_id: roleId,
        assigned_by: user?.id ?? null,
      })),
    );
    if (roleInsert.error) throw roleInsert.error;
  }

  const matterRoleDelete = await supabase.from("user_matter_roles").delete().eq("user_id", userId);
  if (matterRoleDelete.error) throw matterRoleDelete.error;
  if (matterRoleTypeIds.length > 0) {
    const matterRoleInsert = await supabase.from("user_matter_roles").insert(
      matterRoleTypeIds.map((matterRoleTypeId) => ({
        user_id: userId,
        matter_role_type_id: matterRoleTypeId,
      })),
    );
    if (matterRoleInsert.error) throw matterRoleInsert.error;
  }

  const practiceAreaDelete = await supabase.from("user_practice_areas").delete().eq("user_id", userId);
  if (practiceAreaDelete.error) throw practiceAreaDelete.error;
  if (practiceAreas.length > 0) {
    const practiceAreaInsert = await supabase.from("user_practice_areas").insert(
      compactStrings(practiceAreas).map((practiceArea) => ({
        user_id: userId,
        practice_area: practiceArea,
      })),
    );
    if (practiceAreaInsert.error) throw practiceAreaInsert.error;
  }
}

export async function saveCredentials(userId: string, credentials: UserCredential[]) {
  requireUserId(userId);

  const normalizedCredentials = credentials
    .map((credential) => ({
      user_id: userId,
      bar_number: credential.bar_number?.trim() || null,
      jurisdiction: credential.jurisdiction?.trim() || null,
      admission_date: credential.admission_date || null,
      certifications: credential.certifications ?? [],
      licenses: credential.licenses ?? [],
      malpractice_provider: credential.malpractice_provider?.trim() || null,
      malpractice_policy_number: credential.malpractice_policy_number?.trim() || null,
      malpractice_expiration: credential.malpractice_expiration || null,
      conflict_check_status: Boolean(credential.conflict_check_status),
      notes: credential.notes?.trim() || null,
    }))
    .filter(
      (credential) =>
        credential.bar_number ||
        credential.jurisdiction ||
        credential.admission_date ||
        credential.certifications.length > 0 ||
        credential.licenses.length > 0 ||
        credential.malpractice_provider ||
        credential.malpractice_policy_number ||
        credential.malpractice_expiration ||
        credential.notes,
    );

  const deleteResult = await supabase.from("user_credentials").delete().eq("user_id", userId);
  if (deleteResult.error) throw deleteResult.error;
  if (normalizedCredentials.length === 0) return;

  const insertResult = await supabase.from("user_credentials").insert(normalizedCredentials);
  if (insertResult.error) throw insertResult.error;
}

export async function uploadUserDocument({
  userId,
  file,
  documentType,
  expiresAt,
}: {
  userId: string;
  file: File;
  documentType: string;
  expiresAt?: string | null;
}) {
  requireUserId(userId);
  if (!file) throw new Error("Choose a file to upload.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const storagePath = `${userId}/${Date.now()}-${safeFileName(file.name)}`;
  const uploadResult = await supabase.storage.from("user-documents").upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadResult.error) throw uploadResult.error;

  const insertResult = await supabase.from("user_documents").insert({
    user_id: userId,
    document_type: documentType,
    file_name: file.name,
    storage_bucket: "user-documents",
    storage_path: storagePath,
    mime_type: file.type || null,
    size_bytes: file.size,
    expires_at: expiresAt || null,
    uploaded_by: user?.id ?? null,
  });
  if (insertResult.error) throw insertResult.error;
}

export async function getUserDocumentSignedUrl(document: UserDocument) {
  const { data, error } = await supabase.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveSystemAccess({
  userId,
  systemAccess,
  permissionOverrides,
}: {
  userId: string;
  systemAccess: UserSystemAccess;
  permissionOverrides: UserPermissionOverride[];
}) {
  requireUserId(userId);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const systemResult = await supabase.from("user_system_access").upsert({
    user_id: userId,
    account_status: systemAccess.account_status,
    mfa_enabled: Boolean(systemAccess.mfa_enabled),
    last_login_at: systemAccess.last_login_at || null,
    updated_by: user?.id ?? null,
  });
  if (systemResult.error) throw systemResult.error;

  const deleteResult = await supabase.from("user_permissions").delete().eq("user_id", userId);
  if (deleteResult.error) throw deleteResult.error;

  const normalizedOverrides = permissionOverrides.filter((override) => override.effect === "grant" || override.effect === "deny");
  if (normalizedOverrides.length === 0) return;

  const insertResult = await supabase.from("user_permissions").insert(
    normalizedOverrides.map((override) => ({
      user_id: userId,
      permission_id: override.permission_id,
      effect: override.effect,
      reason: override.reason?.trim() || null,
      assigned_by: user?.id ?? null,
    })),
  );
  if (insertResult.error) throw insertResult.error;
}

export async function saveUserSystemAccess(userId: string, systemAccess: UserSystemAccess) {
  requireUserId(userId);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("user_system_access").upsert({
    user_id: userId,
    account_status: systemAccess.account_status,
    mfa_enabled: Boolean(systemAccess.mfa_enabled),
    last_login_at: systemAccess.last_login_at || null,
    updated_by: user?.id ?? null,
  });
  if (error) throw error;
}
