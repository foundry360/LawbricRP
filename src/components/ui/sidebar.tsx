import { cloneElement, createContext, isValidElement, ReactElement, ReactNode, useContext, useState } from "react";
import { PanelLeft } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type SidebarMode = "expanded" | "collapsed" | "hover";

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
  setIsHovering: (hovering: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);
const SIDEBAR_MODE_STORAGE_KEY = "lawbric.sidebar.mode";

export function useSidebar() {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("Sidebar components must be used inside SidebarProvider");
  return value;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SidebarMode>(() => {
    if (typeof window === "undefined") return "expanded";
    const savedMode = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY);
    return savedMode === "collapsed" || savedMode === "hover" || savedMode === "expanded" ? savedMode : "expanded";
  });
  const [isHovering, setIsHovering] = useState(false);
  const collapsed = mode === "collapsed" || (mode === "hover" && !isHovering);
  const setMode = (nextMode: SidebarMode) => {
    setModeState(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, nextMode);
    }
  };
  const setCollapsed = (nextCollapsed: boolean) => {
    setMode(nextCollapsed ? "collapsed" : "expanded");
  };

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mode, setMode, setIsHovering }}>
      <div className="flex min-h-screen w-full bg-background">
        {children}
      </div>
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
  const { collapsed, mode, setIsHovering } = useSidebar();
  return (
    <aside
      data-collapsible={collapsed ? "icon" : ""}
      onMouseEnter={() => mode === "hover" && setIsHovering(true)}
      onMouseLeave={() => mode === "hover" && setIsHovering(false)}
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
    "flex min-w-0 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-md px-3 text-sm transition-colors hover:bg-primary/10 hover:text-primary",
    isActive && "bg-primary/15 font-medium text-primary",
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
  const { mode, setMode } = useSidebar();
  const options: Array<{ value: SidebarMode; label: string }> = [
    { value: "expanded", label: "Expanded" },
    { value: "collapsed", label: "Collapsed" },
    { value: "hover", label: "Expand on hover" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
          title="Sidebar display"
        >
          <PanelLeft className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-44 !border-[#1E293B] !bg-[#0F1729] text-xs !text-white">
        <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
          Sidebar Controls
        </div>
        <div className="mb-1 h-px bg-white/10" />
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-white hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white"
            onClick={() => setMode(option.value)}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                mode === option.value ? "bg-green-500" : "bg-transparent",
              )}
            />
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
