import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { UserDirectory } from "@/components/UserDirectory";
import { supabase } from "@/lib/supabase";

export default function UserManagement() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(() => {
      // App-specific admin enforcement still belongs in RLS and Edge Functions.
      setIsAdmin(true);
    });
  }, []);

  if (isAdmin === null) {
    return (
      <Layout>
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center">
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p className="mt-2 text-muted-foreground">Only administrators can access this page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
        <UserDirectory />
      </div>
    </Layout>
  );
}
