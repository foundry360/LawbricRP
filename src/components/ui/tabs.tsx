import { createContext, ReactNode, useContext, useState } from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const value = useContext(TabsContext);
  if (!value) throw new Error("Tabs components must be used inside Tabs");
  return value;
}

export function Tabs({
  value,
  defaultValue = "",
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const setValue = (nextValue: string) => {
    setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <TabsContext.Provider value={{ value: selectedValue, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("inline-flex items-center rounded-md bg-muted p-1", className)}>{children}</div>;
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const tabs = useTabs();
  const active = tabs.value === value;
  const hasCustomRounded = /\b(?:[a-z]+:)*rounded/.test(className ?? "");
  const hasCustomActiveState = className?.includes("data-[state=active]");

  return (
    <button
      type="button"
      data-state={active ? "active" : "inactive"}
      className={cn(
        "inline-flex items-center justify-center px-3 py-1.5 text-sm transition-colors",
        hasCustomRounded ? "" : "rounded-sm",
        active && !hasCustomActiveState && "bg-background text-foreground shadow-sm",
        className,
      )}
      onClick={() => tabs.setValue(value)}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const tabs = useTabs();

  if (tabs.value !== value) return null;

  return (
    <div data-state="active" className={className}>
      {children}
    </div>
  );
}
