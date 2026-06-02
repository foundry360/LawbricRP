import { createContext, ReactNode, useContext } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const DialogContext = createContext<{ onOpenChange: (open: boolean) => void } | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-[120]">
        <button className="absolute inset-0 bg-black/30" onClick={() => onOpenChange(false)} />
        {children}
      </div>
    </DialogContext.Provider>
  );
}

export function DialogContent({ className, children }: { className?: string; children: ReactNode }) {
  const context = useContext(DialogContext);
  const hasCustomMaxWidth = /\b(?:[a-z]+:)*max-w-/.test(className ?? "");

  return (
    <div
      className={cn(
        "absolute left-1/2 top-1/2 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-background p-6 shadow-xl",
        hasCustomMaxWidth ? "" : "max-w-lg",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute right-4 top-4 z-10 rounded-md bg-background/80 p-1 text-muted-foreground opacity-80 transition hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary"
        onClick={() => context?.onOpenChange(false)}
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mb-4 space-y-1", className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn("text-lg font-semibold", className)}>{children}</h2>;
}

export function DialogDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mt-4 flex justify-end gap-2", className)}>{children}</div>;
}
