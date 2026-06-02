import { createContext, ReactNode, useContext, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AccordionContextValue = {
  type: "single" | "multiple";
  collapsible: boolean;
  openValues: string[];
  toggleValue: (value: string) => void;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);
const AccordionItemContext = createContext<string | null>(null);

function useAccordion() {
  const value = useContext(AccordionContext);
  if (!value) throw new Error("Accordion components must be used inside Accordion");
  return value;
}

function useAccordionItem() {
  const value = useContext(AccordionItemContext);
  if (!value) throw new Error("AccordionTrigger and AccordionContent must be used inside AccordionItem");
  return value;
}

export function Accordion({
  type,
  collapsible = false,
  defaultValue,
  className,
  children,
}: {
  type: "single" | "multiple";
  collapsible?: boolean;
  defaultValue?: string | string[];
  className?: string;
  children: ReactNode;
}) {
  const initialValues = Array.isArray(defaultValue)
    ? defaultValue
    : defaultValue
      ? [defaultValue]
      : [];
  const [openValues, setOpenValues] = useState<string[]>(initialValues);

  const toggleValue = (value: string) => {
    setOpenValues((current) => {
      const isOpen = current.includes(value);

      if (type === "multiple") {
        return isOpen ? current.filter((item) => item !== value) : [...current, value];
      }

      if (isOpen) return collapsible ? [] : current;
      return [value];
    });
  };

  return (
    <AccordionContext.Provider value={{ type, collapsible, openValues, toggleValue }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AccordionItemContext.Provider value={value}>
      <div className={cn("border-b border-border", className)}>{children}</div>
    </AccordionItemContext.Provider>
  );
}

export function AccordionTrigger({ className, children }: { className?: string; children: ReactNode }) {
  const accordion = useAccordion();
  const value = useAccordionItem();
  const isOpen = accordion.openValues.includes(value);

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between py-4 text-left text-sm font-medium transition hover:text-primary",
        className,
      )}
      onClick={() => accordion.toggleValue(value)}
      aria-expanded={isOpen}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
    </button>
  );
}

export function AccordionContent({ className, children }: { className?: string; children: ReactNode }) {
  const accordion = useAccordion();
  const value = useAccordionItem();

  if (!accordion.openValues.includes(value)) return null;

  return <div className={cn("pb-4 text-sm", className)}>{children}</div>;
}
