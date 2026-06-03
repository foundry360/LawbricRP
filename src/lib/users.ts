import { supabase } from "@/lib/supabase";

export type AssignableUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  is_active?: boolean | null;
  role?: string | null;
};

export function getUserId(user: any) {
  return user?.id || user?._id || user?.userId || user?.ghl_user_id || "";
}

export function getUserName(user: any) {
  return (
    user?.name ||
    user?.full_name ||
    `${user?.firstName || user?.first_name || ""} ${user?.lastName || user?.last_name || ""}`.trim() ||
    user?.email ||
    getUserId(user)
  );
}

export async function getAssignableUsers() {
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
    .select("id, email, full_name, role, is_active")
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
