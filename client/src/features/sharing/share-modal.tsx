import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, UserPlus, Trash2, Loader2, Search } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

interface AccessEntry {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
  };
}

interface ShareModalProps {
  type: "task" | "project";
  itemId: string;
  isOpen: boolean;
  onClose: () => void;
}

function getInitials(user?: { firstName?: string | null; lastName?: string | null; email?: string }): string {
  if (user?.firstName && user?.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  if (user?.email) {
    return user.email[0].toUpperCase();
  }
  return "?";
}

function getUserDisplayName(user?: { firstName?: string | null; lastName?: string | null; email?: string }): string {
  if (user?.firstName || user?.lastName) {
    return `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }
  return user?.email || "Unknown";
}

export function ShareModal({ type, itemId, isOpen, onClose }: ShareModalProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("editor");

  const accessQueryKey = type === "task"
    ? ["/api/tasks", itemId, "access"]
    : ["/api/projects", itemId, "access"];

  const { data: accessList = [], isLoading: accessLoading } = useQuery<AccessEntry[]>({
    queryKey: accessQueryKey,
    enabled: isOpen && !!itemId,
  });

  const { data: tenantUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/tenant/users"],
    enabled: isOpen,
  });

  const existingUserIds = new Set(accessList.map(a => a.userId));

  const filteredUsers = tenantUsers.filter(u => {
    if (existingUserIds.has(u.id)) return false;
    if (!searchQuery) return true;
    const name = `${u.firstName || ""} ${u.lastName || ""} ${u.email}`.toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const endpoint = type === "task"
        ? `/api/tasks/${itemId}/access`
        : `/api/projects/${itemId}/access`;
      return apiRequest("POST", endpoint, { userId, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessQueryKey });
      setSelectedUserId("");
      setSearchQuery("");
      toast({ title: "Access granted", description: "User has been invited" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to grant access",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const endpoint = type === "task"
        ? `/api/tasks/${itemId}/access/${userId}`
        : `/api/projects/${itemId}/access/${userId}`;
      return apiRequest("PATCH", endpoint, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessQueryKey });
      toast({ title: "Role updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update role",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const endpoint = type === "task"
        ? `/api/tasks/${itemId}/access/${userId}`
        : `/api/projects/${itemId}/access/${userId}`;
      return apiRequest("DELETE", endpoint);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessQueryKey });
      toast({ title: "Access removed" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove access",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleInvite = () => {
    if (!selectedUserId) return;
    inviteMutation.mutate({ userId: selectedUserId, role: selectedRole });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-share">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Share {type === "task" ? "Task" : "Project"}
          </DialogTitle>
          <DialogDescription>
            Manage who has access to this private {type}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Invite member</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedUserId("");
                  }}
                  className="pl-9"
                  data-testid="input-share-search"
                />
              </div>
            </div>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-[100px]" data-testid="select-share-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {searchQuery && filteredUsers.length > 0 && (
            <ScrollArea className="max-h-[150px]">
              <div className="space-y-1">
                {filteredUsers.slice(0, 10).map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`w-full flex items-center gap-2 p-2 rounded-md text-left text-sm hover-elevate ${selectedUserId === user.id ? "bg-accent" : ""}`}
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setSearchQuery(getUserDisplayName(user));
                    }}
                    data-testid={`button-select-user-${user.id}`}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{getUserDisplayName(user)}</div>
                      <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          {searchQuery && filteredUsers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">No users found</p>
          )}

          <Button
            onClick={handleInvite}
            disabled={!selectedUserId || inviteMutation.isPending}
            className="w-full"
            data-testid="button-invite-user"
          >
            {inviteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Invite
          </Button>

          <Separator />

          <div className="space-y-1.5">
            <h4 className="text-sm font-medium">People with access</h4>
            {accessLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : accessList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No one has been invited yet</p>
            ) : (
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-1">
                  {accessList.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 p-2 rounded-md"
                      data-testid={`access-entry-${entry.userId}`}
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={entry.user?.avatarUrl || undefined} />
                        <AvatarFallback className="text-xs">{getInitials(entry.user)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {getUserDisplayName(entry.user)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {entry.user?.email}
                        </div>
                      </div>
                      <Select
                        value={entry.role}
                        onValueChange={(role) => updateRoleMutation.mutate({ userId: entry.userId, role })}
                      >
                        <SelectTrigger className="w-[90px]" data-testid={`select-role-${entry.userId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(entry.userId)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-access-${entry.userId}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
