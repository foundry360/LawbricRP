import { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav className={cn("mx-auto flex w-full justify-center", className)} {...props} />;
}

export function PaginationContent({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("flex items-center gap-1", className)} {...props} />;
}

export function PaginationItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={className} {...props} />;
}

export function PaginationLink({
  className,
  isActive,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  isActive?: boolean;
  children: ReactNode;
}) {
  const hasCustomRounded = /\b(?:[a-z]+:)*rounded/.test(className ?? "");

  return (
    <a
      className={cn(
        "flex h-9 min-w-9 items-center justify-center px-3 text-sm hover:bg-primary/10 hover:text-primary",
        hasCustomRounded ? "" : "rounded-md",
        isActive && "bg-primary text-primary-foreground hover:bg-primary",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export function PaginationPrevious({ className, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <PaginationLink className={cn("gap-1", className)} {...props}>
      <ChevronLeft className="h-4 w-4" />
      {children ?? "Previous"}
    </PaginationLink>
  );
}

export function PaginationNext({ className, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <PaginationLink className={cn("gap-1", className)} {...props}>
      {children ?? "Next"}
      <ChevronRight className="h-4 w-4" />
    </PaginationLink>
  );
}
