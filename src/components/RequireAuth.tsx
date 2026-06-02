import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export function RequireAuth({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(Boolean(data.session));
      setIsLoading(false);
    });
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
