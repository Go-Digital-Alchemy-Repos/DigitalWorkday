import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface InviteValidation {
  valid: boolean;
  inviteId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  accessLevel: string;
  clientName: string;
}

export default function ClientPortalRegisterPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token") || "";
  const invite = params.get("invite") || "";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const validation = useQuery<InviteValidation>({
    queryKey: ["/api/v1/public/client-portal/invites/validate", invite, token],
    queryFn: async () => {
      const res = await fetch(`/api/v1/public/client-portal/invites/validate?invite=${encodeURIComponent(invite)}&token=${encodeURIComponent(token)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("This invitation is invalid or expired");
      return res.json();
    },
    enabled: Boolean(invite && token),
  });

  const acceptInvite = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password !== confirmPassword) throw new Error("Passwords do not match");
      const res = await apiRequest("POST", "/api/v1/public/client-portal/invites/accept", {
        inviteId: invite,
        token,
        firstName,
        lastName,
        password,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Client portal account ready" });
      navigate(data.requiresLogin ? "/login" : "/portal");
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to accept invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const inviteData = validation.data;

  useEffect(() => {
    if (inviteData) {
      setFirstName(inviteData.firstName || "");
      setLastName(inviteData.lastName || "");
    }
  }, [inviteData]);

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set Up Client Portal</CardTitle>
          <CardDescription>
            {inviteData ? `Create your password for ${inviteData.clientName}.` : "Validating your invitation..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {validation.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : validation.error ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{validation.error.message}</p>
              <Button variant="outline" onClick={() => navigate("/login")}>Back to Login</Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                acceptInvite.mutate();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={acceptInvite.isPending}>
                {acceptInvite.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Finish Setup
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
