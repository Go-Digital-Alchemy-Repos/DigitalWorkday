import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Loader2 } from "lucide-react";
import { OnboardingStepItem } from "./shared-components";
import type { TenantWithDetails, OnboardingProgress } from "./types";

interface TenantDrawerOnboardingProps {
  activeTenant: TenantWithDetails;
  onboardingProgress: OnboardingProgress;
  setActiveTab: (tab: string) => void;
}

export function TenantDrawerOnboarding({ activeTenant, onboardingProgress, setActiveTab }: TenantDrawerOnboardingProps) {
  const { toast } = useToast();

  const seedWelcomeProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant.id}/seed/welcome-project`, {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "created") {
        toast({ title: "Welcome project created", description: `Created ${data.created.tasks} tasks and ${data.created.subtasks} subtasks` });
      } else if (data.status === "skipped") {
        toast({ title: "Already exists", description: data.reason, variant: "default" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create welcome project", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup Wizard</CardTitle>
          <CardDescription>Follow these steps to fully configure the tenant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <OnboardingStepItem
              step={1}
              title="Primary Workspace Created"
              description="A primary workspace was automatically created"
              completed={onboardingProgress.workspace}
              active={false}
            />
            <OnboardingStepItem
              step={2}
              title="Configure Branding"
              description="Set up logo, colors, and white-label options"
              completed={onboardingProgress.branding}
              active={!onboardingProgress.branding}
              action={() => setActiveTab("branding")}
            />
            <OnboardingStepItem
              step={3}
              title="Invite Administrators"
              description="Invite tenant administrators to manage the organization"
              completed={onboardingProgress.users}
              active={onboardingProgress.branding && !onboardingProgress.users}
              action={() => setActiveTab("users")}
            />
            <OnboardingStepItem
              step={4}
              title="Activate Tenant"
              description="Make the tenant live for users to access"
              completed={onboardingProgress.activated}
              active={!onboardingProgress.activated}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Setup</CardTitle>
          <CardDescription>Quickly seed starter data to help the tenant get started</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium">Create Welcome Project</div>
              <div className="text-sm text-muted-foreground">
                Seeds a starter project with sections and sample tasks to demonstrate workflow
              </div>
            </div>
            <Button
              onClick={() => seedWelcomeProjectMutation.mutate()}
              disabled={seedWelcomeProjectMutation.isPending}
              data-testid="button-seed-welcome-project"
            >
              {seedWelcomeProjectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Welcome Project
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
