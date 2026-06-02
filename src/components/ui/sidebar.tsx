import { cloneElement, createContext, isValidElement, ReactElement, ReactNode, useContext, useState } from "react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("Sidebar components must be used inside SidebarProvider");
  return value;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="flex min-h-screen w-full bg-background">{children}</div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  className,
  children,
}: {
  collapsible?: "icon";
  className?: string;
  children: ReactNode;
}) {
  const { collapsed } = useSidebar();
  return (
    <aside
      data-collapsible={collapsed ? "icon" : ""}
      className={cn(
        "group sticky top-0 h-screen shrink-0 bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-64",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("h-full overflow-y-auto group-data-[collapsible=icon]:overflow-hidden", className)}>{children}</div>;
}

export function SidebarFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("absolute bottom-0 left-0 right-0", className)}>{children}</div>;
}

export function SidebarGroup({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

export function SidebarGroupContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

export function SidebarGroupLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-2 text-xs font-semibold text-muted-foreground", className)}>{children}</div>;
}

export function SidebarMenu({ className, children }: { className?: string; children: ReactNode }) {
  return <ul className={cn("space-y-1 px-2", className)}>{children}</ul>;
}

export function SidebarMenuItem({ className, children }: { className?: string; children: ReactNode }) {
  return <li className={className}>{children}</li>;
}

export function SidebarMenuButton({
  asChild,
  isActive,
  className,
  children,
  ...props
}: {
  asChild?: boolean;
  isActive?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "flex w-full items-center gap-3 rounded-md px-3 text-sm transition-colors hover:bg-muted",
    isActive && "bg-muted font-medium",
    className,
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      className: cn(classes, child.props.className),
      ...props,
    });
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function SidebarTrigger() {
  const { collapsed, setCollapsed } = useSidebar();
  return (
    <button
      className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
      onClick={() => setCollapsed(!collapsed)}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <PanelLeft className="h-5 w-5" strokeWidth={1.5} />
    </button>
  );
}
