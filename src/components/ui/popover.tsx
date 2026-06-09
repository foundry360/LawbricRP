import {
  cloneElement,
  createContext,
  isValidElement,
  MouseEvent,
  ReactElement,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type PopoverContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopover() {
  const value = useContext(PopoverContext);
  if (!value) throw new Error("Popover components must be used inside Popover");
  return value;
}

export function Popover({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <div ref={containerRef} className="relative inline-flex items-center align-middle">{children}</div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  const { open, setOpen } = usePopover();

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>;
    return cloneElement(child, {
      onClick: (event: MouseEvent<HTMLElement>) => {
        child.props.onClick?.(event);
        setOpen(!open);
      },
    });
  }

  return <button onClick={() => setOpen(!open)}>{children}</button>;
}

export function PopoverContent({
  className,
  children,
}: {
  className?: string;
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  const { open } = usePopover();
  if (!open) return null;
  return (
    <div className={cn("absolute z-[140] mt-1 rounded-md border border-border bg-background shadow-lg", className)}>
      {children}
    </div>
  );
}
