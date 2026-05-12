import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  MoreHorizontal,
  UserPlus,
  Trash2,
  Users,
  Eye,
  Edit3,
  KeyRound,
  Loader2,
  Save,
  EyeOff,
  ArrowLeft,
} from "lucide-react";

interface ClientUser {
  id: string;
  userId: string;
  clientId: string;
  accessLevel: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
}

interface ClientContact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  title: string | null;
}

type PortalAccessLevel = "collaborator" | "portal_admin";

function normalizePortalAccessLevel(level: string | null | undefined): PortalAccessLevel {
  return level === "portal_admin" ? "portal_admin" : "collaborator";
}

const createUserSchema = z.object({
  contactId: z.string().optional(),
  email: z.string().email("Valid email is required").optional().or(z.literal("")),
  firstName: z.string().optional().default(""),
  lastName: z.string().optional().default(""),
  accessLevel: z.enum(["collaborator", "portal_admin"]),
  password: z.string().optional().default(""),
  confirmPassword: z.string().optional().default(""),
}).refine((data) => Boolean(data.contactId || data.email), {
  message: "Choose a contact or enter an email address",
  path: ["email"],
}).refine((data) => {
  if (data.password && data.password.length > 0 && data.password.length < 8) {
    return false;
  }
  return true;
}, {
  message: "Password must be at least 8 characters",
  path: ["password"],
}).refine((data) => {
  if (data.password && data.password.length >= 8 && data.password !== data.confirmPassword) {
    return false;
  }
  return true;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

const editUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional().default(""),
  accessLevel: z.enum(["collaborator", "portal_admin"]),
  password: z.string().optional().default(""),
  confirmPassword: z.string().optional().default(""),
}).refine((data) => {
  if (data.password && data.password.length > 0 && data.password.length < 8) {
    return false;
  }
  return true;
}, {
  message: "Password must be at least 8 characters",
  path: ["password"],
}).refine((data) => {
  if (data.password && data.password.length >= 8 && data.password !== data.confirmPassword) {
    return false;
  }
  return true;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type EditUserFormData = z.infer<typeof editUserSchema>;

interface ClientPortalUsersTabProps {
  clientId: string;
  portalMode?: boolean;
  currentAccessLevel?: string;
}

export function ClientPortalUsersTab({ clientId, portalMode = false, currentAccessLevel }: ClientPortalUsersTabProps) {
  const { toast } = useToast();
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
  const [userToRevoke, setUserToRevoke] = useState<ClientUser | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const apiBase = portalMode ? `/api/client-portal/clients/${clientId}` : `/api/clients/${clientId}`;
  const usersQueryKey = portalMode
    ? ["/api/client-portal/clients", clientId, "users"]
    : ["/api/clients", clientId, "users"];
  const contactsQueryKey = portalMode
    ? ["/api/client-portal/clients", clientId, "contacts"]
    : ["/api/clients", clientId, "contacts"];
  const canManageUsers = !portalMode || currentAccessLevel === "portal_admin";

  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      contactId: "",
      email: "",
      firstName: "",
      lastName: "",
      accessLevel: "collaborator",
      password: "",
      confirmPassword: "",
    },
  });

  const editForm = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      accessLevel: "collaborator",
      password: "",
      confirmPassword: "",
    },
  });

  const { data: portalUsers = [], isLoading: usersLoading } = useQuery<ClientUser[]>({
    queryKey: usersQueryKey,
    enabled: !!clientId,
  });

  const { data: contacts = [] } = useQuery<ClientContact[]>({
    queryKey: contactsQueryKey,
    enabled: !!clientId,
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      const payload = {
        contactId: data.contactId || undefined,
        email: data.email || undefined,
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        accessLevel: data.accessLevel,
      };
      const res = await apiRequest("POST", `${apiBase}/users/invite`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal invitation sent" });
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
      handleCloseAddUser();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const provisionUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      if (!data.password || data.password.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      const payload = {
        contactId: data.contactId || undefined,
        email: data.email || undefined,
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        accessLevel: data.accessLevel,
        password: data.password,
      };
      const res = await apiRequest("POST", `${apiBase}/users/create`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal user created" });
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
      handleCloseAddUser();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: EditUserFormData }) => {
      const payload: Record<string, any> = {};
      if (data.firstName) payload.firstName = data.firstName;
      if (data.lastName !== undefined) payload.lastName = data.lastName;
      if (data.accessLevel) payload.accessLevel = data.accessLevel;
      if (data.password && data.password.length >= 8) payload.password = data.password;
      const res = await apiRequest("PATCH", `${apiBase}/users/${userId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal user updated successfully" });
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
      handleCloseEditUser();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `${apiBase}/users/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "Access revoked" });
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
      setUserToRevoke(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to revoke access",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCloseAddUser = () => {
    setAddUserOpen(false);
    setShowCreatePassword(false);
    createForm.reset();
  };

  const handleOpenAddUser = () => {
    createForm.reset({
      contactId: "",
      email: "",
      firstName: "",
      lastName: "",
      accessLevel: "collaborator",
      password: "",
      confirmPassword: "",
    });
    setShowCreatePassword(false);
    setAddUserOpen(true);
  };

  const handleOpenAddUserFromContact = (contact: ClientContact) => {
    createForm.reset({
      contactId: contact.id,
      email: contact.email || "",
      firstName: contact.firstName,
      lastName: contact.lastName || "",
      accessLevel: "collaborator",
      password: "",
      confirmPassword: "",
    });
    setShowCreatePassword(false);
    setAddUserOpen(true);
  };

  const handleOpenEditUser = (portalUser: ClientUser) => {
    setEditingUser(portalUser);
    setShowEditPassword(false);
    editForm.reset({
      firstName: portalUser.user.firstName || portalUser.user.name?.split(" ")[0] || "",
      lastName: portalUser.user.lastName || portalUser.user.name?.split(" ").slice(1).join(" ") || "",
      accessLevel: normalizePortalAccessLevel(portalUser.accessLevel),
      password: "",
      confirmPassword: "",
    });
  };

  const handleCloseEditUser = () => {
    setEditingUser(null);
    setShowEditPassword(false);
    editForm.reset();
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email.charAt(0).toUpperCase();
  };

  const getAccessLevelBadge = (level: string) => {
    switch (level) {
      case "portal_admin":
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Portal Admin</Badge>;
      case "collaborator":
      case "viewer":
      default:
        return <Badge variant="default">Contributor</Badge>;
    }
  };

  const uninvitedContacts = contacts.filter(
    (contact) =>
      contact.email &&
      !portalUsers.some((user) => user.user.email === contact.email)
  );

  if (usersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!portalMode && (
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.dispatchEvent(new CustomEvent("navigate-client-tab", { detail: "overview" }))}
          className="text-muted-foreground hover:text-foreground p-0 h-auto"
          data-testid="button-back-to-overview"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Overview
        </Button>
      </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Portal Users</h3>
          <p className="text-sm text-muted-foreground">
            {canManageUsers
              ? "Manage client users who can access the client portal."
              : "View client users who can access this portal. Only portal admins can manage accounts."}
          </p>
        </div>
        {canManageUsers && (
        <Button onClick={handleOpenAddUser} data-testid="button-add-portal-user">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Portal User
        </Button>
        )}
      </div>

      {canManageUsers && uninvitedContacts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick Add from Contacts</CardTitle>
            <CardDescription>
              Create portal accounts for existing contacts with email addresses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {uninvitedContacts.slice(0, 5).map((contact) => (
                <Button
                  key={contact.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenAddUserFromContact(contact)}
                  data-testid={`button-add-contact-${contact.id}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {contact.firstName} {contact.lastName}
                </Button>
              ))}
              {uninvitedContacts.length > 5 && (
                <Badge variant="secondary" className="px-3">
                  +{uninvitedContacts.length - 5} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {portalUsers.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Current Portal Users</CardTitle>
              <Badge variant="secondary">{portalUsers.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {portalUsers.map((portalUser) => (
                <div
                  key={portalUser.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${canManageUsers ? "cursor-pointer hover-elevate" : ""}`}
                  onClick={() => canManageUsers && handleOpenEditUser(portalUser)}
                  data-testid={`portal-user-${portalUser.userId}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs">
                        {getInitials(portalUser.user.name, portalUser.user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium" data-testid={`text-portal-user-name-${portalUser.userId}`}>
                        {portalUser.user.name || portalUser.user.email}
                      </div>
                      {portalUser.user.name && (
                        <div className="text-sm text-muted-foreground" data-testid={`text-portal-user-email-${portalUser.userId}`}>
                          {portalUser.user.email}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getAccessLevelBadge(portalUser.accessLevel)}
                    {canManageUsers && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" data-testid={`button-portal-user-menu-${portalUser.userId}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditUser(portalUser);
                          }}
                          data-testid={`menu-item-edit-${portalUser.userId}`}
                        >
                          <Edit3 className="h-4 w-4 mr-2" />
                          Edit User
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUserToRevoke(portalUser);
                          }}
                          data-testid={`menu-item-revoke-${portalUser.userId}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Revoke Access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No Portal Users</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add client users to give them access to view their projects and tasks.
            </p>
            {canManageUsers && (
            <Button onClick={handleOpenAddUser} data-testid="button-add-first-user">
              <UserPlus className="h-4 w-4 mr-2" />
              Add First User
            </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Portal User Sheet */}
      <Sheet open={canManageUsers && addUserOpen} onOpenChange={(open) => !open && handleCloseAddUser()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-add-portal-user">
          <SheetHeader>
            <SheetTitle>Add Portal User</SheetTitle>
            <SheetDescription>
              Send an invite link, or create the portal account now with a password.
            </SheetDescription>
          </SheetHeader>
          <div className="py-6">
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit((data) => createUserMutation.mutate(data))} className="space-y-5">
                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="user@example.com" type="email" {...field} data-testid="input-create-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} data-testid="input-create-firstName" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} data-testid="input-create-lastName" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-5">
                  <FormField
                    control={createForm.control}
                    name="accessLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-create-accessLevel">
                              <SelectValue placeholder="Select access level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="collaborator">
                              <div className="flex items-center gap-2">
                                <Edit3 className="h-4 w-4" />
                                <span>Contributor - Full portal access except user management</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="portal_admin">
                              <div className="flex items-center gap-2">
                                <UserPlus className="h-4 w-4" />
                                <span>Portal Admin - Manage portal users and client data</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Contributors can use client-facing areas. Portal admins can also manage users and passwords.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-5">
                  <div className="flex items-center gap-2 mb-4">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <Label className="font-medium">Direct Provisioning Password</Label>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Required for Create User. Leave blank if you only want to send an invite.
                  </p>
                  <div className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showCreatePassword ? "text" : "password"}
                                placeholder="Minimum 8 characters"
                                {...field}
                                data-testid="input-create-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2"
                                onClick={() => setShowCreatePassword(!showCreatePassword)}
                                data-testid="button-toggle-create-password-visibility"
                              >
                                {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input
                              type={showCreatePassword ? "text" : "password"}
                              placeholder="Re-enter password"
                              {...field}
                              data-testid="input-create-confirmPassword"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={provisionUserMutation.isPending || createUserMutation.isPending}
                    onClick={createForm.handleSubmit((data) => provisionUserMutation.mutate(data))}
                    className="flex-1"
                    data-testid="button-provision-create-user"
                  >
                    {provisionUserMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4 mr-2" />
                    )}
                    Create User
                  </Button>
                  <Button
                    type="submit"
                    disabled={createUserMutation.isPending || provisionUserMutation.isPending}
                    className="flex-1"
                    data-testid="button-submit-create-user"
                  >
                    {createUserMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Send Invite
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCloseAddUser}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Portal User Sheet */}
      <Sheet open={canManageUsers && !!editingUser} onOpenChange={(open) => !open && handleCloseEditUser()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-edit-portal-user">
          <SheetHeader>
            <SheetTitle>Edit Portal User</SheetTitle>
            <SheetDescription>
              {editingUser ? `Update settings for ${editingUser.user.email}` : "Update portal user settings"}
            </SheetDescription>
          </SheetHeader>
          {editingUser && (
            <div className="py-6">
              <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-sm">
                    {getInitials(editingUser.user.name, editingUser.user.email)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium" data-testid="text-edit-user-name">
                    {editingUser.user.name || editingUser.user.email}
                  </div>
                  <div className="text-sm text-muted-foreground" data-testid="text-edit-user-email">
                    {editingUser.user.email}
                  </div>
                </div>
              </div>

              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit((data) => updateUserMutation.mutate({ userId: editingUser.userId, data }))} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-firstName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-lastName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={editForm.control}
                    name="accessLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-accessLevel">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="collaborator">
                              <div className="flex items-center gap-2">
                                <Edit3 className="h-4 w-4" />
                                <span>Contributor - Full portal access except user management</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="portal_admin">
                              <div className="flex items-center gap-2">
                                <UserPlus className="h-4 w-4" />
                                <span>Portal Admin - Manage portal users and client data</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Contributors can use client-facing areas. Portal admins can also manage users and passwords.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t pt-5">
                    <div className="flex items-center gap-2 mb-4">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Change Password</Label>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Leave blank to keep the current password.
                    </p>
                    <div className="space-y-4">
                      <FormField
                        control={editForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>New Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showEditPassword ? "text" : "password"}
                                  placeholder="Minimum 8 characters"
                                  {...field}
                                  data-testid="input-edit-password"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-1 top-1/2 -translate-y-1/2"
                                  onClick={() => setShowEditPassword(!showEditPassword)}
                                  data-testid="button-toggle-edit-password-visibility"
                                >
                                  {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm New Password</FormLabel>
                            <FormControl>
                              <Input
                                type={showEditPassword ? "text" : "password"}
                                placeholder="Re-enter new password"
                                {...field}
                                data-testid="input-edit-confirmPassword"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      type="submit"
                      disabled={updateUserMutation.isPending}
                      className="flex-1"
                      data-testid="button-submit-edit-user"
                    >
                      {updateUserMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Changes
                    </Button>
                    <Button type="button" variant="outline" onClick={handleCloseEditUser}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Revoke Access Confirmation */}
      <AlertDialog open={!!userToRevoke} onOpenChange={(open) => !open && setUserToRevoke(null)}>
        <AlertDialogContent data-testid="dialog-revoke-access">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Portal Access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke portal access for{" "}
              <strong>{userToRevoke?.user.name || userToRevoke?.user.email}</strong>?
              They will no longer be able to log in to the client portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeAccessMutation.isPending} data-testid="button-cancel-revoke">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToRevoke && revokeAccessMutation.mutate(userToRevoke.userId)}
              disabled={revokeAccessMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-revoke"
            >
              {revokeAccessMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
