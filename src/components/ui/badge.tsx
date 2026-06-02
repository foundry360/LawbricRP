import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "outline";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "default" && "bg-primary text-primary-foreground",
        variant === "outline" && "border border-border",
        className,
      )}
      {...props}
    />
  );
}
