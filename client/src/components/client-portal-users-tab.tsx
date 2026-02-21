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

const createUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional().default(""),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm the password"),
  accessLevel: z.enum(["viewer", "collaborator"]),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

const editUserSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional().default(""),
  accessLevel: z.enum(["viewer", "collaborator"]),
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
}

export function ClientPortalUsersTab({ clientId }: ClientPortalUsersTabProps) {
  const { toast } = useToast();
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
  const [userToRevoke, setUserToRevoke] = useState<ClientUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
      accessLevel: "viewer",
    },
  });

  const editForm = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      accessLevel: "viewer",
      password: "",
      confirmPassword: "",
    },
  });

  const { data: portalUsers = [], isLoading: usersLoading } = useQuery<ClientUser[]>({
    queryKey: ["/api/clients", clientId, "users"],
    enabled: !!clientId,
  });

  const { data: contacts = [] } = useQuery<ClientContact[]>({
    queryKey: ["/api/clients", clientId, "contacts"],
    enabled: !!clientId,
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      const { confirmPassword, ...payload } = data;
      const res = await apiRequest("POST", `/api/clients/${clientId}/users/create`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal user created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "users"] });
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
      const res = await apiRequest("PATCH", `/api/clients/${clientId}/users/${userId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Portal user updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "users"] });
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
      await apiRequest("DELETE", `/api/clients/${clientId}/users/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "Access revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "users"] });
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
    setShowPassword(false);
    createForm.reset();
  };

  const handleOpenAddUser = () => {
    createForm.reset({
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
      accessLevel: "viewer",
    });
    setShowPassword(false);
    setAddUserOpen(true);
  };

  const handleOpenAddUserFromContact = (contact: ClientContact) => {
    createForm.reset({
      email: contact.email || "",
      firstName: contact.firstName,
      lastName: contact.lastName || "",
      password: "",
      confirmPassword: "",
      accessLevel: "viewer",
    });
    setShowPassword(false);
    setAddUserOpen(true);
  };

  const handleOpenEditUser = (portalUser: ClientUser) => {
    setEditingUser(portalUser);
    setShowEditPassword(false);
    editForm.reset({
      firstName: portalUser.user.firstName || portalUser.user.name?.split(" ")[0] || "",
      lastName: portalUser.user.lastName || portalUser.user.name?.split(" ").slice(1).join(" ") || "",
      accessLevel: portalUser.accessLevel as "viewer" | "collaborator",
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
      case "collaborator":
        return <Badge variant="default">Collaborator</Badge>;
      case "viewer":
      default:
        return <Badge variant="secondary">Viewer</Badge>;
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
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.dispatchEvent(new CustomEvent("navigate-client-tab", { detail: "control-center" }))}
          className="text-muted-foreground hover:text-foreground p-0 h-auto"
          data-testid="button-back-to-control-center"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Control Center
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Portal Users</h3>
          <p className="text-sm text-muted-foreground">
            Manage client users who can access the client portal to view projects and tasks.
          </p>
        </div>
        <Button onClick={handleOpenAddUser} data-testid="button-add-portal-user">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Portal User
        </Button>
      </div>

      {uninvitedContacts.length > 0 && (
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
                  className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover-elevate"
                  onClick={() => handleOpenEditUser(portalUser)}
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
            <Button onClick={handleOpenAddUser} data-testid="button-add-first-user">
              <UserPlus className="h-4 w-4 mr-2" />
              Add First User
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Portal User Sheet */}
      <Sheet open={addUserOpen} onOpenChange={(open) => !open && handleCloseAddUser()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-add-portal-user">
          <SheetHeader>
            <SheetTitle>Add Portal User</SheetTitle>
            <SheetDescription>
              Create a new client portal account with login credentials and access permissions.
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
                  <div className="flex items-center gap-2 mb-4">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    <Label className="font-medium">Login Credentials</Label>
                  </div>
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
                                type={showPassword ? "text" : "password"}
                                placeholder="Minimum 8 characters"
                                {...field}
                                data-testid="input-create-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2"
                                onClick={() => setShowPassword(!showPassword)}
                                data-testid="button-toggle-password-visibility"
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                              type={showPassword ? "text" : "password"}
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
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                <span>Viewer - View projects and tasks only</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="collaborator">
                              <div className="flex items-center gap-2">
                                <Edit3 className="h-4 w-4" />
                                <span>Collaborator - Add comments and feedback</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Viewers can see projects and tasks. Collaborators can also add comments.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    type="submit"
                    disabled={createUserMutation.isPending}
                    className="flex-1"
                    data-testid="button-submit-create-user"
                  >
                    {createUserMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Create Portal User
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
      <Sheet open={!!editingUser} onOpenChange={(open) => !open && handleCloseEditUser()}>
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
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                <span>Viewer - View projects and tasks only</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="collaborator">
                              <div className="flex items-center gap-2">
                                <Edit3 className="h-4 w-4" />
                                <span>Collaborator - Add comments and feedback</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Viewers can see projects and tasks. Collaborators can also add comments.
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
