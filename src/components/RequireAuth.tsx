import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

let cachedIsAuthed: boolean | null = null;

export function RequireAuth({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(cachedIsAuthed === null);
  const [isAuthed, setIsAuthed] = useState(cachedIsAuthed ?? false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;

      cachedIsAuthed = Boolean(data.session);
      setIsAuthed(cachedIsAuthed);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
