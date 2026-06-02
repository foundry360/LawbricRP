import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Command({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("overflow-hidden rounded-md bg-background", className)}>{children}</div>;
}

export function CommandInput({
  className,
  placeholder,
}: {
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      className={cn("h-10 w-full border-b border-border px-3 text-sm outline-none", className)}
      placeholder={placeholder}
    />
  );
}

export function CommandList({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("max-h-64 overflow-y-auto p-1", className)}>{children}</div>;
}

export function CommandEmpty({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-2 py-3 text-center text-sm text-muted-foreground", className)}>{children}</div>;
}

export function CommandGroup({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

export function CommandItem({
  className,
  value,
  onSelect,
  children,
}: {
  className?: string;
  value: string;
  onSelect?: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn("flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-muted", className)}
      onClick={() => onSelect?.(value)}
    >
      {children}
    </button>
  );
}
