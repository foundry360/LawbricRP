import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Alert({
  className,
  variant = "default",
  children,
}: {
  className?: string;
  variant?: "default" | "destructive";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border p-3 text-sm",
        variant === "destructive" && "border-destructive/40 text-destructive",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AlertDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}
