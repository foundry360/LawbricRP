import {
  cloneElement,
  createContext,
  CSSProperties,
  isValidElement,
  MouseEvent,
  ReactElement,
  ReactNode,
  useContext,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type DropdownContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRect: DOMRect | null;
  setTriggerRect: (rect: DOMRect | null) => void;
};

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown() {
  const value = useContext(DropdownContext);
  if (!value) throw new Error("DropdownMenu components must be used inside DropdownMenu");
  return value;
}

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerRect, setTriggerRect }}>
      <div className="inline-block">{children}</div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuTrigger({
  children,
  asChild,
}: {
  children: ReactNode;
  asChild?: boolean;
}) {
  const { setOpen, open, setTriggerRect } = useDropdown();

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>;
    return cloneElement(child, {
      onClick: (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setTriggerRect(event.currentTarget.getBoundingClientRect());
        child.props.onClick?.(event);
        setOpen(!open);
      },
    });
  }

  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        setTriggerRect(event.currentTarget.getBoundingClientRect());
        setOpen(!open);
      }}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  className,
  children,
  align = "start",
  side = "bottom",
}: {
  className?: string;
  side?: "right" | "left" | "top" | "bottom";
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  const { open, triggerRect } = useDropdown();
  if (!open) return null;

  const style: CSSProperties | undefined = triggerRect
    ? {
        position: "fixed",
        top: side === "bottom" ? triggerRect.bottom + 4 : side === "top" ? undefined : triggerRect.top,
        bottom: side === "top" ? window.innerHeight - triggerRect.top + 4 : undefined,
        left:
          side === "right"
            ? triggerRect.right + 4
            : align === "end"
              ? undefined
              : align === "center"
                ? triggerRect.left + triggerRect.width / 2
                : triggerRect.left,
        right:
          side === "left"
            ? window.innerWidth - triggerRect.left + 4
            : align === "end"
              ? window.innerWidth - triggerRect.right
              : undefined,
        transform: align === "center" && side !== "left" && side !== "right" ? "translateX(-50%)" : undefined,
      }
    : undefined;

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={style}
      className={cn(
        "z-[200] rounded-md border border-border bg-background p-1 shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const { setOpen } = useDropdown();

  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
        setOpen(false);
      }}
      className={cn("flex cursor-pointer items-center rounded-sm px-2 py-2 hover:bg-primary/10 hover:text-primary", className)}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-border", className)} />;
}
