import { useEffect, useState } from "react";
import { Eye, Loader2, Mail, MoreVertical, Pencil, Phone, Search, Trash2 } from "lucide-react";
import { AddUserSheet } from "@/components/AddUserSheet";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getActiveGhlLocationId } from "@/lib/api";
import { getAvatarInitials } from "@/lib/avatar";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { getPasswordResetSkippedMessage, isPasswordResetCooldown } from "@/lib/password-reset";
import { formatPhoneNumber } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

async function getFunctionErrorMessage(error: unknown) {
  const functionError = error as { message?: string; context?: unknown; status?: number };

  if (functionError.context instanceof Response) {
    const response = functionError.context;
    const body = await response.clone().json().catch(async () => {
      const text = await response.clone().text().catch(() => "");
      return text ? { error: text } : null;
    });
    return body?.error || body?.message || body?.passwordResetSkippedReason || functionError.message;
  }

  if (functionError.context && typeof functionError.context === "object") {
    const context = functionError.context as Record<string, unknown>;
    return (
      (typeof context.error === "string" && context.error) ||
      (typeof context.message === "string" && context.message) ||
      (typeof context.passwordResetSkippedReason === "string" && context.passwordResetSkippedReason) ||
      functionError.message
    );
  }

  return functionError.message;
}

function getVisiblePageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

export function UserDirectory() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [locationId, setLocationId] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userToView, setUserToView] = useState<any>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<any>(null);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

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
        description: getUserFriendlyErrorMessage(error, "Could not load system users. Please refresh and try again."),
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
        const message = await getFunctionErrorMessage(error);
        const status = (error as { status?: number }).status;
        if (
          message?.toLowerCase().includes("rate limit") ||
          status === 429 ||
          message?.toLowerCase().includes("too many")
        ) {
          throw new Error("Too many reset emails were sent recently. Please wait a few minutes and try again.");
        }
        throw new Error(message || "Failed to send password reset email");
      }

      if (data?.error) throw new Error(data.error);

      const resetSkippedReason =
        typeof data?.passwordResetSkippedReason === "string" ? data.passwordResetSkippedReason : undefined;
      const resetWasSkipped = data?.passwordResetSent === false;

      toast({
        title: resetWasSkipped
          ? isPasswordResetCooldown(resetSkippedReason)
            ? "Reset email cooldown"
            : "Reset email not sent"
          : "Success",
        description: resetWasSkipped
          ? getPasswordResetSkippedMessage(resetSkippedReason)
          : "Password reset email sent.",
        variant: resetWasSkipped && !isPasswordResetCooldown(resetSkippedReason) ? "destructive" : "default",
      });
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Failed to send password reset email. Please try again.");
      console.error(error);
      toast({ variant: "destructive", title: "Reset Email Not Sent", description: message });
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
      const message = getUserFriendlyErrorMessage(error, "Failed to deactivate user. Please try again.");
      console.error(error);
      toast({ variant: "destructive", title: "User Not Deactivated", description: message });
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
      const message = getUserFriendlyErrorMessage(error, "Failed to reactivate user. Please try again.");
      console.error(error);
      toast({ variant: "destructive", title: "User Not Reactivated", description: message });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "delete",
          userId: userToDelete.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "User deleted successfully" });
      setUsers((current) => current.filter((user) => user.id !== userToDelete.id));
      setUserToDelete(null);
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, "Failed to delete user. Please try again.");
      console.error(error);
      toast({ variant: "destructive", title: "User Not Deleted", description: message });
    } finally {
      setIsDeletingUser(false);
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

  const getUserInitials = (user: any) => {
    return getAvatarInitials(
      {
        firstName: user.first_name || user.firstName,
        lastName: user.last_name || user.lastName,
        fullName: getDisplayName(user),
        email: user.email,
      },
      "U",
    );
  };

  const filteredUsers = users.filter((user) => {
    const searchString = `${getDisplayName(user)} ${user.email || ""}`.toLowerCase();
    return searchString.includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const safeTotalPages = Math.max(1, totalPages);
  const effectiveCurrentPage = Math.min(currentPage, safeTotalPages);
  const firstVisibleRow = filteredUsers.length === 0 ? 0 : (effectiveCurrentPage - 1) * itemsPerPage + 1;
  const lastVisibleRow = Math.min(effectiveCurrentPage * itemsPerPage, filteredUsers.length);
  const visiblePageItems = getVisiblePageItems(effectiveCurrentPage, safeTotalPages);
  const startIndex = (effectiveCurrentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-primary">User Management</h1>
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

      <div className="overflow-x-auto">
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
                        {(user.avatar_url || user.profilePhoto) && (
                          <AvatarImage src={user.avatar_url || user.profilePhoto} alt={`${getUserInitials(user)} avatar`} />
                        )}
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">
                          {getUserInitials(user)}
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
                      <span>{formatPhoneNumber(user.phone)}</span>
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
                        <DropdownMenuItem className="cursor-pointer" onClick={() => setUserToView(user)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer" onClick={() => setEditingUser(user)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer" onClick={() => setUserToDelete(user)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
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

      <div className="mt-4 flex flex-col gap-4 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground">
          Showing <span className="font-medium text-foreground">{firstVisibleRow}</span>
          {" - "}
          <span className="font-medium text-foreground">{lastVisibleRow}</span>
          {" of "}
          <span className="font-medium text-foreground">{filteredUsers.length}</span> users
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-between gap-2 text-muted-foreground sm:justify-start">
            <span>Rows per page</span>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[78px] rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="min-w-[78px]">
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="75">75</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Pagination className="mx-0 w-full justify-end sm:w-auto">
            <PaginationContent className="justify-end">
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setCurrentPage(Math.max(1, effectiveCurrentPage - 1));
                  }}
                  className={cn(
                    "h-9 rounded-full px-3",
                    effectiveCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer",
                  )}
                />
              </PaginationItem>
              {visiblePageItems.map((item, index) =>
                item === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${index}`} className="hidden px-1 text-muted-foreground sm:block">
                    ...
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item} className="hidden sm:block">
                    <PaginationLink
                      href="#"
                      isActive={effectiveCurrentPage === item}
                      onClick={(event) => {
                        event.preventDefault();
                        setCurrentPage(item);
                      }}
                      className="h-9 min-w-9 cursor-pointer rounded-full px-3"
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem className="sm:hidden">
                <span className="flex h-9 items-center rounded-full px-3 text-sm text-muted-foreground">
                  Page {effectiveCurrentPage} of {safeTotalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setCurrentPage(Math.min(safeTotalPages, effectiveCurrentPage + 1));
                  }}
                  className={cn(
                    "h-9 rounded-full px-3",
                    effectiveCurrentPage === safeTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer",
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>

      <EditUserSheet
        user={editingUser}
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
        onSuccess={fetchUsers}
      />

      <Dialog open={Boolean(userToView)} onOpenChange={(open) => !open && setUserToView(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>View user account details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <UserDetailRow label="Name" value={userToView ? getDisplayName(userToView) : ""} />
            <UserDetailRow label="Email" value={userToView?.email || "N/A"} />
            <UserDetailRow label="Phone" value={formatPhoneNumber(userToView?.phone)} />
            <UserDetailRow label="Role" value={userToView?.role === "admin" ? "Admin" : "User"} />
            <UserDetailRow label="Status" value={userToView?.is_active === false ? "Deactivated" : "Active"} />
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={Boolean(userToDelete)}
        onOpenChange={(open) => !open && setUserToDelete(null)}
        title="Permanently delete user?"
        recordType="user"
        recordName={userToDelete ? getDisplayName(userToDelete) : undefined}
        isDeleting={isDeletingUser}
        onConfirm={handleDeleteUser}
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

function UserDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
