import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { S3Dropzone } from "@/components/common/S3Dropzone";
import { User, Mail, Shield, Users, Save, Loader2, ArrowLeft, Key, Eye, EyeOff, Sun, Moon, Palette, Check } from "lucide-react";
import { useLocation } from "wouter";
import { useTheme } from "@/lib/theme-provider";
import { type ThemePack } from "@/theme/themePacks";
import { cn } from "@/lib/utils";
import { getStorageUrl } from "@/lib/storageUrl";

function getRoleLabel(role: string) {
  switch (role) {
    case "admin": return "Administrator";
    case "super_user": return "Super Admin";
    case "client": return "Client";
    default: return "Employee";
  }
}

function getRoleIcon(role: string) {
  switch (role) {
    case "admin":
    case "super_user":
      return <Shield className="h-4 w-4" />;
    case "client":
      return <Users className="h-4 w-4" />;
    default:
      return <User className="h-4 w-4" />;
  }
}

export default function UserProfilePage() {
  const { user, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string }) => {
      return apiRequest("PATCH", "/api/users/me", data);
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Profile updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null | undefined>(undefined);

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarUrl: string | null) => {
      return apiRequest("PATCH", "/api/users/me", { avatarUrl });
    },
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: () => {
      toast({ title: "Failed to update avatar", variant: "destructive" });
    },
    onSettled: () => {
      setPendingAvatarUrl(undefined);
    },
  });

  const rawAvatarUrl = pendingAvatarUrl !== undefined ? pendingAvatarUrl : user?.avatarUrl;
  const displayAvatarUrl = getStorageUrl(rawAvatarUrl);

  const handleAvatarUploaded = (fileUrl: string) => {
    setPendingAvatarUrl(fileUrl);
    updateAvatarMutation.mutate(fileUrl);
    toast({ title: "Avatar uploaded successfully" });
  };

  const handleAvatarRemove = () => {
    setPendingAvatarUrl(null);
    updateAvatarMutation.mutate(null);
    toast({ title: "Avatar removed" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return apiRequest("POST", "/api/users/me/change-password", data);
    },
    onSuccess: () => {
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed successfully" });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to change password";
      toast({ title: "Error", description: message, variant: "destructive" });
    },
  });

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast({ title: "Error", description: "New password must be at least 8 characters", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  if (!user) {
    return null;
  }

  const initials = user.firstName && user.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const handleBack = () => {
    if (user.role === "super_user") {
      setLocation("/super-admin/dashboard");
    } else {
      setLocation("/");
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-3xl p-6">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4 -ml-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold mb-2">My Profile</h1>
          <p className="text-muted-foreground">
            Manage your personal information and profile picture
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profile Picture</CardTitle>
              <CardDescription>
                Upload a photo to personalize your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={displayAvatarUrl || undefined} alt={user.name} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 w-full max-w-xs">
                  <S3Dropzone
                    category="user-avatar"
                    label="Profile Picture"
                    description="PNG, JPG, WebP or GIF. Max 2MB."
                    valueUrl={displayAvatarUrl}
                    onUploaded={handleAvatarUploaded}
                    onRemoved={handleAvatarRemove}
                    enableCropping
                    cropShape="round"
                    cropAspectRatio={1}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Personal Information</CardTitle>
                <CardDescription>
                  Your name and contact details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="John"
                      data-testid="input-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Doe"
                      data-testid="input-last-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email Address</Label>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.email}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Contact your administrator to change your email address
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Role</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      {getRoleIcon(user.role)}
                      {getRoleLabel(user.role)}
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    className="min-w-[140px]"
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>

          <form onSubmit={handlePasswordChange}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your account password
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      placeholder="Enter your current password"
                      data-testid="input-current-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      data-testid="button-toggle-current-password"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                        placeholder="Min 8 characters"
                        data-testid="input-new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        data-testid="button-toggle-new-password"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {passwordData.newPassword.length > 0 && passwordData.newPassword.length < 8 && (
                      <p className="text-sm text-destructive">Password must be at least 8 characters</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Confirm new password"
                      data-testid="input-confirm-password"
                    />
                    {passwordData.confirmPassword.length > 0 && passwordData.newPassword !== passwordData.confirmPassword && (
                      <p className="text-sm text-destructive">Passwords do not match</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button
                    type="submit"
                    disabled={
                      changePasswordMutation.isPending || 
                      !passwordData.currentPassword || 
                      passwordData.newPassword.length < 8 ||
                      passwordData.newPassword !== passwordData.confirmPassword
                    }
                    className="min-w-[140px]"
                    data-testid="button-change-password"
                  >
                    {changePasswordMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Key className="h-4 w-4 mr-2" />
                        Change Password
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>

          <AppearanceCard />
        </div>
      </div>
    </ScrollArea>
  );
}

function PackPreview({ pack, isActive, onClick }: { pack: ThemePack; isActive: boolean; onClick: () => void }) {
  const bg = pack.tokens["--background"];
  const fg = pack.tokens["--foreground"];
  const sidebar = pack.tokens["--sidebar"];
  const primary = pack.tokens["--primary"];
  const card = pack.tokens["--card"];
  const muted = pack.tokens["--muted-foreground"];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-md p-1.5 transition-all",
        isActive
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "ring-1 ring-border hover:ring-muted-foreground/40"
      )}
      title={pack.description}
      data-testid={`button-theme-pack-${pack.id}`}
    >
      <div
        className="rounded-sm overflow-hidden border border-border/30"
        style={{ width: 72, height: 48, display: "flex" }}
      >
        <div style={{ backgroundColor: `hsl(${sidebar})`, width: "28%", display: "flex", flexDirection: "column", padding: 2, gap: 2 }}>
          <div style={{ backgroundColor: `hsl(${primary})`, height: 4, borderRadius: 1, opacity: 0.8 }} />
          <div style={{ backgroundColor: `hsl(${muted})`, height: 3, borderRadius: 1, opacity: 0.3 }} />
          <div style={{ backgroundColor: `hsl(${muted})`, height: 3, borderRadius: 1, opacity: 0.3 }} />
        </div>
        <div style={{ backgroundColor: `hsl(${bg})`, flex: 1, display: "flex", flexDirection: "column", padding: 3, gap: 2 }}>
          <div style={{ backgroundColor: `hsl(${fg})`, height: 3, width: "60%", borderRadius: 1, opacity: 0.5 }} />
          <div style={{ backgroundColor: `hsl(${card})`, flex: 1, borderRadius: 2, border: `1px solid hsl(${pack.tokens["--border"]})`, display: "flex", flexDirection: "column", padding: 2, gap: 1 }}>
            <div style={{ backgroundColor: `hsl(${primary})`, height: 3, width: "40%", borderRadius: 1 }} />
            <div style={{ backgroundColor: `hsl(${muted})`, height: 2, width: "70%", borderRadius: 1, opacity: 0.4 }} />
          </div>
        </div>
      </div>
      <span className="text-[11px] leading-tight truncate w-full text-center" style={{ maxWidth: 72 }}>
        {pack.name}
      </span>
      {isActive && (
        <div className="absolute top-0.5 right-0.5 rounded-full bg-primary p-0.5">
          <Check className="h-2.5 w-2.5 text-primary-foreground" />
        </div>
      )}
    </button>
  );
}

function AppearanceCard() {
  const { packId, setPackId, availablePacks } = useTheme();

  const lightPacks = availablePacks.filter((p) => p.kind === "light");
  const darkPacks = availablePacks.filter((p) => p.kind === "dark");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Appearance
        </CardTitle>
        <CardDescription>
          Choose a color theme for the application
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label className="flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5" />
            Light Themes
          </Label>
          <div className="flex gap-2 flex-wrap">
            {lightPacks.map((pack) => (
              <PackPreview
                key={pack.id}
                pack={pack}
                isActive={packId === pack.id}
                onClick={() => setPackId(pack.id)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label className="flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5" />
            Dark Themes
          </Label>
          <div className="flex gap-2 flex-wrap">
            {darkPacks.map((pack) => (
              <PackPreview
                key={pack.id}
                pack={pack}
                isActive={packId === pack.id}
                onClick={() => setPackId(pack.id)}
              />
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Changes are saved automatically
        </p>
      </CardContent>
    </Card>
  );
}
