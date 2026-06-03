import { ImgHTMLAttributes, ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function Avatar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}>
      {children}
    </div>
  );
}

export function AvatarImage({ className, onError, src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) return null;

  return (
    <img
      className={cn("absolute inset-0 aspect-square h-full w-full object-cover", className)}
      src={src}
      onError={(event) => {
        setHasError(true);
        onError?.(event);
      }}
      {...props}
    />
  );
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
