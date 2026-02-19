import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Loader2,
  Check,
  X,
  Mail,
  CheckCircle,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  Copy,
  UserPlus,
  Send,
  Upload,
  FileSpreadsheet,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Settings,
} from "lucide-react";
import { TenantUserDrawer } from "../tenant-user-drawer";
import { ProvisionUserDrawer } from "../provision-user-drawer";
import { FixTenantIdsCard } from "./shared-components";
import type { TenantWithDetails, TenantUser, TenantInvitation } from "./types";

interface TenantDrawerUsersProps {
  activeTenant: TenantWithDetails;
  open: boolean;
}

export function TenantDrawerUsers({ activeTenant, open }: TenantDrawerUsersProps) {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "employee">("admin");
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [manualUserMode, setManualUserMode] = useState(false);
  const [manualUserEmail, setManualUserEmail] = useState("");
  const [manualUserFirstName, setManualUserFirstName] = useState("");
  const [manualUserLastName, setManualUserLastName] = useState("");
  const [manualUserPassword, setManualUserPassword] = useState("");
  const [manualUserRole, setManualUserRole] = useState<"admin" | "employee">("employee");
  const [showManualPassword, setShowManualPassword] = useState(false);
  const [csvData, setCsvData] = useState<Array<{ email: string; firstName?: string; lastName?: string; role?: string }>>([]);
  const [bulkImportResults, setBulkImportResults] = useState<any[]>([]);
  const [sendInviteEmails, setSendInviteEmails] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [provisionDrawerOpen, setProvisionDrawerOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string; name: string } | null>(null);

  const { data: usersResponse, isLoading: usersLoading } = useQuery<{ users: TenantUser[]; total: number }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "users"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/users`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const { data: invitationsResponse, isLoading: invitationsLoading } = useQuery<{ invitations: TenantInvitation[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant.id, "invitations"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant.id}/invitations`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant.id && open,
  });

  const inviteAdminMutation = useMutation({
    mutationFn: async (data: { email: string; firstName?: string; lastName?: string; role?: "admin" | "employee"; inviteType: "link" | "email" }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/invite-admin`, data);
      return res.json();
    },
    onSuccess: (data, variables) => {
      setLastInviteUrl(data.inviteUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "invitations"] });
      toast({ 
        title: "Invitation created", 
        description: `Invite link generated for ${variables.email}. Copy and share with the user.` 
      });
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("admin");
    },
    onError: (error: any) => {
      toast({ title: "Failed to create invitation", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const createManualUserMutation = useMutation({
    mutationFn: async (data: { email: string; firstName: string; lastName: string; role: "admin" | "employee"; password: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/users`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "users"] });
      toast({ title: "User created", description: `${data.user.email} has been added to the tenant and can now log in.` });
      setManualUserEmail("");
      setManualUserFirstName("");
      setManualUserLastName("");
      setManualUserPassword("");
      setManualUserRole("employee");
      setManualUserMode(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create user", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const toggleUserActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/users/${userId}/activate`, { isActive });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "users"] });
      toast({ title: data.user.isActive ? "User activated" : "User deactivated", description: `${data.user.email} has been ${data.user.isActive ? "activated" : "deactivated"}.` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update user", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant.id}/users/${userId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "users"] });
      toast({ title: "User deleted", description: data.message || "The user has been permanently deleted." });
      setUserToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete user", description: error?.details || error?.message || "An unexpected error occurred.", variant: "destructive" });
      setUserToDelete(null);
    },
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/invitations/${invitationId}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "invitations"] });
      toast({ title: "Invitation revoked", description: "The invitation has been revoked and can no longer be used." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to revoke invitation", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/invitations/${invitationId}/resend`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "invitations"] });
      if (data.emailSent) {
        toast({ title: "Invitation resent", description: "The invitation email has been sent successfully." });
      } else {
        toast({ title: "Email failed", description: "Link regenerated but email failed. Copy the link manually.", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to resend invitation", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const activateInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/invitations/${invitationId}/activate`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "users"] });
      if (data.tempPassword) {
        toast({ title: "User activated", description: `${data.user?.email} activated. Temp password: ${data.tempPassword}` });
        navigator.clipboard.writeText(data.tempPassword);
      } else {
        toast({ title: "User activated", description: `${data.user?.email} has been activated.` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Activation failed", description: error?.message || "Failed to activate invitation", variant: "destructive" });
    },
  });

  const activateAllInvitationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/invitations/activate-all`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "users"] });
      const activated = data.results?.filter((r: any) => r.status === "activated").length || 0;
      const alreadyExisted = data.results?.filter((r: any) => r.status === "already_exists").length || 0;
      const errors = data.errors?.length || 0;
      toast({ title: "Bulk activation complete", description: `Activated: ${activated}, Already existed: ${alreadyExisted}, Errors: ${errors}` });
    },
    onError: (error: any) => {
      toast({ title: "Bulk activation failed", description: error?.message || "Failed to activate invitations", variant: "destructive" });
    },
  });

  const regenerateInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/invitations/${invitationId}/regenerate`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "invitations"] });
      toast({ title: "Link regenerated", description: "A new invitation link has been created." });
      if (data.inviteUrl) {
        navigator.clipboard.writeText(data.inviteUrl);
        toast({ title: "Link copied", description: "New invite link copied to clipboard." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to regenerate link", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (data: { users: typeof csvData; sendInvite: boolean }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/bulk-import-users`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "invitations"] });
      setBulkImportResults(data.results || []);
      const created = data.results?.filter((r: any) => r.success).length || 0;
      const failed = data.results?.filter((r: any) => !r.success).length || 0;
      toast({ title: "Import complete", description: `Created: ${created}, Failed: ${failed}` });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error?.message || "An unexpected error occurred.", variant: "destructive" });
    },
  });

  const handleInviteAdmin = () => {
    if (!inviteEmail) return;
    inviteAdminMutation.mutate({
      email: inviteEmail,
      firstName: inviteFirstName || undefined,
      lastName: inviteLastName || undefined,
      role: inviteRole,
      inviteType: "link",
    });
  };

  const handleCreateManualUser = () => {
    if (!manualUserEmail || !manualUserFirstName || !manualUserLastName || !manualUserPassword) return;
    createManualUserMutation.mutate({
      email: manualUserEmail,
      firstName: manualUserFirstName,
      lastName: manualUserLastName,
      role: manualUserRole,
      password: manualUserPassword,
    });
  };

  const copyInviteUrl = () => {
    if (lastInviteUrl) {
      navigator.clipboard.writeText(lastInviteUrl);
      toast({ title: "Copied", description: "Invite URL copied to clipboard" });
    }
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        toast({ title: "Invalid CSV", description: "CSV must have a header row and at least one data row", variant: "destructive" });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const emailIndex = headers.indexOf('email');
      const firstNameIndex = headers.indexOf('firstname') >= 0 ? headers.indexOf('firstname') : headers.indexOf('first_name');
      const lastNameIndex = headers.indexOf('lastname') >= 0 ? headers.indexOf('lastname') : headers.indexOf('last_name');
      const roleIndex = headers.indexOf('role');

      if (emailIndex === -1) {
        toast({ title: "Invalid CSV", description: "CSV must have an 'email' column", variant: "destructive" });
        return;
      }

      const parsedUsers: Array<{ email: string; firstName?: string; lastName?: string; role?: string }> = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const email = values[emailIndex];
        if (!email || !email.includes('@')) continue;

        parsedUsers.push({
          email,
          firstName: firstNameIndex >= 0 ? values[firstNameIndex] : undefined,
          lastName: lastNameIndex >= 0 ? values[lastNameIndex] : undefined,
          role: roleIndex >= 0 && ['admin', 'employee'].includes(values[roleIndex]?.toLowerCase()) 
            ? values[roleIndex].toLowerCase() as 'admin' | 'employee'
            : 'employee',
        });
      }

      setCsvData(parsedUsers);
      setBulkImportResults([]);
      toast({ title: "CSV parsed", description: `${parsedUsers.length} users found` });
    };
    reader.readAsText(file);
  };

  const handleBulkImport = () => {
    if (csvData.length === 0) return;
    bulkImportMutation.mutate({ users: csvData, sendInvite: sendInviteEmails });
  };

  const copyAllInviteUrls = () => {
    const urls = bulkImportResults.filter(r => r.success && r.inviteUrl).map(r => `${r.email}: ${r.inviteUrl}`).join('\n');
    navigator.clipboard.writeText(urls);
    toast({ title: "Copied", description: "All invite URLs copied to clipboard" });
  };

  return (
    <>
      <div className="space-y-6 mt-6">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  Provision User Access
                </h4>
                <p className="text-sm text-muted-foreground">
                  Create or update a user with immediate access - no invitation required
                </p>
              </div>
              <Button 
                onClick={() => setProvisionDrawerOpen(true)}
                data-testid="button-provision-user"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Provision User
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {activeTenant?.id && (
          <FixTenantIdsCard tenantId={activeTenant.id} tenantName={activeTenant?.name || "this tenant"} />
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  {manualUserMode ? "Create User Manually" : "Invite User"}
                </CardTitle>
                <CardDescription>
                  {manualUserMode 
                    ? "Create a user account with a password for immediate access" 
                    : "Send an invitation link for self-registration"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Invite</span>
                <Switch
                  checked={manualUserMode}
                  onCheckedChange={setManualUserMode}
                  data-testid="switch-manual-user-mode"
                />
                <span className="text-xs text-muted-foreground">Manual</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {manualUserMode ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-first-name">First Name *</Label>
                    <Input id="manual-first-name" value={manualUserFirstName} onChange={(e) => setManualUserFirstName(e.target.value)} placeholder="John" data-testid="input-manual-first-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-last-name">Last Name *</Label>
                    <Input id="manual-last-name" value={manualUserLastName} onChange={(e) => setManualUserLastName(e.target.value)} placeholder="Doe" data-testid="input-manual-last-name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-email">Email Address *</Label>
                    <Input id="manual-email" type="email" value={manualUserEmail} onChange={(e) => setManualUserEmail(e.target.value)} placeholder="user@example.com" data-testid="input-manual-email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-role">Role *</Label>
                    <Select value={manualUserRole} onValueChange={(v: "admin" | "employee") => setManualUserRole(v)}>
                      <SelectTrigger id="manual-role" data-testid="select-manual-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-password">Password *</Label>
                  <div className="relative">
                    <Input
                      id="manual-password"
                      type={showManualPassword ? "text" : "password"}
                      value={manualUserPassword}
                      onChange={(e) => setManualUserPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="pr-10"
                      data-testid="input-manual-password"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowManualPassword(!showManualPassword)} data-testid="button-toggle-password">
                      {showManualPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Password must be at least 8 characters</p>
                </div>
                <Button 
                  onClick={handleCreateManualUser}
                  disabled={!manualUserEmail || !manualUserFirstName || !manualUserLastName || !manualUserPassword || manualUserPassword.length < 8 || createManualUserMutation.isPending}
                  data-testid="button-create-manual-user"
                >
                  {createManualUserMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>) : (<><UserPlus className="h-4 w-4 mr-2" />Create User Account</>)}
                </Button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-first-name">First Name</Label>
                    <Input id="invite-first-name" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} placeholder="John" data-testid="input-invite-first-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-last-name">Last Name</Label>
                    <Input id="invite-last-name" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} placeholder="Doe" data-testid="input-invite-last-name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email Address *</Label>
                    <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" data-testid="input-invite-email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-role">Role</Label>
                    <Select value={inviteRole} onValueChange={(v: "admin" | "employee") => setInviteRole(v)}>
                      <SelectTrigger id="invite-role" data-testid="select-invite-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button 
                  onClick={handleInviteAdmin}
                  disabled={!inviteEmail || inviteAdminMutation.isPending}
                  data-testid="button-invite-admin"
                >
                  {inviteAdminMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>) : (<><UserPlus className="h-4 w-4 mr-2" />Create Invite Link</>)}
                </Button>

                {lastInviteUrl && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-700 dark:text-green-400">Invitation created</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={copyInviteUrl} data-testid="button-copy-invite">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground truncate">
                      {lastInviteUrl}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Users</CardTitle>
            <CardDescription>
              {usersResponse?.total || 0} user{(usersResponse?.total || 0) === 1 ? '' : 's'} in this tenant
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (<Skeleton key={i} className="h-16 w-full" />))}
              </div>
            ) : !usersResponse?.users?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No users yet. Create or invite users above.
              </div>
            ) : (
              <div className="space-y-2">
                {usersResponse.users.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`user-row-${user.id}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {user.firstName?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {user.name || user.email}
                          {!user.isActive && (<Badge variant="secondary" className="text-xs">Inactive</Badge>)}
                        </div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{user.role}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setSelectedUserId(user.id)} data-testid={`button-manage-user-${user.id}`}>
                        <Settings className="h-3 w-3 mr-1" />
                        Manage
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => toggleUserActiveMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                        disabled={toggleUserActiveMutation.isPending}
                        title={user.isActive ? "Deactivate user" : "Activate user"}
                        data-testid={`button-toggle-user-${user.id}`}
                      >
                        {user.isActive ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                      </Button>
                      {!user.isActive && (
                        <Button
                          size="icon" variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setUserToDelete({ id: user.id, email: user.email, name: user.name || user.email })}
                          disabled={deleteUserMutation.isPending}
                          title="Permanently delete user"
                          data-testid={`button-delete-user-${user.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Pending Invitations</CardTitle>
              <CardDescription>
                {invitationsResponse?.invitations?.filter(i => i.status === "pending").length || 0} pending invitation(s)
              </CardDescription>
            </div>
            {(invitationsResponse?.invitations?.filter(i => i.status === "pending").length || 0) > 0 && (
              <Button size="sm" onClick={() => activateAllInvitationsMutation.mutate()} disabled={activateAllInvitationsMutation.isPending} data-testid="button-activate-all-invitations">
                <UserPlus className="h-4 w-4 mr-1" />
                {activateAllInvitationsMutation.isPending ? "Activating..." : "Activate All"}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {invitationsLoading ? (
              <div className="space-y-3">{[1, 2].map(i => (<Skeleton key={i} className="h-12 w-full" />))}</div>
            ) : !invitationsResponse?.invitations?.length ? (
              <div className="text-center py-6 text-muted-foreground text-sm">No invitations sent yet.</div>
            ) : (
              <div className="space-y-2">
                {invitationsResponse.invitations.map(invitation => {
                  const isExpired = new Date(invitation.expiresAt) < new Date();
                  const isPending = invitation.status === "pending" && !isExpired;
                  return (
                    <div key={invitation.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`invitation-row-${invitation.id}`}>
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">{invitation.email}</div>
                          <div className="text-xs text-muted-foreground">Expires: {new Date(invitation.expiresAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{invitation.role}</Badge>
                        {invitation.status === "accepted" ? (
                          <Badge className="bg-green-600 text-xs">Accepted</Badge>
                        ) : invitation.status === "revoked" ? (
                          <Badge variant="destructive" className="text-xs">Revoked</Badge>
                        ) : isExpired ? (
                          <>
                            <Badge variant="secondary" className="text-xs">Expired</Badge>
                            <Button size="icon" variant="ghost" onClick={() => regenerateInvitationMutation.mutate(invitation.id)} disabled={regenerateInvitationMutation.isPending} title="Regenerate invitation link" data-testid={`button-regenerate-invitation-${invitation.id}`}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Badge className="text-xs">Pending</Badge>
                            <Button size="icon" variant="ghost" onClick={() => activateInvitationMutation.mutate(invitation.id)} disabled={activateInvitationMutation.isPending} title="Activate (create user account)" data-testid={`button-activate-invitation-${invitation.id}`}>
                              <UserPlus className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => regenerateInvitationMutation.mutate(invitation.id)} disabled={regenerateInvitationMutation.isPending} title="Get invite link (regenerate & copy)" data-testid={`button-get-link-${invitation.id}`}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => resendInvitationMutation.mutate(invitation.id)} disabled={resendInvitationMutation.isPending} title="Resend invitation email" data-testid={`button-resend-invitation-${invitation.id}`}>
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => revokeInvitationMutation.mutate(invitation.id)} disabled={revokeInvitationMutation.isPending} title="Revoke invitation" data-testid={`button-revoke-invitation-${invitation.id}`}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Bulk CSV Import
            </CardTitle>
            <CardDescription>Import multiple users at once from a CSV file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-upload">Upload CSV File</Label>
              <div className="flex gap-2">
                <Input id="csv-upload" type="file" accept=".csv" onChange={handleCsvFileChange} className="flex-1" data-testid="input-csv-upload" />
                {csvData.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => { setCsvData([]); setBulkImportResults([]); }} data-testid="button-clear-csv">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Required columns: email. Optional: firstName, lastName, role (admin/employee)</p>
            </div>

            {csvData.length > 0 && (
              <div className="space-y-3">
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr>
                        <th className="text-left p-2">Email</th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 10).map((user, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2 text-xs">{user.email}</td>
                          <td className="p-2">{[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'}</td>
                          <td className="p-2"><Badge variant="secondary" className="text-xs">{user.role || 'employee'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvData.length > 10 && (
                    <div className="p-2 text-center text-xs text-muted-foreground border-t">...and {csvData.length - 10} more</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={sendInviteEmails} onChange={(e) => setSendInviteEmails(e.target.checked)} className="rounded" data-testid="checkbox-send-invite-emails" />
                    Send invite emails (requires Mailgun)
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleBulkImport} disabled={bulkImportMutation.isPending} data-testid="button-bulk-import">
                    {bulkImportMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>) : (<><Upload className="h-4 w-4 mr-2" />Import {csvData.length} Users</>)}
                  </Button>
                </div>
              </div>
            )}

            {bulkImportResults.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Import Results</div>
                  <Button size="sm" variant="outline" onClick={copyAllInviteUrls} data-testid="button-copy-all-urls">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All URLs
                  </Button>
                </div>
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr>
                        <th className="text-left p-2">Email</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkImportResults.map((result, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2 text-xs">{result.email}</td>
                          <td className="p-2">
                            {result.success ? (
                              <div className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3 text-green-500" />
                                <span className="text-green-600 text-xs">Success</span>
                                {result.emailSent && (<Badge variant="secondary" className="text-xs ml-1">Emailed</Badge>)}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                                <span className="text-red-600 text-xs">{result.error}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            {result.success && result.inviteUrl && (
                              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { navigator.clipboard.writeText(result.inviteUrl!); toast({ title: "Copied", description: "Invite URL copied" }); }} data-testid={`button-copy-url-${i}`}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{userToDelete?.email}</strong>? 
              This action cannot be undone and will remove all data associated with this user, 
              including their task assignments, time entries, comments, and activity logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending} data-testid="button-cancel-delete-user">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
              disabled={deleteUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>) : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeTenant && selectedUserId && (
        <TenantUserDrawer
          open={!!selectedUserId}
          onClose={() => setSelectedUserId(null)}
          tenantId={activeTenant.id}
          userId={selectedUserId}
          tenantName={activeTenant.name}
        />
      )}

      {activeTenant && (
        <ProvisionUserDrawer
          open={provisionDrawerOpen}
          onClose={() => setProvisionDrawerOpen(false)}
          tenantId={activeTenant.id}
          tenantName={activeTenant.name}
        />
      )}
    </>
  );
}
