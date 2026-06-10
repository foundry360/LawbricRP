import { cloneElement, createContext, isValidElement, ReactElement, ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

type SheetContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SheetContext = createContext<SheetContextValue | null>(null);
const SheetContentContext = createContext<{ hasInsetPadding: boolean } | null>(null);

function useSheet() {
  const value = useContext(SheetContext);
  if (!value) throw new Error("Sheet components must be used inside Sheet");
  return value;
}

export function Sheet({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return <SheetContext.Provider value={{ open, setOpen }}>{children}</SheetContext.Provider>;
}

export function SheetTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  const { setOpen } = useSheet();

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ onClick?: () => void }>;
    return cloneElement(child, {
      onClick: () => {
        child.props.onClick?.();
        setOpen(true);
      },
    });
  }

  return <button onClick={() => setOpen(true)}>{children}</button>;
}

export function SheetContent({
  className,
  side = "right",
  children,
}: {
  className?: string;
  side?: "right" | "left";
  children: ReactNode;
}) {
  const { open, setOpen } = useSheet();
  if (!open || typeof document === "undefined") return null;
  const hasInsetPadding = !className?.split(/\s+/).includes("p-0");

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/30"
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "absolute top-0 h-full bg-background shadow-xl",
          side === "right" ? "right-0" : "left-0",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Close"
          className="absolute right-4 top-4 z-10 rounded-md bg-background/80 p-1 text-muted-foreground opacity-80 transition hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
        <SheetContentContext.Provider value={{ hasInsetPadding }}>
          {children}
        </SheetContentContext.Provider>
      </aside>
    </div>,
    document.body,
  );
}

export function SheetHeader({ className, children }: { className?: string; children: ReactNode }) {
  const contentContext = useContext(SheetContentContext);
  return (
    <div
      className={cn(
        "bg-[#F0F6FF] px-6 py-4",
        contentContext?.hasInsetPadding !== false && "-mx-6 -mt-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SheetTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={className}>{children}</h2>;
}

export function SheetDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function SheetFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "sticky -bottom-6 z-20 -mx-6 -mb-6 mt-6 flex min-h-[80px] justify-end gap-2 border-t bg-background px-6 pb-6 pt-4 shadow-[0_-12px_24px_-20px_rgba(15,23,42,0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
