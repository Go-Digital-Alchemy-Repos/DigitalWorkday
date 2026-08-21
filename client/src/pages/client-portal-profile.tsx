import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2, Mail, Save, UserRound } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ClientPortalProfile() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
  });
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const updateProfile = useMutation({
    mutationFn: () => {
      const normalizedName = profile.name.trim().replace(/\s+/g, " ");
      const [firstName, ...lastNameParts] = normalizedName.split(" ");
      return apiRequest("PATCH", "/api/users/me", {
        name: normalizedName,
        firstName,
        lastName: lastNameParts.join(" "),
        email: profile.email.trim(),
      });
    },
    onSuccess: async () => {
      await refetch();
      toast({ title: "Profile updated" });
    },
    onError: (error: Error) => toast({
      title: "Unable to update profile",
      description: error.message,
      variant: "destructive",
    }),
  });

  const changePassword = useMutation({
    mutationFn: () => apiRequest("POST", "/api/users/me/change-password", {
      currentPassword: password.currentPassword,
      newPassword: password.newPassword,
    }),
    onSuccess: () => {
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed" });
    },
    onError: (error: Error) => toast({
      title: "Unable to change password",
      description: error.message,
      variant: "destructive",
    }),
  });

  if (!user) return null;

  const passwordMatches = password.newPassword === password.confirmPassword;
  const canChangePassword = !!password.currentPassword && password.newPassword.length >= 8 && passwordMatches;

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-muted-foreground">Manage your personal details and account password.</p>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); updateProfile.mutate(); }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="h-5 w-5" />
                Personal information
              </CardTitle>
              <CardDescription>This information identifies you throughout the client portal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="portal-profile-name">Name</Label>
                <Input
                  id="portal-profile-name"
                  value={profile.name}
                  onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                  autoComplete="name"
                  required
                  maxLength={200}
                  data-testid="input-portal-profile-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-profile-email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="portal-profile-email"
                    type="email"
                    value={profile.email}
                    onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                    className="pl-9"
                    autoComplete="email"
                    required
                    maxLength={320}
                    data-testid="input-portal-profile-email"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Your updated email address will be used the next time you sign in.</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={updateProfile.isPending || !profile.name.trim() || !profile.email.trim()} data-testid="button-save-portal-profile">
                  {updateProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        <form onSubmit={(event) => { event.preventDefault(); if (canChangePassword) changePassword.mutate(); }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5" />
                Change password
              </CardTitle>
              <CardDescription>Enter your current password before choosing a new one.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="portal-current-password">Current password</Label>
                <Input
                  id="portal-current-password"
                  type="password"
                  value={password.currentPassword}
                  onChange={(event) => setPassword((current) => ({ ...current, currentPassword: event.target.value }))}
                  autoComplete="current-password"
                  required
                  data-testid="input-portal-current-password"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="portal-new-password">New password</Label>
                  <Input
                    id="portal-new-password"
                    type="password"
                    value={password.newPassword}
                    onChange={(event) => setPassword((current) => ({ ...current, newPassword: event.target.value }))}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    data-testid="input-portal-new-password"
                  />
                  <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portal-confirm-password">Confirm new password</Label>
                  <Input
                    id="portal-confirm-password"
                    type="password"
                    value={password.confirmPassword}
                    onChange={(event) => setPassword((current) => ({ ...current, confirmPassword: event.target.value }))}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    aria-invalid={password.confirmPassword.length > 0 && !passwordMatches}
                    data-testid="input-portal-confirm-password"
                  />
                  {password.confirmPassword.length > 0 && !passwordMatches && <p className="text-xs text-destructive">Passwords do not match.</p>}
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={changePassword.isPending || !canChangePassword} data-testid="button-change-portal-password">
                  {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Change password
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
