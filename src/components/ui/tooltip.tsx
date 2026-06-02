import { cloneElement, createContext, isValidElement, ReactElement, ReactNode, useContext, useState } from "react";
import { cn } from "@/lib/utils";

type TooltipContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltip() {
  const value = useContext(TooltipContext);
  if (!value) throw new Error("Tooltip components must be used inside Tooltip");
  return value;
}

export function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <span className="relative inline-block">{children}</span>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  const { setOpen } = useTooltip();

  const triggerProps = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  };

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<Record<string, unknown>>;
    return cloneElement(child, triggerProps);
  }

  return <span {...triggerProps}>{children}</span>;
}

export function TooltipContent({ className, children }: { className?: string; children: ReactNode }) {
  const { open } = useTooltip();
  if (!open) return null;
  return (
    <div className={cn("absolute left-0 top-full z-[160] mt-2 rounded-md bg-background p-2 text-sm shadow-lg", className)}>
      {children}
    </div>
  );
}
