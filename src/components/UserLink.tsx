import { Link } from "react-router-dom";
import { getUserId, getUserName } from "@/lib/users";
import { cn } from "@/lib/utils";

type UserLinkProps = {
  userId?: string | null;
  user?: any;
  name?: string | null;
  email?: string | null;
  className?: string;
  stopPropagation?: boolean;
  fallback?: string;
};

export function UserLink({
  userId,
  user,
  name,
  email,
  className,
  stopPropagation,
  fallback = "Unassigned",
}: UserLinkProps) {
  const resolvedUserId = userId || getUserId(user);
  const label = name || (user ? getUserName(user) : "") || email || fallback;

  if (!resolvedUserId) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Link
      to={`/users/${resolvedUserId}`}
      className={cn("text-[#2384CA] hover:underline", className)}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
      }}
    >
      {label}
    </Link>
  );
}
