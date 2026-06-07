import { supabase } from "@/lib/supabase";
import { formatPersonName } from "@/lib/names";

export type AssignableUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  is_active?: boolean | null;
  role?: string | null;
  avatar_url?: string | null;
  profilePhoto?: string | null;
};

export function getUserId(user: any) {
  return user?.id || user?._id || user?.userId || user?.ghl_user_id || "";
}

export function getUserName(user: any) {
  const name =
    user?.name ||
    user?.full_name ||
    `${user?.firstName || user?.first_name || ""} ${user?.lastName || user?.last_name || ""}`.trim();

  return name ? formatPersonName(name) : user?.email || getUserId(user);
}

let cachedAssignableUsers: AssignableUser[] | null = null;
let inFlightAssignableUsers: Promise<AssignableUser[]> | null = null;

export function clearCachedAssignableUsers() {
  cachedAssignableUsers = null;
  inFlightAssignableUsers = null;
}

async function fetchAssignableUsers() {
  const { data: functionData, error: functionError } = await supabase.functions.invoke("assignable-users", {
    body: {},
  });

  if (!functionError && Array.isArray(functionData?.users)) {
    return functionData.users as AssignableUser[];
  }

  if (functionError) {
    console.error("Failed to load assignable users from Edge Function", functionError);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, avatar_url")
    .order("full_name", { ascending: true });

  if (error) throw error;

  const fallbackUsers = (data ?? [])
    .filter((user) => user.is_active !== false)
    .map((user) => ({
      ...user,
      name: user.full_name || user.email || user.id,
    })) as AssignableUser[];

  return fallbackUsers;
}

export async function getAssignableUsers(options: { forceRefresh?: boolean } = {}) {
  if (options.forceRefresh) clearCachedAssignableUsers();
  if (cachedAssignableUsers) return cachedAssignableUsers;
  if (inFlightAssignableUsers) return inFlightAssignableUsers;

  inFlightAssignableUsers = fetchAssignableUsers()
    .then((users) => {
      cachedAssignableUsers = users;
      return users;
    })
    .finally(() => {
      inFlightAssignableUsers = null;
    });

  return inFlightAssignableUsers;
}
