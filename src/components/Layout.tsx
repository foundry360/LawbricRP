import { ReactNode, useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Bell,
  Briefcase,
  Calendar,
  CheckSquare,
  CreditCard,
  DollarSign,
  FileText,
  Info,
  LayoutGrid,
  LogOut,
  Maximize,
  Minimize,
  Plus,
  Scale,
  Settings,
  Target,
  UserCog,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { getAppLocationContext, type AppLocationContext } from "@/lib/api";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarInitials } from "@/lib/avatar";
import { formatDistanceToNow } from "date-fns";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at?: string;
  location_id?: string;
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userAvatar, setUserAvatar] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userFirstName, setUserFirstName] = useState("");
  const [userLastName, setUserLastName] = useState("");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [appContext, setAppContext] = useState<AppLocationContext | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const setUserProfile = (user?: { email?: string; user_metadata?: Record<string, unknown> } | null) => {
      const metadata = user?.user_metadata ?? {};
      setUserAvatar(typeof metadata.avatar_url === "string" ? metadata.avatar_url.trim() : "");
      setUserEmail(user?.email || "");
      setUserFirstName(typeof metadata.first_name === "string" ? metadata.first_name : "");
      setUserLastName(typeof metadata.last_name === "string" ? metadata.last_name : "");
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserProfile(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserProfile(session?.user);
    });

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    const initializeApp = async () => {
      try {
        const context = await getAppLocationContext();
        setAppContext(context);

        if (context.location?.id) {
          localStorage.setItem("supabaseLocationId", context.location.id);
          localStorage.setItem("locationId", context.location.ghlLocationId);
        }

        const locationId = context.location?.ghlLocationId;
        let query = supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (locationId) {
          query = query.eq("location_id", locationId);
        }
        const { data } = await query;
        if (data) setNotifications(data as NotificationRow[]);
      } catch (error) {
        console.error("Initialization error", error);
      } finally {
        setIsInitializing(false);
      }
    };
    initializeApp();

    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const locationId = localStorage.getItem("locationId");
          const notification = payload.new as NotificationRow;
          if (!locationId || notification.location_id === locationId) {
            setNotifications((prev) => [notification, ...prev]);
          }
        },
      )
      .subscribe();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;
  const userInitials = getAvatarInitials({
    firstName: userFirstName,
    lastName: userLastName,
    email: userEmail,
  });

  const markAllAsRead = async () => {
    const locationId = localStorage.getItem("locationId");
    if (!locationId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("location_id", locationId)
      .eq("is_read", false);
    setNotifications(notifications.map((notification) => ({ ...notification, is_read: true })));
  };

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(
      notifications.map((notification) =>
        notification.id === id ? { ...notification, is_read: true } : notification,
      ),
    );
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(console.error);
    } else if (document.exitFullscreen) {
      await document.exitFullscreen();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("locationId");
    localStorage.removeItem("supabaseLocationId");
    localStorage.removeItem("mock_auth");
    navigate("/login");
  };

  return (
    <SidebarProvider>
      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between border-b bg-header px-4 text-header-foreground lg:px-6">
        <div className="flex items-center gap-2">
          <img
            src="https://vibe.filesafe.space/1780031277244837711/attachments/2a75f7ed-1a85-412c-99dd-6eda46271a66.png"
            alt="Lawbric Logo"
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
                title={isFullscreen ? "Exit Full Screen" : "Full Screen"}
              >
                {isFullscreen ? (
                  <Minimize size={20} strokeWidth={1.5} />
                ) : (
                  <Maximize size={20} strokeWidth={1.5} />
                )}
              </Button>

              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
                    title="Notifications"
                  >
                    <Bell size={20} strokeWidth={1.5} />
                    {unreadCount > 0 && (
                      <span className="absolute right-[10px] top-[10px] h-2 w-2 rounded-full border border-header-background bg-red-500" />
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="z-[100] flex w-full flex-col p-0 sm:w-[400px]">
                  <SheetHeader className="mt-4 border-b px-4 py-3 text-left">
                    <div className="flex items-center justify-between">
                      <SheetTitle className="text-sm font-semibold">
                        Notifications {unreadCount > 0 && `(${unreadCount})`}
                      </SheetTitle>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                  </SheetHeader>
                  <div className="flex flex-1 flex-col overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
                        <Bell className="mb-2 h-8 w-8 opacity-20" />
                        <p className="text-sm">No new notifications</p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification.id}
                          onClick={() => !notification.is_read && markAsRead(notification.id)}
                          className={`border-b px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                            notification.is_read ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                notification.is_read ? "bg-transparent" : "bg-red-500"
                              }`}
                            />
                            <div>
                              <p className="mb-1 text-sm font-medium leading-none">{notification.title}</p>
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {notification.message}
                              </p>
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {notification.created_at
                                  ? formatDistanceToNow(new Date(notification.created_at), {
                                      addSuffix: true,
                                    })
                                  : "Just now"}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="mt-auto border-t bg-muted/20 p-2 text-center">
                    <Button variant="ghost" className="h-8 w-full text-xs">
                      View all notifications
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSettingsOpen(true)}
                className="text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
                title="Settings"
              >
                <Settings size={20} strokeWidth={1.5} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-header-foreground hover:bg-header-foreground/10 hover:text-header-foreground"
                title="Log Out"
              >
                <LogOut size={20} strokeWidth={1.5} />
              </Button>
            </div>
            {userEmail && <span className="text-sm font-medium">{userEmail}</span>}
            <Avatar className="h-8 w-8">
              {userAvatar ? <AvatarImage src={userAvatar} alt={`${userInitials} avatar`} /> : null}
              <AvatarFallback className="bg-secondary text-sm font-bold text-secondary-foreground">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <Sidebar collapsible="icon" className="z-40 border-r pt-16">
        <SidebarContent>
          <SidebarGroup className="pt-4">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0">
                <SidebarMenuItem className="pb-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton className="h-10 justify-start font-medium hover:bg-transparent focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Plus className="h-5 w-5" strokeWidth={1.5} />
                        </div>
                        <span className="text-[13px] group-data-[collapsible=icon]:hidden">
                          Quick Add
                        </span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-48 text-[13px]">
                      <DropdownMenuItem className="text-[13px]">
                        <Users className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        <span>Contact</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-[13px]">
                        <Briefcase className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        <span>Cases</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-[13px]">
                        <Scale className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        <span>Lead</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
                <div className="mx-4 mb-2 mt-6 h-px bg-border group-data-[collapsible=icon]:mx-2" />
                <NavItem icon={LayoutGrid} label="Dashboard" to="/dashboard" active={location.pathname === "/dashboard"} />
                <NavItem icon={Users} label="Contacts" to="/" active={location.pathname === "/" || location.pathname.startsWith("/contact")} />
                <NavItem icon={Briefcase} label="Cases" to="/cases" active={location.pathname === "/cases"} />
                <NavItem icon={Calendar} label="Calendar" to="/calendar" active={location.pathname === "/calendar"} />
                <NavItem icon={CheckSquare} label="Tasks" to="/tasks" active={location.pathname === "/tasks"} />
                <NavItem icon={UserCog} label="User Management" to="/users" active={location.pathname === "/users"} />
                <div className="mx-4 my-2 h-px bg-border group-data-[collapsible=icon]:mx-2" />
                <NavItem icon={Target} label="Leads" to="/leads" active={location.pathname === "/leads"} />
                <NavItem icon={CreditCard} label="Billing" to="/billing" active={location.pathname === "/billing"} />
                <NavItem icon={FileText} label="Documents" to="/documents" active={location.pathname === "/documents"} />
                <NavItem icon={DollarSign} label="Payments" to="/payments" active={location.pathname === "/payments"} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t p-4">
          <SidebarTrigger />
        </SidebarFooter>
      </Sidebar>

      <main className="min-w-0 flex-1 overflow-auto pt-16">
        {isInitializing ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : !appContext?.configured ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <Info className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-semibold">Location Not Configured</h2>
            <p className="max-w-md text-muted-foreground">
              {appContext?.userRole === "admin"
                ? "Please complete the Account Activation in Settings to start using the application."
                : "Your account is not assigned to a location. Please contact your administrator."}
            </p>
            {appContext?.userRole === "admin" && (
              <Button onClick={() => setIsSettingsOpen(true)} className="mt-4">
                Open Settings
              </Button>
            )}
          </div>
        ) : (
          children
        )}
      </main>

      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </SidebarProvider>
  );
}

function NavItem({
  icon: Icon,
  label,
  to,
  active,
}: {
  icon: typeof Users;
  label: string;
  to: string;
  active: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} className="h-10">
        <Link to={to}>
          <Icon className="!h-5 !w-5" strokeWidth={1.5} />
          <span className="text-[13px] group-data-[collapsible=icon]:hidden">{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
