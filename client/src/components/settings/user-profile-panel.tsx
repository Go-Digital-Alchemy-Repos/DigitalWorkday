import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Pencil,
  Save,
  X,
  Key,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Link2,
  Settings,
  Activity,
} from "lucide-react";
import type { User, Invitation } from "@shared/schema";

interface UserProfilePanelProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  invitations?: Invitation[];
}

export function UserProfilePanel({ open, onClose, user, invitations }: UserProfilePanelProps) {
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<string>("");

  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mustChangeOnNextLogin, setMustChangeOnNextLogin] = useState(true);

  const [lastResetLinkUrl, setLastResetLinkUrl] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);

  useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName || "");
      setEditLastName(user.lastName || "");
      setEditEmail(user.email || "");
      setEditRole(user.role || "employee");
    }
  }, [user]);

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setShowResetPassword(false);
      setNewPassword("");
      setShowPassword(false);
      setMustChangeOnNextLogin(true);
      setLastResetLinkUrl(null);
      setConfirmDeleteUser(false);
    }
  }, [open]);

  const { data: activitySummary } = useQuery<{
    actions30d: number;
    tasksAssigned: number;
    comments: number;
  }>({
    queryKey: [`/api/users/${user?.id}/activity-summary`],
    enabled: open && !!user?.id,
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string; email?: string; role?: string }) => {
      return apiRequest("PATCH", `/api/users/${user!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User updated successfully" });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update user", description: error?.message || "An error occurred", variant: "destructive" });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      return apiRequest("PATCH", `/api/users/${user!.id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: user?.isActive ? "User deactivated" : "User activated" });
    },
    onError: () => {
      toast({ title: "Failed to update user status", variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/users/${user!.id}/reset-password`, {
        password: newPassword,
        mustChangeOnNextLogin,
      });
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setNewPassword("");
      setShowResetPassword(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: () => {
      toast({ title: "Failed to reset password", variant: "destructive" });
    },
  });

  const generateResetLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/users/${user!.id}/generate-reset-link`);
      return res.json();
    },
    onSuccess: async (data) => {
      setLastResetLinkUrl(data.resetUrl);
      try {
        await navigator.clipboard.writeText(data.resetUrl);
        toast({
          title: "Reset link generated and copied",
          description: `Link expires at ${new Date(data.expiresAt).toLocaleString()}`,
        });
      } catch {
        toast({ title: "Reset link generated", description: "Use the copy button to copy it." });
      }
    },
    onError: () => {
      toast({ title: "Failed to generate reset link", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/users/${user!.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted permanently" });
      onClose();
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete user", description: error?.message || "An error occurred", variant: "destructive" });
    },
  });

  const getFullName = (u: User) => {
    if (u.firstName || u.lastName) {
      return `${u.firstName || ""} ${u.lastName || ""}`.trim();
    }
    return u.name || u.email || "Unknown";
  };

  const getInitials = (u: User) => {
    const first = u.firstName || u.name?.split(" ")[0] || "";
    const last = u.lastName || u.name?.split(" ")[1] || "";
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || u.email?.charAt(0).toUpperCase() || "U";
  };

  const resetEditFields = () => {
    if (user) {
      setEditFirstName(user.firstName || "");
      setEditLastName(user.lastName || "");
      setEditEmail(user.email || "");
      setEditRole(user.role || "employee");
    }
  };

  const startEditing = () => {
    resetEditFields();
    setIsEditing(true);
  };

  const cancelEditing = () => {
    resetEditFields();
    setIsEditing(false);
  };

  const saveUserChanges = () => {
    if (!editEmail || !editEmail.includes("@")) {
      toast({ title: "Valid email is required", variant: "destructive" });
      return;
    }
    if (!editRole || !["admin", "employee", "client"].includes(editRole)) {
      toast({ title: "Please select a valid role", variant: "destructive" });
      return;
    }

    const updates: Record<string, string> = {};
    if (editFirstName !== (user?.firstName || "")) updates.firstName = editFirstName;
    if (editLastName !== (user?.lastName || "")) updates.lastName = editLastName;
    if (editEmail !== user?.email) updates.email = editEmail;
    if (editRole !== user?.role) updates.role = editRole;

    if (Object.keys(updates).length === 0) {
      toast({ title: "No changes to save" });
      setIsEditing(false);
      return;
    }

    updateUserMutation.mutate(updates);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const userInvitation = user ? invitations?.find((inv) => inv.email === user.email && inv.status === "pending") : null;
  const hasAcceptedInvite = user?.passwordHash !== null;

  const getInviteStatusLabel = () => {
    if (hasAcceptedInvite) return "Accepted";
    if (userInvitation) return "Pending";
    return "\u2014";
  };

  if (!user) return null;

  return (
    <>
      <FullScreenDrawer
        open={open}
        onOpenChange={(isOpen) => !isOpen && onClose()}
        title="User Details"
        description="View user information and activity"
        width="lg"
      >
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={getFullName(user)} />}
              <AvatarFallback className="text-lg">{getInitials(user)}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold" data-testid="text-profile-name">{getFullName(user)}</h3>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-email">{user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={user.isActive ? "default" : "secondary"} data-testid="badge-profile-status">
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
                <Badge variant="outline" data-testid="badge-profile-role">
                  {user.role || "employee"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Created</span>
              <p className="font-medium" data-testid="text-profile-created">
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "\u2014"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Updated</span>
              <p className="font-medium" data-testid="text-profile-updated">
                {user.updatedAt ? new Date(user.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "\u2014"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Invite Status</span>
              <p className="font-medium" data-testid="text-profile-invite-status">{getInviteStatusLabel()}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-semibold text-sm">Actions</h4>
            </div>
            <div className="space-y-2">
              {!isEditing ? (
                <button
                  className="w-full flex items-center gap-3 p-3 rounded-lg border text-left hover-elevate"
                  onClick={startEditing}
                  data-testid="button-profile-edit"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Edit User</span>
                </button>
              ) : (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-sm">Edit User Information</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={cancelEditing} data-testid="button-cancel-edit">
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveUserChanges} disabled={updateUserMutation.isPending} data-testid="button-save-edit">
                        {updateUserMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                        Save
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="edit-fn" className="text-xs">First Name</Label>
                        <Input id="edit-fn" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} data-testid="input-edit-first-name" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-ln" className="text-xs">Last Name</Label>
                        <Input id="edit-ln" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} data-testid="input-edit-last-name" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-em" className="text-xs">Email</Label>
                        <Input id="edit-em" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} data-testid="input-edit-email" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="edit-rl" className="text-xs">Role</Label>
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger id="edit-rl" data-testid="select-edit-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!showResetPassword ? (
                <button
                  className="w-full flex items-center gap-3 p-3 rounded-lg border text-left hover-elevate"
                  onClick={() => setShowResetPassword(true)}
                  data-testid="button-profile-change-password"
                >
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Change Password</span>
                </button>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Change Password</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="panel-new-pw" className="text-xs">New Password</Label>
                      <div className="relative">
                        <Input
                          id="panel-new-pw"
                          type={showPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 8 characters"
                          className="pr-10"
                          data-testid="input-panel-new-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={mustChangeOnNextLogin}
                        onCheckedChange={setMustChangeOnNextLogin}
                        id="panel-must-change"
                        data-testid="switch-panel-must-change"
                      />
                      <Label htmlFor="panel-must-change" className="text-xs">Require change on next login</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => resetPasswordMutation.mutate()}
                        disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
                        data-testid="button-panel-confirm-reset"
                      >
                        {resetPasswordMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Key className="h-4 w-4 mr-1" />}
                        Reset Password
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setShowResetPassword(false); setNewPassword(""); }} data-testid="button-panel-cancel-reset">
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <button
                className="w-full flex items-center gap-3 p-3 rounded-lg border text-left hover-elevate"
                onClick={() => generateResetLinkMutation.mutate()}
                disabled={generateResetLinkMutation.isPending}
                data-testid="button-profile-generate-reset-link"
              >
                {generateResetLinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">Generate Password Reset Link</span>
              </button>

              {lastResetLinkUrl && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700 dark:text-green-400">Reset link generated</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(lastResetLinkUrl)} data-testid="button-copy-reset-link">
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">{lastResetLinkUrl}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Expires in 24 hours</div>
                </div>
              )}

              <button
                className="w-full flex items-center gap-3 p-3 rounded-lg border text-left hover-elevate"
                onClick={() => toggleUserStatusMutation.mutate(!user.isActive)}
                disabled={toggleUserStatusMutation.isPending}
                data-testid="button-profile-toggle-status"
              >
                {toggleUserStatusMutation.isPending ? (
                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">{user.isActive ? "Deactivate User" : "Activate User"}</span>
              </button>

              {!user.isActive && (
                <button
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-destructive/30 text-left hover-elevate"
                  onClick={() => setConfirmDeleteUser(true)}
                  disabled={deleteUserMutation.isPending}
                  data-testid="button-profile-delete"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Delete User</span>
                </button>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-semibold text-sm">Activity Summary</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold" data-testid="text-activity-actions">{activitySummary?.actions30d ?? 0}</div>
                <div className="text-xs text-muted-foreground">Actions (30d)</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold" data-testid="text-activity-tasks">{activitySummary?.tasksAssigned ?? 0}</div>
                <div className="text-xs text-muted-foreground">Tasks Assigned</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <div className="text-2xl font-bold" data-testid="text-activity-comments">{activitySummary?.comments ?? 0}</div>
                <div className="text-xs text-muted-foreground">Comments</div>
              </div>
            </div>
          </div>
        </div>
      </FullScreenDrawer>

      <AlertDialog open={confirmDeleteUser} onOpenChange={setConfirmDeleteUser}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete User Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will permanently delete <strong>{getFullName(user)}</strong> ({user.email}) and all their associated data including:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                <li>Team memberships</li>
                <li>Project memberships</li>
                <li>Task assignments</li>
                <li>Time entries</li>
                <li>Comments and activity logs</li>
              </ul>
              <p className="font-medium text-destructive mt-3">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-user">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                deleteUserMutation.mutate();
                setConfirmDeleteUser(false);
              }}
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
