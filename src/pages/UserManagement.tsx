import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { UserDirectory } from "@/components/UserDirectory";
import { hasPermission } from "@/lib/api";

export default function UserManagement() {
  const [canViewUsers, setCanViewUsers] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      hasPermission("user_profiles.view_limited"),
      hasPermission("user_profiles.view_all"),
      hasPermission("user_profiles.view_attorneys"),
    ])
      .then((results) => setCanViewUsers(results.some(Boolean)))
      .catch(() => setCanViewUsers(false));
  }, []);

  if (canViewUsers === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canViewUsers) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center">
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="mt-2 text-muted-foreground">You do not have permission to view users.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <UserDirectory />
    </div>
  );
}
