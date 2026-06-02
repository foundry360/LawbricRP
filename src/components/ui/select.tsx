import { createContext, ReactNode, useContext, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectContextValue = {
  value: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  setValue: (value: string) => void;
};

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelect() {
  const value = useContext(SelectContext);
  if (!value) throw new Error("Select components must be used inside Select");
  return value;
}

export function Select({
  children,
  defaultValue = "",
  value,
  onValueChange,
  required,
}: {
  children: ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const selectedValue = value ?? internalValue;

  const setValue = (nextValue: string) => {
    setInternalValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
  };

  return (
    <SelectContext.Provider value={{ value: selectedValue, open, setOpen, setValue }}>
      <div className="relative" data-required={required ? "true" : undefined}>{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className, children }: { className?: string; children: ReactNode }) {
  const { open, setOpen } = useSelect();
  const hasCustomRounded = /\b(?:[a-z]+:)*rounded/.test(className ?? "");

  return (
    <button
      type="button"
      className={cn(
        "flex h-10 w-full items-center justify-between border border-border bg-background px-3 py-2 text-left text-sm",
        hasCustomRounded ? "" : "rounded-md",
        className,
      )}
      onClick={() => setOpen(!open)}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = useSelect();
  return <span className={cn(!value && "text-muted-foreground")}>{value || placeholder}</span>;
}

export function SelectContent({
  className,
  children,
}: {
  className?: string;
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  const { open } = useSelect();
  if (!open) return null;

  return (
    <div className={cn("absolute z-[130] mt-1 w-full rounded-md border border-border bg-background p-1 shadow-lg", className)}>
      {children}
    </div>
  );
}

export function SelectItem({
  value,
  className,
  disabled,
  children,
}: {
  value: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { setValue } = useSelect();
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "block w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      onClick={() => setValue(value)}
    >
      {children}
    </button>
  );
}
