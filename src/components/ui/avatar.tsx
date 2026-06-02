import { ImgHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Avatar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}>
      {children}
    </div>
  );
}

export function AvatarImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img className="aspect-square h-full w-full object-cover" {...props} />;
}

export function AvatarFallback({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center rounded-full", className)}>
      {children}
    </div>
  );
}
