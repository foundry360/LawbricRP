import { useEffect, useState } from "react";
import { Loader2, Mail, MoreVertical, Phone, Search } from "lucide-react";
import { AddUserSheet } from "@/components/AddUserSheet";
import { EditUserSheet } from "@/components/EditUserSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { getActiveGhlLocationId } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export function UserDirectory() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [locationId, setLocationId] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<any>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      await getActiveGhlLocationId();
      setLocationId(localStorage.getItem("supabaseLocationId") ?? "");

      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(profiles ?? []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: "Could not load system users.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleResetPassword = async () => {
    if (!userToResetPassword) return;

    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "sendPasswordReset",
          userId: userToResetPassword.id,
        },
      });

      if (error) {
        const status = (error as any).status;
        if (
          error.message?.toLowerCase().includes("rate limit") ||
          status === 429 ||
          error.message?.toLowerCase().includes("too many")
        ) {
          throw new Error("Too many reset emails were sent recently. Please wait a few minutes and try again.");
        }
        throw new Error(error.message || "Failed to send password reset email");
      }

      if (data?.error) throw new Error(data.error);

      toast({
        title: data?.passwordResetSent === false ? "User found" : "Success",
        description:
          data?.passwordResetSent === false
            ? data.passwordResetSkippedReason || "Password reset email was not sent."
            : "Password reset email sent.",
        variant: data?.passwordResetSent === false ? "destructive" : "default",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send password reset email";
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setUserToResetPassword(null);
    }
  };

  const handleDeactivate = async (targetUserId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "deactivate",
          userId: targetUserId,
          reason: "Deactivated from User Management",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "User deactivated successfully" });
      fetchUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to deactivate user";
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: message });
    }
  };

  const handleReactivate = async (targetUserId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "reactivate",
          userId: targetUserId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "User reactivated successfully" });
      fetchUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reactivate user";
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: message });
    }
  };

  const getDisplayName = (user: any) => {
    if (user.full_name) return user.full_name;
    if (user.fullName) return user.fullName;
    if (user.name) return user.name;
    const first = user.first_name || user.firstName || "";
    const last = user.last_name || user.lastName || "";
    if (first || last) return `${first} ${last}`.trim();
    if (user.email) return user.email.split("@")[0];
    return "Unknown";
  };

  const getInitial = (user: any) => {
    const name = getDisplayName(user);
    return name !== "Unknown" ? name[0].toUpperCase() : "U";
  };

  const filteredUsers = users.filter((user) => {
    const searchString = `${getDisplayName(user)} ${user.email || ""}`.toLowerCase();
    return searchString.includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <Badge className="rounded-full border-transparent bg-primary text-primary-foreground hover:bg-primary/90">
            {filteredUsers.length}
          </Badge>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="bg-background pl-9"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <AddUserSheet locationId={locationId} onSuccess={fetchUsers} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="h-12 px-4 py-4 font-medium">User</th>
              <th className="h-12 px-4 py-4 font-medium">Email</th>
              <th className="h-12 px-4 py-4 font-medium">Phone</th>
              <th className="h-12 px-4 py-4 font-medium">Role</th>
              <th className="h-12 px-4 py-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">Loading users...</p>
                </td>
              </tr>
            ) : paginatedUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="h-32 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            ) : (
              paginatedUsers.map((user) => (
                <tr key={user.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url || user.profilePhoto || ""} />
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">
                          {getInitial(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="capitalize text-[#2384CA] hover:underline">{getDisplayName(user)}</div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center text-sm text-foreground/70">
                      <Mail className="mr-2 h-3.5 w-3.5" />
                      <span className="max-w-[150px] truncate">{user.email || "N/A"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center text-sm text-foreground/70">
                      <Phone className="mr-2 h-3.5 w-3.5" />
                      <span>{user.phone || "N/A"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="border-transparent bg-gray-100 text-gray-800 capitalize">
                      {user.role === "admin" ? "Admin" : "User"}
                    </Badge>
                    {user.is_active === false && (
                      <Badge variant="outline" className="ml-2 border-transparent bg-red-100 text-red-800">
                        Deactivated
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="cursor-pointer" onClick={() => setEditingUser(user)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer" onClick={() => setUserToResetPassword(user)}>
                          Reset Password
                        </DropdownMenuItem>
                        {user.is_active !== false ? (
                          <DropdownMenuItem
                            className="cursor-pointer text-destructive"
                            onClick={() => handleDeactivate(user.id)}
                          >
                            Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="cursor-pointer text-green-600"
                            onClick={() => handleReactivate(user.id)}
                          >
                            Reactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination className="justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setCurrentPage((page) => Math.max(1, page - 1));
                }}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, index) => {
              let pageNum = index + 1;
              if (totalPages > 5 && currentPage > 3) {
                pageNum = currentPage - 2 + index;
                if (pageNum > totalPages) pageNum = totalPages - (4 - index);
              }
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    href="#"
                    isActive={currentPage === pageNum}
                    onClick={(event) => {
                      event.preventDefault();
                      setCurrentPage(pageNum);
                    }}
                    className="cursor-pointer"
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setCurrentPage((page) => Math.min(totalPages, page + 1));
                }}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <EditUserSheet
        user={editingUser}
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
        onSuccess={fetchUsers}
      />

      <AlertDialog
        open={Boolean(userToResetPassword)}
        onOpenChange={(open) => !open && setUserToResetPassword(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Send a password reset email to {userToResetPassword?.email}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword}>Send Email</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
